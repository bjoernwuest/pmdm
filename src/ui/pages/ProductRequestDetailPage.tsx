import type { PageMeta } from "@/types/PageType.ts";
import { FP_VIEW_PRODUCTS } from "@/ui/auth/functional_permissions.ts";
import {
    getProductRequest,
    updateProductRequestValue,
    approveProductRequestValue,
    approveAllProductRequestValues,
    cancelProductRequest,
    getProductRequestLookupValues,
    getProductRequestConsumableValues,
} from "@/ui/api/ProductRequests.ts";
import { getProducts } from "@/ui/api/Products.ts";
import {
    message_UpdateProductRequestValue,
    message_ApproveProductRequestValue,
    message_CancelProductRequest,
    message_ImportingProductRequest,
} from "@/types/ProductRequestType.ts";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { InputSwitch } from "primereact/inputswitch";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Dropdown } from "primereact/dropdown";
import { MultiSelect } from "primereact/multiselect";
import { Dialog } from "primereact/dialog";
import { Toast } from "primereact/toast";
import { Card } from "primereact/card";
import { Checkbox } from "primereact/checkbox";
import type { PubSubMessage } from "@/types/PubSubType";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";

export const meta: PageMeta = {
    id: "product-request-detail",
    urn: "urn:bun-starter:ui:page:product-request-detail",
    path: "/product-requests/:id",
    title: "Product Request Detail",
    description: "View and edit product request values.",
    menu: {
        section: "General",
        order: 0,
        label: "",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_VIEW_PRODUCTS.functionalPermissionName],
};

// Status tag severity mapping
const STATUS_SEVERITY: Record<string, "info" | "warning" | "success" | "danger"> = {
    open: "info",
    importing: "warning",
    done: "success",
    cancelled: "danger",
};

// Kind label for display
const KIND_LABELS: Record<string, string> = {
    calculated: "Calc.",
    boolean: "Bool",
    numeric: "Num.",
    string: "String",
    lookup: "Lookup",
    consumable: "Consum.",
    product: "Product",
};

// Full kind label for the info tooltip
const KIND_LABELS_FULL: Record<string, string> = {
    calculated: "Calculated",
    boolean: "Boolean",
    numeric: "Numeric",
    string: "String",
    lookup: "Lookup",
    consumable: "Consumable",
    product: "Product",
};

// Human-readable "Value" constraints derived from the resolved data type config
function describeValueConstraints(row: any): string[] {
    const config = (row.dataTypeConfig ?? {}) as Record<string, unknown>;
    const constraints: string[] = [];
    switch (row.dataTypeKind) {
        case "calculated":
            constraints.push("Value is calculated automatically (read-only)");
            break;
        case "boolean":
            constraints.push((config.permitEmpty ?? false)
                ? "Tri-state: true / false / empty"
                : "Two-state: true / false");
            break;
        case "numeric": {
            const min = config.min as number | undefined;
            const max = config.max as number | undefined;
            const decimals = (config.decimals as number | undefined) ?? 0;
            if (min !== undefined && min !== null) constraints.push(`Minimum: ${min}`);
            if (max !== undefined && max !== null) constraints.push(`Maximum: ${max}`);
            constraints.push(decimals === 0 ? "No decimals (integer)" : `Decimals: up to ${decimals}`);
            break;
        }
        case "string": {
            const min = config.min as number | undefined;
            const max = config.max as number | undefined;
            constraints.push((config.multi ?? false) ? "Multi-line text" : "Single-line text");
            if (min !== undefined && min !== null && min > 0) constraints.push(`Minimum length: ${min} characters`);
            if (max !== undefined && max !== null) constraints.push(`Maximum length: ${max} characters`);
            break;
        }
        case "lookup":
        case "consumable":
        case "product":
            constraints.push((config.multi ?? false) ? "Multi-selection" : "Single selection");
            break;
        default:
            break;
    }
    if (row.mandatory) constraints.push("Mandatory: a value is required");
    return constraints;
}

function isValuePresent(row: any): boolean {
    if (!row.mandatory) return true;
    if (row.value !== null && row.value !== undefined) return true;
    if (row.defaultValue !== null && row.defaultValue !== "null") return true;
    if (row.dataTypeKind === "boolean" && (row.dataTypeConfig?.permitEmpty ?? false)) return true;
    return false;
}

interface DropdownOption {
    label: string;
    value: string;
}

