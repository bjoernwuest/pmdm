import type { PageMeta } from "@/types/PageType.ts";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import {
    FP_VIEW_PRODUCTS,
    FP_REQUEST_PRODUCT_UPDATE,
    FP_CREATE_PRODUCT_COPY,
    FP_CREATE_PRODUCT,
    FP_READ_PRODUCT_FILTER,
} from "@/ui/auth/functional_permissions.ts";
import {
    getProducts,
    importProducts,
    exportProductTemplate,
    requestProductUpdate,
    copyProduct,
    type ProductListResponse,
    type FilterPayload,
} from "@/ui/api/Products.ts";
import { findOpenRequestForProduct } from "@/ui/api/ProductRequests.ts";
import { getProductTypes, getProductTypeDataTypes } from "@/ui/api/ProductTypes.ts";
import { getLookupValues } from "@/ui/api/Lookups.ts";
import { getConsumableValues } from "@/ui/api/Consumables.ts";
import { message_CreateProduct, message_UpdateProduct, message_DisableProduct } from "@/types/ProductType.ts";
import type { PubSubMessage } from "@/types/PubSubType.ts";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { useNavigate } from "react-router-dom";
import { Toast } from "primereact/toast";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import QueryBuilder, {
    type QueryBuilderTree,
    type DataTypeMeta,
    type FilterPayload as QBFilterPayload,
} from "@/ui/components/QueryBuilder.tsx";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";
import { apiGet } from "@/ui/api";

export const meta: PageMeta = {
    id: "products",
    urn: "urn:bun-starter:ui:page:products",
    path: "/products",
    title: "Products",
    description: "View and manage products.",
    menu: {
        section: "General",
        order: 10,
        label: "Products",
    },
    requiredFunctionalPermissions: [FP_VIEW_PRODUCTS.functionalPermissionName],
};

const COOKIE_NAME = "pmdm_product_filter";

