import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
import InputField, { type InputFieldHandle } from "@/ui/components/InputField";
import Label, { type LabelHandle } from "@/ui/components/Label";
import Toggle from "@/ui/components/Toggle";
import { subscribe, unsubscribe } from "@/ui/pubsub";
import { runSaveWithConfirmation } from "@/ui/saveConfirmation";
import type { PageMeta } from "@/types/PageType.ts";
import type { PubSubMessage } from "@/types/PubSubType.ts";
import {
    TAG_API_KEY,
    TAG_UPDATE,
    TAG_DISABLE,
} from "@/types/PubSubType.ts";
import {
    FP_PROLONG_API_KEYS,
    FP_READ_FUNCTIONAL_PERMISSIONS,
    FP_VIEW_API_KEYS,
} from "@/ui/auth/functional_permissions.ts";
import type { FunctionalPermissionsResponse } from "@/types/ApiType.ts";
import { getFunctionalPermissions } from "@/ui/api/FunctionalPermissions.ts";
import { getViewerContext } from "@/ui/api/session.ts";
import {
    disableApiKey,
    getApiKeyDetail,
    prolongApiKey,
    replaceApiKeyPermissions,
    updateApiKeyMetadata,
} from "@/ui/api/ApiKeys.ts";
import type {ApiKeyDetailResponse, UserDisplayInfo} from "@/types/ApiKeyType.ts";
import { ApiError } from "@/ui/api/errors.ts";

type ViewerContext = { permissionNames: string[] };

export const meta: PageMeta = {
    id: "admin-api-key-detail",
    urn: "urn:bun-starter:ui:page:admin-api-key-detail",
    path: "/admin/api-keys/:apikeyid",
    detailBreadcrumb: {
        resolveLabel: async (params) => (await getApiKeyDetail(params.apikeyid ?? "")).apiKey.name,
    },
    title: "API key details",
    description: "Edit API key metadata, permissions, and lifecycle state.",
    menu: {
        section: "Administration",
        order: 41,
        label: "API key details",
        parent: "admin-api-keys",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_VIEW_API_KEYS.functionalPermissionName],
};