export function Component() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const toast = useRef<Toast>(null);

    // Data state
    const [loading, setLoading] = useState(true);
    const [request, setRequest] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // UI state
    const [showHidden, setShowHidden] = useState(false);
    const [showFilter, setShowFilter] = useState(false);

    // Data type info tooltip state (row hover for editable rows, pinned via
    // the pi-question-circle button which is available to everyone)
    const [infoTooltipRow, setInfoTooltipRow] = useState<any>(null);
    const [infoTooltipPinned, setInfoTooltipPinned] = useState(false);
    const [infoTooltipPos, setInfoTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    // Filter state
    const [filterIds, setFilterIds] = useState<Set<string>>(new Set());
    const [filterApplied, setFilterApplied] = useState(false);

    // Popup-local narrowing state (controls which data types appear in the checkbox list)
    const [filterPopupKind, setFilterPopupKind] = useState<string | null>(null);
    const [filterPopupName, setFilterPopupName] = useState("");
    const [filterPopupOwner, setFilterPopupOwner] = useState<string | null>(null);
    const [filterPopupApproval, setFilterPopupApproval] = useState<"all" | "approved" | "unapproved">("all");

    // Dropdown data caches
    const [lookupOptions, setLookupOptions] = useState<Record<string, DropdownOption[]>>({});
    const [consumableOptions, setConsumableOptions] = useState<Record<string, DropdownOption[]>>({});
    const [productOptions, setProductOptions] = useState<DropdownOption[]>([]);

    // Confirm cancel dialog
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    // Active edit field tracking (Task 4: only one editor at a time for text/number/textarea)
    const [activeEditField, setActiveEditField] = useState<string | null>(null);

    // Ref to always have the latest request values (avoids stale closure issues)
    const requestRef = useRef<any>(null);
    requestRef.current = request;

    // Store extraIds for consumable reloads so the PubSub handler (which fires
    // before the API response returns) can pass them to reloadConsumableOptions.
    const pendingConsumableExtraIdsRef = useRef<Map<string, string[] | undefined>>(new Map());

    // Store product numbers for product-kind value saves (same pattern as consumable extraIds).
    const pendingProductNumbersRef = useRef<Set<string>>(new Set());

    // Shared reload function for consumable options, called from both
    // handleValueChange (own actions) and PubSub (cross-request changes).
    // Uses a ref so the PubSub handler always has the latest closures.
    const reloadConsumableOptions = useCallback(async (dataTypeId: string, extraIds?: string[]) => {
        const req = requestRef.current;
        if (!id || !req) return;
        const value = req.values?.find((v: any) => v.dataType === dataTypeId);
        if (!value || value.dataTypeKind !== "consumable") return;
        const sourceId = value.dataTypeConfig?.source as string | undefined;
        if (!sourceId) return;

        // Find all data types sharing this source — all need updated options
        const siblingIds: string[] = [];
        for (const v of req.values ?? []) {
            if (v.dataTypeKind === "consumable" && v.dataTypeConfig?.source === sourceId && v.dataType) {
                siblingIds.push(v.dataType as string);
            }
        }

        // Reload options for every sibling data type in parallel
        await Promise.all(siblingIds.map(async (dtId) => {
            consumableDataTypesLoadingRef.current.delete(dtId);
            const selectedIds = new Set(
                (req.values ?? [])
                    .filter((rv: any) => rv.dataTypeKind === "consumable" && rv.dataType === dtId && rv.value != null)
                    .flatMap((rv: any) => Array.isArray(rv.value) ? rv.value as string[] : [rv.value as string]),
            );
            // Only merge extraIds for the triggering data type
            if (dtId === dataTypeId && extraIds) for (const id of extraIds) selectedIds.add(id);

            try {
                const result = await getProductRequestConsumableValues(id, dtId);
                setConsumableOptions((prev) => ({
                    ...prev,
                    [dtId]: result.values
                        .filter((cv: any) => !cv.disabled && (!cv.isUsed || selectedIds.has(cv.identifier)))
                        .map((cv: any) => ({ label: cv.name ?? (cv as any).value ?? cv.identifier, value: cv.identifier })),
                }));
        } catch (e: any) { console.error("reloadConsumableOptions failed:", e); }
        }));
    }, [id]);

    const reloadConsumableOptionsRef = useRef(reloadConsumableOptions);
    reloadConsumableOptionsRef.current = reloadConsumableOptions;

    // Product option reload (same pattern as consumable, but for product-kind
    // data types which share a single flat option list).
    const reloadProductOptions = useCallback(async (extraProductNumbers?: string[]) => {
        const req = requestRef.current;
        if (!id || !req) return;
        const hasProductKind = req.values?.some((v: any) => v.dataTypeKind === "product");
        if (!hasProductKind) return;
        productsLoadedRef.current = false; // allow reload
        try {
            // Coerce to String(): the jsonb "value" column round-trips
            // through drizzle-orm's double JSON-parsing (postgres driver
            // already parses jsonb, then drizzle parses the resulting string
            // again), which silently turns digit-only productNumbers (e.g.
            // "2") into numbers. Lookup/Consumable identifiers are UUIDs and
            // never hit this, since JSON.parse() on a UUID throws and falls
            // back to the original string — that's why only Product is
            // affected. Stringify defensively so comparisons against
            // productOptions (always genuine strings) succeed.
            const selectedProductNumbers = new Set(
                (req.values ?? [])
                    .filter((rv: any) => rv.dataTypeKind === "product" && rv.value != null)
                    .flatMap((rv: any) => Array.isArray(rv.value) ? rv.value.map((x: any) => String(x)) : [String(rv.value)]),
            );
            if (extraProductNumbers) for (const n of extraProductNumbers) selectedProductNumbers.add(String(n));
            const result = await getProducts(0, 1000, false);
            setProductOptions(
                result.products
                    .filter((p: any) => !p.disabled && (p.productNumber !== req.productToUpdate || selectedProductNumbers.has(p.productNumber)))
                    .map((p: any) => ({ label: p.productNumber, value: p.productNumber })),
            );
            productsLoadedRef.current = true;
        } catch (e: any) {
            productsLoadedRef.current = true; // prevent retry loops
            console.error("reloadProductOptions failed:", e);
        }
    }, [id]);

    const reloadProductOptionsRef = useRef(reloadProductOptions);
    reloadProductOptionsRef.current = reloadProductOptions;

    // Track own edits/approvals to suppress PubSub-induced refetch.
    // Entries are added before the API call (to avoid a race with the PubSub
    // message) and cleaned up by the PubSub handler on receipt or by a
    // timeout after 5 seconds.
    const pendingOwnActionRef = useRef<Set<string>>(new Set());
    const pendingOwnActionTimeoutIds = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const pendOwnAction = useCallback((dataType: string) => {
        pendingOwnActionRef.current.add(dataType);
        // Cancel any previous timeout for this dataType so a second selection
        // (e.g. adding a second value to a multi-select) isn't cancelled by
        // the timeout from the first selection.
        const prev = pendingOwnActionTimeoutIds.current.get(dataType);
        if (prev) clearTimeout(prev);
        const id = setTimeout(() => {
            pendingOwnActionRef.current.delete(dataType);
            pendingOwnActionTimeoutIds.current.delete(dataType);
        }, 5000);
        pendingOwnActionTimeoutIds.current.set(dataType, id);
    }, []);

    // Fetch detail
    const fetchDetail = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const result = await getProductRequest(id);
            setRequest(result);
            setError(null);
        } catch (e: any) {
            setError(e.message);
            setRequest(null);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchDetail();
    }, [fetchDetail]);

    // Load dropdown data for lookup/consumable/product types
    const productsLoadedRef = useRef(false);
    const lookupDataTypesLoadingRef = useRef<Set<string>>(new Set());
    const consumableDataTypesLoadingRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!id || !request?.values) return;

        for (const v of request.values) {
            // Load lookups — scoped to the product request so access is governed
            // by the data type's Viewer/Writer/Approver role, not the
            // Configuration-area FP_VIEW_LOOKUPS permission.
            if (v.dataTypeKind === "lookup" && v.dataTypeConfig?.source && v.dataType) {
                const sourceId = v.dataTypeConfig.source as string;
                const dataTypeId = v.dataType as string;
                if (lookupDataTypesLoadingRef.current.has(dataTypeId)) continue;
                lookupDataTypesLoadingRef.current.add(dataTypeId);
                getProductRequestLookupValues(id, dataTypeId)
                    .then((result) => {
                        setLookupOptions((prev) => ({
                            ...prev,
                            [sourceId]: result.values
                                .filter((lv: any) => !lv.disabled)
                                .map((lv: any) => ({ label: lv.name ?? (lv as any).value ?? lv.identifier, value: lv.identifier })),
                        }));
                    })
                    .catch(() => { /* ignore — dropdown will remain empty */ });
            }
            // Load consumables — same product-request-scoped permission model.
            // Options are keyed by dataType (not source) so each data type
            // gets its own filtered view with its own selectedIds.
            if (v.dataTypeKind === "consumable" && v.dataTypeConfig?.source && v.dataType) {
                const dataTypeId = v.dataType as string;
                if (consumableDataTypesLoadingRef.current.has(dataTypeId)) continue;
                consumableDataTypesLoadingRef.current.add(dataTypeId);
                const selectedIds = new Set(
                    (request.values ?? [])
                        .filter((rv: any) => rv.dataTypeKind === "consumable" && rv.dataType === dataTypeId && rv.value != null)
                        .flatMap((rv: any) => Array.isArray(rv.value) ? rv.value as string[] : [rv.value as string]),
                );
                getProductRequestConsumableValues(id, dataTypeId)
                    .then((result) => {
                        setConsumableOptions((prev) => ({
                            ...prev,
                            [dataTypeId]: result.values
                                .filter((cv: any) => !cv.disabled && (!cv.isUsed || selectedIds.has(cv.identifier)))
                                .map((cv: any) => ({ label: cv.name ?? (cv as any).value ?? cv.identifier, value: cv.identifier })),
                        }));
                    })
                .catch((e: any) => { console.error("Initial consumable load failed:", e); });
            }
        }

        // Load products for product-type data types
        const hasProductKind = request.values.some((v: any) => v.dataTypeKind === "product");
        if (hasProductKind && !productsLoadedRef.current) {
            productsLoadedRef.current = true;
            // Coerce to String(): see reloadProductOptions for why the jsonb
            // "value" column can surface digit-only productNumbers as numbers.
            const selectedProductNumbers = new Set(
                (request.values ?? [])
                    .filter((rv: any) => rv.dataTypeKind === "product" && rv.value != null)
                    .flatMap((rv: any) => Array.isArray(rv.value) ? rv.value.map((x: any) => String(x)) : [String(rv.value)]),
            );
            getProducts(0, 1000, false)
                .then((result) => {
                    setProductOptions(
                        result.products
                            .filter((p: any) => !p.disabled && (p.productNumber !== request.productToUpdate || selectedProductNumbers.has(p.productNumber)))
                            .map((p: any) => ({ label: p.productNumber, value: p.productNumber })),
                    );
                })
                .catch((e: any) => { console.error("Initial product load failed:", e); });
        }
    }, [id, request]);

    // PubSub subscriptions
    useEffect(() => {
        if (!id) return;

        const sub1 = subscribe({ and: message_UpdateProductRequestValue }, (msg: PubSubMessage) => {
            const data = msg.data as any;
            const dt = data.dataType as string;

            // Own request changes
            if (data.productRequest === id) {
                if (pendingOwnActionRef.current.has(dt)) {
                    pendingOwnActionRef.current.delete(dt);
                    const extraIds = pendingConsumableExtraIdsRef.current.get(dt);
                    if (extraIds !== undefined) pendingConsumableExtraIdsRef.current.delete(dt);
                    const productNums = pendingProductNumbersRef.current.size > 0
                        ? [...pendingProductNumbersRef.current]
                        : undefined;
                    pendingProductNumbersRef.current.clear();
                    reloadConsumableOptionsRef.current?.(dt, extraIds);
                    reloadProductOptionsRef.current?.(productNums);
                    return;
                }
                fetchDetail();
                return;
            }
            reloadConsumableOptionsRef.current?.(dt);
            reloadProductOptionsRef.current?.();
        });
        const sub2 = subscribe({ and: message_ApproveProductRequestValue }, (msg: PubSubMessage) => {
            const data = msg.data as any;
            const dt = data.dataType as string | undefined;

            // Own request changes (including approve-all via requestId)
            if (data.productRequest === id || data.requestId === id) {
                if (dt && pendingOwnActionRef.current.has(dt)) {
                    pendingOwnActionRef.current.delete(dt);
                    reloadConsumableOptionsRef.current?.(dt);
                    reloadProductOptionsRef.current?.();
                    return;
                }
                fetchDetail();
                return;
            }

            // Cross-request: reload consumable options
            if (dt) {
                reloadConsumableOptionsRef.current?.(dt);
                reloadProductOptionsRef.current?.();
            }
        });
        const sub3 = subscribe({ and: message_CancelProductRequest }, (msg: PubSubMessage) => {
            if ((msg.data as any).identifier === id) navigate("/product-requests");
        });
        const sub4 = subscribe({ and: message_ImportingProductRequest }, (msg: PubSubMessage) => {
            if ((msg.data as any).identifier === id) fetchDetail();
        });

        return () => {
            [sub1, sub2, sub3, sub4].forEach((s) => { if (s) unsubscribe(s); });
        };
    }, [id, fetchDetail, navigate]);

    // Handlers
    const handleValueChange = useCallback(async (dataTypeIdentifier: string, newValue: unknown) => {
        if (!id) return;
        pendOwnAction(dataTypeIdentifier);

        // Pend own actions for on_change calculated data types whose scripts
        // will be recalculated by the server, so the PubSub handler skips the
        // redundant fetchDetail() — the API response already carries the new values.
        const onChangeCalcDts: string[] = [];
        if (requestRef.current?.values) {
            for (const v of requestRef.current.values) {
                if (v.dataTypeKind === "calculated" && v.dataTypeConfig?.mode === "on_change") {
                    pendOwnAction(v.dataType);
                    onChangeCalcDts.push(v.dataType);
                }
            }
        }

        // Store extraIds BEFORE the API call so the PubSub handler (which may
        // fire before the response arrives) can pass them to the options reload.
        const extraIds = newValue != null
            ? (Array.isArray(newValue) ? (newValue as Array<unknown>).filter((v): v is string => typeof v === "string") : (typeof newValue === "string" ? [newValue] : undefined))
            : undefined;
        if (extraIds) {
            pendingConsumableExtraIdsRef.current.set(dataTypeIdentifier, extraIds);
            // Also track for product-kind reload
            for (const id of extraIds) pendingProductNumbersRef.current.add(id);
        }

        try {
            const result = await updateProductRequestValue(id, dataTypeIdentifier, newValue);
            toast.current?.show({ severity: "success", summary: "Saved", detail: "Value updated", life: 2000 });
            const respValue = result.value as any;
            const savedVal = respValue.value;

            setRequest((prev: any) => {
                if (!prev) return prev;
                const recalcMap = new Map<string, any>();
                for (const rv of (result.recalculated ?? [])) {
                    recalcMap.set((rv as any).dataType, rv);
                }
                return {
                    ...prev,
                    values: (prev.values ?? []).map((v: any) => {
                        if (v.dataType === dataTypeIdentifier) {
                            return {
                                ...v,
                                value: respValue.value,
                                updatedAt: respValue.updatedAt,
                                updatedBy: respValue.updatedBy,
                                approvedAt: null,
                                approvedBy: null,
                                approverName: null,
                                approverEmail: null,
                            };
                        }
                        const recalc = recalcMap.get(v.dataType);
                        if (recalc) {
                            return {
                                ...v,
                                value: recalc.value,
                                updatedAt: recalc.updatedAt,
                                updatedBy: recalc.updatedBy,
                            };
                        }
                        return v;
                    }),
                };
            });

            // Ensure the selected product number is in productOptions so the
            // Dropdown / MultiSelect can display the selection immediately,
            // without waiting for the PubSub-triggered reloadProductOptions (which
            // would be needed because the initial load filters out productToUpdate).
            // Lookup needs no equivalent because getProductRequestLookupValues
            // returns all non-disabled lookup values regardless of productToUpdate.
            // Coerce to String(): the jsonb "value" column round-trips through
            // drizzle-orm's double JSON-parsing (the postgres driver already
            // parses jsonb, then drizzle parses the resulting string again),
            // which silently turns digit-only productNumbers (e.g. "2") into
            // numbers in the API response. Accept numbers here too so this
            // guard still fires.
            if (savedVal != null) {
                const ids: string[] = Array.isArray(savedVal)
                    ? savedVal.filter((v: any) => v !== null && v !== undefined).map((v: any) => String(v))
                    : [String(savedVal)];
                if (ids.length > 0) {
                    setProductOptions((prevOpts) => {
                        const missing = ids.filter((id) => !prevOpts.some((o) => o.value === id));
                        if (missing.length === 0) return prevOpts;
                        return [...prevOpts, ...missing.map((id) => ({ label: id, value: id }))];
                    });
                }
            }
        } catch (e: any) {
            pendingOwnActionRef.current.delete(dataTypeIdentifier);
            toast.current?.show({ severity: "error", summary: "Error", detail: e.message, life: 5000 });
        }
    }, [id, pendOwnAction]);

    const handleApprove = useCallback(async (dataTypeIdentifier: string) => {
        if (!id) return;
        pendOwnAction(dataTypeIdentifier);
        try {
            const result = await approveProductRequestValue(id, dataTypeIdentifier);
            if (result.allApproved) {
                pendingOwnActionRef.current.delete(dataTypeIdentifier);
                toast.current?.show({
                    severity: "success",
                    summary: "All approved",
                    detail: "All values approved — request moved to importing",
                    life: 5000,
                });
                fetchDetail();
            } else {
                toast.current?.show({ severity: "success", summary: "Approved", detail: "Value approved", life: 2000 });
                const respValue = result.value as any;
                setRequest((prev: any) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        values: (prev.values ?? []).map((v: any) =>
                            v.dataType === dataTypeIdentifier
                                ? {
                                    ...v,
                                    approvedAt: respValue.approvedAt,
                                    approvedBy: respValue.approvedBy,
                                }
                                : v,
                        ),
                    };
                });
            }
        } catch (e: any) {
            pendingOwnActionRef.current.delete(dataTypeIdentifier);
            toast.current?.show({ severity: "error", summary: "Error", detail: e.message, life: 5000 });
        }
    }, [id, fetchDetail]);

    const handleApproveAll = useCallback(async () => {
        if (!id) return;
        try {
            const result = await approveAllProductRequestValues(id);
            if (result.allApproved) {
                toast.current?.show({
                    severity: "success",
                    summary: "All approved",
                    detail: `Approved ${result.approvedCount} value(s) — request moved to importing`,
                    life: 5000,
                });
            } else {
                toast.current?.show({
                    severity: "success",
                    summary: "Approved",
                    detail: `Approved ${result.approvedCount} value(s)`,
                    life: 3000,
                });
            }
            fetchDetail();
        } catch (e: any) {
            toast.current?.show({ severity: "error", summary: "Error", detail: e.message, life: 5000 });
        }
    }, [id, fetchDetail]);

    const handleCancel = useCallback(async () => {
        if (!id) return;
        try {
            await cancelProductRequest(id);
            toast.current?.show({ severity: "info", summary: "Cancelled", detail: "Product request cancelled", life: 3000 });
            navigate("/product-requests");
        } catch (e: any) {
            toast.current?.show({ severity: "error", summary: "Error", detail: e.message, life: 5000 });
        }
    }, [id, navigate]);

    const openFilterDialog = useCallback(() => {
        setFilterPopupKind(null);
        setFilterPopupName("");
        setFilterPopupOwner(null);
        setFilterPopupApproval("all");
        // Initialize checkbox selection to currently visible values
        const visibleIds = (request?.values ?? []).filter((v: any) =>
            v.userRoles?.length > 0 && (v.showByDefault || showHidden),
        ).map((v: any) => v.dataType);
        setFilterIds(new Set(visibleIds));
        setShowFilter(true);
    }, [request, showHidden]);

    const handleFilterApply = useCallback(() => {
        setFilterApplied(true);
        setShowFilter(false);
    }, []);

    const handleFilterClear = useCallback(() => {
        if (request?.values) {
            const visibleIds = request.values
                .filter((v: any) => v.userRoles?.length > 0 && (v.showByDefault || showHidden))
                .map((v: any) => v.dataType);
            setFilterIds(new Set(visibleIds));
        }
        setFilterPopupKind(null);
        setFilterPopupName("");
        setFilterPopupOwner(null);
        setFilterPopupApproval("all");
        setFilterApplied(false);
        setShowFilter(false);
    }, [request, showHidden]);

    // Resolve identifier-based values to display names for lookup/consumable/product
    const resolveDisplayName = useCallback((row: any, val: unknown): string => {
        if (val === null || val === undefined) return "—";
        const resolveSingle = (v: string, options: DropdownOption[]): string =>
            options.find((o) => o.value === v)?.label ?? v;
        const resolveArray = (arr: string[], options: DropdownOption[]): string =>
            arr.map((v) => resolveSingle(v, options)).join(", ");

        if (row.dataTypeKind === "lookup") {
            const options = lookupOptions[(row.dataTypeConfig?.source as string) ?? ""];
            if (!options || options.length === 0) return Array.isArray(val) ? (val as string[]).join(", ") : String(val);
            return Array.isArray(val) ? resolveArray(val as string[], options) : resolveSingle(val as string, options);
        }
        if (row.dataTypeKind === "consumable") {
            const options = consumableOptions[(row.dataType as string) ?? ""];
            if (!options || options.length === 0) return Array.isArray(val) ? (val as string[]).join(", ") : String(val);
            return Array.isArray(val) ? resolveArray(val as string[], options) : resolveSingle(val as string, options);
        }
        if (row.dataTypeKind === "product") {
            // Coerce to String(): see the "product" case in valueBody for why
            // the jsonb "value" column can surface digit-only productNumbers
            // as numbers instead of strings.
            if (!productOptions || productOptions.length === 0) return Array.isArray(val) ? (val as unknown[]).map((v) => String(v)).join(", ") : String(val);
            return Array.isArray(val)
                ? resolveArray((val as unknown[]).map((v) => String(v)), productOptions)
                : resolveSingle(String(val), productOptions);
        }
        if (typeof val === "object") {
            return Array.isArray(val) ? (val as string[]).join(", ") : JSON.stringify(val);
        }
        return String(val);
    }, [lookupOptions, consumableOptions, productOptions]);

    // Loading state
    if (loading) {
        return (
            <div style={{ padding: "2rem", textAlign: "center" }}>
                <i className="pi pi-spin pi-spinner" style={{ fontSize: "2rem" }} />
                <p>Loading product request...</p>
            </div>
        );
    }

    // Error state
    if (error || !request) {
        return (
            <div style={{ padding: "2rem" }}>
                <Button label="Back to Open requests" icon="pi pi-arrow-left" className="p-button-outlined"
                    onClick={() => navigate("/product-requests")} style={{ marginBottom: "1rem" }} />
                <Card>
                    <p style={{ color: "var(--red-500)" }}>{error ?? "Product request not found"}</p>
                </Card>
            </div>
        );
    }

    // Compute editable/approvable states
    const isUpdateRequest = !!request.productToUpdate;
    const isOpen = request.status === "open";

    // Check if there are any approvable values for "Approve all" button
    const hasApprovableValues = request.values?.some((v: any) =>
        !v.approvedBy &&
        v.dataTypeKind !== "calculated" &&
        isValuePresent(v) &&
        v.userRoles?.includes("approver") &&
        v.previousApprovalDepsMet !== false,
    );

    // Filter values by visibility and attach resolved options for edit fields
    let visibleValues = (request.values ?? []).filter((v: any) => {
        if (v.userRoles?.length === 0) return false;
        if (!v.showByDefault && !showHidden) return false;
        if (filterApplied && !filterIds.has(v.dataType)) return false;
        return true;
    }).map((v: any) => {
        const displayValue = v.value !== null ? v.value : (v.defaultValue !== null && v.defaultValue !== "null" ? v.defaultValue : null);
        let editOptions: DropdownOption[] = [];
        let resolvedLabel: string | null = null;
        if (v.dataTypeKind === "lookup" || v.dataTypeKind === "consumable" || v.dataTypeKind === "product") {
            const source = v.dataTypeConfig?.source as string | undefined;
            if (v.dataTypeKind === "lookup") {
                editOptions = source ? (lookupOptions[source] ?? []) : [];
            } else if (v.dataTypeKind === "consumable") {
                editOptions = consumableOptions[v.dataType] ?? [];
            } else {
                // Product options come from the generic, paginated getProducts()
                // list (unlike Lookup/Consumable, which are fetched via
                // request-scoped endpoints guaranteed to include the row's own
                // value). That list can legitimately be missing the row's
                // currently selected productNumber (disabled since selection,
                // self-reference filtering, or outside the fetched page), which
                // makes the single-select Dropdown render blank (unlike
                // MultiSelect, which falls back to showing the raw value).
                // Mirror Lookup's guarantee by ensuring the row's own selected
                // productNumber(s) are always present, rendering the
                // productNumber itself (never a "name") for any synthesized entry.
                //
                // Also coerce to String(): the jsonb "value" column round-trips
                // through drizzle-orm's double JSON-parsing (the postgres driver
                // already parses jsonb, then drizzle parses the resulting string
                // again), which silently turns digit-only productNumbers (e.g.
                // "2") into numbers. Lookup/Consumable identifiers are UUIDs and
                // never hit this, since JSON.parse() on a UUID throws and falls
                // back to the original string — that's why only Product needs
                // this coercion.
                editOptions = productOptions;
                const selectedProductIds: string[] = displayValue == null
                    ? []
                    : Array.isArray(displayValue)
                        ? displayValue.filter((x: any) => x !== null && x !== undefined).map((x: any) => String(x))
                        : [String(displayValue)];
                const missingProductIds = selectedProductIds.filter(
                    (pid) => !editOptions.some((o) => o.value === pid),
                );
                if (missingProductIds.length > 0) {
                    editOptions = [
                        ...editOptions,
                        ...missingProductIds.map((pid) => ({ label: pid, value: pid })),
                    ];
                }
            }
            resolvedLabel = resolveDisplayName(v, displayValue);
        }
        return { ...v, _editOptions: editOptions, _resolvedLabel: resolvedLabel };
    });

    // Collect unique owners for filter dropdown
    const uniqueOwnerNames = [...new Set(
        (request?.values ?? [])
            .filter((v: any) => v.userRoles?.length > 0 && v.businessDomainName)
            .map((v: any) => v.businessDomainName),
    )].sort() as string[];

    // Kind options for filter dropdown
    const kindOptions = Object.entries(KIND_LABELS).map(([value, label]) => ({ label, value }));

    // Determine if user can cancel
    const canCancel = isOpen; // Server validates cancel role

    // Whether the current user may edit the value of a row
    const canEditRow = (row: any): boolean => isOpen && (
        row.userRoles?.includes("writer") ||
        (row.requestorCanEdit && request.createdBy === row.createdBy)
    ) && (!isUpdateRequest || row.editableOnUpdate);

    // Data type info tooltip helpers
    const hideInfoTooltip = () => {
        setInfoTooltipRow(null);
        setInfoTooltipPinned(false);
    };

    const toggleInfoTooltip = (row: any, anchor: HTMLElement) => {
        if (infoTooltipPinned && infoTooltipRow?.dataType === row.dataType) {
            hideInfoTooltip();
            return;
        }
        const rect = anchor.getBoundingClientRect();
        setInfoTooltipPos({ x: rect.right, y: rect.bottom });
        setInfoTooltipRow(row);
        setInfoTooltipPinned(true);
    };

    // Value cell renderer
    const valueBody = (row: any) => {
        const canEdit = canEditRow(row);

        const displayValue = row.value !== null ? row.value : (row.defaultValue !== null && row.defaultValue !== "null" ? row.defaultValue : null);

        // Read-only calculated
        if (row.dataTypeKind === "calculated") {
            return <span>{displayValue !== null ? JSON.stringify(displayValue) : "—"}</span>;
        }

        // Read-only display
        if (!canEdit) {
            if (displayValue === null || displayValue === undefined) {
                return <span style={{ fontStyle: "italic", color: "var(--text-color-secondary)" }}>—</span>;
            }
            if (row.dataTypeKind === "boolean") {
                return <Tag value={displayValue ? "true" : "false"} severity={displayValue ? "success" : "danger"} />;
            }
            return <span>{row._resolvedLabel ?? resolveDisplayName(row, displayValue)}</span>;
        }

        // Editable inputs
        switch (row.dataTypeKind) {
            case "boolean": {
                const permitEmpty = row.dataTypeConfig?.permitEmpty ?? false;
                return (
                    <InlineEditField
                        value={displayValue}
                        type={permitEmpty ? "tristate" : "switch"}
                        config={row.dataTypeConfig}
                        onSave={(v) => handleValueChange(row.dataType, v)}
                        dataTypeId={row.dataType}
                        activeEditField={activeEditField}
                        onActivate={(id) => setActiveEditField(id)}
                        onDeactivate={() => setActiveEditField(null)}
                        kind={row.dataTypeKind}
                    />
                );
            }
            case "numeric":
                return (
                    <InlineEditField
                        value={displayValue}
                        type="number"
                        config={row.dataTypeConfig}
                        onSave={(v) => handleValueChange(row.dataType, v)}
                        dataTypeId={row.dataType}
                        activeEditField={activeEditField}
                        onActivate={(id) => setActiveEditField(id)}
                        onDeactivate={() => setActiveEditField(null)}
                        kind={row.dataTypeKind}
                    />
                );
            case "string": {
                const multi = row.dataTypeConfig?.multi ?? false;
                return (
                    <InlineEditField
                        value={displayValue}
                        type={multi ? "textarea" : "text"}
                        config={row.dataTypeConfig}
                        onSave={(v) => handleValueChange(row.dataType, v)}
                        dataTypeId={row.dataType}
                        activeEditField={activeEditField}
                        onActivate={(id) => setActiveEditField(id)}
                        onDeactivate={() => setActiveEditField(null)}
                        kind={row.dataTypeKind}
                    />
                );
            }
            case "lookup": {
                const multi = row.dataTypeConfig?.multi ?? false;
                const multiValue = multi
                    ? (Array.isArray(displayValue) ? displayValue : (displayValue != null ? [displayValue] : []))
                    : (Array.isArray(displayValue) ? (typeof displayValue[0] === "string" ? String(displayValue[0]) : null) : displayValue);
                return (
                    <InlineEditField
                        value={multiValue}
                        type={multi ? "multiselect" : "dropdown"}
                        config={row.dataTypeConfig}
                        options={row._editOptions}
                        onSave={(v) => handleValueChange(row.dataType, v)}
                        dataTypeId={row.dataType}
                        activeEditField={activeEditField}
                        onActivate={(id) => setActiveEditField(id)}
                        onDeactivate={() => setActiveEditField(null)}
                        kind={row.dataTypeKind}
                    />
                );
            }
            case "consumable": {
                const multi = row.dataTypeConfig?.multi ?? false;
                const multiValue = multi
                    ? (Array.isArray(displayValue) ? displayValue : (displayValue != null ? [displayValue] : []))
                    : (Array.isArray(displayValue) ? (typeof displayValue[0] === "string" ? String(displayValue[0]) : null) : displayValue);
                return (
                    <InlineEditField
                        value={multiValue}
                        type={multi ? "multiselect" : "dropdown"}
                        config={row.dataTypeConfig}
                        options={row._editOptions}
                        onSave={(v) => handleValueChange(row.dataType, v)}
                        dataTypeId={row.dataType}
                        activeEditField={activeEditField}
                        onActivate={(id) => setActiveEditField(id)}
                        onDeactivate={() => setActiveEditField(null)}
                        kind={row.dataTypeKind}
                    />
                );
            }
            case "product": {
                const multi = row.dataTypeConfig?.multi ?? false;
                // Coerce to String(): the jsonb "value" column round-trips
                // through drizzle-orm's double JSON-parsing (the postgres
                // driver already parses jsonb, then drizzle parses the
                // resulting string again), which silently turns digit-only
                // productNumbers (e.g. "2") into numbers. Lookup/Consumable
                // identifiers are UUIDs and never hit this, since
                // JSON.parse() on a UUID throws and falls back to the
                // original string — that's why only Product needs this
                // coercion to match against the (always string) options.
                const multiValue = multi
                    ? (Array.isArray(displayValue) ? displayValue.map((x: any) => String(x)) : (displayValue != null ? [String(displayValue)] : []))
                    : (Array.isArray(displayValue) ? (displayValue[0] != null ? String(displayValue[0]) : null) : (displayValue != null ? String(displayValue) : null));
                return (
                    <InlineEditField
                        value={multiValue}
                        type={multi ? "multiselect" : "dropdown"}
                        config={row.dataTypeConfig}
                        options={row._editOptions}
                        onSave={(v) => handleValueChange(row.dataType, v)}
                        dataTypeId={row.dataType}
                        activeEditField={activeEditField}
                        onActivate={(id) => setActiveEditField(id)}
                        onDeactivate={() => setActiveEditField(null)}
                        kind={row.dataTypeKind}
                    />
                );
            }
            default:
                return <span>{displayValue !== null ? String(displayValue) : "—"}</span>;
        }
    };

    // Last editor column
    const editorBody = (row: any) => {
        // Tri-state booleans (permitEmpty) accept null as a valid value, so a
        // null value still has a legitimate last editor.
        const isTriStateBoolean = row.dataTypeKind === "boolean" && (row.dataTypeConfig?.permitEmpty ?? false);
        if (!isTriStateBoolean && row.value === null && (row.defaultValue === null || row.defaultValue === "null")) {
            return <span style={{ fontStyle: "italic", color: "var(--text-color-secondary)" }}>Not yet edited</span>;
        }
        if (row.dataTypeKind === "calculated") {
            return <span style={{ fontStyle: "italic", color: "var(--text-color-secondary)" }}>auto</span>;
        }
        const updated = row.updatedAt ? new Date(row.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        if (row.editorName) {
            const emailPart = row.editorEmail ? ` (${row.editorEmail})` : "";
            return <span>{row.editorName}{emailPart} · {updated}</span>;
        }
        if (row.editorEmail) {
            return <span>{row.editorEmail} · {updated}</span>;
        }
        return <span style={{ fontStyle: "italic", color: "var(--text-color-secondary)" }}>—</span>;
    };

    // Approval column
    const approvalBody = (row: any) => {
        const isCalculated = row.dataTypeKind === "calculated";

        if (isCalculated || row.approvedBy) {
            if (isCalculated) {
                return <span style={{ fontStyle: "italic", color: "var(--text-color-secondary)" }}>Auto-approved</span>;
            }
            const approvedAt = row.approvedAt ? new Date(row.approvedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
            const nameDisplay = row.approverName
                ? `${row.approverName}${row.approverEmail ? ` (${row.approverEmail})` : ""}`
                : (row.approverEmail || "Approved");
            return (
                <span style={{ color: "var(--green-600)" }}>
                    <i className="pi pi-check" style={{ marginRight: "0.25rem" }} />
                    {nameDisplay} · {approvedAt}
                </span>
            );
        }

        if (isOpen && row.userRoles?.includes("approver") && isValuePresent(row)) {
            if (row.previousApprovalDepsMet === false) {
                return (
                    <span style={{ color: "var(--text-color-secondary)", fontStyle: "italic" }}>
                        <i className="pi pi-clock" style={{ marginRight: "0.25rem" }} />
                        Waiting for other approvals
                    </span>
                );
            }
            return (
                <Button
                    label="Approve"
                    icon="pi pi-check"
                    className="p-button-sm p-button-outlined p-button-success"
                    onClick={(e) => { e.stopPropagation(); handleApprove(row.dataType); }}
                />
            );
        }

        return <span style={{ color: "var(--text-color-secondary)" }}>—</span>;
    };

    return (
        <div style={{ padding: "1rem" }}>
            <Toast ref={toast} />

            {/* Back button */}
            <Button
                label="Back to Open requests"
                icon="pi pi-arrow-left"
                className="p-button-outlined"
                onClick={() => navigate("/product-requests")}
                style={{ marginBottom: "1rem" }}
            />

            {/* Header Panel */}
            <Card style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                        <h2 style={{ margin: "0 0 0.25rem 0" }}>
                            Product: {request.productNumber}
                        </h2>
                        <p style={{ margin: "0 0 0.25rem 0", color: "var(--text-color-secondary)" }}>
                            {request.productTypeName}
                        </p>
                        <Tag
                            value={request.status}
                            severity={STATUS_SEVERITY[request.status] ?? "info"}
                            style={{ marginTop: "0.25rem" }}
                        />
                        {isUpdateRequest && (
                            <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.9rem" }}>
                                Update of{" "}
                                <a href={`/products/${encodeURIComponent(request.productToUpdate)}`}
                                    style={{ fontWeight: 600 }}
                                    onClick={(e) => { e.preventDefault(); navigate(`/products/${encodeURIComponent(request.productToUpdate)}`); }}>
                                    {request.productToUpdate}
                                </a>
                            </p>
                        )}
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <Button label="Filter" icon="pi pi-filter" className="p-button-outlined"
                            onClick={openFilterDialog} />
                        {hasApprovableValues && (
                            <Button label="Approve all" icon="pi pi-check-circle" className="p-button-outlined p-button-success"
                                onClick={handleApproveAll} />
                        )}
                        {canCancel && (
                            <Button label="Cancel" icon="pi pi-times-circle" className="p-button-outlined p-button-danger"
                                onClick={() => setShowCancelConfirm(true)} />
                        )}
                    </div>
                </div>
            </Card>

            {/* Show hidden toggle */}
            <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <InputSwitch checked={showHidden} onChange={(e: { value: boolean }) => setShowHidden(e.value)} />
                <span>Show hidden</span>
            </div>

            {/* Data Type Table */}
            <Card>
                <DataTable
                    value={visibleValues}
                    dataKey="identifier"
                    loading={loading}
                    emptyMessage="No data types visible"
                    paginator={visibleValues.length > 20}
                    rows={20}
                    rowsPerPageOptions={[20, 50, 100]}
                    onRowMouseEnter={(e: any) => {
                        if (infoTooltipPinned) return;
                        if (!canEditRow(e.data)) return;
                        setInfoTooltipPos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
                        setInfoTooltipRow(e.data);
                    }}
                    onRowMouseLeave={() => {
                        if (!infoTooltipPinned) setInfoTooltipRow(null);
                    }}
                >
                    <Column
                        header="Kind"
                        field="dataTypeKind"
                        sortable
                        body={(row: any) => (
                            <Tag value={KIND_LABELS[row.dataTypeKind] ?? row.dataTypeKind} severity="info" style={{ fontSize: "0.75rem" }} />
                        )}
                        style={{ width: "80px" }}
                    />
                    <Column
                        header="Name"
                        field="dataTypeName"
                        sortable
                        body={(row: any) => (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                                <span>
                                    {row.dataTypeName}
                                    {row.mandatory ? <span style={{ color: "var(--red-500)" }}>*</span> : null}
                                </span>
                                <i
                                    className="pi pi-question-circle"
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Show info for ${row.dataTypeName}`}
                                    style={{
                                        fontSize: "0.8rem",
                                        color: "var(--text-color-secondary)",
                                        cursor: "pointer",
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleInfoTooltip(row, e.currentTarget as HTMLElement);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            toggleInfoTooltip(row, e.currentTarget as HTMLElement);
                                        }
                                    }}
                                />
                            </span>
                        )}
                        style={{ minWidth: "120px" }}
                    />
                    <Column header="Value" body={valueBody} style={{ minWidth: "200px" }} />
                    <Column header="Last Editor" field="editorName" sortable body={editorBody} style={{ minWidth: "150px" }} />
                    <Column header="Owner" field="businessDomainName" sortable body={(row: any) => (
                        row.businessDomainName
                            ? <span>{row.businessDomainName}</span>
                            : <span style={{ fontStyle: "italic", color: "var(--text-color-secondary)" }}>—</span>
                    )} style={{ minWidth: "100px" }} />
                    <Column header="Approval" field="approvedAt" sortable body={approvalBody} style={{ minWidth: "160px" }} />
                </DataTable>
            </Card>

            {/* Data type info tooltip */}
            {infoTooltipRow && (
                <div
                    style={{
                        position: "fixed",
                        left: Math.max(8, Math.min(infoTooltipPos.x + 12, window.innerWidth - 348)),
                        top: infoTooltipPos.y + 12,
                        zIndex: 1100,
                        maxWidth: "340px",
                        background: "var(--surface-overlay)",
                        color: "var(--text-color)",
                        border: "1px solid var(--surface-border)",
                        borderRadius: "6px",
                        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.25)",
                        padding: "0.75rem",
                        fontSize: "0.85rem",
                        pointerEvents: infoTooltipPinned ? "auto" : "none",
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                        {(() => {
                            const autoDefined = infoTooltipRow.dataTypeKind === "calculated" ||
                                (isUpdateRequest && !infoTooltipRow.editableOnUpdate);
                            const nameStyle: React.CSSProperties = autoDefined
                                ? { fontWeight: 600, color: "var(--text-color-secondary)" }
                                : infoTooltipRow.mandatory
                                    ? { fontWeight: 700, color: "var(--red-500)" }
                                    : { fontWeight: 600 };
                            return <span style={nameStyle}>{infoTooltipRow.dataTypeName}</span>;
                        })()}
                        {infoTooltipPinned && (
                            <Button
                                icon="pi pi-times"
                                className="p-button-text p-button-rounded p-button-sm"
                                style={{ width: "1.25rem", height: "1.25rem", padding: 0 }}
                                aria-label="Close info"
                                onClick={hideInfoTooltip}
                            />
                        )}
                    </div>
                    {infoTooltipRow.dataTypeDescription && (
                        <div style={{ marginTop: "0.25rem", color: "var(--text-color-secondary)" }}>
                            {infoTooltipRow.dataTypeDescription}
                        </div>
                    )}
                    <div style={{ marginTop: "0.25rem" }}>
                        <span style={{ fontWeight: 600 }}>Kind: </span>
                        {KIND_LABELS_FULL[infoTooltipRow.dataTypeKind] ?? infoTooltipRow.dataTypeKind}
                    </div>
                    <div style={{ marginTop: "0.25rem" }}>
                        <span style={{ fontWeight: 600 }}>Value constraints:</span>
                        <ul style={{ margin: "0.25rem 0 0 0", paddingLeft: "1.1rem" }}>
                            {describeValueConstraints(infoTooltipRow).map((c, i) => (
                                <li key={i}>{c}</li>
                            ))}
                        </ul>
                    </div>
                    {infoTooltipRow.previousApprovalDepsMet === false && Array.isArray(infoTooltipRow.previousApprovalDepsWaiting) && infoTooltipRow.previousApprovalDepsWaiting.length > 0 && (
                        <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "var(--surface-ground)", borderRadius: "4px" }}>
                            <span style={{ fontWeight: 600, color: "var(--orange-500)" }}>
                                <i className="pi pi-clock" style={{ marginRight: "0.25rem" }} />
                                Waiting for approvals:
                            </span>
                            <ul style={{ margin: "0.15rem 0 0 0", paddingLeft: "1.1rem" }}>
                                {infoTooltipRow.previousApprovalDepsWaiting.map((name: string) => (
                                    <li key={name}>{name}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Filter Popup */}
            <Dialog
                header="Filter Data Types"
                visible={showFilter}
                onHide={() => setShowFilter(false)}
                style={{ width: "520px" }}
            >
                {/* Narrowing controls for the checkbox list */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
                    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                        <label style={{ display: "block", marginBottom: "0.15rem", fontWeight: 600, fontSize: "0.85rem" }}>Kind</label>
                        <Dropdown
                            value={filterPopupKind}
                            options={kindOptions}
                            onChange={(e) => setFilterPopupKind(e.value)}
                            placeholder="All"
                            showClear
                            style={{ width: "100%" }}
                        />
                    </div>
                    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                        <label style={{ display: "block", marginBottom: "0.15rem", fontWeight: 600, fontSize: "0.85rem" }}>Name</label>
                        <InputText
                            value={filterPopupName}
                            onChange={(e) => setFilterPopupName(e.target.value)}
                            placeholder="Search..."
                            style={{ width: "100%" }}
                        />
                    </div>
                    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                        <label style={{ display: "block", marginBottom: "0.15rem", fontWeight: 600, fontSize: "0.85rem" }}>Owner</label>
                        <Dropdown
                            value={filterPopupOwner}
                            options={uniqueOwnerNames.map((n) => ({ label: n, value: n }))}
                            onChange={(e) => setFilterPopupOwner(e.value)}
                            placeholder="All"
                            showClear
                            style={{ width: "100%" }}
                        />
                    </div>
                    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                        <label style={{ display: "block", marginBottom: "0.15rem", fontWeight: 600, fontSize: "0.85rem" }}>Approval</label>
                        <Dropdown
                            value={filterPopupApproval}
                            options={[
                                { label: "All", value: "all" },
                                { label: "Approved", value: "approved" },
                                { label: "Not Approved", value: "unapproved" },
                            ]}
                            onChange={(e) => setFilterPopupApproval(e.value)}
                            style={{ width: "100%" }}
                        />
                    </div>
                </div>

                {/* Checkbox list narrowed by the controls above */}
                <div style={{ maxHeight: "380px", overflowY: "auto", borderTop: "1px solid var(--surface-border)", paddingTop: "0.5rem" }}>
                    {(request?.values ?? []).filter((v: any) => {
                        if (v.userRoles?.length === 0) return false;
                        if (!v.showByDefault && !showHidden) return false;
                        if (filterPopupKind && v.dataTypeKind !== filterPopupKind) return false;
                        if (filterPopupName && !v.dataTypeName.toLowerCase().includes(filterPopupName.toLowerCase())) return false;
                        if (filterPopupOwner && v.businessDomainName !== filterPopupOwner) return false;
                        if (filterPopupApproval === "approved" && !v.approvedBy) return false;
                        if (filterPopupApproval === "unapproved" && v.approvedBy) return false;
                        return true;
                    }).map((v: any) => (
                        <div key={v.dataType} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.25rem 0" }}>
                            <Checkbox
                                checked={filterIds.has(v.dataType)}
                                onChange={(e) => {
                                    const next = new Set(filterIds);
                                    if (e.checked) next.add(v.dataType);
                                    else next.delete(v.dataType);
                                    setFilterIds(next);
                                }}
                            />
                            <span style={{ fontSize: "0.9rem" }}>
                                {v.dataTypeName}
                                <span style={{ color: "var(--text-color-secondary)", marginLeft: "0.35rem" }}>
                                    ({KIND_LABELS[v.dataTypeKind] ?? v.dataTypeKind})
                                </span>
                            </span>
                        </div>
                    ))}
                    {(request?.values ?? []).filter((v: any) => {
                        if (v.userRoles?.length === 0) return false;
                        if (!v.showByDefault && !showHidden) return false;
                        if (filterPopupKind && v.dataTypeKind !== filterPopupKind) return false;
                        if (filterPopupName && !v.dataTypeName.toLowerCase().includes(filterPopupName.toLowerCase())) return false;
                        if (filterPopupOwner && v.businessDomainName !== filterPopupOwner) return false;
                        if (filterPopupApproval === "approved" && !v.approvedBy) return false;
                        if (filterPopupApproval === "unapproved" && v.approvedBy) return false;
                        return true;
                    }).length === 0 && (
                        <p style={{ textAlign: "center", color: "var(--text-color-secondary)", padding: "1rem" }}>
                            No data types match the filter criteria.
                        </p>
                    )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                    <Button label="Clear Filter" icon="pi pi-filter-slash" className="p-button-outlined"
                        onClick={handleFilterClear} />
                    <Button label="Apply" icon="pi pi-check" onClick={handleFilterApply} />
                </div>
            </Dialog>

            {/* Cancel Confirmation Dialog */}
            <Dialog
                header="Cancel Product Request"
                visible={showCancelConfirm}
                onHide={() => setShowCancelConfirm(false)}
                style={{ width: "400px" }}
            >
                <p>Are you sure you want to cancel this product request?</p>
                <p style={{ color: "var(--text-color-secondary)", fontSize: "0.9rem" }}>
                    This action cannot be undone.
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                    <Button label="No, keep it" icon="pi pi-times" className="p-button-outlined"
                        onClick={() => setShowCancelConfirm(false)} />
                    <Button label="Yes, cancel" icon="pi pi-check" className="p-button-danger"
                        onClick={() => { setShowCancelConfirm(false); handleCancel(); }} />
                </div>
            </Dialog>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Inline Edit Field – single-component approach (no view/edit toggle)
// ---------------------------------------------------------------------------

interface InlineEditFieldProps {
    value: unknown;
    type: "text" | "number" | "textarea" | "dropdown" | "multiselect" | "switch" | "tristate";
    config?: Record<string, unknown>;
    onSave: (value: unknown) => void;
    options?: DropdownOption[];
    dataTypeId: string;
    activeEditField: string | null;
    onActivate: (dataTypeId: string) => void;
    onDeactivate: () => void;
    kind?: string;
}

function InlineEditField({
    value,
    type,
    config,
    onSave,
    options,
    dataTypeId,
    activeEditField,
    onActivate,
    onDeactivate,
    kind,
}: InlineEditFieldProps) {
    const [editValue, setEditValue] = useState<any>(value);
    const [saving, setSaving] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const isActive = activeEditField === dataTypeId;
    const prevActiveRef = useRef(isActive);
    const origValueRef = useRef(value);
    const savingRef = useRef(false); // guard against double-save on blur

    // Sync editValue when external value changes (e.g. from pubsub refresh)
    useEffect(() => {
        origValueRef.current = value;
        if (!isActive) {
            setEditValue(value);
            setValidationError(null);
        }
    }, [value, isActive]);

    const hasChanged = isActive && JSON.stringify(editValue) !== JSON.stringify(origValueRef.current);

    // --- Client-side validation (Task 2: allow "-" as intermediate numeric input) ---
    const validate = useCallback(
        (val: any): string | null => {
            if (type === "number") {
                if (val === null || val === undefined || val === "") return null;
                const str = String(val);
                // A lone minus sign is a valid intermediate state while user is typing a negative number
                if (str === "-") return null;
                const num = Number(str);
                if (isNaN(num)) return "Invalid number";
                const min = config?.min as number | undefined;
                const max = config?.max as number | undefined;
                if (min !== undefined && num < min) {
                    return `Value must be at least ${min}`;
                }
                if (max !== undefined && num > max) {
                    return `Value must be at most ${max}`;
                }
                const decimals = config?.decimals as number | undefined;
                if (decimals !== undefined) {
                    const factor = Math.pow(10, decimals);
                    if (Math.round(num * factor) / factor !== num) {
                        return `Value must have at most ${decimals} decimal places`;
                    }
                }
            }
            if (type === "text" || type === "textarea") {
                const str = (val ?? "") as string;
                const min = config?.min as number | undefined;
                const max = config?.max as number | undefined;
                if (min !== undefined && str.length < min) {
                    return `Must be at least ${min} characters`;
                }
                if (max !== undefined && str.length > max) {
                    return `Must be at most ${max} characters`;
                }
            }
            return null;
        },
        [type, config],
    );

    // Re-validate whenever editValue changes while active
    useEffect(() => {
        if (isActive) {
            setValidationError(validate(editValue));
        }
    }, [editValue, isActive, validate]);

    // --- Auto-save / revert on deactivation (Task 4) ---
    useEffect(() => {
        const wasActive = prevActiveRef.current;
        prevActiveRef.current = isActive;

        if (wasActive && !isActive) {
            if (savingRef.current) {
                // An explicit save is in flight; just reset local state
                setEditValue(origValueRef.current);
                setValidationError(null);
                savingRef.current = false;
            } else {
                const changed = JSON.stringify(editValue) !== JSON.stringify(origValueRef.current);
                if (changed && !validationError) {
                    // Auto-save before switching to another field
                    void performSave(editValue);
                } else if (changed) {
                    // Revert invalid changes
                    setEditValue(origValueRef.current);
                    setValidationError(null);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive]);

    // Tracks whether a save was requested via explicit button click (set
    // synchronously on mousedown so handleBlur can see it before the save
    // promise runs).
    const explicitSaveRequestedRef = useRef(false);

    // --- Persist helpers ---
    const performSave = useCallback(
        async (val: unknown) => {
            setSaving(true);
            savingRef.current = true;
            try {
                let parsed: unknown = val;
                if (type === "number") {
                    const str = val === null || val === undefined ? "" : String(val);
                    if (str === "" || str === "-") {
                        parsed = null;
                    } else {
                        parsed = Number(str);
                        if (isNaN(parsed as number)) return; // should not happen with validation
                    }
                }
                if (type === "switch") {
                    parsed = val === true;
                }
                await onSave(parsed);
                // Sync local state to the value we just persisted so that
                // hasChanged correctly becomes false after save and we avoid
                // a type-mismatch false-positive (e.g. string "5" vs number 5).
                setEditValue(parsed);
                origValueRef.current = parsed;
            } catch (_) {
                // Error handled by parent toast
            } finally {
                setSaving(false);
                savingRef.current = false;
                explicitSaveRequestedRef.current = false;
            }
        },
        [type, onSave],
    );

    const handleSave = useCallback(() => {
        const err = validate(editValue);
        if (err) {
            setValidationError(err);
            return;
        }
        void performSave(editValue);
    }, [editValue, validate, performSave]);

    /** Set on mousedown so handleBlur can see the intent before click fires. */
    const handleSaveMouseDown = useCallback(() => {
        // Only set flag when Save button is not disabled (no validation error).
        // If the button is disabled the click handler won't fire, leaving the
        // flag stuck at true and preventing any future blur-based deactivation.
        if (!validationError) {
            explicitSaveRequestedRef.current = true;
        }
    }, [validationError]);

    const handleCancel = useCallback(() => {
        setEditValue(origValueRef.current);
        setValidationError(null);
    }, []);

    const handleClear = useCallback(async () => {
        setSaving(true);
        savingRef.current = true;
        try {
            await onSave(null);
            setEditValue(null);
            setValidationError(null);
        } catch (_) {
            // Error handled by parent toast
        } finally {
            setSaving(false);
            savingRef.current = false;
        }
    }, [onSave]);

    // --- Focus / blur handlers for active-field tracking (Task 4) ---
    const handleFocus = useCallback(() => {
        if (!isActive) onActivate(dataTypeId);
    }, [isActive, onActivate, dataTypeId]);

    const handleBlur = useCallback(() => {
        // Do not deactivate when a save is already in flight.
        if (savingRef.current) return;
        // Clear any stale explicit-save flag that may have been left by a
        // mousedown on a disabled Save button.  Once the flag is cleared the
        // normal deactivation path (auto-save or revert) takes over.
        explicitSaveRequestedRef.current = false;
        // Deactivate so another field can become active; auto-save/revert is
        // handled by the deactivation useEffect above.
        onDeactivate();
    }, [onDeactivate]);

    // ====================================================================
    // Task 3: Single-component render (no view/edit toggle)
    // ====================================================================

    // --- Tri-state boolean: clickable chip that cycles true → false → null → true ---
    if (type === "tristate") {
        const nextTristate = (current: unknown) => {
            if (current === true) return false;
            if (current === false) return null;
            return true;
        };
        const label = value === true ? "true" : value === false ? "false" : "—";
        const severity: "success" | "danger" | "warning" =
            value === true ? "success" : value === false ? "danger" : "warning";
        return (
            <Tag
                value={label}
                severity={severity}
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={async () => {
                    const next = nextTristate(value);
                    if (savingRef.current) return;
                    savingRef.current = true;
                    try {
                        await onSave(next);
                    } catch (_) {
                        // Error handled by parent toast
                    } finally {
                        savingRef.current = false;
                    }
                }}
            />
        );
    }

    // --- Switch boolean: InputSwitch with immediate save ---
    if (type === "switch") {
        return (
            <InputSwitch
                checked={value === true}
                onChange={async (e: { value: boolean }) => {
                    if (savingRef.current) return;
                    savingRef.current = true;
                    try {
                        await onSave(e.value);
                    } catch (_) {
                        // Error handled by parent toast
                    } finally {
                        savingRef.current = false;
                    }
                }}
            />
        );
    }

    // --- Dropdown: immediate save on selection ---
    if (type === "dropdown") {
        return (
            <Dropdown
                value={value}
                options={options ?? []}
                onChange={async (e) => {
                    if (savingRef.current) return;
                    savingRef.current = true;
                    // PrimeReact may emit the full option object or just the
                    // value field. If e.value is an object (has a "value"
                    // property), extract it; otherwise use as-is.
                    const selectedValue = (e.value != null && typeof e.value === "object" && "value" in e.value)
                        ? (e.value as any).value
                        : e.value;
                    try {
                        await onSave(selectedValue);
                    } catch (_) {
                        // Error handled by parent toast
                    } finally {
                        savingRef.current = false;
                    }
                }}
                filter
                placeholder="Select..."
                style={{ minWidth: "180px" }}
            />
        );
    }

    // --- MultiSelect: immediate save on selection ---
    if (type === "multiselect") {
        const safeValue: unknown[] = Array.isArray(value) ? value : (value != null ? [value] : []);
        return (
            <MultiSelect
                value={safeValue}
                options={options ?? []}
                onChange={async (e) => {
                    if (savingRef.current) return;
                    savingRef.current = true;
                    try {
                        await onSave(e.value);
                    } catch (_) {
                        // Error handled by parent toast
                    } finally {
                        savingRef.current = false;
                    }
                }}
                filter
                placeholder="Select..."
                style={{ minWidth: "200px" }}
            />
        );
    }

    // --- Text / Number / Textarea: direct input with save/undo/clear on change ---
    const renderInput = () => {
        switch (type) {
            case "textarea":
                return (
                    <InputTextarea
                        value={(editValue ?? "") as string}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={3}
                        maxLength={config?.max as number | undefined}
                        style={{ minWidth: "180px" }}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                    />
                );
            case "number":
                return (
                    <InputText
                        value={editValue != null ? String(editValue) : ""}
                        onChange={(e) => setEditValue(e.target.value)}
                        style={{ minWidth: "120px" }}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                    />
                );
            case "text":
                return (
                    <InputText
                        value={(editValue ?? "") as string}
                        onChange={(e) => setEditValue(e.target.value)}
                        maxLength={config?.max as number | undefined}
                        style={{ minWidth: "150px" }}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                    />
                );
            default:
                return null;
        }
    };

    const valueIsNullish = editValue == null || editValue === "";

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {renderInput()}
                {isActive && (
                    <>
                        <Button
                            icon="pi pi-check"
                            className="p-button-text p-button-sm p-button-success"
                            onMouseDown={handleSaveMouseDown}
                            onClick={handleSave}
                            loading={saving}
                            disabled={!hasChanged || !!validationError}
                            tooltip="Save"
                        />
                        <Button
                            icon="pi pi-undo"
                            className="p-button-text p-button-sm"
                            onClick={handleCancel}
                            disabled={!hasChanged}
                            tooltip="Restore"
                        />
                    </>
                )}
                <Button
                    icon="pi pi-times"
                    className="p-button-text p-button-sm p-button-danger"
                    onClick={handleClear}
                    loading={saving}
                    tooltip="Clear"
                    disabled={valueIsNullish && value == null}
                />
            </div>
            {validationError && (
                <small style={{ color: "var(--red-500)", display: "block", marginTop: "0.25rem" }}>
                    {validationError}
                </small>
            )}
        </div>
    );
}
