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
    exportLookupTemplate,
    exportLookupValues,
    createLookupValue,
    getLookupDetail,
    getLookupValues,
    importLookupValues,
    setLookupDisabled,
    setLookupValueDisabled,
    updateLookup,
    updateLookupValue,
} from "@/ui/api/Lookups.ts";
import { FP_DO_CONFIGURATION, FP_MANAGE_LOOKUPS, FP_VIEW_LOOKUPS } from "@/ui/auth/functional_permissions.ts";
import type { LookupEntity, LookupValue } from "@/types/ConfigurationTypes.ts";
import type { UserSelectType } from "@/types/UserType.ts";
import {
    TAG_LOOKUP,
    TAG_LOOKUP_VALUE,
} from "@/types/LookupsType.ts";
import {
    TAG_CREATE,
    TAG_DISABLE,
    TAG_UPDATE,
} from "@/types/PubSubType.ts";
import type { PubSubMessage } from "@/types/PubSubType.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";
import { ApiError } from "@/ui/api/errors.ts";

export const meta: PageMeta = {
    id: "configuration-lookup-detail",
    urn: "urn:bun-starter:ui:page:configuration-lookup-detail",
    path: "/configuration/lookups/:lookupid",
    title: "Lookup details",
    description: "Edit lookup metadata and values.",
    menu: {
        section: "Configuration",
        order: 51,
        label: "Lookup details",
        parent: "configuration-lookups",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_DO_CONFIGURATION.functionalPermissionName, FP_VIEW_LOOKUPS.functionalPermissionName],
};

type ViewerContext = { permissionNames: string[] };

type CreateValueState = {
    visible: boolean;
    name: string;
    sourceSystemIdentifier: string;
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

function normalizeLookupValue(value: unknown): LookupValue | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.identifier !== "string" || typeof candidate.name !== "string" || typeof candidate.disabled !== "boolean" || typeof candidate.createdAt !== "string" || typeof candidate.updatedAt !== "string" || typeof candidate.lookupIdentifier !== "string") return null;
    return {
        identifier: candidate.identifier,
        name: candidate.name,
        disabled: candidate.disabled,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
        sourceSystemIdentifier: typeof candidate.sourceSystemIdentifier === "string" ? candidate.sourceSystemIdentifier : null,
        lookupIdentifier: candidate.lookupIdentifier,
    };
}

function isLookupEntity(value: unknown): value is LookupEntity {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.identifier === "string" && typeof candidate.name === "string" && typeof candidate.disabled === "boolean" && typeof candidate.createdAt === "string" && typeof candidate.updatedAt === "string" && typeof candidate.sourceSystem === "string";
}

type UserRefMap = Record<string, UserSelectType | null>;

function formatUserRef(identifier: string | null, userRefs: UserRefMap): string {
    if (!identifier) return "-";
    const user = userRefs[identifier];
    if (!user) return identifier;
    return `${user.firstName} ${user.lastName} (${user.email})`;
}

