import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import Label, { type LabelHandle } from "@/ui/components/Label";
import Toggle from "@/ui/components/Toggle";
import InputField, { type InputFieldHandle } from "@/ui/components/InputField";
import { PageSection, PageTemplate } from "./PageTemplate.tsx";
import { apiGet } from "@/ui/api/index.ts";
import type { UserSelectType } from "@/types/UserType.ts";
import type { ConfigurationEntity } from "@/types/ConfigurationTypes.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";
import type { TagExpression, PubSubMessage } from "@/types/PubSubType";

type ViewerContext = { permissionNames: string[] };

type EntityPagePayload<T extends ConfigurationEntity = ConfigurationEntity> = {
    rows: T[];
    total: number;
    page: number;
    pageSize: number;
    availablePageSizes: number[];
};

type EntityPageProps<T extends ConfigurationEntity = ConfigurationEntity> = {
    urn: string;
    title: string;
    description: string;
    sectionTitle: string;
    entityLabelSingular: string;
    entityLabelPlural: string;
    viewPermissionName: string;
    managePermissionName: string;
    pubSubTopics: readonly TagExpression[];
    loadPage: (page: number, pageSize: number, includeDisabled: boolean) => Promise<EntityPagePayload<T>>;
    createEntity: (name: string, extraFields?: Record<string, string>) => Promise<ConfigurationEntity>;
    renameEntity: (identifier: string, data: { name: string; knownUpdatedAt: string }) => Promise<ConfigurationEntity>;
    setEntityDisabled: (identifier: string, data: { disabled: boolean; knownUpdatedAt: string }) => Promise<ConfigurationEntity>;
    rowHref?: (row: T) => string;
    createdEntityHref?: (row: ConfigurationEntity) => string;
    extraColumnHeaders?: readonly string[];
    renderExtraCells?: (row: T) => React.ReactNode[];
    renderCreateFields?: (state: { values: Record<string, string>; onChange: (key: string, value: string) => void }) => React.ReactNode;
    extraCreateFields?: readonly { key: string; label: string }[];
};

// --- Label refs for pubsub-driven row updates ---
interface EntityLabelRefs {
    name: React.RefObject<LabelHandle | null>;
    status: React.RefObject<LabelHandle | null>;
    created: React.RefObject<LabelHandle | null>;
    updated: React.RefObject<LabelHandle | null>;
}

type UserRefMap = Record<string, UserSelectType | null>;

function normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, " ");
}

function compareEntities(a: ConfigurationEntity, b: ConfigurationEntity): number {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (byName !== 0) return byName;
    return a.identifier.localeCompare(b.identifier);
}

function formatTimestamp(value: string): string {
    return new Date(value).toLocaleString();
}

function formatUserRef(identifier: string | null, userRefs: UserRefMap): string {
    if (!identifier) return "-";
    const user = userRefs[identifier];
    if (!user) return identifier;
    return `${user.firstName} ${user.lastName} (${user.email})`;
}

