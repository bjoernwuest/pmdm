import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { Toast } from "primereact/toast";
import InputField, { type InputFieldHandle } from "@/ui/components/InputField.tsx";
import Label, { type LabelHandle } from "@/ui/components/Label.tsx";
import Toggle, { type ToggleHandle } from "@/ui/components/Toggle.tsx";
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiGet } from "@/ui/api";
import {
    exportConsumableTemplate,
    exportConsumableValues,
    createConsumableValue,
    getConsumableDetail,
    getConsumableValues,
    importConsumableValues,
    setConsumableDisabled,
    setConsumableValueFlags,
    updateConsumable,
    updateConsumableValue,
} from "@/ui/api/Consumables.ts";
import { FP_MANAGE_CONSUMABLES, FP_VIEW_CONSUMABLES } from "@/ui/auth/functional_permissions.ts";
import type { ConsumableEntity, ConsumableValue } from "@/types/ConfigurationTypes.ts";
import type { UserSelectType } from "@/types/UserType.ts";
import {
    TAG_CONSUMABLE,
    TAG_CONSUMABLE_VALUE,
} from "@/types/ConsumableType.ts";
import {
    TAG_CREATE,
    TAG_DISABLE,
    TAG_UPDATE,
} from "@/types/PubSubType.ts";
import type { PubSubMessage } from "@/types/PubSubType.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";
import { ApiError } from "@/ui/api/errors.ts";

export const meta: PageMeta = {
    id: "configuration-consumable-detail",
    urn: "urn:bun-starter:ui:page:configuration-consumable-detail",
    path: "/configuration/consumables/:consumableid",
    title: "Consumable details",
    description: "Edit consumable metadata and values.",
    menu: {
        section: "Configuration",
        order: 41,
        label: "Consumable details",
        parent: "configuration-consumables",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_VIEW_CONSUMABLES.functionalPermissionName],
};

type ViewerContext = { permissionNames: string[] };

type CreateValueState = {
    visible: boolean;
    name: string;
    isSaving: boolean;
    error: string | null;
};

interface ValueLabelRefs {
    name: React.RefObject<LabelHandle | null>;
    status: React.RefObject<LabelHandle | null>;
    created: React.RefObject<LabelHandle | null>;
    updated: React.RefObject<LabelHandle | null>;
}

function normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, " ");
}

function formatTimestamp(value: string): string {
    return new Date(value).toLocaleString();
}

function normalizeConsumableValue(value: unknown): ConsumableValue | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.identifier !== "string" || typeof candidate.disabled !== "boolean" || typeof candidate.createdAt !== "string" || typeof candidate.updatedAt !== "string" || typeof candidate.consumableIdentifier !== "string") return null;
    const rawName = typeof candidate.name === "string" ? candidate.name : typeof candidate.value === "string" ? candidate.value : null;
    if (!rawName) return null;
    return {
        identifier: candidate.identifier,
        name: rawName,
        disabled: candidate.disabled,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
        isUsed: typeof candidate.isUsed === "boolean" ? candidate.isUsed : false,
        consumableIdentifier: candidate.consumableIdentifier,
    };
}

function isConsumableEntity(value: unknown): value is ConsumableEntity {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.identifier === "string" && typeof candidate.name === "string" && typeof candidate.disabled === "boolean" && typeof candidate.createdAt === "string" && typeof candidate.updatedAt === "string";
}

type UserRefMap = Record<string, UserSelectType | null>;

function formatUserRef(identifier: string | null, userRefs: UserRefMap): string {
    if (!identifier) return "-";
    const user = userRefs[identifier];
    if (!user) return identifier;
    return `${user.firstName} ${user.lastName} (${user.email})`;
}

