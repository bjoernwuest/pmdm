import type { PageMeta } from "@/types/PageType.ts";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import { FP_VIEW_PRODUCTS, FP_CREATE_PRODUCT } from "@/ui/auth/functional_permissions.ts";
import {
    getProductRequests,
    createProductRequest,
    type ProductRequestListResponse,
} from "@/ui/api/ProductRequests.ts";
import { getProductTypes } from "@/ui/api/ProductTypes.ts";
import {
    message_CreateProductRequest,
    message_CancelProductRequest,
    message_ImportingProductRequest,
} from "@/types/ProductRequestType.ts";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { Dropdown } from "primereact/dropdown";
import { MultiSelect } from "primereact/multiselect";
import { InputText } from "primereact/inputtext";
import { Dialog } from "primereact/dialog";
import { Toast } from "primereact/toast";
import { useNavigate } from "react-router-dom";
import type { PubSubMessage } from "@/types/PubSubType.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";
import { apiGet } from "@/ui/api";

export const meta: PageMeta = {
    id: "open-product-requests",
    urn: "urn:bun-starter:ui:page:open-product-requests",
    path: "/product-requests",
    title: "Open requests",
    description: "View and manage open product requests.",
    menu: {
        section: "General",
        order: 5,
        label: "Open requests",
    },
    requiredFunctionalPermissions: [FP_VIEW_PRODUCTS.functionalPermissionName],
};

type ViewerContext = { permissionNames: string[] };

// Status options for multi-select filter
const STATUS_OPTIONS = [
    { label: "Open", value: "open" },
    { label: "Importing", value: "importing" },
    { label: "Done", value: "done" },
    { label: "Cancelled", value: "cancelled" },
];

// Action filter options
const ACTION_OPTIONS = [
    { label: "Provide value OR Approve value", value: "provide_or_approve" },
    { label: "Provide value", value: "provide_value" },
    { label: "Approve value", value: "approve_value" },
    { label: "All", value: "all" },
];

// Status tag severity mapping
const STATUS_SEVERITY: Record<string, "info" | "warning" | "success" | "danger"> = {
    open: "info",
    importing: "warning",
    done: "success",
    cancelled: "danger",
};