export function ConfigurationEntitiesPage<T extends ConfigurationEntity = ConfigurationEntity>(props: EntityPageProps<T>) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [rows, setRows] = useState<T[]>([]);
    const [availablePageSizes, setAvailablePageSizes] = useState<number[]>([10, 20, 50]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isPageLoading, setIsPageLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [userRefs, setUserRefs] = useState<UserRefMap>({});
    const [createExtraFields, setCreateExtraFields] = useState<Record<string, string>>({});

    const queryPage = Number(searchParams.get("page") ?? "1");
    const queryPageSize = Number(searchParams.get("pageSize") ?? "10");
    const showDisabled = searchParams.get("showDisabled") === "1";
    const page = Number.isInteger(queryPage) && queryPage > 0 ? queryPage : 1;
    const pageSize = Number.isInteger(queryPageSize) && queryPageSize > 0 ? queryPageSize : 10;

    const canManage = viewerContext.permissionNames.includes(props.managePermissionName);
    const canView = viewerContext.permissionNames.includes(props.viewPermissionName);

    // --- Refs -----------------------------------------------------------------

    const labelRefs = useRef<Map<string, EntityLabelRefs>>(new Map());
    const editInputRef = useRef<InputFieldHandle | null>(null);
    const createNameInputRef = useRef<InputFieldHandle | null>(null);
    const editingEntityIdRef = useRef<string | null>(null);
    editingEntityIdRef.current = editingEntityId;

    // Guard to prevent PubSub feedback loop during our own saves
    const savingRef = useRef<boolean>(false);
    // Tracks the updatedAt we just received from our own save, so permanent PubSub
    // subscriptions can skip our own echo and only react to external changes.
    const lastSavedUpdatedAtRef = useRef<string | null>(null);

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

    useEffect(() => {
        let cancelled = false;
        void apiGet<ViewerContext>("/api/me/context").then((payload) => {
            if (!cancelled) setViewerContext({ permissionNames: Array.isArray(payload.permissionNames) ? payload.permissionNames : [] });
        }).catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const load = async () => {
        const setLoading = page === 1 && rows.length === 0 ? setIsLoading : setIsPageLoading;
        setLoading(true);
        setError(null);
        try {
            const payload = await props.loadPage(page - 1, pageSize, showDisabled);
            setRows(payload.rows);
            setTotal(payload.total);
            setAvailablePageSizes(payload.availablePageSizes);
            if (payload.page !== page - 1) updateQuery({ page: payload.page + 1 });
            if (!payload.availablePageSizes.includes(pageSize) && payload.availablePageSizes.length > 0) {
                updateQuery({ page: 1, pageSize: payload.availablePageSizes[0] });
            }
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : `Could not load ${props.entityLabelPlural.toLowerCase()}`);
        } finally {
            setIsLoading(false);
            setIsPageLoading(false);
        }
    };

    const loadRef = useRef(load);
    loadRef.current = load;

    useEffect(() => {
        if (!canView) return;
        void load();
    }, [page, pageSize, showDisabled, canView]);

    useEffect(() => {
        if (!canView) return;
        const identifiers = Array.from(new Set(rows
            .flatMap((row) => [row.createdBy, row.updatedBy])
            .filter((value): value is string => typeof value === "string" && value.length > 0)
            .filter((identifier) => userRefs[identifier] === undefined)));
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
                results.forEach((result) => {
                    next[result.identifier] = result.user;
                });
                return next;
            });
        });

        return () => {
            cancelled = true;
        };
    }, [canView, rows, userRefs]);

    // --- Seed Labels with initial text after rows load ---
    useEffect(() => {
        rows.forEach((row) => {
            const refs = labelRefs.current.get(row.identifier);
            if (refs) {
                refs.name.current?.setText(row.name, { entityId: row.identifier, field: "name" });
                refs.status.current?.setText(row.disabled ? "Disabled" : "Enabled", { entityId: row.identifier, field: "status" });
                refs.created.current?.setText(formatTimestamp(row.createdAt), { entityId: row.identifier, field: "created" });
                refs.updated.current?.setText(formatTimestamp(row.updatedAt), { entityId: row.identifier, field: "updated" });
            }
        });
    }, [rows]);

    // --- PubSub subscription for live updates via Label refs ---
    useEffect(() => {
        if (!canView) return;
        const tokens = props.pubSubTopics.map((topic) => subscribe(topic, (msg: PubSubMessage) => {
            if (savingRef.current) return;
            const tags = msg.tags;
            const data = msg.data as Record<string, unknown> | undefined;
            // Skip our own echo: if the updatedAt matches what we just saved,
            // this PubSub event is the result of our own change.
            if (data?.updatedAt === lastSavedUpdatedAtRef.current) return;

            // CREATE: re-fetch the full list
            if (tags.includes("create")) {
                void loadRef.current();
                return;
            }

            const entityId = tags.find((t) => /^[0-9a-f-]{36}$/i.test(t));
            if (!entityId) return;
            const refs = labelRefs.current.get(entityId);
            if (!refs) return;

            if (tags.includes("update")) {
                if (data?.name !== undefined) refs.name.current?.setText(String(data.name), { entityId, field: "name" });
                if (data?.updatedAt !== undefined) refs.updated.current?.setText(formatTimestamp(String(data.updatedAt)), { entityId, field: "updated" });
            }
            if (tags.includes("disable")) {
                const disabled = data?.disabled === true;
                refs.status.current?.setText(disabled ? "Disabled" : "Enabled", { entityId, field: "status" });
            }

            // Cancel inline editing if the edited entity was updated externally
            if (entityId === editingEntityIdRef.current) {
                setEditingEntityId(null);
            }
        }));

        return () => {
            tokens.forEach((token) => {
                if (token) unsubscribe(token);
            });
        };
    }, [canView]);

    // --- InputField setup for inline name editing ---
    useEffect(() => {
        if (editingEntityId && editInputRef.current) {
            const row = rows.find((r) => r.identifier === editingEntityId);
            if (row) {
                editInputRef.current.setOriginalValue(row.name, {
                    entityId: row.identifier,
                    field: "name",
                    updatedAt: row.updatedAt,
                });
            }
        }
    }, [editingEntityId, rows]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const handleInlineSave = async (component: InputFieldHandle) => {
        if (!editingEntityId) return;
        const nextName = normalizeName(component.getCurrentValue());
        const ctx = component.getContext();
        const knownUpdatedAt = (ctx?.updatedAt as string) ?? "";

        if (nextName.length === 0 || !component.compareWithOriginal()) {
            setEditingEntityId(null);
            return;
        }

        savingRef.current = true;
        component.disableSaveButton();
        component.disableRestoreButton();
        try {
            const updated = await props.renameEntity(editingEntityId, {
                name: nextName,
                knownUpdatedAt,
            });
            lastSavedUpdatedAtRef.current = updated.updatedAt;
            setRows((currentRows) => currentRows
                .map((row) => (row.identifier === updated.identifier ? updated as T : row))
                .sort(compareEntities));
            setEditingEntityId(null);
            setError(null);
        } catch (saveError) {
            component.enableSaveButton();
            component.enableRestoreButton();
            setError(saveError instanceof Error ? saveError.message : `Could not update ${props.entityLabelSingular.toLowerCase()}`);
        } finally {
            savingRef.current = false;
        }
    };

    const createDisabled = normalizeName(createName).length === 0 || isCreating;

    return (
        <PageTemplate urn={props.urn} title={props.title} description={props.description}>
            <PageSection title={props.sectionTitle}>
                {error ? <p className="admin-config-error">{error}</p> : null}

                <div className="admin-toggle-row">
                    <span>Show disabled {props.entityLabelPlural.toLowerCase()}</span>
                    <Toggle<boolean>
                        variant="toggle"
                        value={showDisabled}
                        options={[{ value: true, label: "Show disabled" }, { value: false, label: "Hide disabled" }]}
                        onChange={(t) => updateQuery({ showDisabled: t.getValue(), page: 1 })}
                    />
                </div>

                {canManage ? (
                    <div className="admin-top-gap">
                        <button type="button" onClick={() => {
                            setCreateOpen(true);
                            setCreateName("");
                            setCreateError(null);
                            // Reset the InputField when dialog opens
                            setTimeout(() => {
                                createNameInputRef.current?.setOriginalValue("");
                            }, 0);
                        }}>
                            Create new {props.entityLabelSingular.toLowerCase()}
                        </button>
                    </div>
                ) : null}

                {isLoading || isPageLoading ? (
                    <p>Loading {props.entityLabelPlural.toLowerCase()}...</p>
                ) : (
                    <>
                        <table className="mui-simple-table admin-table admin-configuration-entity-table">
                            <thead>
                                <tr>
                                    <th>Identifier</th>
                                    <th>Name</th>
                                    <th>Disabled</th>
                                    <th>Created at</th>
                                    <th>Updated at</th>
                                    <th>Created by</th>
                                    <th>Updated by</th>
                                    {props.extraColumnHeaders?.map((header) => <th key={header}>{header}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => {
                                    // Ensure label refs exist for this row
                                    if (!labelRefs.current.has(row.identifier)) {
                                        labelRefs.current.set(row.identifier, {
                                            name: { current: null },
                                            status: { current: null },
                                            created: { current: null },
                                            updated: { current: null },
                                        });
                                    }
                                    const refs = labelRefs.current.get(row.identifier)!;
                                    const isEditing = editingEntityId === row.identifier;
                                    const rowHref = props.rowHref?.(row);
                                    return (
                                        <tr
                                            key={row.identifier}
                                            className={row.disabled ? "admin-configuration-entity-row-disabled" : undefined}
                                            role={rowHref ? "link" : undefined}
                                            tabIndex={rowHref ? 0 : undefined}
                                            onClick={() => { if (rowHref) navigate(rowHref); }}
                                            onKeyDown={(event) => { if (rowHref && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); navigate(rowHref); } }}
                                        >
                                            <td><code>{row.identifier}</code></td>
                                            <td>
                                                {isEditing ? (
                                                    <InputField
                                                        ref={editInputRef}
                                                        editable
                                                        showButtons
                                                        placeholder="Name"
                                                        onSave={(component) => {
                                                            void handleInlineSave(component);
                                                        }}
                                                    />
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="admin-config-value-button"
                                                        disabled={!canManage}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            if (!canManage) return;
                                                            setEditingEntityId(row.identifier);
                                                        }}
                                                    >
                                                        <Label ref={refs.name} size="normal" text={row.name} />
                                                    </button>
                                                )}
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className={`mui-pill admin-configuration-status-chip ${row.disabled ? "admin-configuration-status-chip-disabled" : "admin-configuration-status-chip-enabled"}`}
                                                    disabled={!canManage}
                                                    onClick={async (event) => {
                                                        event.stopPropagation();
                                                        if (!canManage) return;
                                                        savingRef.current = true;
                                                        try {
                                                            const updated = await props.setEntityDisabled(row.identifier, {
                                                                disabled: !row.disabled,
                                                                knownUpdatedAt: row.updatedAt,
                                                            });
                                                            lastSavedUpdatedAtRef.current = updated.updatedAt;
                                                            setRows((currentRows) => currentRows
                                                                .map((item) => (item.identifier === updated.identifier ? updated as T : item))
                                                                .filter((item) => showDisabled || !item.disabled)
                                                                .sort(compareEntities));
                                                            if (!showDisabled) {
                                                                if (!row.disabled && updated.disabled) setTotal((value) => Math.max(0, value - 1));
                                                                if (row.disabled && !updated.disabled) setTotal((value) => value + 1);
                                                            }
                                                        } catch (toggleError) {
                                                            setError(toggleError instanceof Error ? toggleError.message : `Could not update ${props.entityLabelSingular.toLowerCase()}`);
                                                        } finally {
                                                            savingRef.current = false;
                                                        }
                                                    }}
                                                    title={canManage ? (row.disabled ? "Enable" : "Disable") : undefined}
                                                >
                                                    <Label ref={refs.status} size="small" text={row.disabled ? "Disabled" : "Enabled"} />
                                                </button>
                                            </td>
                                            <td><Label ref={refs.created} size="small" text={formatTimestamp(row.createdAt)} /></td>
                                            <td><Label ref={refs.updated} size="small" text={formatTimestamp(row.updatedAt)} /></td>
                                            <td>{formatUserRef(row.createdBy, userRefs)}</td>
                                            <td>{formatUserRef(row.updatedBy, userRefs)}</td>
                                            {props.renderExtraCells ? props.renderExtraCells(row).map((cell, index) => <td key={`${row.identifier}-extra-${index}`}>{cell}</td>) : null}
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
                                <select className="admin-page-size" value={pageSize} onChange={(event) => updateQuery({ page: 1, pageSize: Number(event.target.value) })}>
                                    {availablePageSizes.map((size) => (
                                        <option key={size} value={size}>{size}</option>
                                    ))}
                                </select>
                            </label>
                            <span>{total} {props.entityLabelPlural.toLowerCase()}</span>
                        </div>
                    </>
                )}
            </PageSection>

            <Dialog
                header={`Create new ${props.entityLabelSingular.toLowerCase()}`}
                visible={createOpen}
                modal
                className="admin-config-dialog"
                style={{ width: "min(520px, 95vw)" }}
                onHide={() => {
                    setCreateOpen(false);
                    setCreateError(null);
                    setCreateName("");
                    setCreateExtraFields({});
                }}
            >
                <div className="admin-config-modal-body">
                    {createError ? <p className="admin-config-validation-error">{createError}</p> : null}
                    <label>
                        Name
                        <InputField
                            ref={createNameInputRef}
                            editable
                            showButtons={false}
                            placeholder="Name"
                            onChange={(component) => setCreateName(component.getCurrentValue())}
                        />
                    </label>
                    {props.extraCreateFields?.map((field) => (
                        <label key={field.key}>
                            {field.label}
                            <InputText value={createExtraFields[field.key] ?? ""} onChange={(event) => setCreateExtraFields((current) => ({ ...current, [field.key]: event.target.value }))} />
                        </label>
                    ))}
                    {props.renderCreateFields ? props.renderCreateFields({ values: createExtraFields, onChange: (key, value) => setCreateExtraFields((current) => ({ ...current, [key]: value })) }) : null}
                    <div className="admin-config-actions">
                        <button
                            type="button"
                            disabled={createDisabled}
                            onClick={async () => {
                                const normalizedName = normalizeName(createName);
                                if (normalizedName.length === 0) return;
                                setIsCreating(true);
                                setCreateError(null);
                                try {
                                    const created = await props.createEntity(normalizedName, createExtraFields);
                                    if (props.createdEntityHref) {
                                        setCreateOpen(false);
                                        setCreateName("");
                                        setCreateExtraFields({});
                                        navigate(props.createdEntityHref(created));
                                        return;
                                    }
                                    if (!showDisabled && created.disabled) {
                                        setCreateOpen(false);
                                        return;
                                    }
                                    setCreateOpen(false);
                                    setCreateName("");
                                    setCreateExtraFields({});
                                } catch (createEntityError) {
                                    setCreateError(createEntityError instanceof Error ? createEntityError.message : `Could not create ${props.entityLabelSingular.toLowerCase()}`);
                                } finally {
                                    setIsCreating(false);
                                }
                            }}
                        >
                            Create
                        </button>
                    </div>
                </div>
            </Dialog>
        </PageTemplate>
    );
}