export function Component() {
    const { consumableid } = useParams();
    const location = useLocation();
    const toast = useRef<Toast>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [detail, setDetail] = useState<ConsumableEntity | null>(null);
    const [values, setValues] = useState<ConsumableValue[]>([]);
    const [availablePageSizes, setAvailablePageSizes] = useState<number[]>([10, 20, 50]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isPageLoading, setIsPageLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingValueId, setEditingValueId] = useState<string | null>(null);
    const [createValueState, setCreateValueState] = useState<CreateValueState>({ visible: false, name: "", isSaving: false, error: null });
    const [userRefs, setUserRefs] = useState<UserRefMap>({});
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    // --- Refs ---------------------------------------------------------------

    const nameInputRef = useRef<InputFieldHandle>(null);
    const nameLabelRef = useRef<LabelHandle>(null);
    const statusPillRef = useRef<ToggleHandle<boolean>>(null);
    const createdLabelRef = useRef<LabelHandle>(null);
    const updatedLabelRef = useRef<LabelHandle>(null);
    const createdByLabelRef = useRef<LabelHandle>(null);
    const updatedByLabelRef = useRef<LabelHandle>(null);
    const valueInputRef = useRef<InputFieldHandle>(null);
    const createNameInputRef = useRef<InputFieldHandle>(null);
    const valueLabelRefs = useRef<Map<string, ValueLabelRefs>>(new Map());
    const editingValueIdRef = useRef<string | null>(null);
    editingValueIdRef.current = editingValueId;

    // Guard to prevent PubSub feedback loop during our own saves
    const savingRef = useRef<boolean>(false);
    // Tracks the updatedAt we just received from our own save, so permanent PubSub
    // subscriptions can skip our own echo and only react to external changes.
    const lastSavedUpdatedAtRef = useRef<string | null>(null);

    const queryPage = Number(searchParams.get("page") ?? "1");
    const queryPageSize = Number(searchParams.get("pageSize") ?? "10");
    const showDisabled = searchParams.get("showDisabled") === "1";
    const showUsed = searchParams.get("showUsed") === "1";
    const page = Number.isInteger(queryPage) && queryPage > 0 ? queryPage : 1;
    const pageSize = Number.isInteger(queryPageSize) && queryPageSize > 0 ? queryPageSize : 10;

    const canManage = viewerContext.permissionNames.includes(FP_MANAGE_CONSUMABLES.functionalPermissionName);

    const updateQuery = (patch: { page?: number; pageSize?: number; showDisabled?: boolean; showUsed?: boolean }) => {
        const next = new URLSearchParams(searchParams);
        if (patch.page !== undefined) next.set("page", String(patch.page));
        if (patch.pageSize !== undefined) next.set("pageSize", String(patch.pageSize));
        if (patch.showDisabled !== undefined) {
            if (patch.showDisabled) next.set("showDisabled", "1");
            else next.delete("showDisabled");
        }
        if (patch.showUsed !== undefined) {
            if (patch.showUsed) next.set("showUsed", "1");
            else next.delete("showUsed");
        }
        setSearchParams(next);
    };

    const load = useCallback(async () => {
        if (!consumableid) return;
        const setLoading = page === 1 && values.length === 0 ? setIsLoading : setIsPageLoading;
        setLoading(true);
        setError(null);
        try {
            const [context, detailPayload, valuesPayload] = await Promise.all([
                apiGet<ViewerContext>("/api/me/context"),
                getConsumableDetail(consumableid),
                getConsumableValues(consumableid, page - 1, pageSize, showDisabled, showUsed),
            ]);
            setViewerContext(context);
            setDetail(detailPayload.consumable);
            setValues(valuesPayload.values);
            setTotal(valuesPayload.values.length);
            setAvailablePageSizes(valuesPayload.availablePageSizes);
            if (valuesPayload.page !== page - 1) updateQuery({ page: valuesPayload.page + 1 });
            if (!valuesPayload.availablePageSizes.includes(pageSize) && valuesPayload.availablePageSizes.length > 0) {
                updateQuery({ page: 1, pageSize: valuesPayload.availablePageSizes[0]! });
            }
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Could not load consumable details");
        } finally {
            setIsLoading(false);
            setIsPageLoading(false);
        }
    }, [consumableid, page, pageSize, showDisabled, showUsed]);

    const loadRef = useRef(load);
    loadRef.current = load;

    useEffect(() => { void load(); }, [consumableid, page, pageSize, showDisabled, showUsed, searchParams.toString()]);

    // --- Seed entity-level InputField and Labels after load -------------------

    useEffect(() => {
        if (!detail) return;
        const id = detail.identifier;

        if (canManage) {
            nameInputRef.current?.setOriginalValue(detail.name, {
                consumableId: id,
                field: "name",
                updatedAt: detail.updatedAt,
            });
            nameInputRef.current?.resetToOriginal();
        }

        nameLabelRef.current?.setText(detail.name, { consumableId: id, field: "name" });
        statusPillRef.current?.setValue(detail.disabled, { consumableId: id, field: "status" });
        createdLabelRef.current?.setText(formatTimestamp(detail.createdAt), { consumableId: id, field: "created" });
        updatedLabelRef.current?.setText(formatTimestamp(detail.updatedAt), { consumableId: id, field: "updated" });
        createdByLabelRef.current?.setText(formatUserRef(detail.createdBy, userRefs), { consumableId: id, field: "createdBy" });
        updatedByLabelRef.current?.setText(formatUserRef(detail.updatedBy, userRefs), { consumableId: id, field: "updatedBy" });
    }, [detail, canManage, userRefs]);

    // --- Seed per-row value Labels after load ---------------------------------

    useEffect(() => {
        values.forEach((row) => {
            const refs = valueLabelRefs.current.get(row.identifier);
            if (refs) {
                refs.name.current?.setText(row.name, { consumableId: row.consumableIdentifier, valueId: row.identifier, field: "name" });
                refs.status.current?.setText(row.disabled ? "Disabled" : "Enabled", { consumableId: row.consumableIdentifier, valueId: row.identifier, field: "status" });
                refs.created.current?.setText(formatTimestamp(row.createdAt), { consumableId: row.consumableIdentifier, valueId: row.identifier, field: "created" });
                refs.updated.current?.setText(formatTimestamp(row.updatedAt), { consumableId: row.consumableIdentifier, valueId: row.identifier, field: "updated" });
            }
        });
    }, [values]);

    // --- PubSub: entity-level Label updates -----------------------------------

    useEffect(() => {
        if (!detail) return;
        const id = detail.identifier;
        const token = subscribe(
            { and: [TAG_CONSUMABLE, id, { or: [TAG_UPDATE, TAG_DISABLE] }] },
            (msg: PubSubMessage) => {
                if (savingRef.current) return;
                const tags = msg.tags;
                const data = msg.data as Record<string, unknown> | undefined;
                // Skip our own echo: if the updatedAt matches what we just saved,
                // this PubSub event is the result of our own change.
                if (data?.updatedAt === lastSavedUpdatedAtRef.current) return;

                if (tags.includes(TAG_UPDATE)) {
                    if (data?.name !== undefined) {
                        nameLabelRef.current?.setText(String(data.name), { consumableId: id, field: "name" });
                        // Also seed read-only name InputField if not editing
                        if (canManage && nameInputRef.current) {
                            nameInputRef.current.setOriginalValue(String(data.name), {
                                consumableId: id,
                                field: "name",
                                updatedAt: data?.updatedAt,
                            });
                        }
                    }
                    if (data?.updatedAt !== undefined) updatedLabelRef.current?.setText(formatTimestamp(String(data.updatedAt)), { consumableId: id, field: "updated" });
                }
                if (tags.includes(TAG_DISABLE)) {
                    const disabled = data?.disabled === true;
                    statusPillRef.current?.setValue(disabled, { consumableId: id, field: "status" });
                }
            },
        );
        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub.ts").then((m) => m.unsubscribe(token));
            }
        };
    }, [detail, canManage]);

    // --- PubSub: value-level Label updates + CREATE re-fetch ------------------

    useEffect(() => {
        const token = subscribe(
            { and: [TAG_CONSUMABLE_VALUE, { or: [TAG_UPDATE, TAG_DISABLE, TAG_CREATE] }] },
            (msg: PubSubMessage) => {
                const tags = msg.tags;
                const data = msg.data as Record<string, unknown> | undefined;

                // CREATE: re-fetch the values list
                if (tags.includes(TAG_CREATE)) {
                    void loadRef.current();
                    return;
                }

                // Extract value UUID from tags
                const valueId = tags.find((t) => /^[0-9a-f-]{36}$/i.test(t));
                if (!valueId) return;
                const refs = valueLabelRefs.current.get(valueId);
                if (!refs) return;

                if (tags.includes(TAG_UPDATE)) {
                    if (data?.name !== undefined) refs.name.current?.setText(String(data.name), { valueId, field: "name" });
                    if (data?.updatedAt !== undefined) refs.updated.current?.setText(formatTimestamp(String(data.updatedAt)), { valueId, field: "updated" });
                }
                if (tags.includes(TAG_DISABLE)) {
                    const disabled = data?.disabled === true;
                    refs.status.current?.setText(disabled ? "Disabled" : "Enabled", { valueId, field: "status" });
                }

                // Cancel inline editing if the edited value was updated externally
                if (valueId === editingValueIdRef.current) {
                    setEditingValueId(null);
                }
            },
        );
        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub.ts").then((m) => m.unsubscribe(token));
            }
        };
    }, []);

    // --- PubSub: name InputField concurrent modification detection ------------

    useEffect(() => {
        if (!detail || !canManage) return;
        const id = detail.identifier;
        const token = subscribe(
            { and: [TAG_CONSUMABLE, id, TAG_UPDATE] },
            (msg: PubSubMessage) => {
                if (savingRef.current) return;
                const data = msg.data as Record<string, unknown> | undefined;
                // Skip our own echo: if the updatedAt matches what we just saved,
                // this PubSub event is the result of our own change.
                if (data?.updatedAt === lastSavedUpdatedAtRef.current) return;
                const ref = nameInputRef.current;
                if (!ref) return;
                ref.setDirty(true);
                ref.setHintText("Consumable was modified by another user");
            },
        );
        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub.ts").then((m) => m.unsubscribe(token));
            }
        };
    }, [detail, canManage]);

    // --- Seed value InputField when editingValueId changes --------------------

    useEffect(() => {
        if (editingValueId && valueInputRef.current) {
            const row = values.find((r) => r.identifier === editingValueId);
            if (row) {
                valueInputRef.current.setOriginalValue(row.name, {
                    consumableId: row.consumableIdentifier,
                    valueId: row.identifier,
                    updatedAt: row.updatedAt,
                });
                valueInputRef.current.resetToOriginal();
            }

            // Subscribe to PubSub for this specific value
            const token = subscribe(
                { and: [TAG_CONSUMABLE_VALUE, editingValueId, { or: [TAG_UPDATE, TAG_DISABLE] }] },
                (msg: PubSubMessage) => {
                    const ref = valueInputRef.current;
                    if (!ref) return;
                    const data = msg.data as Record<string, unknown> | undefined;
                    if (data?.name !== undefined && String(data.name) !== ref.getCurrentValue()) {
                        ref.setOriginalValue(String(data.name), {
                            valueId: editingValueId,
                            updatedAt: data?.updatedAt,
                        });
                        ref.setDirty(true);
                        ref.setHintText("Value was modified by another user");
                    }
                },
            );

            if (token) {
                const ctx = valueInputRef.current.getContext();
                if (ctx) {
                    ctx.subscriptionId = token;
                }
            }
        }

        return () => {
            if (valueInputRef.current) {
                const ctx = valueInputRef.current.getContext();
                if (ctx?.subscriptionId) {
                    unsubscribe(ctx.subscriptionId as string);
                }
            }
        };
    }, [editingValueId, values]);

    // --- User ref resolution --------------------------------------------------

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
                results.forEach((result) => {
                    next[result.identifier] = result.user;
                });
                return next;
            });
        });

        return () => { cancelled = true; };
    }, [detail, userRefs]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const createDisabled = normalizeName(createValueState.name).length === 0 || createValueState.isSaving;

    // --- Save handlers --------------------------------------------------------

    const handleSaveName = async (
        component: InputFieldHandle,
        _source: "button" | "blur",
    ) => {
        if (!detail || !consumableid) return;

        const rawValue = component.getCurrentValue();
        if (!component.compareWithOriginal()) return;

        const ctx = component.getContext();

        savingRef.current = true;
        let resolved = false;

        const finalizeSuccess = (
            newName: string,
            newUpdatedAt: string,
        ) => {
            if (resolved) return;
            resolved = true;
            savingRef.current = false;
            lastSavedUpdatedAtRef.current = newUpdatedAt;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);

            component.setOriginalValue(newName, { updatedAt: newUpdatedAt });
            component.setDirty(false);
            component.enableSaveButton();
            component.enableRestoreButton();
            component.setHintText("");
            setDetail((prev) => prev ? {
                ...prev,
                name: newName,
                updatedAt: newUpdatedAt,
            } : prev);
        };

        // Stream 1: PubSub
        let pubsubToken: string | false = false;
        pubsubToken = subscribe(
            { and: [TAG_CONSUMABLE, TAG_UPDATE] },
            async (msg: PubSubMessage) => {
                if (msg.data?.identifiers?.consumable !== detail.identifier) return;
                try {
                    const refreshed = await getConsumableDetail(consumableid);
                    if (!resolved) {
                        finalizeSuccess(
                            refreshed.consumable.name,
                            refreshed.consumable.updatedAt,
                        );
                    }
                } catch { /* consume */ }
            },
        );

        // Stream 2: Timer (fallback re-fetch)
        const timerId = setTimeout(async () => {
            if (resolved) return;
            resolved = true;
            if (pubsubToken) unsubscribe(pubsubToken);

            try {
                const payload = await getConsumableDetail(consumableid);
                if (!resolved) {
                    finalizeSuccess(
                        payload.consumable.name,
                        payload.consumable.updatedAt,
                    );
                    return;
                }
            } catch { /* re-fetch failed */ }

            component.enableSaveButton();
            component.enableRestoreButton();
            component.setHintText("");
        }, 1000);

        component.disableSaveButton();
        component.disableRestoreButton();

        // Stream 3: Server
        try {
            const response = await updateConsumable(detail.identifier, {
                name: rawValue.trim(),
                knownUpdatedAt: (ctx?.updatedAt as string) ?? detail.updatedAt,
            });
            if (!resolved) {
                finalizeSuccess(
                    rawValue.trim(),
                    response.consumable.updatedAt,
                );
            }
        } catch (err: unknown) {
            savingRef.current = false;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);

            if (err instanceof ApiError && err.status === 409) {
                if (resolved) return;
                component.setHintText("This consumable was modified by another user. Please refresh.");
                component.setDirty(true);
                component.enableRestoreButton();
            } else if (!resolved) {
                component.enableSaveButton();
                component.enableRestoreButton();
            }
        }
    };

    const handleSaveValue = async (
        component: InputFieldHandle,
        _source: "button" | "blur",
    ) => {
        if (!editingValueId || !consumableid) return;

        const nextName = normalizeName(component.getCurrentValue());
        const ctx = component.getContext();
        const knownUpdatedAt = (ctx?.updatedAt as string) ?? "";

        if (nextName.length === 0 || !component.compareWithOriginal()) {
            setEditingValueId(null);
            return;
        }

        component.disableSaveButton();
        component.disableRestoreButton();
        try {
            const updated = await updateConsumableValue(consumableid, editingValueId, {
                name: nextName,
                knownUpdatedAt,
            });
            const normalized = normalizeConsumableValue(updated.value);
            if (normalized) {
                setValues((current) => current.map((item) => item.identifier === normalized.identifier ? normalized : item).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.identifier.localeCompare(b.identifier)));
            }
            setEditingValueId(null);
            setError(null);
        } catch (saveError: unknown) {
            if (saveError instanceof ApiError && saveError.status === 409) {
                component.setHintText("This value was modified by another user. Please refresh.");
                component.setDirty(true);
                component.enableRestoreButton();
            } else {
                component.enableSaveButton();
                component.enableRestoreButton();
                setError(saveError instanceof Error ? saveError.message : "Could not update consumable value");
            }
        }
    };

    // --- Export / Import handlers ---------------------------------------------

    const handleExport = async () => {
        if (!consumableid) return;
        try {
            await exportConsumableValues(consumableid);
            toast.current?.show({ severity: "success", summary: "Export complete", detail: "Consumable values downloaded.", life: 4000 });
        } catch (exportError) {
            toast.current?.show({ severity: "error", summary: "Export error", detail: exportError instanceof Error ? exportError.message : "Could not export consumable values", life: 5000 });
        }
    };

    const handleExportTemplate = async () => {
        if (!consumableid) return;
        try {
            await exportConsumableTemplate(consumableid);
            toast.current?.show({ severity: "success", summary: "Template downloaded", detail: "Consumable import template downloaded.", life: 4000 });
        } catch (exportError) {
            toast.current?.show({ severity: "error", summary: "Export error", detail: exportError instanceof Error ? exportError.message : "Could not export consumable template", life: 5000 });
        }
    };

    const handleImport = async () => {
        if (!consumableid || !importFile) return;
        setIsImporting(true);
        setImportError(null);
        try {
            const result = await importConsumableValues(consumableid, importFile);
            setShowImportDialog(false);
            setImportFile(null);
            toast.current?.show({ severity: "success", summary: "Import complete", detail: `Created ${result.created} and updated ${result.updated} consumable value(s).`, life: 5000 });
            await load();
        } catch (importError) {
            const message = importError instanceof Error ? importError.message : "Could not import consumable values";
            setImportError(message);
            toast.current?.show({ severity: "error", summary: "Import error", detail: message, life: 7000 });
        } finally {
            setIsImporting(false);
        }
    };

    const submitCreateValue = async () => {
        if (!consumableid) return;
        const name = normalizeName(createValueState.name);
        if (name.length === 0) return;
        setCreateValueState((current) => ({ ...current, isSaving: true, error: null }));
        try {
            const created = await createConsumableValue(consumableid, { name });
            setCreateValueState({ visible: false, name: "", isSaving: false, error: null });
            const newValue = created.value;
            const shouldShow = (showDisabled || !newValue.disabled) && (showUsed || !newValue.isUsed);
            if (shouldShow) {
                setValues((current) => {
                    const existing = current.find((item) => item.identifier === newValue.identifier);
                    if (existing) return current;
                    setTotal((currentTotal) => currentTotal + 1);
                    return [...current, newValue].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.identifier.localeCompare(b.identifier)).slice(0, pageSize);
                });
            }
        } catch (createError) {
            setCreateValueState((current) => ({ ...current, isSaving: false, error: createError instanceof Error ? createError.message : "Could not create consumable value" }));
        }
    };

    const valueRows = useMemo(() => values, [values]);

    // --- Toggle option constants ---------------------------------------------

    const showDisabledOptions = useMemo(() => [
        { value: true, label: "Show disabled" },
        { value: false, label: "Hide disabled" },
    ] as const, []);

    const showUsedOptions = useMemo(() => [
        { value: true, label: "Show used" },
        { value: false, label: "Hide used" },
    ] as const, []);

    const statusOptions = useMemo(() => [
        { value: false, label: "Enabled" },
        { value: true, label: "Disabled" },
    ] as const, []);

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <Toast ref={toast} />
            <PageSection title="Consumable details">
                {error ? <p className="admin-config-error">{error}</p> : null}

                {isLoading || isPageLoading || !detail ? (
                    <p>Loading consumable details...</p>
                ) : (
                    <>
                        <div className="admin-detail-grid">
                            <div><strong>Identifier:</strong> <code>{detail.identifier}</code></div>
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
                                ) : <Label ref={nameLabelRef} text={detail.name} />}
                            </div>
                            <div>
                                <strong>Status:</strong>
                                <Toggle<boolean>
                                    ref={statusPillRef}
                                    variant="pill"
                                    value={detail.disabled}
                                    options={[...statusOptions]}
                                    disabled={!canManage}
                                    onChange={async (t) => {
                                        const newDisabled = t.getValue();
                                        try {
                                            const updated = await setConsumableDisabled(detail.identifier, { disabled: newDisabled, knownUpdatedAt: detail.updatedAt });
                                            setDetail(updated.consumable);
                                        } catch (toggleError) {
                                            setError(toggleError instanceof Error ? toggleError.message : "Could not update consumable status");
                                        }
                                    }}
                                />
                            </div>
                            <div><strong>Description:</strong> {detail.description ?? "-"}</div>
                            <div><strong>Created by:</strong> <Label ref={createdByLabelRef} text={formatUserRef(detail.createdBy, userRefs)} /></div>
                            <div><strong>Updated by:</strong> <Label ref={updatedByLabelRef} text={formatUserRef(detail.updatedBy, userRefs)} /></div>
                            <div><strong>Created:</strong> <Label ref={createdLabelRef} text={formatTimestamp(detail.createdAt)} size="small" /></div>
                            <div><strong>Updated:</strong> <Label ref={updatedLabelRef} text={formatTimestamp(detail.updatedAt)} size="small" /></div>
                        </div>

                        <div className="admin-top-gap">
                            <div className="admin-top-gap" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                <Button label="Export" icon="pi pi-download" className="p-button-outlined" onClick={() => { void handleExport(); }} />
                                <Button label="Export template" icon="pi pi-download" className="p-button-outlined" onClick={() => { void handleExportTemplate(); }} />
                                {canManage ? <Button label="Import" icon="pi pi-upload" className="p-button-outlined" onClick={() => setShowImportDialog(true)} /> : null}
                            </div>

                            <div className="admin-toggle-row">
                                <Toggle<boolean>
                                    variant="toggle"
                                    value={showDisabled}
                                    options={[...showDisabledOptions]}
                                    onChange={(t) => updateQuery({ showDisabled: t.getValue(), page: 1 })}
                                />
                            </div>
                            <div className="admin-toggle-row">
                                <Toggle<boolean>
                                    variant="toggle"
                                    value={showUsed}
                                    options={[...showUsedOptions]}
                                    onChange={(t) => updateQuery({ showUsed: t.getValue(), page: 1 })}
                                />
                            </div>

                            {canManage ? (
                                <div className="admin-top-gap">
                                    <button type="button" onClick={() => setCreateValueState({ visible: true, name: "", isSaving: false, error: null })}>Create new value</button>
                                </div>
                            ) : null}

                            <table className="mui-simple-table admin-table admin-configuration-entity-table">
                                <thead>
                                    <tr>
                                        <th>Identifier</th>
                                        <th>Name</th>
                                        <th>Disabled</th>
                                        <th>Used</th>
                                        <th>Created at</th>
                                        <th>Updated at</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {valueRows.map((row) => {
                                        // Ensure label refs exist for this row
                                        if (!valueLabelRefs.current.has(row.identifier)) {
                                            valueLabelRefs.current.set(row.identifier, {
                                                name: { current: null },
                                                status: { current: null },
                                                created: { current: null },
                                                updated: { current: null },
                                            });
                                        }
                                        const refs = valueLabelRefs.current.get(row.identifier)!;
                                        const isEditing = editingValueId === row.identifier;
                                        return (
                                            <tr key={row.identifier} className={row.disabled ? "admin-configuration-entity-row-disabled" : undefined}>
                                                <td><code>{row.identifier}</code></td>
                                                <td>
                                                    {isEditing ? (
                                                        <InputField
                                                            ref={valueInputRef}
                                                            editable
                                                            showButtons
                                                            placeholder="Name"
                                                            onSave={(component) => {
                                                                void handleSaveValue(component, "button");
                                                            }}
                                                        />
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="admin-config-value-button"
                                                            disabled={!canManage}
                                                            onClick={() => {
                                                                if (!canManage) return;
                                                                setEditingValueId(row.identifier);
                                                            }}
                                                        >
                                                            <Label ref={refs.name} size="normal" text={row.name} />
                                                        </button>
                                                    )}
                                                </td>
                                                <td>
                                                    <Toggle<boolean>
                                                        variant="toggle"
                                                        value={row.disabled}
                                                        options={[...statusOptions]}
                                                        disabled={!canManage}
                                                        onChange={async (t) => {
                                                            if (!canManage) return;
                                                            const newDisabled = t.getValue();
                                                            try {
                                                                const updated = await setConsumableValueFlags(detail.identifier, row.identifier, { disabled: newDisabled, knownUpdatedAt: row.updatedAt });
                                                                const shouldStillShow = (showDisabled || !newDisabled) && (showUsed || !updated.value.isUsed);
                                                                setValues((current) => {
                                                                    const mapped = current.map((item) => item.identifier === updated.value.identifier ? { ...item, disabled: newDisabled, updatedAt: updated.value.updatedAt } : item);
                                                                    return shouldStillShow ? mapped : mapped.filter((item) => item.identifier !== updated.value.identifier);
                                                                });
                                                                if (!shouldStillShow) setTotal((t2) => Math.max(0, t2 - 1));
                                                            } catch (toggleError) {
                                                                setError(toggleError instanceof Error ? toggleError.message : "Could not update value status");
                                                            }
                                                        }}
                                                    />
                                                </td>
                                                <td>
                                                    {canManage && !row.isUsed ? (
                                                        <button
                                                            type="button"
                                                            className="mui-pill admin-configuration-status-chip-enabled"
                                                            onClick={async () => {
                                                                const updated = await setConsumableValueFlags(detail.identifier, row.identifier, { isUsed: true, knownUpdatedAt: row.updatedAt });
                                                                const shouldStillShow = (showDisabled || !row.disabled) && (showUsed || !updated.value.isUsed);
                                                                setValues((current) => {
                                                                    const mapped = current.map((item) => item.identifier === updated.value.identifier ? { ...item, isUsed: updated.value.isUsed, updatedAt: updated.value.updatedAt } : item);
                                                                    return shouldStillShow ? mapped : mapped.filter((item) => item.identifier !== updated.value.identifier);
                                                                });
                                                                if (!shouldStillShow) setTotal((t2) => Math.max(0, t2 - 1));
                                                            }}
                                                        >
                                                            No
                                                        </button>
                                                    ) : (
                                                        <span className="mui-pill admin-configuration-status-chip-disabled">Yes</span>
                                                    )}
                                                </td>
                                                <td><Label ref={refs.created} size="small" text={formatTimestamp(row.createdAt)} /></td>
                                                <td><Label ref={refs.updated} size="small" text={formatTimestamp(row.updatedAt)} /></td>
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
                                        {availablePageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                                    </select>
                                </label>
                            </div>
                        </div>

                        <div className="admin-top-gap">
                            <Link to={`/configuration/consumables${location.search}`}>Back to consumables</Link>
                        </div>
                    </>
                )}
            </PageSection>

            <Dialog
                header="Create new value"
                visible={createValueState.visible}
                modal
                className="admin-config-dialog"
                style={{ width: "min(520px, 95vw)" }}
                onHide={() => setCreateValueState({ visible: false, name: "", isSaving: false, error: null })}
            >
                <div className="admin-config-modal-body">
                    {createValueState.error ? <p className="admin-config-validation-error">{createValueState.error}</p> : null}
                    <label>
                        Name
                        <InputField
                            ref={createNameInputRef}
                            editable
                            showButtons={false}
                            placeholder="Name"
                            onChange={(component) => setCreateValueState((current) => ({ ...current, name: component.getCurrentValue() }))}
                        />
                    </label>
                    <div className="admin-config-actions">
                        <button type="button" disabled={createDisabled} onClick={() => void submitCreateValue()}>Create</button>
                    </div>
                </div>
            </Dialog>

            <Dialog
                header="Import consumable values"
                visible={showImportDialog}
                modal
                className="admin-config-dialog"
                style={{ width: "min(520px, 95vw)" }}
                onHide={() => {
                    if (isImporting) return;
                    setShowImportDialog(false);
                    setImportFile(null);
                    setImportError(null);
                }}
            >
                <div className="admin-config-modal-body">
                    {importError ? <p className="admin-config-validation-error">{importError}</p> : null}
                    <label>
                        XLSX file
                        <input type="file" accept=".xlsx" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} />
                    </label>
                    <div className="admin-config-actions">
                        <button type="button" disabled={!importFile || isImporting} onClick={() => void handleImport()}>Import</button>
                    </div>
                </div>
            </Dialog>
        </PageTemplate>
    );
}