export function Component() {
    const { lookupid } = useParams();
    const location = useLocation();
    const toast = useRef<Toast>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [detail, setDetail] = useState<LookupEntity | null>(null);
    const [values, setValues] = useState<LookupValue[]>([]);
    const [availablePageSizes, setAvailablePageSizes] = useState<number[]>([10, 20, 50]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isPageLoading, setIsPageLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingValueId, setEditingValueId] = useState<string | null>(null);
    const [createValueState, setCreateValueState] = useState<CreateValueState>({ visible: false, name: "", sourceSystemIdentifier: "", isSaving: false, error: null });
    const [userRefs, setUserRefs] = useState<UserRefMap>({});
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    // --- Refs ---------------------------------------------------------------

    const nameInputRef = useRef<InputFieldHandle>(null);
    const sourceSystemInputRef = useRef<InputFieldHandle>(null);
    const nameLabelRef = useRef<LabelHandle>(null);
    const statusPillRef = useRef<ToggleHandle<boolean>>(null);
    const sourceSystemLabelRef = useRef<LabelHandle>(null);
    const createdLabelRef = useRef<LabelHandle>(null);
    const updatedLabelRef = useRef<LabelHandle>(null);
    const createdByLabelRef = useRef<LabelHandle>(null);
    const updatedByLabelRef = useRef<LabelHandle>(null);
    const valueInputRef = useRef<InputFieldHandle>(null);
    const createNameInputRef = useRef<InputFieldHandle>(null);
    const createSourceSystemIdentifierInputRef = useRef<InputFieldHandle>(null);
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
    const page = Number.isInteger(queryPage) && queryPage > 0 ? queryPage : 1;
    const pageSize = Number.isInteger(queryPageSize) && queryPage > 0 ? queryPageSize : 10;

    const canManage = viewerContext.permissionNames.includes(FP_MANAGE_LOOKUPS.functionalPermissionName);

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

    const load = useCallback(async () => {
        if (!lookupid) return;
        const setLoading = page === 1 && values.length === 0 ? setIsLoading : setIsPageLoading;
        setLoading(true);
        setError(null);
        try {
            const [context, detailPayload, valuesPayload] = await Promise.all([
                apiGet<ViewerContext>("/api/me/context"),
                getLookupDetail(lookupid),
                getLookupValues(lookupid, page - 1, pageSize, showDisabled),
            ]);
            setViewerContext(context);
            setDetail(detailPayload.lookup);
            setValues(valuesPayload.values);
            setTotal(valuesPayload.values.length);
            setAvailablePageSizes(valuesPayload.availablePageSizes);
            if (valuesPayload.page !== page - 1) updateQuery({ page: valuesPayload.page + 1 });
            if (!valuesPayload.availablePageSizes.includes(pageSize) && valuesPayload.availablePageSizes.length > 0) {
                updateQuery({ page: 1, pageSize: valuesPayload.availablePageSizes[0]! });
            }
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Could not load lookup details");
        } finally {
            setIsLoading(false);
            setIsPageLoading(false);
        }
    }, [lookupid, page, pageSize, showDisabled]);

    const loadRef = useRef(load);
    loadRef.current = load;

    useEffect(() => { void load(); }, [lookupid, page, pageSize, showDisabled, searchParams.toString()]);

    // --- Seed entity-level InputField and Labels after load -------------------

    useEffect(() => {
        if (!detail) return;
        const id = detail.identifier;

        if (canManage) {
            nameInputRef.current?.setOriginalValue(detail.name, {
                lookupId: id,
                field: "name",
                updatedAt: detail.updatedAt,
            });
            nameInputRef.current?.resetToOriginal();

            sourceSystemInputRef.current?.setOriginalValue(detail.sourceSystem, {
                lookupId: id,
                field: "sourceSystem",
                updatedAt: detail.updatedAt,
            });
            sourceSystemInputRef.current?.resetToOriginal();
        }

        nameLabelRef.current?.setText(detail.name, { lookupId: id, field: "name" });
        statusPillRef.current?.setValue(detail.disabled, { lookupId: id, field: "status" });
        sourceSystemLabelRef.current?.setText(detail.sourceSystem, { lookupId: id, field: "sourceSystem" });
        createdLabelRef.current?.setText(formatTimestamp(detail.createdAt), { lookupId: id, field: "created" });
        updatedLabelRef.current?.setText(formatTimestamp(detail.updatedAt), { lookupId: id, field: "updated" });
        createdByLabelRef.current?.setText(formatUserRef(detail.createdBy, userRefs), { lookupId: id, field: "createdBy" });
        updatedByLabelRef.current?.setText(formatUserRef(detail.updatedBy, userRefs), { lookupId: id, field: "updatedBy" });
    }, [detail, canManage, userRefs]);

    // --- Seed per-row value Labels after load ---------------------------------

    useEffect(() => {
        values.forEach((row) => {
            const refs = valueLabelRefs.current.get(row.identifier);
            if (refs) {
                refs.name.current?.setText(row.name, { lookupId: row.lookupIdentifier, valueId: row.identifier, field: "name" });
                refs.status.current?.setText(row.disabled ? "Disabled" : "Enabled", { lookupId: row.lookupIdentifier, valueId: row.identifier, field: "status" });
                refs.created.current?.setText(formatTimestamp(row.createdAt), { lookupId: row.lookupIdentifier, valueId: row.identifier, field: "created" });
                refs.updated.current?.setText(formatTimestamp(row.updatedAt), { lookupId: row.lookupIdentifier, valueId: row.identifier, field: "updated" });
            }
        });
    }, [values]);

    // --- PubSub: entity-level Label updates -----------------------------------

    useEffect(() => {
        if (!detail) return;
        const id = detail.identifier;
        const token = subscribe(
            { and: [TAG_LOOKUP, id, { or: [TAG_UPDATE, TAG_DISABLE] }] },
            (msg: PubSubMessage) => {
                if (savingRef.current) return;
                const tags = msg.tags;
                const data = msg.data as Record<string, unknown> | undefined;
                // Skip our own echo: if the updatedAt matches what we just saved,
                // this PubSub event is the result of our own change.
                if (data?.updatedAt === lastSavedUpdatedAtRef.current) return;

                if (tags.includes(TAG_UPDATE)) {
                    if (data?.name !== undefined) {
                        nameLabelRef.current?.setText(String(data.name), { lookupId: id, field: "name" });
                        if (canManage && nameInputRef.current) {
                            nameInputRef.current.setOriginalValue(String(data.name), {
                                lookupId: id,
                                field: "name",
                                updatedAt: data?.updatedAt,
                            });
                        }
                    }
                    if (data?.sourceSystem !== undefined) {
                        sourceSystemLabelRef.current?.setText(String(data.sourceSystem), { lookupId: id, field: "sourceSystem" });
                        if (canManage && sourceSystemInputRef.current) {
                            sourceSystemInputRef.current.setOriginalValue(String(data.sourceSystem), {
                                lookupId: id,
                                field: "sourceSystem",
                                updatedAt: data?.updatedAt,
                            });
                        }
                    }
                    if (data?.updatedAt !== undefined) updatedLabelRef.current?.setText(formatTimestamp(String(data.updatedAt)), { lookupId: id, field: "updated" });
                }
                if (tags.includes(TAG_DISABLE)) {
                    const disabled = data?.disabled === true;
                    statusPillRef.current?.setValue(disabled, { lookupId: id, field: "status" });
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
            { and: [TAG_LOOKUP_VALUE, { or: [TAG_UPDATE, TAG_DISABLE, TAG_CREATE] }] },
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
            { and: [TAG_LOOKUP, id, TAG_UPDATE] },
            (msg: PubSubMessage) => {
                if (savingRef.current) return;
                const data = msg.data as Record<string, unknown> | undefined;
                // Skip our own echo: if the updatedAt matches what we just saved,
                // this PubSub event is the result of our own change.
                if (data?.updatedAt === lastSavedUpdatedAtRef.current) return;
                const ref = nameInputRef.current;
                if (!ref) return;
                ref.setDirty(true);
                ref.setHintText("Lookup was modified by another user");
            },
        );
        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub.ts").then((m) => m.unsubscribe(token));
            }
        };
    }, [detail, canManage]);

    // --- PubSub: sourceSystem InputField concurrent modification detection ----

    useEffect(() => {
        if (!detail || !canManage) return;
        const id = detail.identifier;
        const token = subscribe(
            { and: [TAG_LOOKUP, id, TAG_UPDATE] },
            (msg: PubSubMessage) => {
                if (savingRef.current) return;
                const data = msg.data as Record<string, unknown> | undefined;
                // Skip our own echo
                if (data?.updatedAt === lastSavedUpdatedAtRef.current) return;
                const ref = sourceSystemInputRef.current;
                if (!ref) return;
                ref.setDirty(true);
                ref.setHintText("Lookup was modified by another user");
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
                    lookupId: row.lookupIdentifier,
                    valueId: row.identifier,
                    updatedAt: row.updatedAt,
                });
                valueInputRef.current.resetToOriginal();
            }

            // Subscribe to PubSub for this specific value
            const token = subscribe(
                { and: [TAG_LOOKUP_VALUE, editingValueId, { or: [TAG_UPDATE, TAG_DISABLE] }] },
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
        if (!detail || !lookupid) return;

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
            { and: [TAG_LOOKUP, TAG_UPDATE] },
            async (msg: PubSubMessage) => {
                if (msg.data?.identifiers?.lookup !== detail.identifier) return;
                try {
                    const refreshed = await getLookupDetail(lookupid);
                    if (!resolved) {
                        finalizeSuccess(
                            refreshed.lookup.name,
                            refreshed.lookup.updatedAt,
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
                const payload = await getLookupDetail(lookupid);
                if (!resolved) {
                    finalizeSuccess(
                        payload.lookup.name,
                        payload.lookup.updatedAt,
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
            const response = await updateLookup(detail.identifier, {
                name: rawValue.trim(),
                knownUpdatedAt: (ctx?.updatedAt as string) ?? detail.updatedAt,
            });
            if (!resolved) {
                finalizeSuccess(
                    rawValue.trim(),
                    response.lookup.updatedAt,
                );
            }
        } catch (err: unknown) {
            savingRef.current = false;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);

            if (err instanceof ApiError && err.status === 409) {
                if (resolved) return;
                component.setHintText("This lookup was modified by another user. Please refresh.");
                component.setDirty(true);
                component.enableRestoreButton();
            } else if (!resolved) {
                component.enableSaveButton();
                component.enableRestoreButton();
            }
        }
    };

    const handleSaveSourceSystem = async (
        component: InputFieldHandle,
        _source: "button" | "blur",
    ) => {
        if (!detail || !lookupid) return;

        const rawValue = component.getCurrentValue();
        if (!component.compareWithOriginal()) return;

        const ctx = component.getContext();

        savingRef.current = true;
        let resolved = false;

        const finalizeSuccess = (
            newSourceSystem: string,
            newUpdatedAt: string,
        ) => {
            if (resolved) return;
            resolved = true;
            savingRef.current = false;
            lastSavedUpdatedAtRef.current = newUpdatedAt;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);

            component.setOriginalValue(newSourceSystem, { updatedAt: newUpdatedAt });
            component.setDirty(false);
            component.enableSaveButton();
            component.enableRestoreButton();
            component.setHintText("");
            setDetail((prev) => prev ? {
                ...prev,
                sourceSystem: newSourceSystem,
                updatedAt: newUpdatedAt,
            } : prev);
        };

        // Stream 1: PubSub
        let pubsubToken: string | false = false;
        pubsubToken = subscribe(
            { and: [TAG_LOOKUP, TAG_UPDATE] },
            async (msg: PubSubMessage) => {
                if (msg.data?.identifiers?.lookup !== detail.identifier) return;
                try {
                    const refreshed = await getLookupDetail(lookupid);
                    if (!resolved) {
                        finalizeSuccess(
                            refreshed.lookup.sourceSystem,
                            refreshed.lookup.updatedAt,
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
                const payload = await getLookupDetail(lookupid);
                if (!resolved) {
                    finalizeSuccess(
                        payload.lookup.sourceSystem,
                        payload.lookup.updatedAt,
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
            const response = await updateLookup(detail.identifier, {
                name: detail.name,
                sourceSystem: rawValue.trim(),
                knownUpdatedAt: (ctx?.updatedAt as string) ?? detail.updatedAt,
            });
            if (!resolved) {
                finalizeSuccess(
                    rawValue.trim(),
                    response.lookup.updatedAt,
                );
            }
        } catch (err: unknown) {
            savingRef.current = false;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);

            if (err instanceof ApiError && err.status === 409) {
                if (resolved) return;
                component.setHintText("This lookup was modified by another user. Please refresh.");
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
        if (!editingValueId || !lookupid) return;

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
            const updated = await updateLookupValue(lookupid, editingValueId, {
                name: nextName,
                knownUpdatedAt,
            });
            const normalized = normalizeLookupValue(updated.value);
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
                setError(saveError instanceof Error ? saveError.message : "Could not update lookup value");
            }
        }
    };

    // --- Export / Import handlers ---------------------------------------------

    const handleExport = async () => {
        if (!lookupid) return;
        try {
            await exportLookupValues(lookupid);
            toast.current?.show({ severity: "success", summary: "Export complete", detail: "Lookup values downloaded.", life: 4000 });
        } catch (exportError) {
            toast.current?.show({ severity: "error", summary: "Export error", detail: exportError instanceof Error ? exportError.message : "Could not export lookup values", life: 5000 });
        }
    };

    const handleExportTemplate = async () => {
        if (!lookupid) return;
        try {
            await exportLookupTemplate(lookupid);
            toast.current?.show({ severity: "success", summary: "Template downloaded", detail: "Lookup import template downloaded.", life: 4000 });
        } catch (exportError) {
            toast.current?.show({ severity: "error", summary: "Export error", detail: exportError instanceof Error ? exportError.message : "Could not export lookup template", life: 5000 });
        }
    };

    const handleImport = async () => {
        if (!lookupid || !importFile) return;
        setIsImporting(true);
        setImportError(null);
        try {
            const result = await importLookupValues(lookupid, importFile);
            setShowImportDialog(false);
            setImportFile(null);
            toast.current?.show({ severity: "success", summary: "Import complete", detail: `Created ${result.created} and updated ${result.updated} lookup value(s).`, life: 5000 });
            await load();
        } catch (importError) {
            const message = importError instanceof Error ? importError.message : "Could not import lookup values";
            setImportError(message);
            toast.current?.show({ severity: "error", summary: "Import error", detail: message, life: 7000 });
        } finally {
            setIsImporting(false);
        }
    };

    const submitCreateValue = async () => {
        if (!lookupid) return;
        const name = normalizeName(createValueState.name);
        const sourceSystemIdentifier = createValueState.sourceSystemIdentifier.trim();
        if (name.length === 0) return;
        setCreateValueState((current) => ({ ...current, isSaving: true, error: null }));
        try {
            const created = await createLookupValue(lookupid, { name, sourceSystemIdentifier: sourceSystemIdentifier.length > 0 ? sourceSystemIdentifier : null });
            setCreateValueState({ visible: false, name: "", sourceSystemIdentifier: "", isSaving: false, error: null });
            const newValue = created.value;
            const shouldShow = showDisabled || !newValue.disabled;
            if (shouldShow) {
                setValues((current) => {
                    const existing = current.find((item) => item.identifier === newValue.identifier);
                    if (existing) return current;
                    setTotal((currentTotal) => currentTotal + 1);
                    return [...current, newValue].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.identifier.localeCompare(b.identifier)).slice(0, pageSize);
                });
            }
        } catch (createError) {
            setCreateValueState((current) => ({ ...current, isSaving: false, error: createError instanceof Error ? createError.message : "Could not create lookup value" }));
        }
    };

    const valueRows = useMemo(() => values, [values]);

    // --- Toggle option constants ---------------------------------------------

    const showDisabledOptions = useMemo(() => [
        { value: true, label: "Show disabled" },
        { value: false, label: "Hide disabled" },
    ] as const, []);

    const statusOptions = useMemo(() => [
        { value: false, label: "Enabled" },
        { value: true, label: "Disabled" },
    ] as const, []);

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <Toast ref={toast} />
            <PageSection title="Lookup details">
                {error ? <p className="admin-config-error">{error}</p> : null}

                {isLoading || isPageLoading || !detail ? (
                    <p>Loading lookup details...</p>
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
                                            const updated = await setLookupDisabled(detail.identifier, { disabled: newDisabled, knownUpdatedAt: detail.updatedAt });
                                            setDetail(updated.lookup);
                                        } catch (toggleError) {
                                            setError(toggleError instanceof Error ? toggleError.message : "Could not update lookup status");
                                        }
                                    }}
                                />
                            </div>
                            <div><strong>Description:</strong> {detail.description ?? "-"}</div>
                            <div>
                                <strong>Source system:</strong>
                                {canManage ? (
                                    <div className="admin-config-actions admin-top-gap">
                                        <InputField
                                            ref={sourceSystemInputRef}
                                            showButtons={true}
                                            onSave={handleSaveSourceSystem}
                                        />
                                    </div>
                                ) : <Label ref={sourceSystemLabelRef} text={detail.sourceSystem} />}
                            </div>
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

                            {canManage ? (
                                <div className="admin-top-gap">
                                    <button type="button" onClick={() => setCreateValueState({ visible: true, name: "", sourceSystemIdentifier: "", isSaving: false, error: null })}>Create new value</button>
                                </div>
                            ) : null}

                            <table className="mui-simple-table admin-table admin-configuration-entity-table">
                                <thead>
                                    <tr>
                                        <th>Identifier</th>
                                        <th>Name</th>
                                        <th>Disabled</th>
                                        <th>Source system identifier</th>
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
                                                                const updated = await setLookupValueDisabled(detail.identifier, row.identifier, { disabled: newDisabled, knownUpdatedAt: row.updatedAt });
                                                                const shouldStillShow = showDisabled || !newDisabled;
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
                                                <td><Label text={row.sourceSystemIdentifier ?? "-"} size="normal" /></td>
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
                            <Link to={`/configuration/lookups${location.search}`}>Back to lookups</Link>
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
                onHide={() => setCreateValueState({ visible: false, name: "", sourceSystemIdentifier: "", isSaving: false, error: null })}
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
                    <label>
                        Source system identifier
                        <InputField
                            ref={createSourceSystemIdentifierInputRef}
                            editable
                            showButtons={false}
                            placeholder="Source system identifier"
                            onChange={(component) => setCreateValueState((current) => ({ ...current, sourceSystemIdentifier: component.getCurrentValue() }))}
                        />
                    </label>
                    <div className="admin-config-actions">
                        <button type="button" disabled={createDisabled} onClick={() => void submitCreateValue()}>Create</button>
                    </div>
                </div>
            </Dialog>

            <Dialog
                header="Import lookup values"
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
