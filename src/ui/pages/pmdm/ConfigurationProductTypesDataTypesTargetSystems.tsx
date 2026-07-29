import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Dialog } from "primereact/dialog";
import { Toast } from "primereact/toast";
import { FilterableDropdown } from "@/ui/components/FilterableDropdown.tsx";
import type { FilterableDropdownOption } from "@/ui/components/FilterableDropdown.tsx";
import { InputText } from "primereact/inputtext";
import { Checkbox } from "primereact/checkbox";
import { MonacoField } from "@/ui/components/MonacoField.tsx";
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiGet } from "@/ui/api";
import type { DataTypePermissionEntry } from "@/types/ConfigurationTypes.ts";
import {
    getProductType,
    getProductTypeDataTypes,
    getProductTypeDataTypeTargetSystems,
    assignTargetSystem,
    unassignTargetSystem,
    updateTargetSystemAssignment,
    getProductTypeDataTypePermissions,
    grantProductTypeDataTypePermission,
    revokeProductTypeDataTypePermission,
    updateProductTypeDataTypePermission,
    getProductTypeDataTypePreviousApprovals,
    addProductTypeDataTypePreviousApproval,
    removeProductTypeDataTypePreviousApproval,
    updateDataTypeAssignment,
    type ProductTypeDataTypeAssignment,
    type ProductTypeDataTypeTargetSystemRow,
    type ProductTypeDataTypePermissionEntry,
    type ProductTypeEntity,
    type PreviousApprovalEntry,
} from "@/ui/api/ProductTypes.ts";
import { getTargetSystems } from "@/ui/api/TargetSystems.ts";
import { getDataTypeDetail, getDataTypePermissions } from "@/ui/api/DataTypes.ts";
import { getBusinessDomains } from "@/ui/api/BusinessDomains.ts";
import {
    FP_DO_CONFIGURATION,
    FP_MANAGE_PRODUCT_TYPES,
    FP_VIEW_PRODUCT_TYPES,
} from "@/ui/auth/app_functional_permissions.ts";
import {
    TAG_PRODUCT_TYPE_DATA_TYPE,
    TAG_PRODUCT_TYPE_DATA_TYPE_TARGET_SYSTEM,
    TAG_PRODUCT_TYPE_DATA_TYPE_PERMISSION,
    TAG_PRODUCT_TYPE_DATA_TYPE_PREVIOUS_APPROVAL,
    TAG_ASSIGN,
    TAG_UNASSIGN,
} from "@/types/ProductTypeType.ts";
import {
    TAG_UPDATE,
    TAG_GRANT,
    TAG_REVOKE,
    TAG_CONFIG,
    TAG_UPSERT,
} from "@/types/PubSubType.ts";
import { DataTypeKind, DefaultValueCalculationMode } from "@/types/DataTypeType.ts";
import type { PubSubMessage } from "@/types/PubSubType.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";
import type { UserSelectType } from "@/types/UserType.ts";
import InputField, { type InputFieldHandle } from "@/ui/components/InputField.tsx";
import Label, { type LabelHandle } from "@/ui/components/Label.tsx";
import Toggle, { type ToggleHandle } from "@/ui/components/Toggle.tsx";
import { ScriptEditorPopup } from "@/ui/components/ScriptEditorPopup.tsx";

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export const meta: PageMeta = {
    id: "configuration-product-types-datatypes-targetsystems",
    urn: "urn:bun-starter:ui:page:configuration-product-types-datatypes-targetsystems",
    path: "/configuration/product-types/:producttypeid/datatypes/:datatypeassignmentid/targetsystems",
    title: "Product type data type target systems",
    description: "Manage target systems, config, and permissions for a product type data type assignment.",
    menu: {
        section: "Configuration",
        order: 27,
        label: "Target systems",
        parent: "configuration-product-types-datatypes",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_DO_CONFIGURATION.functionalPermissionName, FP_VIEW_PRODUCT_TYPES.functionalPermissionName],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ViewerContext = { permissionNames: string[] };
type OwnerOption = { identifier: string; name: string };
type GroupOption = { identifier: string; name: string };
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
// Chip-value helpers for Mandatory and RequestorCanEdit (with inheritance)
// ---------------------------------------------------------------------------

function chipValueWithInherit(dbVal: boolean | string | null): string {
    if (dbVal === null || dbVal === undefined) return "inherit";
    if (dbVal === true || dbVal === "Yes") return "yes";
    if (dbVal === false || dbVal === "No") return "no";
    return "script";
}

function scriptFromValue(dbVal: boolean | string | null): string {
    if (typeof dbVal !== "string") return "";
    if (dbVal === "Yes" || dbVal === "No") return "";
    return dbVal;
}

function isYes(value: boolean | string | null | undefined): boolean {
    return value === true || value === "Yes";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Component() {
    const { producttypeid, datatypeassignmentid } = useParams<{ producttypeid: string; datatypeassignmentid: string }>();

    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [userRefs, setUserRefs] = useState<UserRefMap>({});

    // ProductType + DataType info
    const [productType, setProductType] = useState<ProductTypeEntity | null>(null);
    const [assignment, setAssignment] = useState<ProductTypeDataTypeAssignment | null>(null);

    // Target Systems
    const [targetSystems, setTargetSystems] = useState<ProductTypeDataTypeTargetSystemRow[]>([]);
    const [tsPage, setTsPage] = useState(0);
    const [tsPageSize, setTsPageSize] = useState(10);
    const [tsTotal, setTsTotal] = useState(0);
    const [availablePageSizes, setAvailablePageSizes] = useState<number[]>([10, 20, 50]);

    // Assign Target System dialog
    const [tsDialogOpen, setTsDialogOpen] = useState(false);
    const [availableTargetSystems, setAvailableTargetSystems] = useState<{ identifier: string; name: string }[]>([]);
    const [selectedTsIds, setSelectedTsIds] = useState<string[]>([]);

    // Owner dropdown options
    const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);

    // Edit states for assignment fields
    const [editOwner, setEditOwner] = useState<string | null>(null);
    const [origOwner, setOrigOwner] = useState<string | null>(null);
    const [editMandatory, setEditMandatory] = useState<boolean | string | null>(null);
    const [editEditableOnUpdate, setEditEditableOnUpdate] = useState<boolean>(true);
    const [editRequestorCanEdit, setEditRequestorCanEdit] = useState<boolean | string | null>(null);

    // Script content (only meaningful when mode is "script")
    const [mandatoryScript, setMandatoryScript] = useState("");
    const [requestorCanEditScript, setRequestorCanEditScript] = useState("");

    // Script editor popup visibility
    const [mandatoryPopupVisible, setMandatoryPopupVisible] = useState(false);
    const [requestorCanEditPopupVisible, setRequestorCanEditPopupVisible] = useState(false);

    // Config editor
    const [editConfig, setEditConfig] = useState<Record<string, unknown>>({});
    const [origConfig, setOrigConfig] = useState<Record<string, unknown>>({});
    const [inheritedConfig, setInheritedConfig] = useState<Record<string, unknown>>({});

    // Parent data type metadata for inherited display
    const [inheritedDataType, setInheritedDataType] = useState<{
        owner: string;
        mandatory: boolean | string;
        requestorCanEdit: boolean | string;
    } | null>(null);

    // Parent data type permissions for inherited display
    const [inheritedPermissions, setInheritedPermissions] = useState<DataTypePermissionEntry[]>([]);

    // Permissions
    const [permissions, setPermissions] = useState<ProductTypeDataTypePermissionEntry[]>([]);

    // Previous Approvals
    const [previousApprovals, setPreviousApprovals] = useState<PreviousApprovalEntry[]>([]);
    const [allDataTypeAssignments, setAllDataTypeAssignments] = useState<ProductTypeDataTypeAssignment[]>([]);

    // Group options for permissions
    const [allGroups, setAllGroups] = useState<GroupOption[]>([]);

    const canManage = viewerContext.permissionNames.includes(FP_MANAGE_PRODUCT_TYPES.functionalPermissionName);
    const canView = viewerContext.permissionNames.includes(FP_VIEW_PRODUCT_TYPES.functionalPermissionName);

    const availablePrevApprovalDTs = useMemo(() => {
        if (!assignment) return [] as FilterableDropdownOption[];
        const configuredSet = new Set(previousApprovals.map(p => p.dependsOnDataType));
        return allDataTypeAssignments
            .filter(a => a.dataType !== assignment.dataType && !configuredSet.has(a.dataType))
            .map(a => ({ identifier: a.dataType, name: a.dataTypeName }) as FilterableDropdownOption);
    }, [assignment, previousApprovals, allDataTypeAssignments]);

    // --- Label refs for page display ---
    const productTypeNameRef = useRef<LabelHandle>(null);
    const productTypeDescRef = useRef<LabelHandle>(null);
    const dataTypeNameRef = useRef<LabelHandle>(null);
    const dataTypeKindRef = useRef<LabelHandle>(null);
    const dataTypeDescRef = useRef<LabelHandle>(null);

    // --- Label refs for assignment details ---
    const ownerLabelRef = useRef<LabelHandle>(null);
    const editableOnUpdateLabelRef = useRef<LabelHandle>(null);

    // --- Toggle refs for mutable assignment fields ---
    const editableOnUpdateToggleRef = useRef<ToggleHandle<boolean>>(null);

    const toast = useRef<Toast>(null);

    // --- Per-row InputField refs for target system name overrides ---
    const tsNameInputRefs = useRef<Map<string, React.RefObject<InputFieldHandle | null>>>(new Map());

    // Guard to prevent PubSub feedback loop during our own saves
    const savingRef = useRef<boolean>(false);
    // Tracks the updatedAt we just received from our own save, so permanent PubSub
    // subscriptions can skip our own echo and only react to external changes.
    const lastSavedUpdatedAtRef = useRef<string | null>(null);

    // --- Stable refs for PubSub closures ---
    const producttypeidRef = useRef(producttypeid);
    producttypeidRef.current = producttypeid;
    const datatypeassignmentidRef = useRef(datatypeassignmentid);
    datatypeassignmentidRef.current = datatypeassignmentid;
    const assignmentRef = useRef(assignment);
    assignmentRef.current = assignment;

    // ---------- Load viewer context ----------
    useEffect(() => {
        let cancelled = false;
        void apiGet<ViewerContext>("/api/me/context").then((payload) => {
            if (!cancelled) setViewerContext({ permissionNames: Array.isArray(payload.permissionNames) ? payload.permissionNames : [] });
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, []);

    // ---------- Load owner options ----------
    useEffect(() => {
        if (!canView) return;
        let cancelled = false;
        void getBusinessDomains(0, 1000, false).then((payload) => {
            if (cancelled) return;
            setOwnerOptions(payload.businessDomains.map((bd) => ({ identifier: bd.identifier, name: bd.name })));
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [canView]);

    // ---------- Load groups ----------
    useEffect(() => {
        if (!canView) return;
        let cancelled = false;
        void apiGet<{ groups: { identifier: string; groupName: string }[] }>("/api/groups?page=0&pageSize=1000").then((payload) => {
            if (cancelled) return;
            setAllGroups((payload.groups ?? []).map((g) => ({ identifier: g.identifier, name: g.groupName })));
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [canView]);

    // ---------- Load core data ----------
    const loadData = useCallback(async () => {
        if (!producttypeid || !datatypeassignmentid || !canView) return;
        setIsLoading(true);
        setError(null);
        try {
            // Load product type
            const ptPayload = await getProductType(producttypeid);
            const pt = ptPayload.productType;
            if (pt) setProductType(pt);

            // Load assignment
            const dtPayload = await getProductTypeDataTypes(producttypeid, 0, 1000);
            setAllDataTypeAssignments(dtPayload.dataTypeAssignments);
            const asgn = dtPayload.dataTypeAssignments.find((a) => a.identifier === datatypeassignmentid);
            if (asgn) {
                setAssignment(asgn);
                setEditOwner(asgn.owner);
                setOrigOwner(asgn.owner);
                setEditMandatory(asgn.mandatory);
                setEditEditableOnUpdate(asgn.editableOnUpdate);
                setEditRequestorCanEdit(asgn.requestorCanEdit);
                const cfg = (asgn.config ?? {}) as Record<string, unknown>;
                setEditConfig(cfg);
                setOrigConfig(cfg);

                // Load parent data type config and metadata for inherited display
                try {
                    const dtPayload = await getDataTypeDetail(asgn.dataType);
                    const raw = dtPayload.dataType as any;
                    const dtConfig = raw.dataType?.config ?? {};
                    setInheritedConfig(dtConfig as Record<string, unknown>);
                    setInheritedDataType({
                        owner: raw.dataType?.owner ?? "",
                        mandatory: raw.dataType?.mandatory ?? false,
                        requestorCanEdit: raw.dataType?.requestorCanEdit ?? false,
                    });
                } catch {
                    setInheritedConfig({});
                    setInheritedDataType(null);
                }

                // Load parent data type permissions for inherited display
                try {
                    const dtPermPayload = await getDataTypePermissions(asgn.dataType);
                    setInheritedPermissions(dtPermPayload.permissions);
                } catch {
                    setInheritedPermissions([]);
                }
            }

            // Load target systems
            const tsPayload = await getProductTypeDataTypeTargetSystems(producttypeid, datatypeassignmentid, tsPage, tsPageSize);
            setTargetSystems(tsPayload.targetSystems);
            setTsTotal(tsPayload.total);
            setAvailablePageSizes(tsPayload.availablePageSizes);

            // Load permissions
            const permPayload = await getProductTypeDataTypePermissions(producttypeid, datatypeassignmentid);
            setPermissions(permPayload.permissions);

            // Load previous approvals
            const prevApprovalPayload = await getProductTypeDataTypePreviousApprovals(producttypeid, datatypeassignmentid);
            setPreviousApprovals(prevApprovalPayload.previousApprovals);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load data");
        } finally {
            setIsLoading(false);
        }
    }, [canView, producttypeid, datatypeassignmentid, tsPage, tsPageSize]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    // ---------- Minimal reload of the target systems list ----------
    const reloadTargetSystems = useCallback(async () => {
        if (!producttypeid || !datatypeassignmentid || !canView) return;
        try {
            const tsPayload = await getProductTypeDataTypeTargetSystems(producttypeid, datatypeassignmentid, tsPage, tsPageSize);
            setTargetSystems(tsPayload.targetSystems);
            setTsTotal(tsPayload.total);
            setAvailablePageSizes(tsPayload.availablePageSizes);
        } catch { /* consume */ }
    }, [canView, producttypeid, datatypeassignmentid, tsPage, tsPageSize]);

    // ---------- Seed Labels and Toggles when data loads ----------
    useEffect(() => {
        if (!productType || !assignment) return;

        // Product type Labels
        productTypeNameRef.current?.setText(productType.name, { productTypeId: productType.identifier, field: "name" });
        productTypeDescRef.current?.setText(productType.description ?? "-", { productTypeId: productType.identifier, field: "description" });

        // Data type Labels
        dataTypeNameRef.current?.setText(assignment.dataTypeName, { assignmentId: assignment.identifier, field: "dataTypeName" });
        dataTypeKindRef.current?.setText(assignment.dataTypeKind, { assignmentId: assignment.identifier, field: "dataTypeKind" });
        dataTypeDescRef.current?.setText(assignment.dataTypeDescription ?? "-", { assignmentId: assignment.identifier, field: "dataTypeDescription" });

        // Assignment detail Labels
        const ownerName = editOwner != null
            ? (assignment.ownerBusinessDomainName ?? assignment.owner ?? "(set)")
            : (inheritedDataType
                ? (ownerOptions.find(o => o.identifier === inheritedDataType.owner)?.name ?? inheritedDataType.owner)
                : "(inherit)");
        ownerLabelRef.current?.setText(ownerName, { assignmentId: assignment.identifier, field: "owner" });
        editableOnUpdateLabelRef.current?.setText(editEditableOnUpdate ? "Yes" : "No", { assignmentId: assignment.identifier, field: "editableOnUpdate" });

        // Seed editableOnUpdate Toggle
        editableOnUpdateToggleRef.current?.setValue(editEditableOnUpdate, { assignmentId: assignment.identifier, field: "editableOnUpdate" });

        // Seed script content when assignment has script values
        if (typeof editMandatory === "string") {
            setMandatoryScript(editMandatory);
        }
        if (typeof editRequestorCanEdit === "string") {
            setRequestorCanEditScript(editRequestorCanEdit);
        }
    }, [productType, assignment, editOwner, editMandatory, editEditableOnUpdate, editRequestorCanEdit, inheritedDataType, ownerOptions]);

    // ---------- Seed per-row target system name InputFields ----------
    const getTsNameInputRef = (targetSystemId: string): React.RefObject<InputFieldHandle | null> => {
        let ref = tsNameInputRefs.current.get(targetSystemId);
        if (!ref) {
            ref = { current: null };
            tsNameInputRefs.current.set(targetSystemId, ref);
        }
        return ref;
    };

    useEffect(() => {
        if (isLoading) return;
        targetSystems.forEach((ts) => {
            const ref = getTsNameInputRef(ts.targetSystem);
            ref.current?.setOriginalValue(ts.name ?? "", { targetSystem: ts.targetSystem, updatedAt: (ts as any).updatedAt });
        });

        // Clean up refs for removed target systems
        const currentIds = new Set(targetSystems.map((ts) => ts.targetSystem));
        for (const id of tsNameInputRefs.current.keys()) {
            if (!currentIds.has(id)) {
                tsNameInputRefs.current.delete(id);
            }
        }
    }, [targetSystems, isLoading]);

    // ---------- PubSub: Assignment detail updates ----------
    useEffect(() => {
        if (!assignment || !datatypeassignmentid) return;

        const token = subscribe(
            { and: [TAG_PRODUCT_TYPE_DATA_TYPE, TAG_UPDATE] },
            (msg: PubSubMessage) => {
                if (savingRef.current) return;
                const data = msg.data as Record<string, unknown> | undefined;
                // Skip our own echo: if the updatedAt matches what we just saved,
                // this PubSub event is the result of our own change.
                if (data?.updatedAt === lastSavedUpdatedAtRef.current) return;
                const msgAssignmentId = data?.identifier as string | undefined;
                if (msgAssignmentId !== datatypeassignmentid) return;

                // Update Labels for changed fields
                if (data?.owner !== undefined) {
                    const newOwner = data.owner as string | null;
                    setEditOwner(newOwner);
                    const ownerName = newOwner != null
                        ? (assignment.ownerBusinessDomainName ?? newOwner)
                        : (inheritedDataType
                            ? (ownerOptions.find(o => o.identifier === inheritedDataType.owner)?.name ?? inheritedDataType.owner)
                            : "(inherit)");
                    ownerLabelRef.current?.setText(ownerName, { assignmentId: datatypeassignmentid, field: "owner" });
                }
                if (data?.mandatory !== undefined) {
                    const newVal = data.mandatory as boolean | string | null;
                    setEditMandatory(newVal);
                    if (typeof newVal === "string") setMandatoryScript(newVal);
                }
                if (data?.editableOnUpdate !== undefined) {
                    const newVal = data.editableOnUpdate as boolean;
                    setEditEditableOnUpdate(newVal);
                    editableOnUpdateLabelRef.current?.setText(newVal ? "Yes" : "No", { assignmentId: datatypeassignmentid, field: "editableOnUpdate" });
                    editableOnUpdateToggleRef.current?.setValue(newVal, { assignmentId: datatypeassignmentid, field: "editableOnUpdate" });
                }
                if (data?.requestorCanEdit !== undefined) {
                    const newVal = data.requestorCanEdit as boolean | string | null;
                    setEditRequestorCanEdit(newVal);
                    if (typeof newVal === "string") setRequestorCanEditScript(newVal);
                }

                // Set dirty on editableOnUpdate Toggle for concurrent modification
                if (msgAssignmentId === datatypeassignmentid) {
                    editableOnUpdateToggleRef.current?.setDirty(true);
                    editableOnUpdateToggleRef.current?.setHintText("Assignment was modified by another user");
                }
            },
        );

        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub.ts").then((m) => m.unsubscribe(token));
            }
        };
    }, [assignment, datatypeassignmentid, inheritedDataType, ownerOptions]);

    // ---------- PubSub: Target system changes (assign/unassign/update) ----------
    useEffect(() => {
        if (!canView || !producttypeid || !datatypeassignmentid) return;

        const token = subscribe(
            { and: [TAG_PRODUCT_TYPE_DATA_TYPE_TARGET_SYSTEM, { or: [TAG_ASSIGN, TAG_UNASSIGN, TAG_UPDATE] }] },
            () => {
                void reloadTargetSystems();
            },
        );

        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub.ts").then((m) => m.unsubscribe(token));
            }
        };
    }, [canView, producttypeid, datatypeassignmentid, reloadTargetSystems]);

    // ---------- PubSub: Permission changes ----------
    useEffect(() => {
        if (!canView || !producttypeid || !datatypeassignmentid) return;

        const token = subscribe(
            { and: [TAG_PRODUCT_TYPE_DATA_TYPE_PERMISSION, { or: [TAG_GRANT, TAG_REVOKE, TAG_UPDATE] }] },
            () => {
                void (async () => {
                    try {
                        const permPayload = await getProductTypeDataTypePermissions(producttypeid, datatypeassignmentid);
                        setPermissions(permPayload.permissions);
                    } catch { /* consume */ }
                })();
            },
        );

        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub.ts").then((m) => m.unsubscribe(token));
            }
        };
    }, [canView, producttypeid, datatypeassignmentid]);

    // ---------- PubSub: Previous Approval changes ----------
    useEffect(() => {
        if (!canView || !producttypeid || !datatypeassignmentid) return;

        const token = subscribe(
            { and: [TAG_PRODUCT_TYPE_DATA_TYPE_PREVIOUS_APPROVAL, { or: [TAG_ASSIGN, TAG_UNASSIGN] }] },
            () => {
                void (async () => {
                    try {
                        const payload = await getProductTypeDataTypePreviousApprovals(producttypeid, datatypeassignmentid);
                        setPreviousApprovals(payload.previousApprovals);
                    } catch { /* consume */ }
                })();
            },
        );

        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub.ts").then((m) => m.unsubscribe(token));
            }
        };
    }, [canView, producttypeid, datatypeassignmentid]);

    // ---------- PubSub: Config changes ----------
    useEffect(() => {
        if (!canView) return;

        const token = subscribe(
            { and: [TAG_CONFIG, TAG_UPSERT] },
            (msg: PubSubMessage) => {
                const data = msg.data as Record<string, unknown> | undefined;
                // Generic config change — reload config data
                if (assignmentRef.current && data) {
                    void (async () => {
                        try {
                            const asgn = assignmentRef.current;
                            if (!asgn) return;
                            const dtPayload = await getDataTypeDetail(asgn.dataType);
                            const raw = dtPayload.dataType as any;
                            const dtConfig = raw.dataType?.config ?? {};
                            setInheritedConfig(dtConfig as Record<string, unknown>);
                        } catch { /* consume */ }
                    })();
                }
            },
        );

        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub.ts").then((m) => m.unsubscribe(token));
            }
        };
    }, [canView]);

    // ---------- Update assignment field ----------
    const persistAssignment = async (fields: Record<string, unknown>) => {
        if (!producttypeid || !datatypeassignmentid || !assignment) return;
        savingRef.current = true;
        try {
            const response = await updateDataTypeAssignment(producttypeid, datatypeassignmentid, fields as any);
            if (response?.assignment) {
                setAssignment(prev => prev ? { ...prev, ...response.assignment } : prev);
                lastSavedUpdatedAtRef.current = (response.assignment as any).updatedAt ?? null;
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update");
        } finally {
            savingRef.current = false;
        }
    };

    // ---------- Target System operations ----------
    const openTsDialog = async () => {
        setTsDialogOpen(true);
        setSelectedTsIds([]);
        try {
            const payload = await getTargetSystems(0, 1000, false);
            const assignedIds = new Set(targetSystems.map((ts) => ts.targetSystem));
            setAvailableTargetSystems(
                payload.targetSystems
                    .filter((ts) => !assignedIds.has(ts.identifier))
                    .map((ts) => ({ identifier: ts.identifier, name: ts.name })),
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load target systems");
        }
    };

    const handleAssignTs = async (targetSystemIdentifier: string) => {
        if (!producttypeid || !datatypeassignmentid) return;
        try {
            await assignTargetSystem(producttypeid, datatypeassignmentid, targetSystemIdentifier);
            setTsDialogOpen(false);
            void reloadTargetSystems();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not assign target system");
        }
    };

    const handleAssignMultipleTs = async (identifiers: string[]) => {
        if (!producttypeid || !datatypeassignmentid) return;
        setIsSaving(true);
        const errors: string[] = [];
        for (const id of identifiers) {
            try {
                await assignTargetSystem(producttypeid, datatypeassignmentid, id);
            } catch (e) {
                errors.push(id + ": " + (e instanceof Error ? e.message : "unknown error"));
            }
        }
        setIsSaving(false);
        if (errors.length > 0) {
            setError("Could not assign some target systems: " + errors.join("; "));
        } else {
            setTsDialogOpen(false);
            void reloadTargetSystems();
        }
    };

    const handleUnassignTs = async (targetSystemIdentifier: string) => {
        if (!producttypeid || !datatypeassignmentid) return;
        try {
            await unassignTargetSystem(producttypeid, datatypeassignmentid, targetSystemIdentifier);
            void reloadTargetSystems();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not unassign target system");
        }
    };

    const handleUpdateTsName = async (targetSystemIdentifier: string, name: string | null) => {
        if (!producttypeid || !datatypeassignmentid) return;
        try {
            const response = await updateTargetSystemAssignment(producttypeid, datatypeassignmentid, targetSystemIdentifier, name);
            setTargetSystems(prev =>
                prev.map(ts =>
                    ts.targetSystem === targetSystemIdentifier
                        ? { ...ts, ...response.targetSystem }
                        : ts,
                ),
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update target system name");
        }
    };

    // ---------- Previous Approval handlers ----------
    const handleAddPreviousApproval = async (dependsOnDataTypeIdentifier: string) => {
        if (!producttypeid || !datatypeassignmentid) return;
        try {
            const response = await addProductTypeDataTypePreviousApproval(producttypeid, datatypeassignmentid, dependsOnDataTypeIdentifier);
            setPreviousApprovals(prev => [...prev, response.previousApproval]);
        } catch (e) {
            toast.current?.show({ severity: "error", summary: "Error", detail: e instanceof Error ? e.message : "Could not add previous approval dependency", life: 5000 });
        }
    };

    const handleRemovePreviousApproval = async (dependsOnDataTypeIdentifier: string) => {
        if (!producttypeid || !datatypeassignmentid) return;
        try {
            await removeProductTypeDataTypePreviousApproval(producttypeid, datatypeassignmentid, dependsOnDataTypeIdentifier);
            setPreviousApprovals(prev => prev.filter(p => p.dependsOnDataType !== dependsOnDataTypeIdentifier));
        } catch (e) {
            toast.current?.show({ severity: "error", summary: "Error", detail: e instanceof Error ? e.message : "Could not remove previous approval dependency", life: 5000 });
        }
    };

    // ---------- Config save ----------
    const saveConfigImmediate = async (newConfig: Record<string, unknown>) => {
        if (!producttypeid || !datatypeassignmentid || !assignment) return;
        savingRef.current = true;
        setIsSaving(true);
        try {
            const response = await updateDataTypeAssignment(producttypeid, datatypeassignmentid, { config: newConfig } as any);
            setOrigConfig(newConfig);
            if (response?.assignment) {
                setAssignment(prev => prev ? { ...prev, ...response.assignment } : prev);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save config");
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };

    const handleResetConfigField = useCallback(
        async (field: string) => {
            const next = { ...editConfig };
            delete next[field];
            setEditConfig(next);
            await saveConfigImmediate(next);
        },
        [editConfig],
    );

    // ---------- Inline config helpers (WITH inheritance) ----------

    const MONACO_HELP: Record<string, string> = {
        defaultProvider: "ctx.api available. Receives ctx. Returns default value, e.g.:\nconst meta = await ctx.api.request.meta(); return 42;",
        validate: "ctx.api + ctx.trigger.candidateValue. Returns { valid, message? }, e.g.:\nreturn { valid: ctx.trigger.candidateValue.length > 3, message: 'Too short' };",
        filter: "ctx.options contains the unfiltered list. Returns filtered array, e.g.:\nreturn ctx.options.filter(o => o.name.startsWith('A'));",
        script: "ctx.api available. Returns computed value, e.g.:\nconst v = await ctx.api.request.getValue('uuid'); return v ? v * 2 : null;",
    };

    const setField = useCallback(
        (field: string, value: unknown) => {
            setEditConfig({ ...editConfig, [field]: value });
        },
        [editConfig],
    );

    // Helper for immediate-save fields (dropdowns, checkboxes)
    const setFieldAndSave = useCallback(
        (field: string, value: unknown) => {
            const next = { ...editConfig, [field]: value };
            setEditConfig(next);
            void saveConfigImmediate(next);
        },
        [editConfig, saveConfigImmediate],
    );

    // Helper for save/restore fields
    const saveField = useCallback(
        (field: string) => async () => {
            await saveConfigImmediate(editConfig);
        },
        [editConfig, saveConfigImmediate],
    );
    const restoreField = useCallback(
        (field: string) => () => {
            setField(field, origConfig[field]);
        },
        [origConfig, setField],
    );

    // Whether a field is overridden (has an explicit value set)
    const isOverridden = useCallback(
        (field: string) => editConfig[field] != null,
        [editConfig],
    );

    // Whether a field is overridden AND has an inherited value to reset to
    const canReset = useCallback(
        (field: string) => canManage && editConfig[field] != null && inheritedConfig?.[field] != null,
        [canManage, editConfig, inheritedConfig],
    );

    // Resolved display value: use config if set, otherwise fall back to inherited.
    const displayValue = useCallback(
        (field: string): unknown => {
            if (editConfig[field] != null) return editConfig[field];
            if (inheritedConfig && inheritedConfig[field] != null) return inheritedConfig[field];
            return undefined;
        },
        [editConfig, inheritedConfig],
    );

    // Render reset button for a field that is currently overridden
    const ResetBtn = ({ field }: { field: string }) => {
        if (!isOverridden(field)) return null;
        return (
            <button
                type="button"
                disabled={isSaving}
                onClick={() => handleResetConfigField(field)}
                title="Reset to inherited value"
                style={{ marginLeft: "4px", flexShrink: 0 }}
            >
                <i className="pi pi-undo" aria-hidden="true" />
            </button>
        );
    };

    // ---------- Save mandatory / requestorCanEdit ----------
    const saveMandatoryOrRequestorCanEdit = useCallback(async (field: "mandatory" | "requestorCanEdit", value: boolean | string | null) => {
        if (!assignment) return;
        setIsSaving(true);
        setError(null);
        try {
            const apiValue: string | null = value == null ? null : typeof value === "boolean" ? (value ? "Yes" : "No") : value;
            await persistAssignment({ [field]: apiValue });
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Could not save");
        } finally {
            setIsSaving(false);
        }
    }, [assignment, persistAssignment]);

    // ---------- EditableOnUpdate Toggle change handler ----------
    const handleEditableOnUpdateChange = useCallback(
        (component: ToggleHandle<boolean>) => {
            const val = component.getValue();
            setEditEditableOnUpdate(val);
            void persistAssignment({ editableOnUpdate: val });
        },
        [persistAssignment],
    );

    // ---------- Target System Name InputField save handler ----------
    const makeTsNameSaveHandler = (targetSystemIdentifier: string) =>
        async (component: InputFieldHandle, _source: "button" | "blur") => {
            const val = component.getCurrentValue().trim();
            await handleUpdateTsName(targetSystemIdentifier, val || null);
        };

    // ---------- Permissions ----------
    const reloadPermissions = async () => {
        if (!producttypeid || !datatypeassignmentid) return;
        try {
            const permPayload = await getProductTypeDataTypePermissions(producttypeid, datatypeassignmentid);
            setPermissions(permPayload.permissions);
        } catch { /* consume */ }
    };

    const makeGrantHandler = (role: string) => async (groupIdentifier: string) => {
        if (!producttypeid || !datatypeassignmentid) return;
        try {
            await grantProductTypeDataTypePermission(producttypeid, datatypeassignmentid, {
                groupIdentifier,
                role,
            });
            void reloadPermissions();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not grant permission");
        }
    };

    const makeRevokeHandler = (role: string) => async (groupIdentifier: string) => {
        if (!producttypeid || !datatypeassignmentid) return;
        try {
            await revokeProductTypeDataTypePermission(producttypeid, datatypeassignmentid, {
                groupIdentifier,
                role,
            });
            void reloadPermissions();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not revoke permission");
        }
    };

    const handleToggleShowByDefault = async (entry: ProductTypeDataTypePermissionEntry) => {
        if (!producttypeid || !datatypeassignmentid) return;
        const permId = `${entry.groupIdentifier}__${entry.role}`;
        try {
            await updateProductTypeDataTypePermission(producttypeid, datatypeassignmentid, permId, {
                showByDefault: !entry.showByDefault,
            });
            void reloadPermissions();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update permission");
        }
    };

    const makeResetToDataTypeHandler = (role: string) => async () => {
        if (!producttypeid || !datatypeassignmentid) return;
        setIsSaving(true);
        try {
            const rolePerms = permissions.filter((p) => p.role === role);
            for (const p of rolePerms) {
                await revokeProductTypeDataTypePermission(producttypeid, datatypeassignmentid, {
                    groupIdentifier: p.groupIdentifier,
                    role: p.role,
                });
            }
            void reloadPermissions();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not reset permissions to inherited");
        } finally {
            setIsSaving(false);
        }
    };

    // ---------- Derived values ----------
    const viewerAssigned = useMemo(() => [...permissions.filter((p) => p.role === "viewer")].sort((a, b) => a.groupName.localeCompare(b.groupName)), [permissions]);
    const writerAssigned = useMemo(() => [...permissions.filter((p) => p.role === "writer")].sort((a, b) => a.groupName.localeCompare(b.groupName)), [permissions]);
    const approverAssigned = useMemo(() => [...permissions.filter((p) => p.role === "approver")].sort((a, b) => a.groupName.localeCompare(b.groupName)), [permissions]);

    if (isLoading) {
        return (
            <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
                <PageSection title="Loading">
                    <p>Loading...</p>
                </PageSection>
            </PageTemplate>
        );
    }

    if (error) {
        return (
            <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
                <PageSection title="Target systems">
                    <p className="admin-config-error">{error}</p>
                </PageSection>
            </PageTemplate>
        );
    }

    if (!productType) {
        return (
            <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
                <PageSection title="Target systems">
                    <p>Product type not found.</p>
                </PageSection>
            </PageTemplate>
        );
    }

    if (!assignment) {
        return (
            <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
                <PageSection title="Target systems">
                    <p>Data type assignment not found.</p>
                </PageSection>
            </PageTemplate>
        );
    }

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <Toast ref={toast} />
            {error ? <p className="admin-config-error">{error}</p> : null}

            {/* A. Header Section */}
            <CollapsibleSection title="Product Type & Data Type" defaultExpanded>
                <div className="admin-detail-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <div>
                        <strong>Product Type:</strong>{" "}
                        <Label ref={productTypeNameRef} text={productType.name} />
                        <br />
                        <strong>Description:</strong>{" "}
                        <Label ref={productTypeDescRef} text={productType.description ?? "-"} />
                    </div>
                    <div>
                        <strong>Data Type:</strong>{" "}
                        <Label ref={dataTypeNameRef} text={assignment.dataTypeName} />
                        <br />
                        <strong>Kind:</strong>{" "}
                        <Label ref={dataTypeKindRef} text={assignment.dataTypeKind} />
                        <br />
                        <strong>Description:</strong>{" "}
                        <Label ref={dataTypeDescRef} text={assignment.dataTypeDescription ?? "-"} />
                    </div>
                </div>
            </CollapsibleSection>

            {/* B. Assignment Details */}
            <CollapsibleSection title="Assignment Details" defaultExpanded>
                <div className="admin-detail-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                    {/* Owner */}
                    <div>
                        <strong>Owner:</strong>{" "}
                        {canManage ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <select
                                    value={(editOwner ?? inheritedDataType?.owner) ?? ""}
                                    onChange={(e) => {
                                        const val = e.target.value || null;
                                        setEditOwner(val === inheritedDataType?.owner ? null : val);
                                        void persistAssignment({ owner: val === inheritedDataType?.owner ? null : val });
                                    }}
                                    style={editOwner == null && inheritedDataType ? { fontStyle: "italic", color: "var(--at-text-secondary)" } : undefined}
                                >
                                    {ownerOptions.map((opt) => (
                                        <option key={opt.identifier} value={opt.identifier}>{opt.name}</option>
                                    ))}
                                </select>
                                {editOwner != null ? (
                                    <button type="button" onClick={() => { setEditOwner(null); void persistAssignment({ owner: null }); }} title="Reset to inherit from data type">
                                        <i className="pi pi-undo" aria-hidden="true" />
                                    </button>
                                ) : null}
                            </span>
                        ) : (
                            <Label ref={ownerLabelRef} text={(editOwner != null ? (assignment.ownerBusinessDomainName ?? assignment.owner) : (inheritedDataType ? (ownerOptions.find(o => o.identifier === inheritedDataType.owner)?.name ?? inheritedDataType.owner) : "-")) ?? undefined} />
                        )}
                    </div>
                    {/* Mandatory — chip-style Toggle with Inherit + Script support */}
                    <div>
                        <strong>Mandatory:</strong>{" "}
                        {canManage ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                                <Toggle<string>
                                    variant="pill"
                                    options={[
                                        { value: "yes", label: "Yes" },
                                        { value: "no", label: "No" },
                                        { value: "script", label: "Script" },
                                          { value: "inherit", label: inheritedDataType ? (isYes(inheritedDataType.mandatory) ? "Inherit (Yes)" : "Inherit (No)") : "Inherit" },
                                    ]}
                                    value={chipValueWithInherit(editMandatory)}
                                    onChange={(t) => {
                                        if (!canManage) return;
                                        const val = t.getValue();
                                        if (val === "script") {
                                            setEditMandatory(mandatoryScript || scriptFromValue(editMandatory));
                                            setMandatoryPopupVisible(true);
                                        } else if (val === "yes") {
                                            setEditMandatory(true);
                                            void saveMandatoryOrRequestorCanEdit("mandatory", true);
                                        } else if (val === "no") {
                                            setEditMandatory(false);
                                            void saveMandatoryOrRequestorCanEdit("mandatory", false);
                                        } else if (val === "inherit") {
                                            setEditMandatory(null);
                                            void saveMandatoryOrRequestorCanEdit("mandatory", null);
                                        }
                                    }}
                                    disabled={!canManage}
                                />
                                {chipValueWithInherit(editMandatory) === "script" ? (
                                    <button
                                        type="button"
                                        className="p-button p-button-sm p-button-outlined"
                                        onClick={() => { setMandatoryPopupVisible(true); }}
                                        disabled={!canManage}
                                        title="Edit script"
                                    >
                                        <i className="pi pi-pencil" />
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            <span>{chipValueWithInherit(editMandatory) === "script" ? "Script" : editMandatory === true || editMandatory === "Yes" ? "Yes" : editMandatory === false || editMandatory === "No" ? "No" : (inheritedDataType ? (isYes(inheritedDataType.mandatory) ? "Yes (inherited)" : "No (inherited)") : "Inherit")}</span>
                        )}
                    </div>
                    {/* Editable on Update — Toggle */}
                    <div>
                        <strong>Editable on Update:</strong>{" "}
                        {canManage ? (
                            <Toggle<boolean>
                                ref={editableOnUpdateToggleRef}
                                variant="toggle"
                                value={editEditableOnUpdate}
                                options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]}
                                onChange={handleEditableOnUpdateChange}
                            />
                        ) : (
                            <Label ref={editableOnUpdateLabelRef} text={editEditableOnUpdate ? "Yes" : "No"} />
                        )}
                    </div>
                    {/* Requestor Can Edit — chip-style Toggle with Inherit + Script support */}
                    <div>
                        <strong>Requestor Can Edit:</strong>{" "}
                        {canManage ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                                <Toggle<string>
                                    variant="pill"
                                    options={[
                                        { value: "yes", label: "Yes" },
                                        { value: "no", label: "No" },
                                        { value: "script", label: "Script" },
                                          { value: "inherit", label: inheritedDataType ? (isYes(inheritedDataType.requestorCanEdit) ? "Inherit (Yes)" : "Inherit (No)") : "Inherit" },
                                    ]}
                                    value={chipValueWithInherit(editRequestorCanEdit)}
                                    onChange={(t) => {
                                        if (!canManage) return;
                                        const val = t.getValue();
                                        if (val === "script") {
                                            setEditRequestorCanEdit(requestorCanEditScript || scriptFromValue(editRequestorCanEdit));
                                            setRequestorCanEditPopupVisible(true);
                                        } else if (val === "yes") {
                                            setEditRequestorCanEdit(true);
                                            void saveMandatoryOrRequestorCanEdit("requestorCanEdit", true);
                                        } else if (val === "no") {
                                            setEditRequestorCanEdit(false);
                                            void saveMandatoryOrRequestorCanEdit("requestorCanEdit", false);
                                        } else if (val === "inherit") {
                                            setEditRequestorCanEdit(null);
                                            void saveMandatoryOrRequestorCanEdit("requestorCanEdit", null);
                                        }
                                    }}
                                    disabled={!canManage}
                                />
                                {chipValueWithInherit(editRequestorCanEdit) === "script" ? (
                                    <button
                                        type="button"
                                        className="p-button p-button-sm p-button-outlined"
                                        onClick={() => { setRequestorCanEditPopupVisible(true); }}
                                        disabled={!canManage}
                                        title="Edit script"
                                    >
                                        <i className="pi pi-pencil" />
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            <span>{chipValueWithInherit(editRequestorCanEdit) === "script" ? "Script" : editRequestorCanEdit === true || editRequestorCanEdit === "Yes" ? "Yes" : editRequestorCanEdit === false || editRequestorCanEdit === "No" ? "No" : (inheritedDataType ? (isYes(inheritedDataType.requestorCanEdit) ? "Yes (inherited)" : "No (inherited)") : "Inherit")}</span>
                        )}
                    </div>
                </div>
            </CollapsibleSection>

            {/* C. Configuration Section — inline config editor */}
            <CollapsibleSection title="Configuration" defaultExpanded>
                {(() => {
                    const onResetField = canManage ? handleResetConfigField : undefined;
                    switch (assignment.dataTypeKind) {
                        case DataTypeKind.Calculated:
                            return (
                                <div className="admin-datatype-config-section">
                                    <label>
                                        Mode
                                        <ResetBtn field="mode" />
                                        <select
                                            value={String(displayValue("mode") ?? "on_change")}
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
                                        inheritedValue={inheritedConfig?.script as string | undefined}
                                        onResetToParent={canReset("script") ? () => onResetField?.("script") : undefined}
                                    />
                                </div>
                            );

                        case DataTypeKind.Boolean:
                            return (
                                <div className="admin-datatype-config-section">
                                    <label className="admin-checkbox-label">
                                        <Checkbox
                                            checked={Boolean(displayValue("permitEmpty"))}
                                            onChange={(e) => setFieldAndSave("permitEmpty", e.checked)}
                                        />
                                        <span>Permit Empty</span>

                                        <ResetBtn field="permitEmpty" />
                                    </label>
                                    <label>
                                        Default Provider Mode
                                        <ResetBtn field="mode" />
                                        <select
                                            value={String(displayValue("mode") ?? DefaultValueCalculationMode.OnCreate)}
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
                                        inheritedValue={inheritedConfig?.defaultProvider as string | undefined}
                                        onResetToParent={canReset("defaultProvider") ? () => onResetField?.("defaultProvider") : undefined}
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
                                        inheritedValue={inheritedConfig?.validate as string | undefined}
                                        onResetToParent={canReset("validate") ? () => onResetField?.("validate") : undefined}
                                    />
                                </div>
                            );

                        case DataTypeKind.String:
                            return (
                                <div className="admin-datatype-config-section">
                                    <label className="admin-checkbox-label">
                                        <Checkbox
                                            checked={Boolean(displayValue("multi"))}
                                            onChange={(e) => setFieldAndSave("multi", e.checked)}
                                        />
                                        <span>Multi-line</span>

                                        <ResetBtn field="multi" />
                                    </label>
                                    <label>
                                        Input Validation Regex
                                        <ResetBtn field="inputValidation" />
                                        <InputText
                                            type="text"
                                            value={String(displayValue("inputValidation") ?? "")}
                                            placeholder="e.g. ^[A-Z]{2}\d{4}$"
                                            onChange={(e) => setField("inputValidation", e.target.value || undefined)}
                                            onBlur={() => saveConfigImmediate(editConfig)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveConfigImmediate(editConfig); }}
                                            style={{ width: "100%" }}
                                        />
                                    </label>
                                    <label>
                                        Default Provider Mode
                                        <ResetBtn field="mode" />
                                        <select
                                            value={String(displayValue("mode") ?? DefaultValueCalculationMode.OnCreate)}
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
                                        inheritedValue={inheritedConfig?.defaultProvider as string | undefined}
                                        onResetToParent={canReset("defaultProvider") ? () => onResetField?.("defaultProvider") : undefined}
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
                                        inheritedValue={inheritedConfig?.validate as string | undefined}
                                        onResetToParent={canReset("validate") ? () => onResetField?.("validate") : undefined}
                                    />
                                </div>
                            );

                        case DataTypeKind.Lookup:
                            return (
                                <div className="admin-datatype-config-section">
                                    {onResetField ? (
                                        <div className="admin-datatype-field">
                                            <strong>Source Lookup:</strong>{" "}
                                            <code>{String(displayValue("source") ?? "—")}</code>

                                            <ResetBtn field="source" />
                                        </div>
                                    ) : (
                                        <label>
                                            Source Lookup
                                            <ResetBtn field="source" />
                                            <select
                                                value={String(displayValue("source") ?? "")}
                                                onChange={(e) => setFieldAndSave("source", e.target.value || undefined)}
                                            >
                                                <option value="">-- None --</option>
                                            </select>
                                        </label>
                                    )}
                                    <label className="admin-checkbox-label">
                                        <Checkbox
                                            checked={Boolean(displayValue("multi"))}
                                            onChange={(e) => setFieldAndSave("multi", e.checked)}
                                        />
                                        <span>Multi-select</span>

                                        <ResetBtn field="multi" />
                                    </label>
                                    <label>
                                        Default Provider Mode
                                        <ResetBtn field="mode" />
                                        <select
                                            value={String(displayValue("mode") ?? DefaultValueCalculationMode.OnCreate)}
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
                                        inheritedValue={inheritedConfig?.defaultProvider as string | undefined}
                                        onResetToParent={canReset("defaultProvider") ? () => onResetField?.("defaultProvider") : undefined}
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
                                        inheritedValue={inheritedConfig?.filter as string | undefined}
                                        onResetToParent={canReset("filter") ? () => onResetField?.("filter") : undefined}
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
                                        inheritedValue={inheritedConfig?.validate as string | undefined}
                                        onResetToParent={canReset("validate") ? () => onResetField?.("validate") : undefined}
                                    />
                                </div>
                            );

                        case DataTypeKind.Consumable:
                            return (
                                <div className="admin-datatype-config-section">
                                    {onResetField ? (
                                        <div className="admin-datatype-field">
                                            <strong>Source Consumable:</strong>{" "}
                                            <code>{String(displayValue("source") ?? "—")}</code>

                                            <ResetBtn field="source" />
                                        </div>
                                    ) : (
                                        <label>
                                            Source Consumable
                                            <ResetBtn field="source" />
                                            <select
                                                value={String(displayValue("source") ?? "")}
                                                onChange={(e) => setFieldAndSave("source", e.target.value || undefined)}
                                            >
                                                <option value="">-- None --</option>
                                            </select>
                                        </label>
                                    )}
                                    <label className="admin-checkbox-label">
                                        <Checkbox
                                            checked={Boolean(displayValue("multi"))}
                                            onChange={(e) => setFieldAndSave("multi", e.checked)}
                                        />
                                        <span>Multi-select</span>

                                        <ResetBtn field="multi" />
                                    </label>
                                    <label>
                                        Default Provider Mode
                                        <ResetBtn field="mode" />
                                        <select
                                            value={String(displayValue("mode") ?? DefaultValueCalculationMode.OnCreate)}
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
                                        inheritedValue={inheritedConfig?.defaultProvider as string | undefined}
                                        onResetToParent={canReset("defaultProvider") ? () => onResetField?.("defaultProvider") : undefined}
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
                                        inheritedValue={inheritedConfig?.filter as string | undefined}
                                        onResetToParent={canReset("filter") ? () => onResetField?.("filter") : undefined}
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
                                        inheritedValue={inheritedConfig?.validate as string | undefined}
                                        onResetToParent={canReset("validate") ? () => onResetField?.("validate") : undefined}
                                    />
                                </div>
                            );

                        case DataTypeKind.Product:
                            return (
                                <div className="admin-datatype-config-section">
                                    <label className="admin-checkbox-label">
                                        <Checkbox
                                            checked={Boolean(displayValue("multi"))}
                                            onChange={(e) => setFieldAndSave("multi", e.checked)}
                                        />
                                        <span>Multi-select</span>

                                        <ResetBtn field="multi" />
                                    </label>
                                    <label>
                                        Default Provider Mode
                                        <ResetBtn field="mode" />
                                        <select
                                            value={String(displayValue("mode") ?? DefaultValueCalculationMode.OnCreate)}
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
                                        inheritedValue={inheritedConfig?.defaultProvider as string | undefined}
                                        onResetToParent={canReset("defaultProvider") ? () => onResetField?.("defaultProvider") : undefined}
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
                                        inheritedValue={inheritedConfig?.filter as string | undefined}
                                        onResetToParent={canReset("filter") ? () => onResetField?.("filter") : undefined}
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
                                        inheritedValue={inheritedConfig?.validate as string | undefined}
                                        onResetToParent={canReset("validate") ? () => onResetField?.("validate") : undefined}
                                    />
                                </div>
                            );

                        default:
                            return <p>Unknown data type kind: {assignment.dataTypeKind}</p>;
                    }
                })()}
            </CollapsibleSection>

            {/* D. Permissions Section */}
            <CollapsibleSection title="Permissions" defaultExpanded>
                <div className="admin-datatype-permissions-container">
                    <PermissionChipManager
                        label="Viewer"
                        role="viewer"
                        allGroups={allGroups}
                        assignedPermissions={viewerAssigned}
                        inheritedPermissions={inheritedPermissions.filter(p => p.role === "viewer")}
                        onGrant={makeGrantHandler("viewer")}
                        onRevoke={makeRevokeHandler("viewer")}
                        onToggleShowByDefault={handleToggleShowByDefault}
                        onResetToDataType={canManage ? makeResetToDataTypeHandler("viewer") : undefined}
                        canManage={canManage}
                    />
                    <PermissionChipManager
                        label="Writer"
                        role="writer"
                        allGroups={allGroups}
                        assignedPermissions={writerAssigned}
                        inheritedPermissions={inheritedPermissions.filter(p => p.role === "writer")}
                        onGrant={makeGrantHandler("writer")}
                        onRevoke={makeRevokeHandler("writer")}
                        onToggleShowByDefault={async () => {}}
                        onResetToDataType={canManage ? makeResetToDataTypeHandler("writer") : undefined}
                        canManage={canManage}
                    />
                    <PermissionChipManager
                        label="Approver"
                        role="approver"
                        allGroups={allGroups}
                        assignedPermissions={approverAssigned}
                        inheritedPermissions={inheritedPermissions.filter(p => p.role === "approver")}
                        onGrant={makeGrantHandler("approver")}
                        onRevoke={makeRevokeHandler("approver")}
                        onToggleShowByDefault={async () => {}}
                        onResetToDataType={canManage ? makeResetToDataTypeHandler("approver") : undefined}
                        canManage={canManage}
                    />
                </div>
            </CollapsibleSection>

            {/* F. Previous Approvals Section */}
            <CollapsibleSection title="Previous Approvals">
                <p style={{ marginBottom: "0.5rem", color: "var(--at-text-secondary)" }}>
                    Require other data type values to be approved before this data type can be approved.
                </p>
                {canManage ? (
                    <FilterableDropdown
                        options={availablePrevApprovalDTs}
                        selected={[]}
                        onChange={(identifiers: string | string[]) => {
                            const id = Array.isArray(identifiers) ? identifiers[0] : identifiers;
                            if (id) void handleAddPreviousApproval(id);
                        }}
                        multiSelect={false}
                        placeholder="Add prerequisite data type..."
                        disabled={availablePrevApprovalDTs.length === 0}
                    />
                ) : null}
                {previousApprovals.length === 0 ? (
                    <p style={{ color: "var(--at-text-secondary)", fontStyle: "italic", marginTop: "0.5rem" }}>
                        No previous approval dependencies configured.
                    </p>
                ) : (
                    <table className="mui-simple-table admin-table" style={{ marginTop: "0.5rem" }}>
                        <thead>
                            <tr>
                                <th>Prerequisite Data Type</th>
                                {canManage ? <th>Action</th> : null}
                            </tr>
                        </thead>
                        <tbody>
                            {previousApprovals.map((pa) => (
                                <tr key={pa.dependsOnDataType}>
                                    <td>{pa.dependsOnDataTypeName}</td>
                                    {canManage ? (
                                        <td>
                                            <button
                                                type="button"
                                                className="p-button p-button-sm p-button-outlined"
                                                onClick={() => void handleRemovePreviousApproval(pa.dependsOnDataType)}
                                                title="Remove prerequisite"
                                            >
                                                <i className="pi pi-trash" aria-hidden="true" />
                                            </button>
                                        </td>
                                    ) : null}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </CollapsibleSection>

            {/* E. Target Systems Section */}
            <CollapsibleSection title="Target Systems" defaultExpanded>
                {canManage ? (
                    <div className="admin-top-gap" style={{ marginBottom: "1rem" }}>
                        <button type="button" onClick={() => void openTsDialog()}>
                            <i className="pi pi-plus" aria-hidden="true" /> Assign Target System
                        </button>
                    </div>
                ) : null}

                {targetSystems.length === 0 ? (
                    <p style={{ color: "var(--at-text-secondary)", fontStyle: "italic" }}>No target systems assigned.</p>
                ) : (
                    <table className="mui-simple-table admin-table">
                        <thead>
                            <tr>
                                <th>Target System</th>
                                <th>Name Override</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {targetSystems.map((ts) => {
                                const inputRef = getTsNameInputRef(ts.targetSystem);
                                return (
                                    <tr key={ts.targetSystem}>
                                        <td>{ts.targetSystemName}</td>
                                        <td>
                                            {canManage ? (
                                                <InputField
                                                    ref={inputRef}
                                                    placeholder={ts.targetSystemName}
                                                    editable={true}
                                                    showButtons={true}
                                                    onSave={makeTsNameSaveHandler(ts.targetSystem)}
                                                />
                                            ) : (
                                                ts.name ?? ts.targetSystemName
                                            )}
                                        </td>
                                        <td>
                                            {canManage ? (
                                                <button
                                                    type="button"
                                                    onClick={() => void handleUnassignTs(ts.targetSystem)}
                                                    title="Remove target system"
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

                {tsTotal > tsPageSize ? (
                    <div className="admin-pager-row" style={{ marginTop: "0.5rem" }}>
                        <button type="button" disabled={tsPage <= 0} onClick={() => setTsPage((p) => Math.max(0, p - 1))}>Previous</button>
                        <span>Page {tsPage + 1} of {Math.max(1, Math.ceil(tsTotal / tsPageSize))}</span>
                        <button type="button" disabled={tsPage >= Math.ceil(tsTotal / tsPageSize) - 1} onClick={() => setTsPage((p) => p + 1)}>Next</button>
                        <label>
                            Page size
                            <select className="admin-page-size" value={tsPageSize} onChange={(e) => { setTsPage(0); setTsPageSize(Number(e.target.value)); }}>
                                {availablePageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                            </select>
                        </label>
                    </div>
                ) : null}
            </CollapsibleSection>

            <div className="admin-top-gap">
                <Link to={`/configuration/product-types/${encodeURIComponent(producttypeid ?? "")}/datatypes`}>Back to data types</Link>
            </div>

            {/* Assign TargetSystem Dialog */}
            <Dialog
                header="Assign Target System"
                visible={tsDialogOpen}
                onHide={() => setTsDialogOpen(false)}
                style={{ minWidth: "400px" }}
            >
                <FilterableDropdown
                    options={availableTargetSystems}
                    selected={selectedTsIds}
                    onChange={(identifiers: string | string[]) => {
                        setSelectedTsIds(Array.isArray(identifiers) ? identifiers : [identifiers]);
                    }}
                    multiSelect={true}
                    placeholder="Search target systems..."
                    emptyMessage="No available target systems to assign"
                    disabled={!canManage}
                />
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                    <button
                        type="button"
                        onClick={() => void handleAssignMultipleTs(selectedTsIds)}
                        disabled={selectedTsIds.length === 0 || isSaving}
                    >
                        Add
                    </button>
                    <button
                        type="button"
                        className="p-button p-button-outlined"
                        onClick={() => setTsDialogOpen(false)}
                    >
                        Cancel
                    </button>
                </div>
            </Dialog>

            {/* Script editor popups for mandatory and requestorCanEdit */}
            <ScriptEditorPopup
                visible={mandatoryPopupVisible}
                onHide={() => setMandatoryPopupVisible(false)}
                title="Edit Mandatory Script"
                script={mandatoryScript}
                onSave={async (script) => {
                    setEditMandatory(script);
                    setMandatoryScript(script);
                    await saveMandatoryOrRequestorCanEdit("mandatory", script);
                    setMandatoryPopupVisible(false);
                }}
            />

            <ScriptEditorPopup
                visible={requestorCanEditPopupVisible}
                onHide={() => setRequestorCanEditPopupVisible(false)}
                title="Edit Requestor Can Edit Script"
                script={requestorCanEditScript}
                onSave={async (script) => {
                    setEditRequestorCanEdit(script);
                    setRequestorCanEditScript(script);
                    await saveMandatoryOrRequestorCanEdit("requestorCanEdit", script);
                    setRequestorCanEditPopupVisible(false);
                }}
            />
        </PageTemplate>
    );
}

// ---------------------------------------------------------------------------
// PermissionChipManager with inherited display — Checkbox replaced with Toggle<boolean>
// ---------------------------------------------------------------------------

function PermissionChipManager({
    label,
    role,
    allGroups,
    assignedPermissions,
    inheritedPermissions,
    onGrant,
    onRevoke,
    onToggleShowByDefault,
    onResetToDataType,
    canManage,
}: {
    label: string;
    role: string;
    allGroups: GroupOption[];
    assignedPermissions: ProductTypeDataTypePermissionEntry[];
    inheritedPermissions: DataTypePermissionEntry[];
    onGrant: (groupIdentifier: string) => Promise<void>;
    onRevoke: (groupIdentifier: string) => Promise<void>;
    onToggleShowByDefault: (entry: ProductTypeDataTypePermissionEntry) => Promise<void>;
    onResetToDataType?: () => Promise<void>;
    canManage: boolean;
}) {
    const assignedGroupIds = useMemo(
        () => new Set(assignedPermissions.map((p) => p.groupIdentifier)),
        [assignedPermissions],
    );

    const availableGroups = useMemo(
        () => allGroups.filter((g) => !assignedGroupIds.has(g.identifier)),
        [allGroups, assignedGroupIds],
    );

    // Inherited groups that are NOT already in the assigned set
    const inheritedOnly = useMemo(
        () => [...inheritedPermissions.filter((p) => !assignedGroupIds.has(p.groupIdentifier))].sort((a, b) => a.groupName.localeCompare(b.groupName)),
        [inheritedPermissions, assignedGroupIds],
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
            <h4>
                {label}
                {canManage && onResetToDataType && assignedPermissions.length > 0 ? (
                    <button
                        type="button"
                        onClick={() => void onResetToDataType()}
                        title={`Reset ${role} groups to match data type`}
                        style={{
                            marginLeft: "8px",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            padding: "0 2px",
                            fontSize: "0.9rem",
                            color: "var(--at-text-secondary)",
                        }}
                    >
                        <i className="pi pi-undo" aria-hidden="true" />
                    </button>
                ) : null}
            </h4>
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
                {assignedPermissions.length === 0 && inheritedOnly.length === 0 ? (
                    <span style={{ color: "var(--at-text-secondary)", fontStyle: "italic" }}>No groups assigned</span>
                ) : (
                    <>
                        {assignedPermissions.map((perm) => (
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
                                    <label
                                        className="admin-checkbox-label"
                                        style={{ margin: 0, padding: 0 }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Toggle<boolean>
                                            variant="checkbox"
                                            value={perm.showByDefault}
                                            options={[{ value: true, label: "show" }, { value: false, label: "" }]}
                                            onChange={() => {
                                                void onToggleShowByDefault(perm);
                                            }}
                                        />
                                    </label>
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
                        ))}
                        {assignedPermissions.length === 0 && inheritedOnly.map((perm) => (
                            <span
                                key={`inh-${perm.groupIdentifier}`}
                                className="mui-pill"
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    background: "var(--at-surface-50)",
                                    border: "1px dashed var(--at-surface-border)",
                                    color: "var(--at-text-secondary)",
                                }}
                            >
                                {perm.groupName}
                                <i className="pi pi-arrow-down-right" aria-hidden="true" title="Inherited from data type" style={{ fontSize: "0.75rem" }} />
                            </span>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}