export function Component() {
    const navigate = useNavigate();
    const toast = useRef<Toast>(null);

    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });

    useEffect(() => {
        let cancelled = false;
        void apiGet<ViewerContext>("/api/me/context").then((payload) => {
            if (!cancelled) setViewerContext(payload);
        }).catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, []);

    // Data state
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ProductRequestListResponse | null>(null);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);

    // Filter state
    const [filterStatus, setFilterStatus] = useState<string[]>(["open"]);
    const [filterProductType, setFilterProductType] = useState<string | null>(null);
    const [filterProductNumber, setFilterProductNumber] = useState("");
    const [filterAction, setFilterAction] = useState<string>("provide_or_approve");

    // Product types for filter and create dialog
    const [productTypes, setProductTypes] = useState<Array<{ identifier: string; name: string; description: string | null }>>([]);

    // Create dialog state
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [createProductType, setCreateProductType] = useState<string | null>(null);
    const [createProductNumber, setCreateProductNumber] = useState("");
    const [creating, setCreating] = useState(false);

    const selectedProductType = productTypes.find(pt => pt.identifier === createProductType);

    // Fetch product requests
    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getProductRequests(page, pageSize, {
                status: filterStatus.length > 0 ? filterStatus : undefined,
                productTypeIdentifier: filterProductType ?? undefined,
                productNumberContains: filterProductNumber || undefined,
                actionFilter: filterAction !== "all"
                    ? (filterAction as "provide_or_approve" | "provide_value" | "approve_value")
                    : undefined,
            });
            setData(result);
            if (result.availablePageSizes.length > 0 && !result.availablePageSizes.includes(pageSize)) {
                setPageSize(result.availablePageSizes[0]!);
                setPage(0);
            }
        } catch (e: any) {
            toast.current?.show({ severity: "error", summary: "Error", detail: e.message, life: 5000 });
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, filterStatus, filterProductType, filterProductNumber, filterAction]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    // Load product types for dropdowns
    useEffect(() => {
        void (async () => {
            try {
                const types = await getProductTypes(0, 1000, true);
                setProductTypes(types.productTypes.map((pt: any) => ({
                    identifier: pt.identifier,
                    name: pt.name,
                    description: pt.description,
                })));
            } catch (_) { /* ignore */ }
        })();
    }, []);

    // PubSub subscriptions
    useEffect(() => {
        const sub1 = subscribe({ and: message_CreateProductRequest }, (_msg: PubSubMessage) => { fetchRequests(); });
        const sub2 = subscribe({ and: message_CancelProductRequest }, (_msg: PubSubMessage) => { fetchRequests(); });
        const sub3 = subscribe({ and: message_ImportingProductRequest }, (_msg: PubSubMessage) => { fetchRequests(); });
        return () => {
            if (sub1) unsubscribe(sub1);
            if (sub2) unsubscribe(sub2);
            if (sub3) unsubscribe(sub3);
        };
    }, [fetchRequests]);

    // Create handler
    const handleCreate = useCallback(async () => {
        if (!createProductType) return;
        setCreating(true);
        try {
            const result = await createProductRequest({
                mode: "new",
                productTypeIdentifier: createProductType,
                productNumber: createProductNumber || undefined,
            });
            setShowCreateDialog(false);
            setCreateProductType(null);
            setCreateProductNumber("");
            navigate(`/product-requests/${result.productRequestId}`);
        } catch (e: any) {
            // Handle conflict: product number already exists
            if (e.message?.includes("already exists") || e.status === 409) {
                const msg = typeof e === "object" ? (e.message || JSON.stringify(e)) : String(e);
                toast.current?.show({
                    severity: "error",
                    summary: "Product number already exists",
                    detail: msg,
                    life: 5000,
                });
                // Navigate to existing product
                if (createProductNumber) {
                    navigate(`/products/${encodeURIComponent(createProductNumber)}`);
                }
            } else {
                toast.current?.show({ severity: "error", summary: "Error", detail: e.message || String(e), life: 5000 });
            }
        } finally {
            setCreating(false);
        }
    }, [createProductType, createProductNumber, navigate]);

    // Column templates
    const statusBody = (row: any) => (
        <Tag
            value={row.status}
            severity={STATUS_SEVERITY[row.status] ?? "info"}
        />
    );

    const actionBody = (row: any) => {
        // No action possible once a request leaves "open" status
        if (row.status !== "open") return <span>—</span>;

        const summary = row.actionableSummary;
        if (!summary) return <span>—</span>;

        const parts: string[] = [];
        if (summary.needsValue) parts.push("Provide value");
        if (summary.needsApproval) parts.push("Approve value");

        if (parts.length === 0) return <span style={{ color: "var(--text-color-secondary)" }}>—</span>;
        return (
            <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                {parts.map((p) => (
                    <Tag key={p} value={p} severity="warning" style={{ fontSize: "0.75rem" }} />
                ))}
            </div>
        );
    };

    const productTypeOptions = [
        { label: "All", value: "" },
        ...productTypes.map((pt) => ({ label: pt.name, value: pt.identifier })),
    ];

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <Toast ref={toast} />

            {/* Header */}
            <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem",
            }}>
                <h2 style={{ margin: 0 }}>Open requests</h2>
                {viewerContext.permissionNames.includes(FP_CREATE_PRODUCT.functionalPermissionName) && (
                    <Button
                        label="Create new product"
                        icon="pi pi-plus"
                        onClick={() => setShowCreateDialog(true)}
                    />
                )}
            </div>

            {/* Filter Bar */}
            <div style={{
                display: "flex", gap: "0.75rem", marginBottom: "1rem",
                flexWrap: "wrap", alignItems: "center",
            }}>
                {/* Action filter */}
                <div style={{ minWidth: "220px" }}>
                    <Dropdown
                        value={filterAction}
                        options={ACTION_OPTIONS}
                        onChange={(e) => { setFilterAction(e.value); setPage(0); }}
                        placeholder="Action for you"
                    />
                </div>

                {/* Status filter */}
                <div style={{ minWidth: "200px" }}>
                    <MultiSelect
                        value={filterStatus}
                        options={STATUS_OPTIONS}
                        onChange={(e) => { setFilterStatus(e.value ?? []); setPage(0); }}
                        placeholder="Status"
                        display="chip"
                    />
                </div>

                {/* Product Type filter */}
                <div style={{ minWidth: "180px" }}>
                    <Dropdown
                        value={filterProductType}
                        options={productTypeOptions}
                        onChange={(e) => { setFilterProductType(e.value || null); setPage(0); }}
                        placeholder="Product Type"
                    />
                </div>

                {/* Product Number search */}
                <div style={{ minWidth: "180px" }}>
                    <span className="p-input-icon-left" style={{ width: "100%" }}>
                        <i className="pi pi-search" />
                        <InputText
                            value={filterProductNumber}
                            onChange={(e) => {
                                setFilterProductNumber(e.target.value);
                                // Debounce handled by the lazy loading on page change
                                // For immediate effect, we re-fetch after a short delay
                            }}
                            placeholder="Product #"
                            style={{ width: "100%", paddingLeft: "2rem" }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") { setPage(0); fetchRequests(); }
                            }}
                        />
                    </span>
                </div>
            </div>

            {/* Data Table */}
            <DataTable
                value={data?.requests ?? []}
                loading={loading}
                paginator
                rows={pageSize}
                totalRecords={data?.total ?? 0}
                lazy
                first={page * pageSize}
                onPage={(e) => { setPage(e.page ?? 0); setPageSize(e.rows ?? pageSize); }}
                rowsPerPageOptions={data?.availablePageSizes ?? [10, 20, 50, 100]}
                onRowClick={(e) => navigate(`/product-requests/${encodeURIComponent(e.data.identifier)}`)}
                rowHover
                emptyMessage="No product requests found"
                style={{ cursor: "pointer" }}
            >
                <Column field="productNumber" header="Product #" sortable />
                <Column field="productTypeName" header="Product Type" sortable />
                <Column field="status" header="Status" body={statusBody} sortable />
                <Column header="Action for you" body={actionBody} />
                <Column field="createdByName" header="Created By" sortable />
            </DataTable>

            {/* Create New Product Dialog */}
            <Dialog
                header="Create New Product Request"
                visible={showCreateDialog}
                onHide={() => {
                    setShowCreateDialog(false);
                    setCreateProductType(null);
                    setCreateProductNumber("");
                }}
                style={{ width: "450px" }}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div>
                        <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
                            Product Type
                        </label>
                        <Dropdown
                            value={createProductType}
                            options={productTypes.map((pt) => ({ label: pt.name, value: pt.identifier }))}
                            onChange={(e) => setCreateProductType(e.value)}
                            placeholder="Select a product type"
                            filter
                            style={{ width: "100%" }}
                        />
                    </div>
                    {selectedProductType?.description && (
                        <small style={{ display: "block", color: "var(--text-color-secondary)", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
                            {selectedProductType.description}
                        </small>
                    )}
                    <div>
                        <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
                            Product Number
                        </label>
                        <InputText
                            value={createProductNumber}
                            onChange={(e) => setCreateProductNumber(e.target.value)}
                            placeholder="Auto-generated if empty"
                            style={{ width: "100%" }}
                        />
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <Button
                            label="Cancel"
                            icon="pi pi-times"
                            className="p-button-outlined"
                            onClick={() => {
                                setShowCreateDialog(false);
                                setCreateProductType(null);
                                setCreateProductNumber("");
                            }}
                        />
                        <Button
                            label="Create"
                            icon="pi pi-plus"
                            onClick={handleCreate}
                            disabled={!createProductType || creating}
                            loading={creating}
                        />
                    </div>
                </div>
            </Dialog>
        </PageTemplate>
    );
}
