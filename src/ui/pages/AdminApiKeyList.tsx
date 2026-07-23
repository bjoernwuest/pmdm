import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Dialog } from "primereact/dialog";
import Toggle from "@/ui/components/Toggle";
import Label, { type LabelHandle } from "@/ui/components/Label";
import { InputText } from "primereact/inputtext";
import { PageSection, PageTemplate } from "./PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import {
    FP_CREATE_API_KEYS,
    FP_PROLONG_API_KEYS,
    FP_VIEW_API_KEYS,
} from "@/ui/auth/functional_permissions.ts";
import type { ApiKeySummary } from "@/types/ApiKeyType.ts";
import {
    createApiKey,
    disableApiKey,
    getApiKeys,
    prolongApiKey,
} from "@/ui/api/ApiKeys.ts";
import { apiGet } from "@/ui/api/index.ts";
import { ApiError } from "@/ui/api/errors.ts";
import { subscribe } from "@/ui/pubsub";
import { TAG_API_KEY, TAG_UPDATE, TAG_DISABLE } from "@/types/PubSubType";

type ViewerContext = { permissionNames: string[] };

type CreateState = {
    visible: boolean;
    name: string;
    description: string;
    isSaving: boolean;
    error: string | null;
    result: { identifier: string; plainApiKey: string; expiresAt: string } | null;
};

type ProlongState = {
    visible: boolean;
    apiKeyIdentifier: string | null;
    knownUpdatedAt: string | null;
    apiKeyName: string;
    days: number;
    isSaving: boolean;
    error: string | null;
};

export const meta: PageMeta = {
    id: "admin-api-keys",
    urn: "urn:bun-starter:ui:page:admin-api-keys",
    path: "/admin/api-keys",
    title: "API keys",
    description: "Create, review, and maintain API keys used to authenticate API clients.",
    menu: {
        section: "Administration",
        order: 40,
        label: "API keys",
        parent: "admin-home",
    },
    requiredFunctionalPermissions: [FP_VIEW_API_KEYS.functionalPermissionName],
};

function statusLabel(item: ApiKeySummary): string {
    if (item.disabled) return "Disabled";
    const isExpired = new Date(item.expiresAt).getTime() <= Date.now();
    return isExpired ? "Expired" : "Active";
}