function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()\[\]\\\/+^])/g, "\\$1")}=([^;]*)`));
    return match ? decodeURIComponent(match[1]!) : null;
}

function setCookie(name: string, value: string, days: number = 30): void {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string): void {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

type ViewerContext = { permissionNames: string[] };

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
    const [data, setData] = useState<ProductListResponse | null>(null);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);

    // Filter state
    const [showFilter, setShowFilter] = useState(false);
    const [filterPayload, setFilterPayload] = useState<FilterPayload | null>(null);
    const [filterTree, setFilterTree] = useState<QueryBuilderTree | null>(null);
    const [dataTypes, setDataTypes] = useState<DataTypeMeta[]>([]);
    const [lookupOptions, setLookupOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});

    // Import state
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [productTypes, setProductTypes] = useState<Array<{ identifier: string; name: string }>>([]);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importResult, setImportResult] = useState<{ created: number; errors: any[] } | null>(null);

    // Export template state
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [exportTypeId, setExportTypeId] = useState<string | null>(null);

    // Copy dialog
    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [copyTargetProductNumber, setCopyTargetProductNumber] = useState("");
    const [copySourceProductNumber, setCopySourceProductNumber] = useState<string | null>(null);
    const [copying, setCopying] = useState(false);

    // Load cookie on mount
    useEffect(() => {
        const cookie = getCookie(COOKIE_NAME);
        if (cookie) {
            try {
                const parsed = JSON.parse(cookie);
                if (parsed.payload) setFilterPayload(parsed.payload);
                if (parsed.tree) setFilterTree(parsed.tree);
            } catch (_) { /* ignore */ }
        }
    }, []);

    // Fetch products
    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const response = await getProducts(page, pageSize, false, filterPayload ?? undefined);
            setData(response);
        } catch (e: any) {
            toast.current?.show({ severity: "error", summary: "Error", detail: e.message, life: 5000 });
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, filterPayload]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    // Subscribe to PubSub
    useEffect(() => {
        const sub1 = subscribe({ and: message_CreateProduct }, (_msg: PubSubMessage) => { fetchProducts(); });
        const sub2 = subscribe({ and: message_UpdateProduct }, (_msg: PubSubMessage) => { fetchProducts(); });
        const sub3 = subscribe({ and: message_DisableProduct }, (_msg: PubSubMessage) => { fetchProducts(); });
        return () => {
            if (sub1) unsubscribe(sub1);
            if (sub2) unsubscribe(sub2);
            if (sub3) unsubscribe(sub3);
        };
    }, [fetchProducts]);

    // Load ProductTypes for export/import dialogs
    useEffect(() => {
        void (async () => {
            try {
                const types = await getProductTypes(0, 1000, true);
                setProductTypes(types.productTypes.map((pt: any) => ({ identifier: pt.identifier, name: pt.name })));
            } catch (_) { /* ignore */ }
        })();
    }, []);

    // Load DataTypes for QueryBuilder
    const loadDataTypes = useCallback(async () => {
        try {
            const pts = await getProductTypes(0, 1000, false);
            const allDataTypes: DataTypeMeta[] = [];
            for (const pt of pts.productTypes) {
                try {
                    const assignments = await getProductTypeDataTypes(pt.identifier as string, 0, 1000);
                    for (const a of assignments.dataTypeAssignments) {
                        allDataTypes.push({
                            identifier: a.dataType!,
                            name: a.dataTypeName!,
                            kind: a.dataTypeKind!,
                            lookupTypeIdentifier: (a.dataTypeKind === "lookup" || a.dataTypeKind === "consumable") ? ((a.dataTypeConfig as { source?: string } | null)?.source ?? null) : null,
                        });
                    }
                } catch (_) { /* ignore */ }
            }
            setDataTypes(allDataTypes);
        } catch (_) { /* ignore */ }
    }, []);

    // Load values for rule builder dropdowns (lookup, consumable, product references)
    const handleEnsureLookup = useCallback(async (refIdentifier: string, kind?: string) => {
        if (lookupOptions[refIdentifier]) return; // already loaded
        try {
            if (kind === "product") {
                const response = await getProducts(0, 10000, false);
                const options = (response.products ?? []).map((p: any) => ({
                    label: p.productNumber,
                    value: p.productNumber,
                }));
                setLookupOptions((prev) => ({ ...prev, [refIdentifier]: options }));
            } else if (kind === "consumable") {
                const response = await getConsumableValues(refIdentifier, 0, 1000, true, true);
                const options = response.values.map((v: any) => ({
                    label: v.name ?? v.value ?? v.identifier,
                    value: v.name ?? v.value ?? v.identifier,
                }));
                setLookupOptions((prev) => ({ ...prev, [refIdentifier]: options }));
            } else {
                const response = await getLookupValues(refIdentifier, 0, 1000, true);
                const options = response.values.map((v: any) => ({
                    label: v.name ?? v.value ?? v.identifier,
                    value: v.name ?? v.value ?? v.identifier,
                }));
                setLookupOptions((prev) => ({ ...prev, [refIdentifier]: options }));
            }
        } catch (_) { /* ignore */ }
    }, [lookupOptions]);

    useEffect(() => {
        if (showFilter) loadDataTypes();
    }, [showFilter, loadDataTypes]);

    // Filter handlers
    const handleApplyFilter = useCallback((payload: QBFilterPayload | null, tree: QueryBuilderTree | null) => {
        if (payload) {
            setFilterPayload(payload as FilterPayload);
            setFilterTree(tree);
            setCookie(COOKIE_NAME, JSON.stringify({ payload, tree }));
            setPage(0);
        } else {
            setFilterPayload(null);
            setFilterTree(null);
            deleteCookie(COOKIE_NAME);
        }
    }, []);

    const handleClearFilter = useCallback(() => {
        setFilterPayload(null);
        setFilterTree(null);
        deleteCookie(COOKIE_NAME);
        setPage(0);
    }, []);

    // Import handler
    const handleImport = useCallback(async () => {
        if (!importFile) return;
        try {
            const result = await importProducts(importFile);
            setImportResult(result);
            if (result.created > 0) {
                toast.current?.show({ severity: "success", summary: "Import complete", detail: `Created ${result.created} products`, life: 5000 });
            }
            if (result.errors.length > 0) {
                toast.current?.show({ severity: "warn", summary: "Import warnings", detail: `${result.errors.length} rows had errors`, life: 8000 });
            }
            fetchProducts();
        } catch (e: any) {
            toast.current?.show({ severity: "error", summary: "Import error", detail: e.message, life: 5000 });
        }
    }, [importFile, fetchProducts]);

    // Export template handler
    const handleExportTemplate = useCallback(async () => {
        if (!exportTypeId) return;
        try {
            await exportProductTemplate(exportTypeId);
            setShowExportDialog(false);
            setExportTypeId(null);
        } catch (e: any) {
            toast.current?.show({ severity: "error", summary: "Export error", detail: e.message, life: 5000 });
        }
    }, [exportTypeId]);

    // Action handlers
    const handleRequestUpdate = useCallback(async (productNumber: string) => {
        try {
            // Step 1: Check if an open request already exists for this product
            const existingRequestId = await findOpenRequestForProduct(productNumber);
            if (existingRequestId) {
                navigate(`/product-requests/${existingRequestId}`);
                toast.current?.show({
                    severity: "info",
                    summary: "Existing request found",
                    detail: "An open request already exists for this product.",
                    life: 3000,
                });
                return;
            }

            // Step 2: No existing request — create one
            const result = await requestProductUpdate(productNumber);
            toast.current?.show({
                severity: "success",
                summary: "Request created",
                detail: "Product update request has been created.",
                life: 3000,
            });
            navigate(`/product-requests/${result.productRequestId}`);
        } catch (e: any) {
            toast.current?.show({ severity: "error", summary: "Error", detail: e.message, life: 5000 });
        }
    }, [navigate]);

    const handleCopy = useCallback((productNumber: string) => {
        setCopySourceProductNumber(productNumber);
        setCopyTargetProductNumber("");
        setShowCopyDialog(true);
    }, []);

    const handleCopyConfirm = useCallback(async () => {
        if (!copySourceProductNumber) return;
        setCopying(true);
        try {
            const result = await copyProduct(
                copySourceProductNumber,
                copyTargetProductNumber.trim() || undefined,
            );
            setShowCopyDialog(false);
            setCopySourceProductNumber(null);
            setCopyTargetProductNumber("");
            toast.current?.show({
                severity: "success",
                summary: "Copy request created",
                detail: "Product copy request has been created.",
                life: 3000,
            });
            navigate(`/product-requests/${result.productRequestId}`);
        } catch (e: any) {
            if (e.message?.includes("already exists") || e.status === 409) {
                toast.current?.show({
                    severity: "error",
                    summary: "Product number already exists",
                    detail: e.message,
                    life: 5000,
                });
                if (copyTargetProductNumber) {
                    navigate(`/products/${encodeURIComponent(copyTargetProductNumber)}`);
                }
            } else {
                toast.current?.show({ severity: "error", summary: "Error", detail: e.message, life: 5000 });
            }
        } finally {
            setCopying(false);
        }
    }, [copySourceProductNumber, copyTargetProductNumber, navigate]);

    // Templates
    const disabledBody = (row: any) => (
        <Tag value={row.disabled ? "Disabled" : "Active"} severity={row.disabled ? "danger" : "success"} />
    );

    const updatedAtBody = (row: any) => {
        const d = new Date(row.updatedAt);
        return <span>{d.toISOString()}</span>;
    };

    const actionsBody = (row: any) => (
        <div style={{ display: "flex", gap: "0.25rem" }}>
            {viewerContext.permissionNames.includes(FP_REQUEST_PRODUCT_UPDATE.functionalPermissionName) && (
                <Button icon="pi pi-sync" className="p-button-text p-button-sm" tooltip="Request Update" onClick={(e) => { e.stopPropagation(); handleRequestUpdate(row.productNumber); }} />
            )}
            {viewerContext.permissionNames.includes(FP_CREATE_PRODUCT_COPY.functionalPermissionName) && (
                <Button icon="pi pi-copy" className="p-button-text p-button-sm" tooltip="Create Copy" onClick={(e) => { e.stopPropagation(); handleCopy(row.productNumber); }} />
            )}
        </div>
    );

    const hasFilter = filterPayload !== null;

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <Toast ref={toast} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ margin: 0 }}>Products</h2>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    {viewerContext.permissionNames.includes(FP_READ_PRODUCT_FILTER.functionalPermissionName) && (
                        <Button label="Filter" icon="pi pi-filter" className="p-button-outlined" onClick={() => setShowFilter(true)} />
                    )}
                    {viewerContext.permissionNames.includes(FP_READ_PRODUCT_FILTER.functionalPermissionName) && hasFilter && (
                        <Button label="Clear Filter" icon="pi pi-times" className="p-button-outlined p-button-danger" onClick={handleClearFilter} />
                    )}
                    <Button label="Export Template" icon="pi pi-download" className="p-button-outlined"
                        onClick={() => { setExportTypeId(null); setShowExportDialog(true); }} />
                    {viewerContext.permissionNames.includes(FP_CREATE_PRODUCT.functionalPermissionName) && (
                        <Button label="Import" icon="pi pi-upload" className="p-button-outlined" onClick={() => setShowImportDialog(true)} />
                    )}
                </div>
            </div>

            <DataTable
                value={data?.products ?? []}
                loading={loading}
                paginator
                rows={pageSize}
                totalRecords={data?.total ?? 0}
                lazy
                first={page * pageSize}
                onPage={(e) => { setPage(e.page ?? 0); setPageSize(e.rows ?? 20); }}
                rowsPerPageOptions={data?.availablePageSizes ?? [10, 20, 50, 100]}
                onRowClick={(e) => navigate(`/products/${encodeURIComponent(e.data.productNumber)}`)}
                rowHover
                emptyMessage="No products found"
                style={{ cursor: "pointer" }}
            >
                <Column field="productNumber" header="Product #" sortable />
                <Column field="productTypeName" header="Product Type" sortable />
                <Column field="updatedAt" header="Updated At" body={updatedAtBody} sortable />
                <Column field="disabled" header="Disabled" body={disabledBody} sortable />
                <Column header="Actions" body={actionsBody} style={{ width: "100px" }} />
            </DataTable>

            {/* Filter Modal */}
            <QueryBuilder
                visible={showFilter}
                onHide={() => setShowFilter(false)}
                dataTypes={dataTypes}
                productTypes={productTypes}
                lookupOptionsByType={lookupOptions}
                onEnsureLookup={handleEnsureLookup}
                onApply={handleApplyFilter}
                currentTree={filterTree}
                currentPayload={filterPayload as any}
            />

            {/* Import Dialog */}
            <Dialog header="Import Products" visible={showImportDialog} onHide={() => { setShowImportDialog(false); setImportResult(null); setImportFile(null); }} style={{ width: "500px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <input
                        type="file"
                        accept=".xlsx"
                        onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    />
                    <Button label="Import" icon="pi pi-upload" onClick={handleImport} disabled={!importFile} />

                    {importResult && (
                        <div style={{ padding: "0.5rem", border: "1px solid var(--surface-border)", borderRadius: "0.375rem" }}>
                            <p><strong>Created:</strong> {importResult.created}</p>
                            <p><strong>Errors:</strong> {importResult.errors.length}</p>
                            {importResult.errors.length > 0 && (
                                <div style={{ maxHeight: "200px", overflowY: "auto", marginTop: "0.5rem" }}>
                                    {importResult.errors.map((err: any, i: number) => (
                                        <div key={i} style={{ color: "var(--red-500)", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                                            Row {err.row}: {err.field} - {err.message}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Dialog>

            {/* Export Template Dialog */}
            <Dialog header="Export Template" visible={showExportDialog} onHide={() => { setShowExportDialog(false); setExportTypeId(null); }} style={{ width: "500px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <Dropdown
                        value={exportTypeId}
                        options={productTypes.map((pt) => ({ label: pt.name, value: pt.identifier }))}
                        onChange={(e) => setExportTypeId(e.value)}
                        placeholder="Select Product Type"
                        style={{ width: "100%" }}
                    />
                    <Button label="Download template" icon="pi pi-download" onClick={handleExportTemplate} disabled={!exportTypeId} />
                </div>
            </Dialog>

            {/* Copy Product Dialog */}
            <Dialog
                header="Create Copy"
                visible={showCopyDialog}
                onHide={() => {
                    setShowCopyDialog(false);
                    setCopySourceProductNumber(null);
                    setCopyTargetProductNumber("");
                }}
                style={{ width: "450px" }}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <p>Create a copy of product <strong>{copySourceProductNumber}</strong>.</p>
                    <div>
                        <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
                            Target Product Number (optional)
                        </label>
                        <InputText
                            value={copyTargetProductNumber}
                            onChange={(e) => setCopyTargetProductNumber(e.target.value)}
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
                                setShowCopyDialog(false);
                                setCopySourceProductNumber(null);
                                setCopyTargetProductNumber("");
                            }}
                        />
                        <Button
                            label="Create Copy"
                            icon="pi pi-copy"
                            onClick={() => void handleCopyConfirm()}
                            loading={copying}
                        />
                    </div>
                </div>
            </Dialog>
        </PageTemplate>
    );
}
