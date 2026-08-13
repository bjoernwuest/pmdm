import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiGet } from "@/ui/api";
import {
    getDataTypeDetail,
    getDataTypePermissions,
    updateDataType,
    setDataTypeDisabled,
    grantDataTypePermission,
    revokeDataTypePermission,
    updateDataTypePermission,
} from "@/ui/api/DataTypes.ts";
import {
    getBusinessDomains,
} from "@/ui/api/BusinessDomains.ts";
import { FP_DO_CONFIGURATION, FP_MANAGE_DATA_TYPES, FP_VIEW_DATA_TYPES } from "@/ui/auth/functional_permissions.ts";
import type {
    DataTypeEntity,
    DataTypePermissionEntry,
} from "@/types/ConfigurationTypes.ts";
import type { UserSelectType } from "@/types/UserType.ts";
import {
    TAG_DATA_TYPE,
    TAG_DATA_TYPE_PERMISSION,
    DataTypeKind,
    DefaultValueCalculationMode,
} from "@/types/DataTypeType.ts";
import {
    TAG_GRANT,
    TAG_REVOKE,
    TAG_UPDATE,
    TAG_DISABLE,
    TAG_CREATE,
    type PubSubMessage,
} from "@/types/PubSubType.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";
import { FilterableDropdown } from "@/ui/components/FilterableDropdown.tsx";
import { MonacoField } from "@/ui/components/MonacoField.tsx";
import InputField, { type InputFieldHandle } from "@/ui/components/InputField.tsx";
import Toggle from "@/ui/components/Toggle.tsx";
import { ScriptEditorPopup } from "@/ui/components/ScriptEditorPopup.tsx";
import { ApiError } from "@/ui/api/errors.ts";
import { InputText } from "primereact/inputtext";
import { Checkbox } from "primereact/checkbox";
import type { FilterableDropdownOption } from "@/ui/components/FilterableDropdown.tsx";

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export const meta: PageMeta = {
    id: "configuration-data-type-detail",
    urn: "urn:bun-starter:ui:page:configuration-data-type-detail",
    path: "/configuration/datatypes/:datatypeid",
    title: "Data type details",
    description: "Edit data type metadata, config, and permissions.",
    menu: {
        section: "Configuration",
        order: 36,
        label: "Data type details",
        parent: "configuration-data-types",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_DO_CONFIGURATION.functionalPermissionName, FP_VIEW_DATA_TYPES.functionalPermissionName],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ViewerContext = { permissionNames: string[] };
type OwnerOption = { identifier: string; name: string };
type GroupOption = { identifier: string; name: string };

function formatTimestamp(value: string): string {
    return new Date(value).toLocaleString();
}

type UserRefMap = Record<string, UserSelectType | null>;

function formatUserRef(identifier: string | null, userRefs: UserRefMap): string {
    if (!identifier) return "-";
    const user = userRefs[identifier];
    if (!user) return identifier;
    return `${user.firstName} ${user.lastName} (${user.email})`;
}

function permId(entry: Pick<DataTypePermissionEntry, "groupIdentifier" | "role">): string {
    return `${entry.groupIdentifier}__${entry.role}`;
}

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

function CollapsibleSection({
    title,
    defaultExpanded,
    children,
}: {
    title: string;
    defaultExpanded?: boolean;
    children: React.ReactNode;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded ?? true);
    return (
        <section className="template-page-section at-card">
            <div
                className="template-page-section-header"
                style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center" }}
                onClick={() => setExpanded((prev) => !prev)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((prev) => !prev); }
                }}
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
            >
                <h2 className="template-page-section-title" style={{ flex: 1 }}>{title}</h2>
                <span style={{ fontSize: "0.9rem", opacity: 0.6, flexShrink: 0 }}>
                    {expanded ? "▼" : "▶"}
                </span>
            </div>
            {expanded ? children : null}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Permission Chip Manager (dropdown + chips)
// ---------------------------------------------------------------------------

function PermissionChipManager({
    label,
    role,
    allGroups,
    assignedPermissions,
    onGrant,
    onRevoke,
    onToggleShowByDefault,
    canManage,
}: {
    label: string;
    role: string;
    allGroups: GroupOption[];
    assignedPermissions: DataTypePermissionEntry[];
    onGrant: (groupIdentifier: string) => Promise<void>;
    onRevoke: (groupIdentifier: string) => Promise<void>;
    onToggleShowByDefault: (entry: DataTypePermissionEntry) => Promise<void>;
    canManage: boolean;
}) {
    const assignedGroupIds = useMemo(
        () => new Set(assignedPermissions.map((p) => p.groupIdentifier)),
        [assignedPermissions],
    );

    // Groups not yet assigned this role
    const availableGroups = useMemo(
        () => allGroups.filter((g) => !assignedGroupIds.has(g.identifier)),
        [allGroups, assignedGroupIds],
    );

    const handleFilterableSelect = useCallback(
        async (identifiers: string | string[]) => {
            if (!canManage) return;
            const ids = Array.isArray(identifiers) ? identifiers : [identifiers];
            for (const id of ids) {
                if (!id) continue;
                await onGrant(id);
            }
        },
        [canManage, onGrant],
    );

    const handleRemove = useCallback(
        async (groupIdentifier: string) => {
            if (!canManage) return;
            await onRevoke(groupIdentifier);
        },
        [canManage, onRevoke],
    );

    return (
        <div className="admin-datatype-permission-panel">
            <h4>{label}</h4>
            {canManage ? (
                <div className="admin-top-gap">
                    <FilterableDropdown
                        options={availableGroups}
                        selected={[]}
                        onChange={handleFilterableSelect}
                        multiSelect={true}
                        placeholder="Add groups..."
                        disabled={availableGroups.length === 0}
                    />
                </div>
            ) : null}
            <div className="admin-chip-wrap admin-top-gap">
                {assignedPermissions.length === 0 ? (
                    <span style={{ color: "var(--at-text-secondary)", fontStyle: "italic" }}>No groups assigned</span>
                ) : (
                    assignedPermissions.map((perm) => (
                        <span
                            key={perm.groupIdentifier}
                            className="mui-pill"
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                background: "var(--at-surface-100)",
                                border: "1px solid var(--at-surface-border)",
                            }}
                        >
                            {perm.groupName}
                            {role === "viewer" && canManage ? (
                                <Toggle<boolean>
                                    variant="checkbox"
                                    value={perm.showByDefault}
                                    options={[{ value: true, label: "show" }, { value: false, label: "hide" }]}
                                    onChange={() => {
                                        void onToggleShowByDefault(perm);
                                    }}
                                />
                            ) : null}
                            {canManage ? (
                                <button
                                    type="button"
                                    className="admin-datatype-chip-remove"
                                    onClick={() => void handleRemove(perm.groupIdentifier)}
                                    title={`Remove ${perm.groupName}`}
                                    style={{
                                        border: "none",
                                        background: "transparent",
                                        cursor: "pointer",
                                        padding: "0 2px",
                                        fontSize: "0.85rem",
                                        color: "var(--at-text-secondary)",
                                    }}
                                >
                                    <i className="pi pi-times" aria-hidden="true" />
                                </button>
                            ) : null}
                        </span>
                    ))
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function Component() {
    const { datatypeid } = useParams();
    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [detail, setDetail] = useState<DataTypeEntity | null>(null);
    const [permissions, setPermissions] = useState<DataTypePermissionEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userRefs, setUserRefs] = useState<UserRefMap>({});
    const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
    const [allGroups, setAllGroups] = useState<GroupOption[]>([]);
    const [lookupOptions, setLookupOptions] = useState<GroupOption[]>([]);
    const [consumableOptions, setConsumableOptions] = useState<GroupOption[]>([]);

    // Editable state – draft values
    const [editOwner, setEditOwner] = useState("");
    const [editConfig, setEditConfig] = useState<Record<string, unknown>>({});

    // Original values (last-saved state) for restore
    const [origOwner, setOrigOwner] = useState("");
    const [origConfig, setOrigConfig] = useState<Record<string, unknown>>({});

    // Edit state for mandatory/requestorCanEdit (now boolean | string)
    const [editMandatory, setEditMandatory] = useState<boolean | string>(false);
    const [editRequestorCanEdit, setEditRequestorCanEdit] = useState<boolean | string>(false);
    const [origMandatory, setOrigMandatory] = useState<boolean | string>(false);
    const [origRequestorCanEdit, setOrigRequestorCanEdit] = useState<boolean | string>(false);

    // Script content (only meaningful when mode is "script")
    const [mandatoryScript, setMandatoryScript] = useState("");
    const [requestorCanEditScript, setRequestorCanEditScript] = useState("");

    // Popup visibility
    const [mandatoryPopupVisible, setMandatoryPopupVisible] = useState(false);
    const [requestorCanEditPopupVisible, setRequestorCanEditPopupVisible] = useState(false);

    // Component refs for InputField
    const nameInputRef = useRef<InputFieldHandle | null>(null);
    const descriptionInputRef = useRef<InputFieldHandle | null>(null);

    // Guard to prevent PubSub feedback loop during our own saves
    const savingRef = useRef<boolean>(false);
    // Tracks the updatedAt we just received from our own save, so permanent PubSub
    // subscriptions can skip our own echo and only react to external changes.
    const lastSavedUpdatedAtRef = useRef<string | null>(null);

    const canManage = viewerContext.permissionNames.includes(FP_MANAGE_DATA_TYPES.functionalPermissionName);

    const load = useCallback(async () => {
        if (!datatypeid) return;
        setIsLoading(true);
        setError(null);
        try {
            const [context, detailPayload, permPayload] = await Promise.all([
                apiGet<ViewerContext>("/api/me/context"),
                getDataTypeDetail(datatypeid),
                getDataTypePermissions(datatypeid),
            ]);
            setViewerContext(context);
            const raw = detailPayload.dataType as any;
            const dt: DataTypeEntity = {
                ...raw.dataType,
                ownerBusinessDomainName: raw.owner?.name ?? null,
            };
            setDetail(dt);
            const ownerVal = dt.owner;
            const configVal = dt.config ?? {};
            setEditOwner(ownerVal);
            setEditConfig(configVal);
            setOrigOwner(ownerVal);
            setOrigConfig(configVal);
            const mandVal = dt.mandatory;
            const rceVal = dt.requestorCanEdit;
            setEditMandatory(mandVal);
            setEditRequestorCanEdit(rceVal);
            setOrigMandatory(mandVal);
            setOrigRequestorCanEdit(rceVal);
            setMandatoryScript((dt as any).mandatory_script ?? "");
            setRequestorCanEditScript((dt as any).requestorCanEdit_script ?? "");
            setPermissions(permPayload.permissions);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Could not load data type details");
        } finally {
            setIsLoading(false);
        }
    }, [datatypeid]);

    // Seed InputField refs when detail is loaded
    useEffect(() => {
        if (!detail) return;
        nameInputRef.current?.setOriginalValue(detail.name, {
            dataTypeId: detail.identifier,
            field: "name",
            updatedAt: detail.updatedAt,
        });
        nameInputRef.current?.resetToOriginal();

        descriptionInputRef.current?.setOriginalValue(detail.description ?? "", {
            dataTypeId: detail.identifier,
            field: "description",
            updatedAt: detail.updatedAt,
        });
        descriptionInputRef.current?.resetToOriginal();
    }, [detail]);

    useEffect(() => { void load(); }, [load]);

    // Load dropdown data
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const [bdPayload, groupsPayload, lookupsPayload, consumablesPayload] = await Promise.all([
                    getBusinessDomains(0, 9999, true),
                    apiGet<{ groups: { identifier: string; groupName: string }[] }>(`/api/groups?page=0&pageSize=9999`),
                    apiGet<{ lookups: { lookup: { identifier: string; name: string }; enabledValueCount: number; disabledValueCount: number }[] }>(`/api/lookups?page=0&pageSize=9999`),
                    apiGet<{ consumables: { consumable: { identifier: string; name: string }; enabledValueCount: number; disabledValueCount: number; usedValueCount: number }[] }>(`/api/consumables?page=0&pageSize=9999`),
                ]);
                if (!cancelled) {
                    setOwnerOptions(bdPayload.businessDomains.map((d) => ({ identifier: d.identifier, name: d.name })));
                    setAllGroups(groupsPayload.groups.map((g: { identifier: string; groupName: string }) => ({ identifier: g.identifier, name: g.groupName })).sort((a, b) => a.name.localeCompare(b.name)));
                    setLookupOptions(lookupsPayload.lookups.map((l) => ({ identifier: l.lookup.identifier, name: l.lookup.name })));
                    setConsumableOptions(consumablesPayload.consumables.map((c) => ({ identifier: c.consumable.identifier, name: c.consumable.name })));
                }
            } catch {
                // Ignore
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // PubSub: detect concurrent modifications to data type fields
    useEffect(() => {
        if (!detail || !canManage) return;

        const token = subscribe(
            { and: [TAG_DATA_TYPE, TAG_UPDATE] },
            (msg: PubSubMessage) => {
                if (savingRef.current) return;
                const data = msg.data as Record<string, unknown> | undefined;
                if (!data || data.identifier !== datatypeid) return;
                // Skip our own echo: if the updatedAt matches what we just saved,
                // this PubSub event is the result of our own change.
                if (data.updatedAt === lastSavedUpdatedAtRef.current) return;

                const nameRef = nameInputRef.current;
                if (nameRef) {
                    nameRef.setDirty(true);
                    nameRef.setHintText("Data type was modified by another user");
                }
                const descRef = descriptionInputRef.current;
                if (descRef) {
                    descRef.setDirty(true);
                    descRef.setHintText("Data type was modified by another user");
                }
            },
        );

        return () => {
            if (token) unsubscribe(token);
        };
    }, [detail, canManage, datatypeid]);

    // PubSub: refresh data type detail on update/disable from other sessions
    useEffect(() => {
        if (!datatypeid) return;
        const token = subscribe(
            { and: [TAG_DATA_TYPE, { or: [TAG_UPDATE, TAG_DISABLE, TAG_CREATE] }] },
            (msg: PubSubMessage) => {
                if (savingRef.current) return;
                const data = msg.data as Record<string, unknown> | undefined;
                if (!data || data.identifier !== datatypeid) return;
                // Skip our own echo
                if (data.updatedAt === lastSavedUpdatedAtRef.current) return;
                void getDataTypeDetail(datatypeid).then((d) => {
                    const dt: DataTypeEntity = {
                        ...(d.dataType as any).dataType,
                        ownerBusinessDomainName: (d.dataType as any).owner?.name ?? null,
                    };
                    setDetail(dt);
                }).catch(() => {});
            },
        );
        return () => {
            if (token) unsubscribe(token);
        };
    }, [datatypeid]);

    // PubSub: refresh permissions on grant/revoke/update from other sessions
    useEffect(() => {
        if (!datatypeid) return;
        const token = subscribe(
            { and: [TAG_DATA_TYPE_PERMISSION, { or: [TAG_GRANT, TAG_REVOKE, TAG_UPDATE] }] },
            () => {
                void getDataTypePermissions(datatypeid).then((p) => setPermissions(p.permissions)).catch(() => {});
            },
        );
        return () => {
            if (token) unsubscribe(token);
        };
    }, [datatypeid]);

    // Load user references
    useEffect(() => {
        if (!detail) return;
        const identifiers = [detail.createdBy, detail.updatedBy]
            .filter((value): value is string => typeof value === "string" && value.length > 0)
            .filter((identifier) => userRefs[identifier] === undefined);
        if (identifiers.length === 0) return;
        let cancelled = false;
        void Promise.all(identifiers.map(async (identifier) => {
            try {
                const payload = await apiGet<{ user: UserSelectType }>(`/api/users/${encodeURIComponent(identifier)}`);
                return { identifier, user: payload.user };
            } catch {
                return { identifier, user: null };
            }
        })).then((results) => {
            if (cancelled) return;
            setUserRefs((current) => {
                const next = { ...current };
                results.forEach((r) => { next[r.identifier] = r.user; });
                return next;
            });
        });
        return () => { cancelled = true; };
    }, [detail, userRefs]);

    // ---- Save helpers ----

    /** Persist owner/config edits to server, then update originals on success. */
    const persistEdits = useCallback(async (overrides: {
        owner?: string;
        config?: Record<string, unknown>;
    }) => {
        if (!detail || !datatypeid) return;
        setIsSaving(true);
        setError(null);
        try {
            const updated = await updateDataType(datatypeid, {
                knownUpdatedAt: detail.updatedAt,
                ...overrides,
            });
            setDetail(updated.dataType);
            if (overrides.owner !== undefined) setOrigOwner(overrides.owner);
            if (overrides.config !== undefined) setOrigConfig(overrides.config);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Could not save");
        } finally {
            setIsSaving(false);
        }
    }, [detail, datatypeid]);

    /** Save a specific config (for immediate-save dropdowns/checkboxes). */
    const saveConfigImmediate = useCallback(async (config: Record<string, unknown>) => {
        await persistEdits({ config });
    }, [persistEdits]);

    // ---- Inline config helpers (no inheritance) ----

    const setField = useCallback(
        (field: string, value: unknown) => {
            setEditConfig({ ...editConfig, [field]: value });
        },
        [editConfig],
    );

    const setFieldAndSave = useCallback(
        (field: string, value: unknown) => {
            const next = { ...editConfig, [field]: value };
            setEditConfig(next);
            void saveConfigImmediate(next);
        },
        [editConfig, saveConfigImmediate],
    );

    const saveField = useCallback(
        (_field: string) => async () => {
            await saveConfigImmediate(editConfig);
        },
        [editConfig, saveConfigImmediate],
    );

    const restoreField = useCallback(
        (field: string) => () => {
            setEditConfig((prev) => ({ ...prev, [field]: origConfig[field] }));
        },
        [origConfig],
    );

    // ---- Helpers for mandatory / requestorCanEdit chip toggles ----

    function chipValue(dbVal: boolean | string): string {
        if (dbVal === true || dbVal === "Yes") return "yes";
        if (dbVal === false || dbVal === "No") return "no";
        return "script";
    }

    const saveMandatoryOrRequestorCanEdit = useCallback(async (field: "mandatory" | "requestorCanEdit", value: boolean | string) => {
        if (!detail || !datatypeid) return;
        setIsSaving(true);
        setError(null);
        try {
            const isScript = typeof value === "string" && value !== "Yes" && value !== "No";
            const apiValue = isScript ? "Script" : (typeof value === "boolean" ? (value ? "Yes" : "No") : value);
            const scriptField = (field + "_script") as "mandatory_script" | "requestorCanEdit_script";
            const payload: Record<string, unknown> = {
                knownUpdatedAt: detail.updatedAt,
                [field]: apiValue,
            };
            if (isScript) {
                payload[scriptField] = value;
            }
            const updated = await updateDataType(datatypeid, payload as any);
            setDetail(updated.dataType);
            if (field === "mandatory") {
                setEditMandatory(value);
                setOrigMandatory(value);
                if (isScript) setMandatoryScript(value);
            } else {
                setEditRequestorCanEdit(value);
                setOrigRequestorCanEdit(value);
                if (isScript) setRequestorCanEditScript(value);
            }
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Could not save");
        } finally {
            setIsSaving(false);
        }
    }, [detail, datatypeid]);

    const MONACO_HELP: Record<string, string> = {
        defaultProvider: "ctx.api available. Receives ctx. Returns default value, e.g.:\nconst meta = await ctx.api.request.meta(); return 42;",
        validate: "ctx.api + ctx.trigger.candidateValue. Returns { valid, message? }, e.g.:\nreturn { valid: ctx.trigger.candidateValue.length > 3, message: 'Too short' };",
        filter: "ctx.options contains the unfiltered list. Returns filtered array, e.g.:\nreturn ctx.options.filter(o => o.name.startsWith('A'));",
        script: "ctx.api available. Returns computed value, e.g.:\nconst v = await ctx.api.request.getValue('uuid'); return v ? v * 2 : null;",
    };

    // ---- Name: three-stream race save (PubSub + timer fallback + API call) ----

    const handleSaveName = useCallback(async (
        component: InputFieldHandle,
        _source: "button" | "blur",
    ) => {
        if (!detail || !datatypeid) return;
        const rawValue = component.getCurrentValue();
        if (!component.compareWithOriginal()) return;
        const ctx = component.getContext();

        savingRef.current = true;
        let resolved = false;

        const finalizeSuccess = (newName: string, newUpdatedAt: string) => {
            if (resolved) return;
            resolved = true;
            savingRef.current = false;
            lastSavedUpdatedAtRef.current = newUpdatedAt;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);
            component.setOriginalValue(newName, {
                dataTypeId: datatypeid,
                field: "name",
                updatedAt: newUpdatedAt,
            });
            component.setDirty(false);
            component.enableSaveButton();
            component.enableRestoreButton();
            component.setHintText("");
            setDetail((prev) => prev ? { ...prev, name: newName, updatedAt: newUpdatedAt } : prev);
        };

        // Stream 1: PubSub
        let pubsubToken: string | false = false;
        pubsubToken = subscribe(
            { and: [TAG_DATA_TYPE, TAG_UPDATE] },
            async (msg: PubSubMessage) => {
                const data = msg.data as Record<string, unknown> | undefined;
                if (!data || data.identifier !== datatypeid) return;
                try {
                    const refreshed = await getDataTypeDetail(datatypeid);
                    const dt: DataTypeEntity = {
                        ...(refreshed.dataType as any).dataType,
                        ownerBusinessDomainName: (refreshed.dataType as any).owner?.name ?? null,
                    };
                    if (!resolved) finalizeSuccess(dt.name, dt.updatedAt);
                } catch { /* consume */ }
            },
        );

        // Stream 2: Timer (fallback re-fetch)
        const timerId = setTimeout(async () => {
            if (resolved) return;
            resolved = true;
            if (pubsubToken) unsubscribe(pubsubToken);
            try {
                const payload = await getDataTypeDetail(datatypeid);
                const dt: DataTypeEntity = {
                    ...(payload.dataType as any).dataType,
                    ownerBusinessDomainName: (payload.dataType as any).owner?.name ?? null,
                };
                if (!resolved) { finalizeSuccess(dt.name, dt.updatedAt); return; }
            } catch { /* re-fetch failed */ }
            component.enableSaveButton();
            component.enableRestoreButton();
            component.setHintText("");
        }, 1000);

        component.disableSaveButton();
        component.disableRestoreButton();

        // Stream 3: Server
        try {
            const response = await updateDataType(datatypeid, {
                knownUpdatedAt: (ctx?.updatedAt as string) ?? detail.updatedAt,
                name: rawValue.trim(),
            });
            if (!resolved) {
                finalizeSuccess(rawValue.trim(), response.dataType.updatedAt);
            }
        } catch (err: unknown) {
            savingRef.current = false;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);
            if (err instanceof ApiError && err.status === 409) {
                if (resolved) return;
                component.setHintText("This data type was modified by another user. Please refresh.");
                component.setDirty(true);
                component.enableRestoreButton();
            } else if (!resolved) {
                component.enableSaveButton();
                component.enableRestoreButton();
            }
        }
    }, [detail, datatypeid]);

    // ---- Description: three-stream race save (PubSub + timer fallback + API call) ----

    const handleSaveDescription = useCallback(async (
        component: InputFieldHandle,
        _source: "button" | "blur",
    ) => {
        if (!detail || !datatypeid) return;
        const rawValue = component.getCurrentValue();
        if (!component.compareWithOriginal()) return;
        const ctx = component.getContext();

        savingRef.current = true;
        let resolved = false;

        const finalizeSuccess = (newDescription: string, newUpdatedAt: string) => {
            if (resolved) return;
            resolved = true;
            savingRef.current = false;
            lastSavedUpdatedAtRef.current = newUpdatedAt;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);
            component.setOriginalValue(newDescription, {
                dataTypeId: datatypeid,
                field: "description",
                updatedAt: newUpdatedAt,
            });
            component.setDirty(false);
            component.enableSaveButton();
            component.enableRestoreButton();
            component.setHintText("");
            setDetail((prev) => prev ? { ...prev, description: newDescription || null, updatedAt: newUpdatedAt } : prev);
        };

        // Stream 1: PubSub
        let pubsubToken: string | false = false;
        pubsubToken = subscribe(
            { and: [TAG_DATA_TYPE, TAG_UPDATE] },
            async (msg: PubSubMessage) => {
                const data = msg.data as Record<string, unknown> | undefined;
                if (!data || data.identifier !== datatypeid) return;
                try {
                    const refreshed = await getDataTypeDetail(datatypeid);
                    const dt: DataTypeEntity = {
                        ...(refreshed.dataType as any).dataType,
                        ownerBusinessDomainName: (refreshed.dataType as any).owner?.name ?? null,
                    };
                    if (!resolved) finalizeSuccess(dt.description ?? "", dt.updatedAt);
                } catch { /* consume */ }
            },
        );

        // Stream 2: Timer (fallback re-fetch)
        const timerId = setTimeout(async () => {
            if (resolved) return;
            resolved = true;
            if (pubsubToken) unsubscribe(pubsubToken);
            try {
                const payload = await getDataTypeDetail(datatypeid);
                const dt: DataTypeEntity = {
                    ...(payload.dataType as any).dataType,
                    ownerBusinessDomainName: (payload.dataType as any).owner?.name ?? null,
                };
                if (!resolved) { finalizeSuccess(dt.description ?? "", dt.updatedAt); return; }
            } catch { /* re-fetch failed */ }
            component.enableSaveButton();
            component.enableRestoreButton();
            component.setHintText("");
        }, 1000);

        component.disableSaveButton();
        component.disableRestoreButton();

        // Stream 3: Server
        try {
            const response = await updateDataType(datatypeid, {
                knownUpdatedAt: (ctx?.updatedAt as string) ?? detail.updatedAt,
                description: rawValue.trim().length > 0 ? rawValue.trim() : null,
            });
            if (!resolved) {
                finalizeSuccess(rawValue.trim().length > 0 ? rawValue.trim() : "", response.dataType.updatedAt);
            }
        } catch (err: unknown) {
            savingRef.current = false;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);
            if (err instanceof ApiError && err.status === 409) {
                if (resolved) return;
                component.setHintText("This data type was modified by another user. Please refresh.");
                component.setDirty(true);
                component.enableRestoreButton();
            } else if (!resolved) {
                component.enableSaveButton();
                component.enableRestoreButton();
            }
        }
    }, [detail, datatypeid]);

    // ---- Toggle disabled ----

    const handleToggleDisabled = async () => {
        if (!detail || !datatypeid) return;
        try {
            const updated = await setDataTypeDisabled(datatypeid, {
                disabled: !detail.disabled,
                knownUpdatedAt: detail.updatedAt,
            });
            setDetail(updated.dataType);
        } catch (toggleError) {
            setError(toggleError instanceof Error ? toggleError.message : "Could not toggle disabled state");
        }
    };

    // ---- Permission handlers ----

    const makeGrantHandler = (role: string) => async (groupIdentifier: string) => {
        if (!datatypeid) return;
        try {
            const result = await grantDataTypePermission(datatypeid, { groupIdentifier, role });
            setPermissions((prev) => {
                const filtered = prev.filter(
                    (p) => !(p.groupIdentifier === groupIdentifier && p.role === role),
                );
                return [...filtered, result.permission];
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not grant permission");
        }
    };

    const makeRevokeHandler = (role: string) => async (groupIdentifier: string) => {
        if (!datatypeid) return;
        try {
            await revokeDataTypePermission(datatypeid, { groupIdentifier, role });
            setPermissions((prev) => prev.filter(
                (p) => !(p.groupIdentifier === groupIdentifier && p.role === role),
            ));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not revoke permission");
        }
    };

    const handleToggleShowByDefault = async (entry: DataTypePermissionEntry) => {
        if (!datatypeid) return;
        try {
            const result = await updateDataTypePermission(datatypeid, permId(entry), {
                showByDefault: !entry.showByDefault,
                knownUpdatedAt: entry.createdAt,
            });
            setPermissions((prev) =>
                prev.map((p) =>
                    p.groupIdentifier === entry.groupIdentifier && p.role === entry.role
                        ? { ...p, showByDefault: result.permission.showByDefault }
                        : p,
                ),
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update permission");
        }
    };

    // ---- Derived values ----

    const ownerChanged = editOwner !== origOwner;

    const viewerAssigned = useMemo(() => [...permissions.filter((p) => p.role === "viewer")].sort((a, b) => a.groupName.localeCompare(b.groupName)), [permissions]);
    const writerAssigned = useMemo(() => [...permissions.filter((p) => p.role === "writer")].sort((a, b) => a.groupName.localeCompare(b.groupName)), [permissions]);
    const approverAssigned = useMemo(() => [...permissions.filter((p) => p.role === "approver")].sort((a, b) => a.groupName.localeCompare(b.groupName)), [permissions]);

    if (isLoading || !detail) {
        return (
            <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
                <PageSection title="Data type details">
                    <p>Loading data type details...</p>
                </PageSection>
            </PageTemplate>
        );
    }

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            {error ? <p className="admin-config-error">{error}</p> : null}

            {/* A. Metadata Section */}
            <CollapsibleSection title="Metadata" defaultExpanded>
                {/* Row 1: Name | Description (span three columns) */}
                <div className="admin-detail-grid" style={{ gridTemplateColumns: "1fr 3fr" }}>
                    {canManage ? (
                        <>
                            <div>
                                <strong>Name:</strong>
                                <div className="admin-config-actions admin-top-gap">
                                    <InputField
                                        ref={nameInputRef}
                                        showButtons={true}
                                        onSave={handleSaveName}
                                    />
                                </div>
                            </div>
                            <div>
                                <strong>Description:</strong>
                                <div className="admin-config-inline-editor admin-top-gap">
                                    <InputField
                                        ref={descriptionInputRef}
                                        multiLine={true}
                                        showButtons={true}
                                        onSave={handleSaveDescription}
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div><strong>Name:</strong> {detail.name}</div>
                            <div><strong>Description:</strong> {detail.description ?? "-"}</div>
                        </>
                    )}
                </div>

                {/* Row 2: Mandatory | Requestor can edit | Owner | Status */}
                <div className="admin-detail-grid admin-top-gap" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                   <div>
                       <strong>Mandatory:</strong>{" "}
                       {canManage ? (
                           <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                               <Toggle<string>
                                   variant="pill"
                                   options={[
                                       { value: "yes", label: "Yes" },
                                       { value: "no", label: "No" },
                                       { value: "script", label: "Script" },
                                   ]}
                                   value={chipValue(editMandatory)}
                                   onChange={(t) => {
                                       if (!canManage) return;
                                       const val = t.getValue();
                                        if (val === "script") {
                                            setEditMandatory(mandatoryScript || "");
                                            setMandatoryPopupVisible(true);
                                        } else if (val === "yes") {
                                           setEditMandatory(true);
                                           void saveMandatoryOrRequestorCanEdit("mandatory", true);
                                       } else if (val === "no") {
                                           setEditMandatory(false);
                                           void saveMandatoryOrRequestorCanEdit("mandatory", false);
                                       }
                                   }}
                                   disabled={!canManage}
                               />
                               {chipValue(editMandatory) === "script" ? (
                                   <button
                                       type="button"
                                       className="p-button p-button-sm p-button-outlined"
                                       onClick={() => setMandatoryPopupVisible(true)}
                                       disabled={!canManage}
                                   >
                                       <i className="pi pi-pencil" style={{ marginRight: "4px" }} />
                                       Edit script
                                   </button>
                               ) : null}
                           </div>
                       ) : (
                           <span>{chipValue(detail.mandatory) === "script" ? "Script" : detail.mandatory === true || detail.mandatory === "Yes" ? "Yes" : "No"}</span>
                       )}
                   </div>
                    <div>
                        <strong>Requestor can edit:</strong>{" "}
                        {canManage ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                <Toggle<string>
                                    variant="pill"
                                    options={[
                                        { value: "yes", label: "Yes" },
                                        { value: "no", label: "No" },
                                        { value: "script", label: "Script" },
                                    ]}
                                    value={chipValue(editRequestorCanEdit)}
                                    onChange={(t) => {
                                        if (!canManage) return;
                                        const val = t.getValue();
                                        if (val === "script") {
                                            setEditRequestorCanEdit(requestorCanEditScript || "");
                                            setRequestorCanEditPopupVisible(true);
                                        } else if (val === "yes") {
                                            setEditRequestorCanEdit(true);
                                            void saveMandatoryOrRequestorCanEdit("requestorCanEdit", true);
                                        } else if (val === "no") {
                                            setEditRequestorCanEdit(false);
                                            void saveMandatoryOrRequestorCanEdit("requestorCanEdit", false);
                                        }
                                    }}
                                    disabled={!canManage}
                                />
                                {chipValue(editRequestorCanEdit) === "script" ? (
                                    <button
                                        type="button"
                                        className="p-button p-button-sm p-button-outlined"
                                        onClick={() => setRequestorCanEditPopupVisible(true)}
                                        disabled={!canManage}
                                    >
                                        <i className="pi pi-pencil" style={{ marginRight: "4px" }} />
                                        Edit script
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            <span>{chipValue(detail.requestorCanEdit) === "script" ? "Script" : detail.requestorCanEdit === true || detail.requestorCanEdit === "Yes" ? "Yes" : "No"}</span>
                        )}
                    </div>
                    <div>
                        <strong>Owner:</strong>{" "}
                        {canManage ? (
                            <select
                                value={editOwner}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setEditOwner(val);
                                    void persistEdits({ owner: val });
                                }}
                            >
                                {ownerOptions.map((opt) => (
                                    <option key={opt.identifier} value={opt.identifier}>{opt.name}</option>
                                ))}
                            </select>
                        ) : (
                            <span>{detail.ownerBusinessDomainName ?? detail.owner}</span>
                        )}
                    </div>
                    <div>
                        <strong>Status:</strong>{" "}
                        {canManage ? (
                            <button
                                type="button"
                                className={`mui-pill ${detail.disabled ? "admin-configuration-status-chip-disabled" : "admin-configuration-status-chip-enabled"}`}
                                onClick={() => void handleToggleDisabled()}
                            >
                                {detail.disabled ? "Inactive" : "Enabled"}
                            </button>
                        ) : (
                            <span className={`mui-pill ${detail.disabled ? "admin-configuration-status-chip-disabled" : "admin-configuration-status-chip-enabled"}`}>
                                {detail.disabled ? "Inactive" : "Enabled"}
                            </span>
                        )}
                    </div>
                </div>

                {/* Row 3: Kind | Created at and by | Updated at and by | Identifier */}
                <div className="admin-detail-grid admin-top-gap" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                    <div><strong>Kind:</strong> {detail.kind}</div>
                    <div>
                        <strong>Created:</strong> {formatTimestamp(detail.createdAt)}
                        <br />
                        <strong>by:</strong> {formatUserRef(detail.createdBy, userRefs)}
                    </div>
                    <div>
                        <strong>Updated:</strong> {formatTimestamp(detail.updatedAt)}
                        <br />
                        <strong>by:</strong> {formatUserRef(detail.updatedBy, userRefs)}
                    </div>
                    <div><strong>Identifier:</strong> <code>{detail.identifier}</code></div>
                </div>
            </CollapsibleSection>

            {/* B. Config Editor Section */}
            <CollapsibleSection title="Configuration" defaultExpanded>
                {(() => {
                    switch (detail.kind) {
                        case DataTypeKind.Calculated:
                            return (
                                <div className="admin-datatype-config-section">
                                    <label>
                                        Mode
                                        <select
                                            value={String(editConfig["mode"] ?? "on_export")}
                                            onChange={(e) => setFieldAndSave("mode", e.target.value)}
                                        >
                                            <option value="on_change">On Change</option>
                                            <option value="on_export">On Export</option>
                                        </select>
                                    </label>
                                    <MonacoField
                                        label="Script"
                                        value={editConfig.script as string | undefined}
                                        originalValue={origConfig.script as string | undefined}
                                        onChange={(val) => setField("script", val)}
                                        onSave={saveField("script")}
                                        onRestore={restoreField("script")}
                                        helpText={MONACO_HELP.script}
                                        isSaving={isSaving}
                                    />
                                </div>
                            );

                        case DataTypeKind.Boolean:
                            return (
                                <div className="admin-datatype-config-section">
                                    <label className="admin-checkbox-label">
                                        <Checkbox
                                            checked={Boolean(editConfig["permitEmpty"])}
                                            onChange={(e) => setFieldAndSave("permitEmpty", e.checked)}
                                        />
                                        <span>Permit Empty</span>
                                    </label>
                                    <label>
                                        Default Provider Mode
                                        <select
                                            value={String(editConfig["mode"] ?? DefaultValueCalculationMode.OnCreate)}
                                            onChange={(e) => setFieldAndSave("mode", e.target.value)}
                                        >
                                            <option value={DefaultValueCalculationMode.OnCreate}>On Create</option>
                                            <option value={DefaultValueCalculationMode.OnChangeNoValue}>On Change (no value)</option>
                                            <option value={DefaultValueCalculationMode.OnChange}>On Change</option>
                                        </select>
                                    </label>
                                    <MonacoField
                                        label="Default Provider"
                                        value={editConfig.defaultProvider as string | undefined}
                                        originalValue={origConfig.defaultProvider as string | undefined}
                                        onChange={(val) => setField("defaultProvider", val)}
                                        onSave={saveField("defaultProvider")}
                                        onRestore={restoreField("defaultProvider")}
                                        helpText={MONACO_HELP.defaultProvider}
                                        isSaving={isSaving}
                                    />
                                    <MonacoField
                                        label="Validate"
                                        value={editConfig.validate as string | undefined}
                                        originalValue={origConfig.validate as string | undefined}
                                        onChange={(val) => setField("validate", val)}
                                        onSave={saveField("validate")}
                                        onRestore={restoreField("validate")}
                                        helpText={MONACO_HELP.validate}
                                        isSaving={isSaving}
                                    />
                                </div>
                            );

                        case DataTypeKind.String:
                            return (
                                <div className="admin-datatype-config-section">
                                    <label className="admin-checkbox-label">
                                        <Checkbox
                                            checked={Boolean(editConfig["multi"])}
                                            onChange={(e) => setFieldAndSave("multi", e.checked)}
                                        />
                                        <span>Multi-line</span>
                                    </label>
                                    <label>
                                        Input Validation Regex
                                        <InputText
                                            type="text"
                                            value={String(editConfig["inputValidation"] ?? "")}
                                            placeholder="e.g. ^[A-Z]{2}\d{4}$"
                                            onChange={(e) => setField("inputValidation", e.target.value || undefined)}
                                            onBlur={() => saveConfigImmediate(editConfig)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveConfigImmediate(editConfig); }}
                                            style={{ width: "100%" }}
                                        />
                                    </label>
                                    <label>
                                        Default Provider Mode
                                        <select
                                            value={String(editConfig["mode"] ?? DefaultValueCalculationMode.OnCreate)}
                                            onChange={(e) => setFieldAndSave("mode", e.target.value)}
                                        >
                                            <option value={DefaultValueCalculationMode.OnCreate}>On Create</option>
                                            <option value={DefaultValueCalculationMode.OnChangeNoValue}>On Change (no value)</option>
                                            <option value={DefaultValueCalculationMode.OnChange}>On Change</option>
                                        </select>
                                    </label>
                                    <MonacoField
                                        label="Default Provider"
                                        value={editConfig.defaultProvider as string | undefined}
                                        originalValue={origConfig.defaultProvider as string | undefined}
                                        onChange={(val) => setField("defaultProvider", val)}
                                        onSave={saveField("defaultProvider")}
                                        onRestore={restoreField("defaultProvider")}
                                        helpText={MONACO_HELP.defaultProvider}
                                        isSaving={isSaving}
                                    />
                                    <MonacoField
                                        label="Validate"
                                        value={editConfig.validate as string | undefined}
                                        originalValue={origConfig.validate as string | undefined}
                                        onChange={(val) => setField("validate", val)}
                                        onSave={saveField("validate")}
                                        onRestore={restoreField("validate")}
                                        helpText={MONACO_HELP.validate}
                                        isSaving={isSaving}
                                    />
                                </div>
                            );

                        case DataTypeKind.Lookup:
                            return (
                                <div className="admin-datatype-config-section">
                                    <label>
                                        Source Lookup
                                        <select
                                            value={String(editConfig["source"] ?? "")}
                                            onChange={(e) => setFieldAndSave("source", e.target.value || undefined)}
                                        >
                                            {lookupOptions.map((opt) => (
                                                <option key={opt.identifier} value={opt.identifier}>{opt.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="admin-checkbox-label">
                                        <Checkbox
                                            checked={Boolean(editConfig["multi"])}
                                            onChange={(e) => setFieldAndSave("multi", e.checked)}
                                        />
                                        <span>Multi-select</span>
                                    </label>
                                    <label>
                                        Default Provider Mode
                                        <select
                                            value={String(editConfig["mode"] ?? DefaultValueCalculationMode.OnCreate)}
                                            onChange={(e) => setFieldAndSave("mode", e.target.value)}
                                        >
                                            <option value={DefaultValueCalculationMode.OnCreate}>On Create</option>
                                            <option value={DefaultValueCalculationMode.OnChangeNoValue}>On Change (no value)</option>
                                            <option value={DefaultValueCalculationMode.OnChange}>On Change</option>
                                        </select>
                                    </label>
                                    <MonacoField
                                        label="Default Provider"
                                        value={editConfig.defaultProvider as string | undefined}
                                        originalValue={origConfig.defaultProvider as string | undefined}
                                        onChange={(val) => setField("defaultProvider", val)}
                                        onSave={saveField("defaultProvider")}
                                        onRestore={restoreField("defaultProvider")}
                                        helpText={MONACO_HELP.defaultProvider}
                                        isSaving={isSaving}
                                    />
                                    <MonacoField
                                        label="Filter"
                                        value={editConfig.filter as string | undefined}
                                        originalValue={origConfig.filter as string | undefined}
                                        onChange={(val) => setField("filter", val)}
                                        onSave={saveField("filter")}
                                        onRestore={restoreField("filter")}
                                        helpText={MONACO_HELP.filter}
                                        isSaving={isSaving}
                                    />
                                    <MonacoField
                                        label="Validate"
                                        value={editConfig.validate as string | undefined}
                                        originalValue={origConfig.validate as string | undefined}
                                        onChange={(val) => setField("validate", val)}
                                        onSave={saveField("validate")}
                                        onRestore={restoreField("validate")}
                                        helpText={MONACO_HELP.validate}
                                        isSaving={isSaving}
                                    />
                                </div>
                            );

                        case DataTypeKind.Consumable:
                            return (
                                <div className="admin-datatype-config-section">
                                    <label>
                                        Source Consumable
                                        <select
                                            value={String(editConfig["source"] ?? "")}
                                            onChange={(e) => setFieldAndSave("source", e.target.value || undefined)}
                                        >
                                            {consumableOptions.map((opt) => (
                                                <option key={opt.identifier} value={opt.identifier}>{opt.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="admin-checkbox-label">
                                        <Checkbox
                                            checked={Boolean(editConfig["multi"])}
                                            onChange={(e) => setFieldAndSave("multi", e.checked)}
                                        />
                                        <span>Multi-select</span>
                                    </label>
                                    <label>
                                        Default Provider Mode
                                        <select
                                            value={String(editConfig["mode"] ?? DefaultValueCalculationMode.OnCreate)}
                                            onChange={(e) => setFieldAndSave("mode", e.target.value)}
                                        >
                                            <option value={DefaultValueCalculationMode.OnCreate}>On Create</option>
                                            <option value={DefaultValueCalculationMode.OnChangeNoValue}>On Change (no value)</option>
                                            <option value={DefaultValueCalculationMode.OnChange}>On Change</option>
                                        </select>
                                    </label>
                                    <MonacoField
                                        label="Default Provider"
                                        value={editConfig.defaultProvider as string | undefined}
                                        originalValue={origConfig.defaultProvider as string | undefined}
                                        onChange={(val) => setField("defaultProvider", val)}
                                        onSave={saveField("defaultProvider")}
                                        onRestore={restoreField("defaultProvider")}
                                        helpText={MONACO_HELP.defaultProvider}
                                        isSaving={isSaving}
                                    />
                                    <MonacoField
                                        label="Filter"
                                        value={editConfig.filter as string | undefined}
                                        originalValue={origConfig.filter as string | undefined}
                                        onChange={(val) => setField("filter", val)}
                                        onSave={saveField("filter")}
                                        onRestore={restoreField("filter")}
                                        helpText={MONACO_HELP.filter}
                                        isSaving={isSaving}
                                    />
                                    <MonacoField
                                        label="Validate"
                                        value={editConfig.validate as string | undefined}
                                        originalValue={origConfig.validate as string | undefined}
                                        onChange={(val) => setField("validate", val)}
                                        onSave={saveField("validate")}
                                        onRestore={restoreField("validate")}
                                        helpText={MONACO_HELP.validate}
                                        isSaving={isSaving}
                                    />
                                </div>
                            );

                        case DataTypeKind.Product:
                            return (
                                <div className="admin-datatype-config-section">
                                    <label className="admin-checkbox-label">
                                        <Checkbox
                                            checked={Boolean(editConfig["multi"])}
                                            onChange={(e) => setFieldAndSave("multi", e.checked)}
                                        />
                                        <span>Multi-select</span>
                                    </label>
                                    <label>
                                        Default Provider Mode
                                        <select
                                            value={String(editConfig["mode"] ?? DefaultValueCalculationMode.OnCreate)}
                                            onChange={(e) => setFieldAndSave("mode", e.target.value)}
                                        >
                                            <option value={DefaultValueCalculationMode.OnCreate}>On Create</option>
                                            <option value={DefaultValueCalculationMode.OnChangeNoValue}>On Change (no value)</option>
                                            <option value={DefaultValueCalculationMode.OnChange}>On Change</option>
                                        </select>
                                    </label>
                                    <MonacoField
                                        label="Default Provider"
                                        value={editConfig.defaultProvider as string | undefined}
                                        originalValue={origConfig.defaultProvider as string | undefined}
                                        onChange={(val) => setField("defaultProvider", val)}
                                        onSave={saveField("defaultProvider")}
                                        onRestore={restoreField("defaultProvider")}
                                        helpText={MONACO_HELP.defaultProvider}
                                        isSaving={isSaving}
                                    />
                                    <MonacoField
                                        label="Filter"
                                        value={editConfig.filter as string | undefined}
                                        originalValue={origConfig.filter as string | undefined}
                                        onChange={(val) => setField("filter", val)}
                                        onSave={saveField("filter")}
                                        onRestore={restoreField("filter")}
                                        helpText={MONACO_HELP.filter}
                                        isSaving={isSaving}
                                    />
                                    <MonacoField
                                        label="Validate"
                                        value={editConfig.validate as string | undefined}
                                        originalValue={origConfig.validate as string | undefined}
                                        onChange={(val) => setField("validate", val)}
                                        onSave={saveField("validate")}
                                        onRestore={restoreField("validate")}
                                        helpText={MONACO_HELP.validate}
                                        isSaving={isSaving}
                                    />
                                </div>
                            );

                        default:
                            return <p>Unknown data type kind: {detail.kind}</p>;
                    }
                })()}
            </CollapsibleSection>

            {/* C. Permissions Section */}
            <CollapsibleSection title="Permissions" defaultExpanded>
                <div className="admin-datatype-permissions-container">
                    <PermissionChipManager
                        label="Viewer"
                        role="viewer"
                        allGroups={allGroups}
                        assignedPermissions={viewerAssigned}
                        onGrant={makeGrantHandler("viewer")}
                        onRevoke={makeRevokeHandler("viewer")}
                        onToggleShowByDefault={handleToggleShowByDefault}
                        canManage={canManage}
                    />
                    <PermissionChipManager
                        label="Writer"
                        role="writer"
                        allGroups={allGroups}
                        assignedPermissions={writerAssigned}
                        onGrant={makeGrantHandler("writer")}
                        onRevoke={makeRevokeHandler("writer")}
                        onToggleShowByDefault={async () => {}}
                        canManage={canManage}
                    />
                    <PermissionChipManager
                        label="Approver"
                        role="approver"
                        allGroups={allGroups}
                        assignedPermissions={approverAssigned}
                        onGrant={makeGrantHandler("approver")}
                        onRevoke={makeRevokeHandler("approver")}
                        onToggleShowByDefault={async () => {}}
                        canManage={canManage}
                    />
                </div>
            </CollapsibleSection>

            <div className="admin-top-gap">
                <Link to="/configuration/datatypes">Back to data types</Link>
            </div>

            <ScriptEditorPopup
                visible={mandatoryPopupVisible}
                onHide={() => setMandatoryPopupVisible(false)}
                title="Edit Mandatory Script"
                script={mandatoryScript}
                onSave={async (script) => {
                    setMandatoryScript(script);
                    setEditMandatory(script);
                    await saveMandatoryOrRequestorCanEdit("mandatory", script);
                }}
            />

            <ScriptEditorPopup
                visible={requestorCanEditPopupVisible}
                onHide={() => setRequestorCanEditPopupVisible(false)}
                title="Edit Requestor Can Edit Script"
                script={requestorCanEditScript}
                onSave={async (script) => {
                    setRequestorCanEditScript(script);
                    setEditRequestorCanEdit(script);
                    await saveMandatoryOrRequestorCanEdit("requestorCanEdit", script);
                }}
            />
        </PageTemplate>
    );
}
