import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Dialog } from "primereact/dialog";
import { FilterableDropdown } from "@/ui/components/FilterableDropdown.tsx";
import type { FilterableDropdownOption } from "@/ui/components/FilterableDropdown.tsx";
import { PageSection, PageTemplate } from "./PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiGet, apiPut } from "@/ui/api/index.ts";
import {
    getProductType,
    updateProductType,
    setProductTypeDisabled,
    getProductTypeDataTypes,
    assignDataType,
    unassignDataType,
    updateDataTypeAssignment,
    getProductTypePermissions,
    grantProductTypePermission,
    revokeProductTypePermission,
    type ProductTypeDataTypeAssignment,
    type ProductTypeEntity,
    type ProductTypePermissionEntry,
} from "@/ui/api/ProductTypes.ts";
import { getDataTypes } from "@/ui/api/DataTypes.ts";
import { getBusinessDomains } from "@/ui/api/BusinessDomains.ts";
import {
    FP_DO_CONFIGURATION,
    FP_MANAGE_PRODUCT_TYPES,
    FP_VIEW_PRODUCT_TYPES,
} from "@/ui/auth/app_functional_permissions.ts";
import {
    TAG_PRODUCT_TYPE,
    TAG_PRODUCT_TYPE_DATA_TYPE,
    TAG_ASSIGN,
    TAG_UNASSIGN,
    TAG_PRODUCT_TYPE_PERMISSION,
} from "@/types/ProductTypeType.ts";
import {
    TAG_CREATE,
    TAG_UPDATE,
    TAG_DISABLE,
    TAG_GRANT,
    TAG_REVOKE,
} from "@/types/PubSubType";
import type { PubSubMessage } from "@/types/PubSubType";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";
import type { UserSelectType } from "@/types/UserType.ts";
import { DataTypeKind, DefaultValueCalculationMode } from "@/types/DataTypeType.ts";
import InputField, { type InputFieldHandle } from "@/ui/components/InputField";
import Label, { type LabelHandle } from "@/ui/components/Label";
import Toggle, { type ToggleHandle } from "@/ui/components/Toggle";

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export const meta: PageMeta = {
    id: "configuration-product-types-datatypes",
    urn: "urn:bun-starter:ui:page:configuration-product-types-datatypes",
    path: "/configuration/product-types/:producttypeid/datatypes",
    title: "Product type data types",
    description: "Manage data type assignments for a product type.",
    menu: {
        section: "Configuration",
        order: 26,
        label: "Product type data types",
        parent: "configuration-product-types",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_DO_CONFIGURATION.functionalPermissionName, FP_VIEW_PRODUCT_TYPES.functionalPermissionName],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ViewerContext = { permissionNames: string[] };
type OwnerOption = { identifier: string; name: string };
type UserRefMap = Record<string, UserSelectType | null>;

function formatTimestamp(value: string): string {
    return new Date(value).toLocaleString();
}

function formatUserRef(identifier: string | null, userRefs: UserRefMap): string {
    if (!identifier) return "-";
    const user = userRefs[identifier];
    if (!user) return identifier;
    return `${user.firstName} ${user.lastName} (${user.email})`;
}

// ---------------------------------------------------------------------------
// CollapsibleSection
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
// Tri-state helpers for Mandatory and RequestorCanEdit
// ---------------------------------------------------------------------------

function triStateNext(current: boolean | string | null): string | null {
    if (current === true || current === "Yes") return "No";
    if (current === false || current === "No") return null;
    return "Yes";
}

function triStateLabel(value: boolean | string | null, parentLabel?: string): string {
    if (value === true || value === "Yes") return "Yes";
    if (value === false || value === "No") return "No";
    return parentLabel ?? "Parent";
}

function triStateStyle(value: boolean | string | null): React.CSSProperties {
    if (value === true || value === "Yes") return { color: "var(--at-color-success, green)", fontWeight: "bold" };
    if (value === false || value === "No") return { color: "var(--at-color-danger, red)", fontWeight: "bold" };
    return { color: "var(--at-text-secondary, gray)", fontStyle: "italic" };
}

// ---------------------------------------------------------------------------
// Per-row Label refs structure
// ---------------------------------------------------------------------------

interface AssignmentLabelRefs {
    dataTypeName: React.RefObject<LabelHandle | null>;
    dataTypeKind: React.RefObject<LabelHandle | null>;
    owner: React.RefObject<LabelHandle | null>;
    mandatory: React.RefObject<LabelHandle | null>;
    requestorCanEdit: React.RefObject<LabelHandle | null>;
    configMode: React.RefObject<LabelHandle | null>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Component() {
    const { producttypeid } = useParams<{ producttypeid: string }>();

    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [productType, setProductType] = useState<ProductTypeEntity | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [userRefs, setUserRefs] = useState<UserRefMap>({});

    // Assigned DataTypes
    const [assignments, setAssignments] = useState<ProductTypeDataTypeAssignment[]>([]);
    const [assignmentsPage, setAssignmentsPage] = useState(0);
    const [assignmentsPageSize, setAssignmentsPageSize] = useState(10);
    const [assignmentsTotal, setAssignmentsTotal] = useState(0);
    const [availablePageSizes, setAvailablePageSizes] = useState<number[]>([10, 20, 50]);

    // Product-type-level permissions (role "cancel")
    const [productTypePermissions, setProductTypePermissions] = useState<ProductTypePermissionEntry[]>([]);
    const [allGroups, setAllGroups] = useState<{ identifier: string; name: string }[]>([]);

    // Assign DataType dialog
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [availableDataTypes, setAvailableDataTypes] = useState<{ identifier: string; name: string; kind: string }[]>([]);
    const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>([]);

    // Owner dropdown options
    const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);

    const canManage = viewerContext.permissionNames.includes(FP_MANAGE_PRODUCT_TYPES.functionalPermissionName);
    const canView = viewerContext.permissionNames.includes(FP_VIEW_PRODUCT_TYPES.functionalPermissionName);

    // --- InputField refs for name/description ---
    const nameInputRef = useRef<InputFieldHandle | null>(null);
    const descriptionInputRef = useRef<InputFieldHandle | null>(null);

    // --- Label refs for page headings (view-only mode) ---
    const nameLabelRef = useRef<LabelHandle>(null);
    const descriptionLabelRef = useRef<LabelHandle>(null);

    // --- Label refs for metadata fields ---
    const statusRef = useRef<LabelHandle>(null);
    const createdRef = useRef<LabelHandle>(null);
    const createdByRef = useRef<LabelHandle>(null);
    const updatedRef = useRef<LabelHandle>(null);
    const updatedByRef = useRef<LabelHandle>(null);
    const identifierRef = useRef<LabelHandle>(null);

    // --- Toggle ref for status ---
    const statusToggleRef = useRef<ToggleHandle<boolean>>(null);

    // --- Toggle ref for requestorCanCancel ---
    const requestorCanCancelToggleRef = useRef<ToggleHandle<boolean>>(null);
    const requestorCanCancelLabelRef = useRef<LabelHandle>(null);

    // --- Per-row refs for assignments ---
    const assignmentLabelRefs = useRef<Map<string, AssignmentLabelRefs>>(new Map());
    const assignmentEditableToggleRefs = useRef<Map<string, React.RefObject<ToggleHandle<boolean> | null>>>(new Map());

    // Guard to prevent PubSub feedback loop during our own saves
    const savingRef = useRef<boolean>(false);
    // Tracks the updatedAt we just received from our own save, so permanent PubSub
    // subscriptions can skip our own echo and only react to external changes.
    const lastSavedUpdatedAtRef = useRef<string | null>(null);

    // Product type ID stable ref for PubSub closures
    const producttypeidRef = useRef(producttypeid);
    producttypeidRef.current = producttypeid;

    // ---------- Load viewer context ----------
    useEffect(() => {
        let cancelled = false;
        void apiGet<ViewerContext>("/api/me/context").then((payload) => {
            if (!cancelled) setViewerContext({ permissionNames: Array.isArray(payload.permissionNames) ? payload.permissionNames : [] });
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, []);

    // ---------- Load product type ----------
    useEffect(() => {
        if (!canView || !producttypeid) return;
        let cancelled = false;
        setIsLoading(true);
        void (async () => {
            try {
                const payload = await getProductType(producttypeid);
                const pt = payload.productType;
                if (!pt) { setError("Product type not found"); return; }
                if (cancelled) return;
                setProductType(pt);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Could not load product type");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [canView, producttypeid]);

    // ---------- Seed InputFields and Labels when product type loads ----------
    useEffect(() => {
        if (!productType) return;

        // Seed InputFields
        nameInputRef.current?.setOriginalValue(productType.name, {
            productTypeId: productType.identifier,
            field: "name",
            updatedAt: productType.updatedAt,
        });
        nameInputRef.current?.resetToOriginal();

        descriptionInputRef.current?.setOriginalValue(productType.description ?? "", {
            productTypeId: productType.identifier,
            field: "description",
            updatedAt: productType.updatedAt,
        });
        descriptionInputRef.current?.resetToOriginal();

        // Seed Labels
        const id = productType.identifier;
        nameLabelRef.current?.setText(productType.name, { productTypeId: id, field: "name" });
        descriptionLabelRef.current?.setText(productType.description ?? "-", { productTypeId: id, field: "description" });
        statusRef.current?.setText(productType.disabled ? "Disabled" : "Enabled", { productTypeId: id, field: "status" });
        createdRef.current?.setText(formatTimestamp(productType.createdAt), { productTypeId: id, field: "created" });
        updatedRef.current?.setText(formatTimestamp(productType.updatedAt), { productTypeId: id, field: "updated" });
        identifierRef.current?.setText(productType.identifier, { productTypeId: id, field: "identifier" });

        // Seed status Toggle
        statusToggleRef.current?.setValue(productType.disabled, { productTypeId: id, field: "disabled", updatedAt: productType.updatedAt });

        // Seed requestorCanCancel Toggle and Label
        requestorCanCancelToggleRef.current?.setValue(productType.requestorCanCancel, {
            productTypeId: id, field: "requestorCanCancel", updatedAt: productType.updatedAt,
        });
        requestorCanCancelLabelRef.current?.setText(
            productType.requestorCanCancel ? "Yes" : "No",
            { productTypeId: id, field: "requestorCanCancel" },
        );
    }, [productType]);

    // ---------- Load user refs for createdBy/updatedBy ----------
    useEffect(() => {
        if (!productType || !canView) return;
        const identifiers = [productType.createdBy, productType.updatedBy].filter(
            (v): v is string => typeof v === "string" && v.length > 0 && !userRefs[v],
        );
        if (identifiers.length === 0) return;

        let cancelled = false;
        void Promise.all(identifiers.map(async (id) => {
            try {
                const payload = await apiGet<{ user: UserSelectType }>(`/api/users/${encodeURIComponent(id)}`);
                return { identifier: id, user: payload.user };
            } catch { return { identifier: id, user: null }; }
        })).then((results) => {
            if (cancelled) return;
            setUserRefs((cur) => {
                const next = { ...cur };
                results.forEach((r) => { next[r.identifier] = r.user; });
                return next;
            });
        });
        return () => { cancelled = true; };
    }, [canView, productType]);

    // ---------- Update createdBy/updatedBy Labels when userRefs load ----------
    useEffect(() => {
        if (!productType) return;
        createdByRef.current?.setText(formatUserRef(productType.createdBy, userRefs), { productTypeId: productType.identifier, field: "createdBy" });
        updatedByRef.current?.setText(formatUserRef(productType.updatedBy, userRefs), { productTypeId: productType.identifier, field: "updatedBy" });
    }, [productType, userRefs]);

    // ---------- Load owner options ----------
    useEffect(() => {
        if (!canView) return;
        let cancelled = false;
        void apiGet<{ groups: { identifier: string; groupName: string }[] }>(`/api/groups?page=0&pageSize=9999`).then((payload) => {
            if (!cancelled) setAllGroups(payload.groups.map((g) => ({ identifier: g.identifier, name: g.groupName })));
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [canView]);

    // ---------- Load product-type-level permissions ----------
    const loadProductTypePermissions = useCallback(async () => {
        if (!producttypeid || !canView) return;
        try {
            const payload = await getProductTypePermissions(producttypeid);
            setProductTypePermissions(payload.permissions);
        } catch (_e) {
            // Silently ignore
        }
    }, [canView, producttypeid]);

    useEffect(() => {
        void loadProductTypePermissions();
    }, [loadProductTypePermissions]);

    // ---------- PubSub: Product-type-level permission changes ----------
    useEffect(() => {
        if (!canView) return;

        const token = subscribe(
            { and: [TAG_PRODUCT_TYPE_PERMISSION, { or: [TAG_GRANT, TAG_REVOKE] }] },
            () => {
                void loadProductTypePermissions();
            },
        );

        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub").then((m) => m.unsubscribe(token));
            }
        };
    }, [canView, loadProductTypePermissions]);

    // ---------- Load assigned data types ----------
    const loadAssignments = useCallback(async () => {
        if (!producttypeid || !canView) return;
        try {
            const payload = await getProductTypeDataTypes(producttypeid, assignmentsPage, assignmentsPageSize, false);
            setAssignments(payload.dataTypeAssignments);
            setAssignmentsTotal(payload.total);
            setAvailablePageSizes(payload.availablePageSizes);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load data type assignments");
        }
    }, [canView, producttypeid, assignmentsPage, assignmentsPageSize]);

    useEffect(() => {
        void loadAssignments();
    }, [loadAssignments]);

    // ---------- Seed per-row Labels after assignments load ----------
    useEffect(() => {
        assignments.forEach((row) => {
            let refs = assignmentLabelRefs.current.get(row.identifier);
            if (!refs) {
                refs = {
                    dataTypeName: { current: null },
                    dataTypeKind: { current: null },
                    owner: { current: null },
                    mandatory: { current: null },
                    requestorCanEdit: { current: null },
                    configMode: { current: null },
                };
                assignmentLabelRefs.current.set(row.identifier, refs);
            }

            const id = row.identifier;
            refs.dataTypeName.current?.setText(row.dataTypeName, { assignmentId: id, field: "dataTypeName" });
            refs.dataTypeKind.current?.setText(row.dataTypeKind, { assignmentId: id, field: "dataTypeKind" });
            refs.owner.current?.setText(row.ownerBusinessDomainName ?? row.owner ?? "(inherit)", { assignmentId: id, field: "owner" });
            refs.mandatory.current?.setText(triStateLabel(row.mandatory, "from DataType"), { assignmentId: id, field: "mandatory" });
            refs.requestorCanEdit.current?.setText(triStateLabel(row.requestorCanEdit, "from DataType"), { assignmentId: id, field: "requestorCanEdit" });
            const modeText = row.dataTypeKind !== DataTypeKind.Calculated
                ? (row.config?.mode
                    ? row.config.mode === DefaultValueCalculationMode.OnCreate ? "On Create"
                        : row.config.mode === DefaultValueCalculationMode.OnChangeNoValue ? "On Change (no value)"
                        : row.config.mode === DefaultValueCalculationMode.OnChange ? "On Change"
                        : String(row.config.mode)
                    : "— inherit —")
                : "n/a";
            refs.configMode.current?.setText(modeText, { assignmentId: id, field: "configMode" });

            // Seed editableOnUpdate Toggle
            let toggleRef = assignmentEditableToggleRefs.current.get(row.identifier);
            if (!toggleRef) {
                toggleRef = { current: null };
                assignmentEditableToggleRefs.current.set(row.identifier, toggleRef);
            }
            toggleRef.current?.setValue(row.editableOnUpdate, { assignmentId: id, field: "editableOnUpdate" });
        });

        // Clean up refs for removed assignments
        const currentIds = new Set(assignments.map((a) => a.identifier));
        for (const id of assignmentLabelRefs.current.keys()) {
            if (!currentIds.has(id)) {
                assignmentLabelRefs.current.delete(id);
                assignmentEditableToggleRefs.current.delete(id);
            }
        }
    }, [assignments]);

    // ---------- PubSub: Targeted product type updates (name/description/status) ----------
    useEffect(() => {
        if (!productType || !producttypeid) return;

        const token = subscribe(
            { and: [TAG_PRODUCT_TYPE, producttypeid, { or: [TAG_UPDATE, TAG_DISABLE] }] },
            (msg: PubSubMessage) => {
                if (savingRef.current) return;
                const tags = msg.tags;
                const data = msg.data as Record<string, unknown> | undefined;
                // Skip our own echo: if the updatedAt matches what we just saved,
                // this PubSub event is the result of our own change.
                if (data?.updatedAt === lastSavedUpdatedAtRef.current) return;

                if (tags.includes(TAG_UPDATE)) {
                    if (data?.name !== undefined) {
                        nameLabelRef.current?.setText(String(data.name), { productTypeId: producttypeid, field: "name" });
                        // Don't overwrite user edits - seed only if not focused/dirty
                        const nameRef = nameInputRef.current;
                        if (nameRef && !nameRef.getDirty() && !nameRef.compareWithOriginal()) {
                            nameRef.setOriginalValue(String(data.name), {
                                productTypeId: producttypeid,
                                field: "name",
                                updatedAt: (data?.updatedAt as string) ?? productType.updatedAt,
                            });
                        }
                    }
                    if (data?.description !== undefined) {
                        descriptionLabelRef.current?.setText(String(data.description), { productTypeId: producttypeid, field: "description" });
                        const descRef = descriptionInputRef.current;
                        if (descRef && !descRef.getDirty() && !descRef.compareWithOriginal()) {
                            descRef.setOriginalValue(String(data.description), {
                                productTypeId: producttypeid,
                                field: "description",
                                updatedAt: (data?.updatedAt as string) ?? productType.updatedAt,
                            });
                        }
                    }
                    if (data?.updatedAt !== undefined) {
                        updatedRef.current?.setText(formatTimestamp(String(data.updatedAt)), { productTypeId: producttypeid, field: "updated" });
                    }
                    if (data?.requestorCanCancel !== undefined) {
                        requestorCanCancelLabelRef.current?.setText(
                            data.requestorCanCancel ? "Yes" : "No",
                            { productTypeId: producttypeid, field: "requestorCanCancel" },
                        );
                        requestorCanCancelToggleRef.current?.setValue(
                            Boolean(data.requestorCanCancel),
                            { productTypeId: producttypeid, field: "requestorCanCancel", updatedAt: String(data.updatedAt ?? productType.updatedAt) },
                        );
                        setProductType((prev) => prev ? {
                            ...prev,
                            requestorCanCancel: Boolean(data.requestorCanCancel),
                            updatedAt: String(data.updatedAt ?? productType.updatedAt),
                        } : prev);
                    }
                }
                if (tags.includes(TAG_DISABLE)) {
                    const disabled = data?.disabled === true;
                    statusRef.current?.setText(disabled ? "Disabled" : "Enabled", { productTypeId: producttypeid, field: "status" });
                    statusToggleRef.current?.setValue(disabled, { productTypeId: producttypeid, field: "disabled", updatedAt: (data?.updatedAt as string) ?? productType.updatedAt });
                }
            },
        );

        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub").then((m) => m.unsubscribe(token));
            }
        };
    }, [productType, producttypeid]);

    // ---------- PubSub: Assignment list changes (assign/unassign) ----------
    useEffect(() => {
        if (!canView) return;

        const token = subscribe(
            { and: [TAG_PRODUCT_TYPE_DATA_TYPE, { or: [TAG_ASSIGN, TAG_UNASSIGN] }] },
            () => {
                void loadAssignments();
            },
        );

        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub").then((m) => m.unsubscribe(token));
            }
        };
    }, [canView, loadAssignments]);

    // ---------- PubSub: Assignment updates (concurrent edit detection) ----------
    useEffect(() => {
        if (!canView) return;

        const token = subscribe(
            { and: [TAG_PRODUCT_TYPE_DATA_TYPE, TAG_UPDATE] },
            (msg: PubSubMessage) => {
                if (savingRef.current) return;
                const data = msg.data as Record<string, unknown> | undefined;
                // Skip our own echo: if the updatedAt matches what we just saved,
                // this PubSub event is the result of our own change.
                if (data?.updatedAt === lastSavedUpdatedAtRef.current) return;
                const assignmentId = data?.identifier as string | undefined;

                if (assignmentId) {
                    // Set dirty on the editableOnUpdate Toggle for that assignment
                    const toggleRef = assignmentEditableToggleRefs.current.get(assignmentId);
                    if (toggleRef?.current) {
                        toggleRef.current.setDirty(true);
                        toggleRef.current.setHintText("Assignment was modified by another user");
                    }
                }
            },
        );

        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub").then((m) => m.unsubscribe(token));
            }
        };
    }, [canView]);

    // ---------- Save name (three-stream race pattern) ----------
    const handleSaveName = async (
        component: InputFieldHandle,
        _source: "button" | "blur",
    ) => {
        const rawValue = component.getCurrentValue();
        if (!component.compareWithOriginal()) return;
        if (!productType || !producttypeid) return;

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
            setProductType((prev) => prev ? {
                ...prev,
                name: newName,
                updatedAt: newUpdatedAt,
            } : prev);
            setSuccess("Name updated");
        };

        // Stream 1: PubSub
        let pubsubToken: string | false = false;
        pubsubToken = subscribe(
            { and: [TAG_PRODUCT_TYPE, TAG_UPDATE] },
            async (msg: PubSubMessage) => {
                const data = msg.data as Record<string, unknown> | undefined;
                if (data?.identifier !== productType.identifier) return;
                try {
                    const refreshed = await getProductType(producttypeid);
                    if (!resolved) {
                        finalizeSuccess(
                            refreshed.productType.name,
                            refreshed.productType.updatedAt,
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
                const payload = await getProductType(producttypeid);
                if (!resolved) {
                    finalizeSuccess(payload.productType.name, payload.productType.updatedAt);
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
            const response = await updateProductType(productType.identifier, {
                name: rawValue.trim(),
                knownUpdatedAt: (ctx?.updatedAt as string) ?? productType.updatedAt,
            });
            if (!resolved) {
                finalizeSuccess(rawValue.trim(), response.productType.updatedAt);
            }
        } catch (err: any) {
            savingRef.current = false;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);

            if (err?.status === 409) {
                if (resolved) return;
                component.setHintText("This product type was modified by another user. Please refresh.");
                component.setDirty(true);
                component.enableRestoreButton();
            } else if (!resolved) {
                component.enableSaveButton();
                component.enableRestoreButton();
                setError(err instanceof Error ? err.message : "Could not update name");
            }
        }
    };

    // ---------- Save description (three-stream race pattern) ----------
    const handleSaveDescription = async (
        component: InputFieldHandle,
        _source: "button" | "blur",
    ) => {
        const rawValue = component.getCurrentValue();
        if (!component.compareWithOriginal()) return;
        if (!productType || !producttypeid) return;

        const ctx = component.getContext();
        savingRef.current = true;
        let resolved = false;

        const finalizeSuccess = (
            newDescription: string,
            newUpdatedAt: string,
        ) => {
            if (resolved) return;
            resolved = true;
            savingRef.current = false;
            lastSavedUpdatedAtRef.current = newUpdatedAt;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);

            component.setOriginalValue(newDescription, { updatedAt: newUpdatedAt });
            component.setDirty(false);
            component.enableSaveButton();
            component.enableRestoreButton();
            component.setHintText("");
            setProductType((prev) => prev ? {
                ...prev,
                description: newDescription || null,
                updatedAt: newUpdatedAt,
            } : prev);
            setSuccess("Description updated");
        };

        // Stream 1: PubSub
        let pubsubToken: string | false = false;
        pubsubToken = subscribe(
            { and: [TAG_PRODUCT_TYPE, TAG_UPDATE] },
            async (msg: PubSubMessage) => {
                const data = msg.data as Record<string, unknown> | undefined;
                if (data?.identifier !== productType.identifier) return;
                try {
                    const refreshed = await getProductType(producttypeid);
                    if (!resolved) {
                        finalizeSuccess(
                            refreshed.productType.description ?? "",
                            refreshed.productType.updatedAt,
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
                const payload = await getProductType(producttypeid);
                if (!resolved) {
                    finalizeSuccess(
                        payload.productType.description ?? "",
                        payload.productType.updatedAt,
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

        // Stream 3: Server - use apiPut directly to pass both name and description
        try {
            const response = await apiPut<{ productType: ProductTypeEntity }>(
                `/api/product_types/${encodeURIComponent(productType.identifier)}`,
                {
                    name: productType.name,
                    description: rawValue.trim().length > 0 ? rawValue.trim() : null,
                    knownUpdatedAt: (ctx?.updatedAt as string) ?? productType.updatedAt,
                },
            );
            if (!resolved) {
                finalizeSuccess(
                    rawValue.trim().length > 0 ? rawValue.trim() : "",
                    response.productType.updatedAt,
                );
            }
        } catch (err: any) {
            savingRef.current = false;
            clearTimeout(timerId);
            if (pubsubToken) unsubscribe(pubsubToken);

            if (err?.status === 409) {
                if (resolved) return;
                component.setHintText("This product type was modified by another user. Please refresh.");
                component.setDirty(true);
                component.enableRestoreButton();
            } else if (!resolved) {
                component.enableSaveButton();
                component.enableRestoreButton();
                setError(err instanceof Error ? err.message : "Could not update description");
            }
        }
    };

    // ---------- Toggle disabled (status) ----------
    const handleToggleDisabled = async (toggle: ToggleHandle<boolean>) => {
        if (!producttypeid || !productType || !canManage) return;
        const newDisabled = toggle.getValue();
        try {
            const updated = await setProductTypeDisabled(producttypeid, {
                disabled: newDisabled,
                knownUpdatedAt: productType.updatedAt,
            });
            const pt = updated.productType;
            setProductType(pt);
            toggle.setValue(pt.disabled, { productTypeId: pt.identifier, field: "disabled", updatedAt: pt.updatedAt });
            setSuccess(newDisabled ? "Product type disabled" : "Product type enabled");
        } catch (e) {
            // Revert toggle on error
            toggle.setValue(productType.disabled, { productTypeId: productType.identifier, field: "disabled", updatedAt: productType.updatedAt });
            setError(e instanceof Error ? e.message : "Could not toggle status");
        }
    };

    // ---------- Toggle requestorCanCancel ----------
    const handleToggleRequestorCanCancel = async (toggle: ToggleHandle<boolean>) => {
        if (!producttypeid || !productType || !canManage) return;
        const newValue = toggle.getValue();
        savingRef.current = true;
        try {
            const response = await apiPut<{ productType: ProductTypeEntity }>(
                `/api/product_types/${encodeURIComponent(productType.identifier)}`,
                {
                    name: productType.name,
                    requestorCanCancel: newValue,
                    knownUpdatedAt: productType.updatedAt,
                },
            );
            const pt = response.productType;
            lastSavedUpdatedAtRef.current = pt.updatedAt;
            setProductType(pt);
            toggle.setValue(pt.requestorCanCancel, {
                productTypeId: pt.identifier, field: "requestorCanCancel", updatedAt: pt.updatedAt,
            });
            requestorCanCancelLabelRef.current?.setText(
                pt.requestorCanCancel ? "Yes" : "No",
                { productTypeId: pt.identifier, field: "requestorCanCancel" },
            );
            setSuccess(newValue ? "Requestor can cancel enabled" : "Requestor can cancel disabled");
        } catch (e) {
            toggle.setValue(productType.requestorCanCancel, {
                productTypeId: productType.identifier, field: "requestorCanCancel",
                updatedAt: productType.updatedAt,
            });
            setError(e instanceof Error ? e.message : "Could not update requestor cancel permission");
        } finally {
            savingRef.current = false;
        }
    };

    // ---------- Assign DataType dialog ----------
    const openAssignDialog = async () => {
        setAssignDialogOpen(true);
        setSelectedDataTypes([]);
        try {
            // Load all assignments (pageSize=1000) so assignedIds covers ALL existing assignments,
            // not just the currently visible page of the paginated table.
            const allAssignments = await getProductTypeDataTypes(producttypeid!, 0, 1000, false);
            const assignedIds = new Set(allAssignments.dataTypeAssignments.map((a) => a.dataType));

            // Load all data types (pageSize=1000 to avoid pagination in dropdown)
            const payload = await getDataTypes(0, 1000, false);
            setAvailableDataTypes(
                payload.dataTypes
                    .filter((dt: any) => !assignedIds.has(dt.dataType?.identifier ?? dt.identifier))
                    .map((dt: any) => {
                        const inner = dt.dataType ?? dt;
                        return { identifier: inner.identifier, name: inner.name, kind: inner.kind };
                    }),
            );
        } catch (e) {
            // If the all-assignments fetch fails, fall back to the current page's assignments
            try {
                const assignedIds = new Set(assignments.map((a) => a.dataType));
                const payload = await getDataTypes(0, 1000, false);
                setAvailableDataTypes(
                    payload.dataTypes
                        .filter((dt: any) => !assignedIds.has(dt.dataType?.identifier ?? dt.identifier))
                        .map((dt: any) => {
                            const inner = dt.dataType ?? dt;
                            return { identifier: inner.identifier, name: inner.name, kind: inner.kind };
                        }),
                );
            } catch (_e2) {
                setError(e instanceof Error ? e.message : "Could not load data types");
            }
        }
    };

    const handleAssignDataTypes = async () => {
        if (!producttypeid || selectedDataTypes.length === 0) return;
        setIsSaving(true);
        const errors: string[] = [];
        for (const dtId of selectedDataTypes) {
            try {
                await assignDataType(producttypeid, dtId);
            } catch (e) {
                errors.push(dtId + ": " + (e instanceof Error ? e.message : "unknown error"));
            }
        }
        setIsSaving(false);
        if (errors.length > 0) {
            setError("Could not assign some data types: " + errors.join("; "));
        } else {
            setAssignDialogOpen(false);
            void loadAssignments();
        }
    };

    // ---------- Unassign DataType ----------
    const handleUnassign = async (assignmentIdentifier: string) => {
        if (!producttypeid) return;
        try {
            await unassignDataType(producttypeid, assignmentIdentifier);
            void loadAssignments();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not unassign data type");
        }
    };

    // ---------- Update assignment field ----------
    const handleUpdateAssignment = async (assignmentIdentifier: string, fields: Record<string, unknown>) => {
        if (!producttypeid) return;
        try {
            await updateDataTypeAssignment(producttypeid, assignmentIdentifier, fields as any);
            void loadAssignments();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update assignment");
        }
    };

    // ---------- Product-type-level permission handlers ----------
    const handleGrantProductTypePermission = async (groupIdentifier: string) => {
        if (!producttypeid) return;
        try {
            const result = await grantProductTypePermission(producttypeid, { groupIdentifier });
            if (result.permission) {
                setProductTypePermissions((prev) => [...prev, result.permission!]);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not grant permission");
        }
    };

    const handleRevokeProductTypePermission = async (groupIdentifier: string) => {
        if (!producttypeid) return;
        try {
            await revokeProductTypePermission(producttypeid, { groupIdentifier });
            setProductTypePermissions((prev) => prev.filter((p) => p.groupIdentifier !== groupIdentifier));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not revoke permission");
        }
    };

    if (isLoading) {
        return (
            <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
                <PageSection title="Product type data types">
                    <p>Loading...</p>
                </PageSection>
            </PageTemplate>
        );
    }

    if (error) {
        return (
            <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
                <PageSection title="Product type data types">
                    <p className="admin-config-error">{error}</p>
                </PageSection>
            </PageTemplate>
        );
    }

    if (!productType) {
        return (
            <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
                <PageSection title="Product type data types">
                    <p>Product type not found.</p>
                </PageSection>
            </PageTemplate>
        );
    }

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            {error ? <p className="admin-config-error">{error}</p> : null}
            {success ? <p className="admin-config-success">{success}</p> : null}

            {/* A. Metadata Section */}
            <CollapsibleSection title="Metadata" defaultExpanded>
                <div className="admin-detail-grid" style={{ gridTemplateColumns: "1fr 3fr" }}>
                    {canManage ? (
                        <>
                            <div>
                                <strong>Name:</strong>
                                <InputField
                                    ref={nameInputRef}
                                    showButtons={true}
                                    onSave={handleSaveName}
                                />
                            </div>
                            <div>
                                <strong>Description:</strong>
                                <InputField
                                    ref={descriptionInputRef}
                                    multiLine={true}
                                    showButtons={true}
                                    onSave={handleSaveDescription}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div><strong>Name:</strong> <Label ref={nameLabelRef} size="normal" text={productType.name} /></div>
                            <div><strong>Description:</strong> <Label ref={descriptionLabelRef} size="normal" text={productType.description ?? "-"} /></div>
                        </>
                    )}
                </div>

                <div className="admin-detail-grid admin-top-gap" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
                    <div>
                        <strong>Status:</strong>{" "}
                        {canManage ? (
                            <Toggle<boolean>
                                ref={statusToggleRef}
                                variant="pill"
                                value={productType.disabled}
                                options={[
                                    { value: false, label: "Enabled" },
                                    { value: true, label: "Disabled" },
                                ]}
                                onChange={(t) => { void handleToggleDisabled(t); }}
                            />
                        ) : (
                            <Label ref={statusRef} size="small" text={productType.disabled ? "Disabled" : "Enabled"} />
                        )}
                    </div>
                    <div>
                        <strong>Requestor can cancel:</strong>{" "}
                        {canManage ? (
                            <Toggle<boolean>
                                ref={requestorCanCancelToggleRef}
                                variant="pill"
                                value={productType.requestorCanCancel}
                                options={[
                                    { value: true, label: "Yes" },
                                    { value: false, label: "No" },
                                ]}
                                onChange={(t) => { void handleToggleRequestorCanCancel(t); }}
                            />
                        ) : (
                            <Label ref={requestorCanCancelLabelRef} size="small" text={productType.requestorCanCancel ? "Yes" : "No"} />
                        )}
                    </div>
                    <div>
                        <strong>Created:</strong> <Label ref={createdRef} size="small" text={formatTimestamp(productType.createdAt)} />
                        <br />
                        <strong>by:</strong> <Label ref={createdByRef} size="small" text={formatUserRef(productType.createdBy, userRefs)} />
                    </div>
                    <div>
                        <strong>Updated:</strong> <Label ref={updatedRef} size="small" text={formatTimestamp(productType.updatedAt)} />
                        <br />
                        <strong>by:</strong> <Label ref={updatedByRef} size="small" text={formatUserRef(productType.updatedBy, userRefs)} />
                    </div>
                    <div><strong>Identifier:</strong> <code><Label ref={identifierRef} size="small" text={productType.identifier} /></code></div>
                </div>
            </CollapsibleSection>

            {/* B. Assigned Data Types */}
            <CollapsibleSection title="Assigned Data Types" defaultExpanded>
                {canManage ? (
                    <div className="admin-top-gap" style={{ marginBottom: "1rem" }}>
                        <button type="button" onClick={() => void openAssignDialog()}>
                            <i className="pi pi-plus" aria-hidden="true" /> Assign Data Type
                        </button>
                    </div>
                ) : null}

                {assignments.length === 0 ? (
                    <p style={{ color: "var(--at-text-secondary)", fontStyle: "italic" }}>No data types assigned.</p>
                ) : (
                    <table className="mui-simple-table admin-table">
                        <thead>
                            <tr>
                                <th>Data Type</th>
                                <th>Kind</th>
                                <th>Owner</th>
                                <th>Mandatory</th>
                                <th>Editable on Update</th>
                                <th>Requestor Can Edit</th>
                                <th>Default Mode</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...assignments].sort((a, b) => a.dataTypeName.localeCompare(b.dataTypeName)).map((row) => {
                                // Ensure label refs and toggle ref exist for this row
                                if (!assignmentLabelRefs.current.has(row.identifier)) {
                                    assignmentLabelRefs.current.set(row.identifier, {
                                        dataTypeName: { current: null },
                                        dataTypeKind: { current: null },
                                        owner: { current: null },
                                        mandatory: { current: null },
                                        requestorCanEdit: { current: null },
                                        configMode: { current: null },
                                    });
                                }
                                if (!assignmentEditableToggleRefs.current.has(row.identifier)) {
                                    assignmentEditableToggleRefs.current.set(row.identifier, { current: null });
                                }
                                const refs = assignmentLabelRefs.current.get(row.identifier)!;
                                const editableToggleRef = assignmentEditableToggleRefs.current.get(row.identifier)!;

                                return (
                                    <tr key={row.identifier}>
                                        <td>
                                            <Link to={`/configuration/product-types/${producttypeid}/datatypes/${row.identifier}/targetsystems`}>
                                                <Label ref={refs.dataTypeName} size="normal" text={row.dataTypeName} />
                                            </Link>
                                        </td>
                                        <td><Label ref={refs.dataTypeKind} size="small" text={row.dataTypeKind} /></td>
                                        <td>
                                            {canManage ? (
                                                <select
                                                    value={row.owner ?? ""}
                                                    onChange={(e) => {
                                                        const val = e.target.value || null;
                                                        void handleUpdateAssignment(row.identifier, { owner: val });
                                                    }}
                                                >
                                                    <option value="">(inherit)</option>
                                                    {ownerOptions.map((opt) => (
                                                        <option key={opt.identifier} value={opt.identifier}>{opt.name}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <Label ref={refs.owner} size="small" text={row.ownerBusinessDomainName ?? row.owner ?? "-"} />
                                            )}
                                        </td>
                                        <td>
                                            {canManage ? (
                                                <button
                                                    type="button"
                                                    className="admin-config-value-button"
                                                    style={triStateStyle(row.mandatory)}
                                                    onClick={() => {
                                                        const next = triStateNext(row.mandatory);
                                                        void handleUpdateAssignment(row.identifier, { mandatory: next });
                                                    }}
                                                >
                                                    <Label ref={refs.mandatory} size="small" text={triStateLabel(row.mandatory, "from DataType")} />
                                                </button>
                                            ) : (
                                                <span style={triStateStyle(row.mandatory)}>
                                                    <Label ref={refs.mandatory} size="small" text={triStateLabel(row.mandatory, "from DataType")} />
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {canManage ? (
                                                <Toggle<boolean>
                                                    ref={editableToggleRef}
                                                    variant="toggle"
                                                    value={row.editableOnUpdate}
                                                    options={[
                                                        { value: true, label: "Yes" },
                                                        { value: false, label: "No" },
                                                    ]}
                                                    onChange={(t) => {
                                                        void handleUpdateAssignment(row.identifier, { editableOnUpdate: t.getValue() });
                                                    }}
                                                />
                                            ) : (
                                                <span>{row.editableOnUpdate ? "Yes" : "No"}</span>
                                            )}
                                        </td>
                                        <td>
                                            {canManage ? (
                                                <button
                                                    type="button"
                                                    className="admin-config-value-button"
                                                    style={triStateStyle(row.requestorCanEdit)}
                                                    onClick={() => {
                                                        const next = triStateNext(row.requestorCanEdit);
                                                        void handleUpdateAssignment(row.identifier, { requestorCanEdit: next });
                                                    }}
                                                >
                                                    <Label ref={refs.requestorCanEdit} size="small" text={triStateLabel(row.requestorCanEdit, "from DataType")} />
                                                </button>
                                            ) : (
                                                <span style={triStateStyle(row.requestorCanEdit)}>
                                                    <Label ref={refs.requestorCanEdit} size="small" text={triStateLabel(row.requestorCanEdit, "from DataType")} />
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {row.dataTypeKind !== DataTypeKind.Calculated ? (
                                                canManage ? (
                                                    <select
                                                        value={(row.config?.mode as string) ?? ""}
                                                        onChange={(e) => {
                                                            const val = e.target.value || null;
                                                            void handleUpdateAssignment(row.identifier, {
                                                                config: { ...(row.config ?? {}), mode: val },
                                                            });
                                                        }}
                                                    >
                                                        <option value="">— inherit —</option>
                                                        <option value={DefaultValueCalculationMode.OnCreate}>On Create</option>
                                                        <option value={DefaultValueCalculationMode.OnChangeNoValue}>On Change (no value)</option>
                                                        <option value={DefaultValueCalculationMode.OnChange}>On Change</option>
                                                    </select>
                                                ) : (
                                                    <Label ref={refs.configMode} size="small" text={
                                                        row.config?.mode
                                                            ? row.config.mode === DefaultValueCalculationMode.OnCreate ? "On Create"
                                                                : row.config.mode === DefaultValueCalculationMode.OnChangeNoValue ? "On Change (no value)"
                                                                : row.config.mode === DefaultValueCalculationMode.OnChange ? "On Change"
                                                                : String(row.config.mode)
                                                            : "— inherit —"
                                                    } />
                                                )
                                            ) : (
                                                <span style={{ color: "var(--at-text-secondary)", fontStyle: "italic" }}>n/a</span>
                                            )}
                                        </td>
                                        <td>
                                            {canManage ? (
                                                <button
                                                    type="button"
                                                    onClick={() => void handleUnassign(row.identifier)}
                                                    title="Remove assignment"
                                                >
                                                    <i className="pi pi-trash" aria-hidden="true" />
                                                </button>
                                            ) : null}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {assignmentsTotal > 0 ? (
                    <div className="admin-pager-row" style={{ marginTop: "0.5rem" }}>
                        <button type="button" disabled={assignmentsPage <= 0} onClick={() => setAssignmentsPage((p) => Math.max(0, p - 1))}>Previous</button>
                        <span>Page {assignmentsPage + 1} of {Math.max(1, Math.ceil(assignmentsTotal / assignmentsPageSize))}</span>
                        <button type="button" disabled={assignmentsPage >= Math.ceil(assignmentsTotal / assignmentsPageSize) - 1} onClick={() => setAssignmentsPage((p) => p + 1)}>Next</button>
                        <label>
                            Page size
                            <select className="admin-page-size" value={assignmentsPageSize} onChange={(e) => { setAssignmentsPageSize(Number(e.target.value)); setAssignmentsPage(0); }}>
                                {availablePageSizes.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </label>
                    </div>
                ) : null}
            </CollapsibleSection>

            {/* C. Product Type Permissions (cancel role) */}
            <CollapsibleSection title="Permissions" defaultExpanded>
                <div className="admin-datatype-permission-panel admin-top-gap">
                    {canManage ? (
                        <div className="admin-top-gap">
                            <FilterableDropdown
                                options={allGroups.filter(
                                    (g) => !productTypePermissions.some((p) => p.groupIdentifier === g.identifier),
                                )}
                                selected={[]}
                                onChange={async (identifiers: string | string[]) => {
                                    if (!canManage) return;
                                    const ids = Array.isArray(identifiers) ? identifiers : [identifiers];
                                    for (const id of ids) {
                                        if (!id) continue;
                                        await handleGrantProductTypePermission(id);
                                    }
                                }}
                                multiSelect={true}
                                placeholder="Add groups..."
                                disabled={
                                    allGroups.filter((g) => !productTypePermissions.some((p) => p.groupIdentifier === g.identifier)).length === 0
                                }
                            />
                        </div>
                    ) : null}
                    <div className="admin-chip-wrap admin-top-gap">
                        {productTypePermissions.length === 0 ? (
                            <span style={{ color: "var(--at-text-secondary)", fontStyle: "italic" }}>No groups have cancel permission</span>
                        ) : (
                            productTypePermissions.map((perm) => (
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
                                    {perm.groupName} ({perm.role})
                                    {canManage ? (
                                        <button
                                            type="button"
                                            className="admin-datatype-chip-remove"
                                            onClick={() => void handleRevokeProductTypePermission(perm.groupIdentifier)}
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
            </CollapsibleSection>

            <div className="admin-top-gap">
                <Link to="/configuration/product-types">Back to product types</Link>
            </div>

            {/* Assign DataType Dialog */}
            <Dialog
                header="Assign Data Type"
                visible={assignDialogOpen}
                onHide={() => setAssignDialogOpen(false)}
                style={{ minWidth: "450px" }}
            >
                <FilterableDropdown
                    options={availableDataTypes}
                    selected={selectedDataTypes}
                    onChange={(identifiers: string | string[]) => setSelectedDataTypes(identifiers as string[])}
                    multiSelect={true}
                    placeholder="Search data types..."
                    emptyMessage="No data types available to assign"
                    disabled={!canManage}
                />
                <div className="admin-config-actions admin-top-gap" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                    <button type="button" onClick={() => setAssignDialogOpen(false)}>Cancel</button>
                    <button type="button" disabled={selectedDataTypes.length === 0} onClick={() => void handleAssignDataTypes()}>Assign</button>
                </div>
            </Dialog>
        </PageTemplate>
    );
}