export function Component() {
    const { apikeyid } = useParams();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [error, setError] = useState<string | null>(null);
    const [notPermitted, setNotPermitted] = useState(false);
    const [detail, setDetail] = useState<ApiKeyDetailResponse | null>(null);
    const [allPermissions, setAllPermissions] = useState<FunctionalPermissionsResponse["functionalPermissions"]>([]);
    const [permissionsTotal, setPermissionsTotal] = useState(0);
    const [permissionsAvailablePageSizes, setPermissionsAvailablePageSizes] = useState<number[]>([10, 20, 50]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingPermissions, setIsSavingPermissions] = useState(false);
    const [prolongDays, setProlongDays] = useState(90);
    const [prolongVisible, setProlongVisible] = useState(false);
    const [prolongError, setProlongError] = useState<string | null>(null);

    const nameInputRef = useRef<InputFieldHandle | null>(null);
    const descriptionInputRef = useRef<InputFieldHandle | null>(null);

    // Label refs for read-only fields
    const statusRef = useRef<LabelHandle>(null);
    const expiresRef = useRef<LabelHandle>(null);
    const lastProlongedRef = useRef<LabelHandle>(null);
    const lastProlongedByRef = useRef<LabelHandle>(null);
    const disabledAtRef = useRef<LabelHandle>(null);
    const disabledByRef = useRef<LabelHandle>(null);
    const nameLabelRef = useRef<LabelHandle>(null);
    const descriptionLabelRef = useRef<LabelHandle>(null);

    const queryPermissionsPage = Number(searchParams.get("permissionsPage") ?? "1");
    const queryPermissionsPageSize = Number(searchParams.get("permissionsPageSize") ?? "10");
    const permissionsPage = Number.isInteger(queryPermissionsPage) && queryPermissionsPage > 0 ? queryPermissionsPage : 1;
    const permissionsPageSize = Number.isInteger(queryPermissionsPageSize) && queryPermissionsPageSize > 0 ? queryPermissionsPageSize : 10;

    const updateQuery = useCallback((patch: { permissionsPage?: number; permissionsPageSize?: number }) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (patch.permissionsPage !== undefined) next.set("permissionsPage", String(patch.permissionsPage));
            if (patch.permissionsPageSize !== undefined) next.set("permissionsPageSize", String(patch.permissionsPageSize));
            return next;
        });
    }, [setSearchParams]);

    const canManage = viewerContext.permissionNames.includes(FP_PROLONG_API_KEYS.functionalPermissionName);

    const load = useCallback(async () => {
        if (!apikeyid) return;
        setIsLoading(true);
        setError(null);
        setNotPermitted(false);
        try {
            const context = await getViewerContext();
            setViewerContext(context);
            if (!context.permissionNames.includes(FP_READ_FUNCTIONAL_PERMISSIONS.functionalPermissionName)) {
                setNotPermitted(true);
                return;
            }
            const [payload, permissionsPayload] = await Promise.all([
                getApiKeyDetail(apikeyid),
                getFunctionalPermissions(permissionsPage - 1, permissionsPageSize),
            ]);
            setDetail(payload);
            setAllPermissions(permissionsPayload.functionalPermissions);
            setPermissionsTotal(permissionsPayload.total);
            setPermissionsAvailablePageSizes(permissionsPayload.availablePageSizes);
            if (permissionsPayload.page !== permissionsPage - 1) updateQuery({ permissionsPage: permissionsPayload.page + 1 });
            if (!permissionsPayload.availablePageSizes.includes(permissionsPageSize)) {
                const [firstPageSize] = permissionsPayload.availablePageSizes;
                if (typeof firstPageSize === "number") {
                    updateQuery({ permissionsPage: 1, permissionsPageSize: firstPageSize });
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load API key details");
        } finally {
            setIsLoading(false);
        }
    }, [apikeyid, permissionsPage, permissionsPageSize, updateQuery]);

    const refreshDetailOnly = async () => {
        if (!apikeyid) return;
        const payload = await getApiKeyDetail(apikeyid);
        setDetail(payload);
    };

    useEffect(() => {
        void load();
    }, [load]);

    // Initialize InputField refs when detail is loaded
    useEffect(() => {
        if (!detail) return;
        nameInputRef.current?.setOriginalValue(detail.apiKey.name, {
            updatedAt: detail.apiKey.updatedAt,
        });
        nameInputRef.current?.resetToOriginal();

        descriptionInputRef.current?.setOriginalValue(detail.apiKey.description ?? "", {
            updatedAt: detail.apiKey.updatedAt,
        });
        descriptionInputRef.current?.resetToOriginal();

        // Seed Label read-only fields
        const id = detail.apiKey.identifier;
        const status = detail.apiKey.disabled ? "Disabled"
            : (new Date(detail.apiKey.expiresAt).getTime() <= Date.now() ? "Expired" : "Active");
        // Guarded re-seed: call setText only when the incoming value differs
        // from the component's current value (see the three-phase model in Label.tsx).
        if (nameLabelRef.current && nameLabelRef.current.getText() !== detail.apiKey.name) {
            nameLabelRef.current.setText(detail.apiKey.name, { apiKeyId: id, field: "name" });
        }
        if (statusRef.current && statusRef.current.getText() !== status) {
            statusRef.current.setText(status, { apiKeyId: id, field: "status" });
        }
        const expiresText = new Date(detail.apiKey.expiresAt).toLocaleString();
        if (expiresRef.current && expiresRef.current.getText() !== expiresText) {
            expiresRef.current.setText(expiresText, { apiKeyId: id, field: "expires" });
        }
        const descriptionText = detail.apiKey.description ?? "-";
        if (descriptionLabelRef.current && descriptionLabelRef.current.getText() !== descriptionText) {
            descriptionLabelRef.current.setText(descriptionText, { apiKeyId: id, field: "description" });
        }
        const lastProlongedText = detail.apiKey.lastProlongedAt ? new Date(detail.apiKey.lastProlongedAt).toLocaleString() : "-";
        if (lastProlongedRef.current && lastProlongedRef.current.getText() !== lastProlongedText) {
            lastProlongedRef.current.setText(lastProlongedText, { apiKeyId: id, field: "lastProlonged" });
        }
        lastProlongedByRef.current?.setText(formatUserDisplay(detail.apiKey.lastProlongedBy), { apiKeyId: id, field: "lastProlongedBy" });
        disabledAtRef.current?.setText(detail.apiKey.disabledAt ? new Date(detail.apiKey.disabledAt).toLocaleString() : "-", { apiKeyId: id, field: "disabledAt" });
        disabledByRef.current?.setText(formatUserDisplay(detail.apiKey.disabledBy), { apiKeyId: id, field: "disabledBy" });
    }, [detail]);

    // Concurrent modification detection via PubSub
    useEffect(() => {
        if (!detail || !canManage) return;

        const token = subscribe(
            { and: [TAG_API_KEY, TAG_UPDATE] },
            (msg: PubSubMessage) => {
                if (msg.data?.identifiers?.api_key !== detail.apiKey.identifier) return;

                // Mark both fields as potentially stale
                const nameRef = nameInputRef.current;
                if (nameRef && msg.data?.identifiers?.api_key === detail.apiKey.identifier) {
                    nameRef.setDirty(true);
                    nameRef.setHintText("API key was modified by another user");
                }

                const descRef = descriptionInputRef.current;
                if (descRef) {
                    descRef.setDirty(true);
                    descRef.setHintText("API key was modified by another user");
                }
            },
        );

        return () => {
            if (token) unsubscribe(token);
        };
    }, [detail, canManage]);

    // PubSub subscription for Label read-only field updates
    useEffect(() => {
        if (!detail) return;
        const id = detail.apiKey.identifier;
        const token = subscribe(
            { and: [TAG_API_KEY, id, { or: [TAG_UPDATE, TAG_DISABLE] }] },
            (msg: PubSubMessage) => {
                const tags = msg.tags;
                const data = msg.data as Record<string, unknown> | undefined;

                if (tags.includes(TAG_UPDATE)) {
                    if (data?.name !== undefined) nameLabelRef.current?.setText(String(data.name), { apiKeyId: id, field: "name" });
                    if (data?.description !== undefined) descriptionLabelRef.current?.setText(String(data.description), { apiKeyId: id, field: "description" });
                    if (data?.expiresAt !== undefined) expiresRef.current?.setText(new Date(String(data.expiresAt)).toLocaleString(), { apiKeyId: id, field: "expires" });
                    if (data?.lastProlongedBy !== undefined) lastProlongedByRef.current?.setText(String(data.lastProlongedBy), { apiKeyId: id, field: "lastProlongedBy" });
                }
                if (tags.includes(TAG_DISABLE)) {
                    const disabled = data?.disabled === true;
                    statusRef.current?.setText(disabled ? "Disabled" : "Active", { apiKeyId: id, field: "status" });
                    if (data?.disabledAt !== undefined) disabledAtRef.current?.setText(new Date(String(data.disabledAt)).toLocaleString(), { apiKeyId: id, field: "disabledAt" });
                    if (data?.disabledBy !== undefined) disabledByRef.current?.setText(String(data.disabledBy), { apiKeyId: id, field: "disabledBy" });
                }
            },
        );
        return () => {
            if (typeof token === "string") {
                unsubscribe(token);
            }
        };
    }, [detail]);

    const assignedPermissionSet = useMemo(() => new Set(detail?.permissionIdentifiers ?? []), [detail]);

    const formatUserDisplay = (userId: string | null | undefined): string => {
        if (!userId || !detail?.relatedUsers) return userId ?? "-";
        const userInfo: UserDisplayInfo | undefined = detail.relatedUsers[userId];
        if (!userInfo) return userId;
        return `${userInfo.firstName} ${userInfo.lastName} (${userInfo.email})`;
    };

    const statusLabel = detail?.apiKey.disabled
        ? "Disabled"
        : (detail && new Date(detail.apiKey.expiresAt).getTime() <= Date.now() ? "Expired" : "Active");
    const handleSaveName = async (
        component: InputFieldHandle,
        source: "button" | "blur",
    ) => {
        if (!detail || !apikeyid) return;

        const rawValue = component.getCurrentValue();
        if (!component.compareWithOriginal()) return;

        const ctx = component.getContext();

        component.disableSaveButton();
        component.disableRestoreButton();

        await runSaveWithConfirmation({
            pubsubExpression: { and: [TAG_API_KEY, TAG_UPDATE] },
            confirmFromPubSub: async (msg) => {
                if (msg.data?.identifiers?.api_key !== detail.apiKey.identifier) return undefined;
                try {
                    const refreshed = await getApiKeyDetail(apikeyid);
                    return { value: refreshed.apiKey.name, updatedAt: refreshed.apiKey.updatedAt };
                } catch { return undefined; }
            },
            confirmFromRefetch: async () => {
                const payload = await getApiKeyDetail(apikeyid);
                return { value: payload.apiKey.name, updatedAt: payload.apiKey.updatedAt };
            },
            mutate: async () => {
                const response = await updateApiKeyMetadata(detail.apiKey.identifier, {
                    knownUpdatedAt: (ctx?.updatedAt as string) ?? detail.apiKey.updatedAt,
                    name: rawValue.trim(),
                    description: detail.apiKey.description ?? null,
                });
                return { value: rawValue.trim(), updatedAt: response.updatedAt };
            },
            onSuccess: (newName, newUpdatedAt) => {
                component.setOriginalValue(newName, { updatedAt: newUpdatedAt });
                component.setDirty(false);
                component.enableSaveButton();
                component.enableRestoreButton();
                component.setHintText("");
                // Update detail in-place so Description field context stays in sync
                setDetail((prev) => prev ? {
                    ...prev,
                    apiKey: { ...prev.apiKey, name: newName, updatedAt: newUpdatedAt },
                } : prev);
            },
            onTimeoutResolved: () => {
                component.enableSaveButton();
                component.enableRestoreButton();
                component.setHintText("");
            },
            onTimeoutFailure: () => {
                component.enableSaveButton();
                component.enableRestoreButton();
                component.setHintText("");
            },
            onConflict: () => {
                component.setHintText("This API key was modified by another user. Please refresh.");
                component.setDirty(true);
                component.enableRestoreButton();
            },
            onOtherError: () => {
                component.enableSaveButton();
                component.enableRestoreButton();
            },
        });
    };

    const handleSaveDescription = async (
        component: InputFieldHandle,
        source: "button" | "blur",
    ) => {
        if (!detail || !apikeyid) return;

        const rawValue = component.getCurrentValue();
        if (!component.compareWithOriginal()) return;

        const ctx = component.getContext();

        component.disableSaveButton();
        component.disableRestoreButton();

        await runSaveWithConfirmation({
            pubsubExpression: { and: [TAG_API_KEY, TAG_UPDATE] },
            confirmFromPubSub: async (msg) => {
                if (msg.data?.identifiers?.api_key !== detail.apiKey.identifier) return undefined;
                try {
                    const refreshed = await getApiKeyDetail(apikeyid);
                    return { value: refreshed.apiKey.description ?? "", updatedAt: refreshed.apiKey.updatedAt };
                } catch { return undefined; }
            },
            confirmFromRefetch: async () => {
                const payload = await getApiKeyDetail(apikeyid);
                return { value: payload.apiKey.description ?? "", updatedAt: payload.apiKey.updatedAt };
            },
            mutate: async () => {
                const response = await updateApiKeyMetadata(detail.apiKey.identifier, {
                    knownUpdatedAt: (ctx?.updatedAt as string) ?? detail.apiKey.updatedAt,
                    name: detail.apiKey.name,
                    description: rawValue.trim().length > 0 ? rawValue.trim() : null,
                });
                return { value: rawValue.trim().length > 0 ? rawValue.trim() : "", updatedAt: response.updatedAt };
            },
            onSuccess: (newDescription, newUpdatedAt) => {
                component.setOriginalValue(newDescription, { updatedAt: newUpdatedAt });
                component.setDirty(false);
                component.enableSaveButton();
                component.enableRestoreButton();
                component.setHintText("");
                // Update detail in-place so Name field context stays in sync
                setDetail((prev) => prev ? {
                    ...prev,
                    apiKey: { ...prev.apiKey, description: newDescription || null, updatedAt: newUpdatedAt },
                } : prev);
            },
            onTimeoutResolved: () => {
                component.enableSaveButton();
                component.enableRestoreButton();
                component.setHintText("");
            },
            onTimeoutFailure: () => {
                component.enableSaveButton();
                component.enableRestoreButton();
                component.setHintText("");
            },
            onConflict: () => {
                component.setHintText("This API key was modified by another user. Please refresh.");
                component.setDirty(true);
                component.enableRestoreButton();
            },
            onOtherError: () => {
                component.enableSaveButton();
                component.enableRestoreButton();
            },
        });
    };

    const submitProlong = async () => {
        if (!detail) return;
        if (!Number.isInteger(prolongDays) || prolongDays < 1 || prolongDays > 730) {
            setProlongError("Please choose a value between 1 and 730 days.");
            return;
        }
        await prolongApiKey(detail.apiKey.identifier, {
            knownUpdatedAt: detail.apiKey.updatedAt,
            days: prolongDays,
        });
        setProlongVisible(false);
        setProlongError(null);
        await load();
    };

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="API key details">
                {error ? (
                    <p className="admin-config-error">{error}</p>
                ) : notPermitted ? (
                    <p className="admin-config-error">You are not permitted to read API key details. Required permission not granted: FP_READ_FUNCTIONAL_PERMISSIONS.</p>
                ) : isLoading || !detail ? (
                    <p>Loading API key details...</p>
                ) : (
                    <>
                        <div className="admin-detail-grid">
                            <div>
                                <strong>Name:</strong>
                                {canManage ? (
                                    <div className="admin-config-actions admin-top-gap">
                                        <InputField
                                            ref={nameInputRef}
                                            showButtons={true}
                                            onSave={handleSaveName}
                                        />
                                    </div>
                                ) : <Label ref={nameLabelRef} text={detail.apiKey.name} />}
                            </div>
                            <div><strong>Status:</strong> <Label ref={statusRef} text={statusLabel} /></div>
                            <div>
                                <strong>Description:</strong>
                                {canManage ? (
                                    <div className="admin-config-inline-editor admin-top-gap">
                                        <InputField
                                            ref={descriptionInputRef}
                                            multiLine={true}
                                            showButtons={true}
                                            onSave={handleSaveDescription}
                                        />
                                    </div>
                                ) : <Label ref={descriptionLabelRef} text={detail.apiKey.description ?? "-"} />}
                            </div>
                            <div><strong>Identifier:</strong> <code>{detail.apiKey.identifier}</code></div>
                            <div><strong>Created by:</strong> {formatUserDisplay(detail.apiKey.createdBy)}</div>
                            <div><strong>Created:</strong> {new Date(detail.apiKey.createdAt).toLocaleString()}</div>
                            <div><strong>Expires:</strong> <Label ref={expiresRef} text={new Date(detail.apiKey.expiresAt).toLocaleString()} /></div>
                            <div><strong>Last prolonged:</strong> <Label ref={lastProlongedRef} text={detail.apiKey.lastProlongedAt ? new Date(detail.apiKey.lastProlongedAt).toLocaleString() : "-"} /></div>
                            <div><strong>Last prolonged by:</strong> <Label ref={lastProlongedByRef} text={formatUserDisplay(detail.apiKey.lastProlongedBy)} /></div>
                            <div><strong>Disabled at:</strong> <Label ref={disabledAtRef} text={detail.apiKey.disabledAt ? new Date(detail.apiKey.disabledAt).toLocaleString() : "-"} /></div>
                            <div><strong>Disabled by:</strong> <Label ref={disabledByRef} text={formatUserDisplay(detail.apiKey.disabledBy)} /></div>
                        </div>

                        {canManage ? (
                            <div className="admin-top-gap admin-config-inline-editor">
                                <h3>Actions</h3>
                                <div className="admin-config-inline-editor">
                                    {!detail.apiKey.disabled ? (
                                        <button type="button" onClick={() => { setProlongVisible(true); setProlongError(null); }}>Prolong</button>
                                    ) : null}
                                    {!detail.apiKey.disabled ? (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    await disableApiKey(detail.apiKey.identifier, { knownUpdatedAt: detail.apiKey.updatedAt });
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
                            </div>
                        ) : null}

                        <div className="admin-top-gap">
                            <h3>Functional permissions</h3>
                            <table className="mui-simple-table admin-table">
                                <thead>
                                    <tr>
                                        <th>Assigned</th>
                                        <th>Name</th>
                                        <th>Group</th>
                                        <th>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allPermissions.map((permission) => {
                                        const checked = assignedPermissionSet.has(permission.identifier);
                                        return (
                                            <tr key={permission.identifier}>
                                                <td>
                                                    <Toggle<boolean>
                                                        variant="checkbox"
                                                        value={checked}
                                                        visible={canManage}
                                                        options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]}
                                                        disabled={isSavingPermissions}
                                                        onChange={async (t) => {
                                                            if (!detail) return;
                                                            setIsSavingPermissions(true);
                                                            const next = new Set(assignedPermissionSet);
                                                            if (t.getValue()) next.add(permission.identifier);
                                                            else next.delete(permission.identifier);
                                                            try {
                                                                await replaceApiKeyPermissions(detail.apiKey.identifier, {
                                                                    knownUpdatedAt: detail.apiKey.updatedAt,
                                                                    permissionIdentifiers: [...next],
                                                                });
                                                                await refreshDetailOnly();
                                                            } finally {
                                                                setIsSavingPermissions(false);
                                                            }
                                                        }}
                                                    />
                                                    {!canManage && (checked ? "Yes" : "No")}
                                                </td>
                                                <td>{permission.functionalPermissionName}</td>
                                                <td>{permission.group}</td>
                                                <td>{permission.description}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            <div className="admin-pager-row">
                                <button type="button" disabled={permissionsPage <= 1} onClick={() => updateQuery({ permissionsPage: Math.max(1, permissionsPage - 1) })}>
                                    Previous
                                </button>
                                <span>Page {permissionsPage} of {Math.max(1, Math.ceil(permissionsTotal / permissionsPageSize))}</span>
                                <button type="button" disabled={permissionsPage >= Math.max(1, Math.ceil(permissionsTotal / permissionsPageSize))} onClick={() => updateQuery({ permissionsPage: Math.min(Math.max(1, Math.ceil(permissionsTotal / permissionsPageSize)), permissionsPage + 1) })}>
                                    Next
                                </button>
                                <label>
                                    Page size
                                    <select
                                        className="admin-page-size"
                                        value={permissionsPageSize}
                                        onChange={(event) => updateQuery({ permissionsPage: 1, permissionsPageSize: Number(event.target.value) })}
                                    >
                                        {permissionsAvailablePageSizes.map((size) => (
                                            <option key={size} value={size}>{size}</option>
                                        ))}
                                    </select>
                                </label>
                                <span>{permissionsTotal} functional permissions</span>
                            </div>
                        </div>

                        <div className="admin-top-gap">
                            <Link to={`/admin/api-keys${location.search}`}>Back to API key list</Link>
                        </div>
                    </>
                )}
            </PageSection>

            <Dialog
                header="Prolong API key"
                visible={prolongVisible}
                modal
                className="admin-config-dialog admin-api-key-dialog"
                style={{ width: "min(520px, 95vw)" }}
                onHide={() => {
                    setProlongVisible(false);
                    setProlongError(null);
                }}
            >
                <div className="admin-config-modal-body">
                    <p>Choose how many days to extend this API key.</p>
                    {prolongError ? <p className="admin-config-validation-error">{prolongError}</p> : null}
                    <label>
                        Days (1-730)
                        <InputText
                            value={String(prolongDays)}
                            inputMode="numeric"
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                setProlongDays(Number.isFinite(next) ? Math.trunc(next) : prolongDays);
                            }}
                        />
                    </label>
                    <div className="admin-config-actions">
                        <button type="button" onClick={submitProlong}>Confirm</button>
                    </div>
                </div>
            </Dialog>
        </PageTemplate>
    );
}

