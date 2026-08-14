import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Dialog } from "primereact/dialog";
import Toggle from "@/ui/components/Toggle";
import Label, { type LabelHandle } from "@/ui/components/Label";
import { InputText } from "primereact/inputtext";
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
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
import { getViewerContext } from "@/ui/api/session.ts";
import { useAdminListQuery } from "@/ui/useAdminListQuery.ts";
import { AdminPager } from "@/ui/AdminPager.tsx";
import { ApiError } from "@/ui/api/errors.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub";
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
            { and: [TAG_API_KEY, { or: [TAG_UPDATE, TAG_DISABLE] }] },
            (msg) => {
                const tags = msg.tags;
                const data = msg.data as Record<string, unknown> | undefined;
                // Entity identifier comes from the payload (instance-form convention), not from a tag regex.
                const rawApiKeyId = data?.identifier ?? (data?.identifiers as Record<string, unknown> | undefined)?.api_key;
                const apiKeyId = typeof rawApiKeyId === "string" ? rawApiKeyId : undefined;
                if (!apiKeyId) return;
                const refs = labelRefs.current.get(apiKeyId);
                if (!refs) return;

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
                unsubscribe(token);
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

    const {
        page,
        pageSize,
        showDisabled,
        availablePageSizes,
        total,
        setAvailablePageSizes,
        setTotal,
        updateQuery,
    } = useAdminListQuery();

    const canCreate = viewerContext.permissionNames.includes(FP_CREATE_API_KEYS.functionalPermissionName);
    const canManage = viewerContext.permissionNames.includes(FP_PROLONG_API_KEYS.functionalPermissionName);

    // Latest-committed mirror so the loading-indicator choice inside `load` never
    // introduces `apiKeys` into the effect dependency chain.
    const apiKeysRef = useRef(apiKeys);
    useEffect(() => {
        apiKeysRef.current = apiKeys;
    }, [apiKeys]);

    const load = useCallback(async () => {
        const setLoading = page === 1 && apiKeysRef.current.length === 0 ? setIsLoading : setIsPageLoading;
        setLoading(true);
        setError(null);
        try {
            const [context, payload] = await Promise.all([
                getViewerContext(),
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
    }, [page, pageSize, showDisabled, updateQuery]);

    useEffect(() => {
        void load();
    }, [load]);

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
                                {apiKeys.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: "center", padding: "2rem" }}>
                                            No API keys found.
                                        </td>
                                    </tr>
                                ) : (apiKeys.map((item) => {
                                    let refs = labelRefs.current.get(item.identifier);
                                    if (!refs) {
                                        refs = {
                                            name: { current: null },
                                            status: { current: null },
                                            expires: { current: null },
                                        };
                                        labelRefs.current.set(item.identifier, refs);
                                    }
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
                                                            try {
                                                                await disableApiKey(item.identifier, { knownUpdatedAt: item.updatedAt });
                                                                await load();
                                                            } catch (err) {
                                                                setError(err instanceof Error ? err.message : "Failed to disable API key");
                                                            }
                                                        }}
                                                    >
                                                        Disable
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                }))}
                            </tbody>
                        </table>

                        <AdminPager
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            availablePageSizes={availablePageSizes}
                            onUpdate={updateQuery}
                            entityLabel="API keys"
                        />
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