export function Component() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPageLoading, setIsPageLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createState, setCreateState] = useState<CreateState>({
        visible: false,
        name: "",
        description: "",
        isSaving: false,
        error: null,
        result: null,
    });
    const [prolongState, setProlongState] = useState<ProlongState>({
        visible: false,
        apiKeyIdentifier: null,
        knownUpdatedAt: null,
        apiKeyName: "",
        days: 90,
        isSaving: false,
        error: null,
    });

    // --- Label refs for pubsub-driven updates ---
    interface ApiKeyLabelRefs {
        name: React.RefObject<LabelHandle | null>;
        status: React.RefObject<LabelHandle | null>;
        expires: React.RefObject<LabelHandle | null>;
    }
    const labelRefs = useRef<Map<string, ApiKeyLabelRefs>>(new Map());

    // Seed Labels after apiKeys load
    useEffect(() => {
        apiKeys.forEach((item) => {
            const refs = labelRefs.current.get(item.identifier);
            if (refs) {
                refs.name.current?.setText(item.name, { apiKeyId: item.identifier, field: "name" });
                refs.status.current?.setText(statusLabel(item), { apiKeyId: item.identifier, field: "status" });
                refs.expires.current?.setText(new Date(item.expiresAt).toLocaleString(), { apiKeyId: item.identifier, field: "expires" });
            }
        });
    }, [apiKeys]);

    // PubSub subscription for live updates
    useEffect(() => {
        const token = subscribe(
            { or: [TAG_UPDATE, TAG_DISABLE] },
            (msg) => {
                const tags = msg.tags;
                const apiKeyId = tags.find((t) => /^[0-9a-f-]{36}$/i.test(t));
                if (!apiKeyId) return;
                const refs = labelRefs.current.get(apiKeyId);
                if (!refs) return;
                const data = msg.data as Record<string, unknown> | undefined;

                if (tags.includes(TAG_UPDATE)) {
                    if (data?.name !== undefined) refs.name.current?.setText(String(data.name), { apiKeyId, field: "name" });
                    if (data?.expiresAt !== undefined) refs.expires.current?.setText(new Date(String(data.expiresAt)).toLocaleString(), { apiKeyId, field: "expires" });
                }
                if (tags.includes(TAG_DISABLE)) {
                    const disabled = data?.disabled === true;
                    refs.status.current?.setText(disabled ? "Disabled" : "Active", { apiKeyId, field: "status" });
                }
            },
        );
        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub").then((m) => m.unsubscribe(token));
            }
        };
    }, []);

    const toCreateErrorMessage = (error: unknown): string => {
        if (error instanceof ApiError && error.status === 500 && error.message.toLowerCase().includes("pgcrypto")) {
            return error.message;
        }
        if (error instanceof ApiError && error.message) return error.message;
        if (error instanceof Error && error.message) return error.message;
        return "Could not create API key";
    };

    const queryPage = Number(searchParams.get("page") ?? "1");
    const queryPageSize = Number(searchParams.get("pageSize") ?? "10");
    const showDisabled = searchParams.get("showDisabled") === "1";
    const page = Number.isInteger(queryPage) && queryPage > 0 ? queryPage : 1;
    const pageSize = Number.isInteger(queryPageSize) && queryPageSize > 0 ? queryPageSize : 10;

    const [total, setTotal] = useState(0);
    const [availablePageSizes, setAvailablePageSizes] = useState<number[]>([10, 20, 50]);

    const canCreate = viewerContext.permissionNames.includes(FP_CREATE_API_KEYS.functionalPermissionName);
    const canManage = viewerContext.permissionNames.includes(FP_PROLONG_API_KEYS.functionalPermissionName);

    const updateQuery = (patch: { page?: number; pageSize?: number; showDisabled?: boolean }) => {
        const next = new URLSearchParams(searchParams);
        if (patch.page !== undefined) next.set("page", String(patch.page));
        if (patch.pageSize !== undefined) next.set("pageSize", String(patch.pageSize));
        if (patch.showDisabled !== undefined) {
            if (patch.showDisabled) next.set("showDisabled", "1");
            else next.delete("showDisabled");
        }
        setSearchParams(next);
    };

    const load = async () => {
        const setLoading = page === 1 && apiKeys.length === 0 ? setIsLoading : setIsPageLoading;
        setLoading(true);
        setError(null);
        try {
            const [context, payload] = await Promise.all([
                apiGet<ViewerContext>("/api/me/context"),
                getApiKeys(page - 1, pageSize, showDisabled),
            ]);
            setViewerContext(context);
            setApiKeys(payload.apiKeys);
            setTotal(payload.total);
            setAvailablePageSizes(payload.availablePageSizes);
            if (payload.page !== page - 1) updateQuery({ page: payload.page + 1 });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load API keys");
        } finally {
            setIsLoading(false);
            setIsPageLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [page, pageSize, searchParams.toString()]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const createdId = createState.result?.identifier;

    const openProlongDialog = (item: ApiKeySummary) => {
        setProlongState({
            visible: true,
            apiKeyIdentifier: item.identifier,
            knownUpdatedAt: item.updatedAt,
            apiKeyName: item.name,
            days: 90,
            isSaving: false,
            error: null,
        });
    };

    const submitProlong = async () => {
        if (!prolongState.apiKeyIdentifier || !prolongState.knownUpdatedAt) return;
        if (!Number.isInteger(prolongState.days) || prolongState.days < 1 || prolongState.days > 730) {
            setProlongState((current) => ({ ...current, error: "Please choose a value between 1 and 730 days." }));
            return;
        }

        setProlongState((current) => ({ ...current, isSaving: true, error: null }));
        try {
            await prolongApiKey(prolongState.apiKeyIdentifier, {
                knownUpdatedAt: prolongState.knownUpdatedAt,
                days: prolongState.days,
            });
            setProlongState((current) => ({ ...current, visible: false, isSaving: false }));
            await load();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not prolong API key";
            setProlongState((current) => ({ ...current, isSaving: false, error: message }));
        }
    };

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="API key list">
                {error ? <p className="admin-config-error">{error}</p> : null}

                <div className="admin-toggle-row">
                    <span>Show disabled API keys</span>
                    <Toggle<boolean>
                        variant="toggle"
                        value={showDisabled}
                        options={[{ value: true, label: "Show disabled API keys" }, { value: false, label: "Hide disabled API keys" }]}
                        onChange={(t) => updateQuery({ showDisabled: t.getValue(), page: 1 })}
                    />
                </div>

                {canCreate ? (
                    <div className="admin-top-gap">
                        <button type="button" onClick={() => setCreateState({ visible: true, name: "", description: "", isSaving: false, error: null, result: null })}>
                            Create new API key
                        </button>
                    </div>
                ) : null}

                {isLoading || isPageLoading ? (
                    <p>Loading API keys...</p>
                ) : (
                    <>
                        <table className="mui-simple-table admin-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Status</th>
                                    <th>Expires</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {apiKeys.map((item) => {
                                    if (!labelRefs.current.has(item.identifier)) {
                                        labelRefs.current.set(item.identifier, {
                                            name: { current: null },
                                            status: { current: null },
                                            expires: { current: null },
                                        });
                                    }
                                    const refs = labelRefs.current.get(item.identifier)!;
                                    return (
                                        <tr key={item.identifier}>
                                            <td>
                                                <Link to={`/admin/api-keys/${encodeURIComponent(item.identifier)}${location.search}`}>
                                                    <Label ref={refs.name} text={item.name} size="small" />
                                                </Link>
                                            </td>
                                            <td><Label ref={refs.status} text={statusLabel(item)} size="small" /></td>
                                            <td><Label ref={refs.expires} text={new Date(item.expiresAt).toLocaleString()} size="small" /></td>
                                        <td>
                                            <div className="admin-config-actions">
                                                {canManage && !item.disabled ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => openProlongDialog(item)}
                                                    >
                                                        Prolong
                                                    </button>
                                                ) : null}
                                                {canManage && !item.disabled ? (
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            await disableApiKey(item.identifier, { knownUpdatedAt: item.updatedAt });
                                                            await load();
                                                        }}
                                                    >
                                                        Disable
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div className="admin-pager-row">
                            <button type="button" disabled={page <= 1} onClick={() => updateQuery({ page: Math.max(1, page - 1) })}>Previous</button>
                            <span>Page {page} of {totalPages}</span>
                            <button type="button" disabled={page >= totalPages} onClick={() => updateQuery({ page: Math.min(totalPages, page + 1) })}>Next</button>
                            <label>
                                Page size
                                <select
                                    className="admin-page-size"
                                    value={pageSize}
                                    onChange={(event) => updateQuery({ page: 1, pageSize: Number(event.target.value) })}
                                >
                                    {availablePageSizes.map((size) => (
                                        <option key={size} value={size}>{size}</option>
                                    ))}
                                </select>
                            </label>
                            <span>{total} API keys</span>
                        </div>
                    </>
                )}
            </PageSection>

            <Dialog
                header="Create API key"
                visible={createState.visible}
                modal
                className="admin-config-dialog admin-api-key-dialog"
                style={{ width: "min(760px, 96vw)" }}
                onHide={() => {
                    const nextDetailId = createState.result?.identifier;
                    setCreateState((current) => ({ ...current, visible: false }));
                    if (nextDetailId) navigate(`/admin/api-keys/${encodeURIComponent(nextDetailId)}${location.search}`);
                }}
            >
                {createState.result ? (
                    <div className="admin-config-modal-body">
                        <p><strong>Copy and store this API key now.</strong> It is shown only once.</p>
                        <code className="admin-api-key-secret">{createState.result.plainApiKey}</code>
                        <p>Expires: {new Date(createState.result.expiresAt).toLocaleString()}</p>
                        <div className="admin-config-actions">
                            <button
                                type="button"
                                onClick={async () => {
                                    await navigator.clipboard.writeText(createState.result?.plainApiKey ?? "");
                                }}
                            >
                                Copy to clipboard
                            </button>
                            <button type="button" onClick={() => {
                                if (createdId) navigate(`/admin/api-keys/${encodeURIComponent(createdId)}${location.search}`);
                                setCreateState((current) => ({ ...current, visible: false }));
                            }}>
                                Close and open details
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="admin-config-modal-body">
                        {createState.error ? <p className="admin-config-validation-error">{createState.error}</p> : null}
                        <label>
                            Name
                            <InputText
                                value={createState.name}
                                onChange={(event) => setCreateState((current) => ({ ...current, name: event.target.value }))}
                            />
                        </label>
                        <label>
                            Description (optional)
                            <InputText
                                value={createState.description}
                                onChange={(event) => setCreateState((current) => ({ ...current, description: event.target.value }))}
                            />
                        </label>
                        <div className="admin-config-actions">
                            <button
                                type="button"
                                disabled={createState.isSaving || createState.name.trim().length === 0}
                                onClick={async () => {
                                    setCreateState((current) => ({ ...current, isSaving: true, error: null }));
                                    try {
                                        const created = await createApiKey({
                                            name: createState.name.trim(),
                                            ...(createState.description.trim().length > 0 ? { description: createState.description.trim() } : {}),
                                        });
                                        setCreateState((current) => ({
                                            ...current,
                                            isSaving: false,
                                            error: null,
                                            result: {
                                                identifier: created.identifier,
                                                plainApiKey: created.plainApiKey,
                                                expiresAt: created.expiresAt,
                                            },
                                        }));
                                        await load();
                                    } catch (error) {
                                        setCreateState((current) => ({
                                            ...current,
                                            isSaving: false,
                                            error: toCreateErrorMessage(error),
                                        }));
                                    }
                                }}
                            >
                                Create
                            </button>
                        </div>
                    </div>
                )}
            </Dialog>

            <Dialog
                header="Prolong API key"
                visible={prolongState.visible}
                modal
                className="admin-config-dialog admin-api-key-dialog"
                style={{ width: "min(520px, 95vw)" }}
                onHide={() => setProlongState((current) => ({ ...current, visible: false, error: null, isSaving: false }))}
            >
                <div className="admin-config-modal-body">
                    <p>Choose how many days to extend <strong>{prolongState.apiKeyName}</strong>.</p>
                    {prolongState.error ? <p className="admin-config-validation-error">{prolongState.error}</p> : null}
                    <label>
                        Days (1-730)
                        <InputText
                            value={String(prolongState.days)}
                            inputMode="numeric"
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                setProlongState((current) => ({
                                    ...current,
                                    days: Number.isFinite(next) ? Math.trunc(next) : current.days,
                                }));
                            }}
                        />
                    </label>
                    <div className="admin-config-actions">
                        <button type="button" disabled={prolongState.isSaving} onClick={submitProlong}>Confirm</button>
                    </div>
                </div>
            </Dialog>
        </PageTemplate>
    );
}


