import type { PageMeta } from "@/types/PageType.ts";
import {
    FP_VIEW_PRODUCT_EXPORTS,
    FP_EXPORT_PRODUCT_REQUESTS,
    FP_EDIT_EXPORT_STATUS,
} from "@/ui/auth/functional_permissions.ts";
import {
    getProductExports,
    exportProductRequests,
    importProductExports,
    markAsExported,
    markAsImported,
} from "@/ui/api/ProductExports.ts";
import { getProductTypes, getProductTypeDataTypes } from "@/ui/api/ProductTypes.ts";
import { getLookupValues } from "@/ui/api/Lookups.ts";
import {
    message_ProductExportExported,
    message_ProductExportImported,
    message_ImportingProductRequest,
    message_DoneProductRequest,
} from "@/types/ProductRequestType.ts";
import type { ProductExportsListResponse, ProductExportRequestRow, ProductExportRow } from "@/types/ProductExportType.ts";
import type { FilterPayload } from "@/ui/api/Products.ts";
import type { PubSubMessage } from "@/types/PubSubType";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { useNavigate } from "react-router-dom";
import { Toast } from "primereact/toast";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { ToggleButton } from "primereact/togglebutton";
import QueryBuilder, {
    type QueryBuilderTree,
    type DataTypeMeta,
    type FilterPayload as QBFilterPayload,
} from "@/ui/components/QueryBuilder.tsx";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";

export const meta: PageMeta = {
    id: "product-exports",
    urn: "urn:pmdm:ui:page:product-exports",
    path: "/product-exports",
    title: "Product Exports",
    description: "Manage export and import of product requests into target systems.",
    menu: {
        section: "General",
        order: 15,
        label: "Product Exports",
    },
    requiredFunctionalPermissions: [FP_VIEW_PRODUCT_EXPORTS.functionalPermissionName],
};

const COOKIE_NAME = "pmdm_product_exports_filter";

function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()\[\]\\\/+^])/g, "\\$1")}=([^;]*)`));
    return match ? decodeURIComponent(match[1]!) : null;
}

function setCookie(name: string, value: string, days: number = 365): void {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string): void {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

type ExportStatus = "pending" | "exported" | "imported";

function getExportStatus(row: ProductExportRow): ExportStatus {
    if (row.importedAt !== null) return "imported";
    if (row.exportedAt !== null) return "exported";
    return "pending";
}

function formatTimestamp(ts: string | null): string {
    if (!ts) return "";
    return new Date(ts).toLocaleString();
}

function statusSeverity(status: ExportStatus): "warning" | "info" | "success" {
    switch (status) {
        case "pending": return "warning";
        case "exported": return "info";
        case "imported": return "success";
    }
}

export function Component() {
    const navigate = useNavigate();
    const toast = useRef<Toast>(null);
    const pendingOwnActionRef = useRef<Set<string>>(new Set());

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ProductExportsListResponse & { availablePageSizes: number[] } | null>(null);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [selectedRows, setSelectedRows] = useState<ProductExportRequestRow[]>([]);

    const [showFilter, setShowFilter] = useState(false);
    const [filterPayload, setFilterPayload] = useState<FilterPayload | null>(null);
    const [filterTree, setFilterTree] = useState<QueryBuilderTree | null>(null);
    const [dataTypes, setDataTypes] = useState<DataTypeMeta[]>([]);
    const [lookupOptions, setLookupOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
    const [productTypes, setProductTypes] = useState<Array<{ identifier: string; name: string }>>([]);

    const [showExportDialog, setShowExportDialog] = useState(false);
    const [exportTargetSystem, setExportTargetSystem] = useState<string | null>(null);
    const [exportFormat, setExportFormat] = useState<"xlsx" | "csv">("xlsx");

    const [showImportDialog, setShowImportDialog] = useState(false);
    const [importTargetSystem, setImportTargetSystem] = useState<string | null>(null);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importResult, setImportResult] = useState<{ totalRows: number; exportedCount: number; importedCount: number; errors: any[] } | null>(null);

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

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const response = await getProductExports(page, pageSize, filterPayload ?? undefined);
            setData(response);
        } catch (e: any) {
            toast.current?.show({ severity: "error", summary: "Error", detail: e.message, life: 5000 });
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, filterPayload]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        const sub1 = subscribe({ and: message_ProductExportExported }, (msg: PubSubMessage) => {
            const payload = msg.data;
            if (!payload?.productRequest || !payload?.targetSystem) return;
            const key = `exported:${payload.productRequest}:${payload.targetSystem}`;
            if (pendingOwnActionRef.current.has(key)) {
                pendingOwnActionRef.current.delete(key);
                return;
            }
            setData((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    requests: prev.requests.map((req) => {
                        if (req.identifier !== payload.productRequest) return req;
                        return {
                            ...req,
                            exports: req.exports.map((exp) => {
                                if (exp.targetSystem !== payload.targetSystem) return exp;
                                return {
                                    ...exp,
                                    exportedAt: payload.exportedAt ?? null,
                                    exportedByDisplay: payload.exportedByDisplay ?? null,
                                    importedAt: null,
                                    importedByDisplay: null,
                                };
                            }),
                        };
                    }),
                };
            });
        });
        const sub2 = subscribe({ and: message_ProductExportImported }, (msg: PubSubMessage) => {
            const payload = msg.data;
            if (!payload?.productRequest || !payload?.targetSystem) return;
            const key = `imported:${payload.productRequest}:${payload.targetSystem}`;
            if (pendingOwnActionRef.current.has(key)) {
                pendingOwnActionRef.current.delete(key);
                return;
            }
            setData((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    requests: prev.requests.map((req) => {
                        if (req.identifier !== payload.productRequest) return req;
                        return {
                            ...req,
                            exports: req.exports.map((exp) => {
                                if (exp.targetSystem !== payload.targetSystem) return exp;
                                return {
                                    ...exp,
                                    importedAt: payload.importedAt ?? null,
                                    importedByDisplay: payload.importedByDisplay ?? null,
                                };
                            }),
                        };
                    }),
                };
            });
        });
        const sub3 = subscribe({ and: message_ImportingProductRequest }, () => { fetchData(); });
        const sub4 = subscribe({ and: message_DoneProductRequest }, (msg: PubSubMessage) => {
            const payload = msg.data;
            if (!payload?.identifier) return;
            setData((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    requests: prev.requests.filter((req) => req.identifier !== payload.identifier),
                    total: prev.total - 1,
                };
            });
        });
        return () => {
            if (sub1) unsubscribe(sub1);
            if (sub2) unsubscribe(sub2);
            if (sub3) unsubscribe(sub3);
            if (sub4) unsubscribe(sub4);
        };
    }, [fetchData]);

    useEffect(() => {
        void (async () => {
            try {
                const types = await getProductTypes(0, 1000, true);
                setProductTypes(types.productTypes.map((pt: any) => ({ identifier: pt.identifier, name: pt.name })));
            } catch (_) { /* ignore */ }
        })();
    }, []);

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
                            lookupTypeIdentifier: a.dataTypeKind === "lookup" ? ((a.dataTypeConfig as { source?: string } | null)?.source ?? null) : null,
                        });
                    }
                } catch (_) { /* ignore */ }
            }
            setDataTypes(allDataTypes);
        } catch (_) { /* ignore */ }
    }, []);

    const handleEnsureLookup = useCallback(async (lookupIdentifier: string) => {
        if (lookupOptions[lookupIdentifier]) return;
        try {
            const response = await getLookupValues(lookupIdentifier, 0, 1000, true);
            const options = response.values.map((v: any) => ({
                label: v.name ?? v.value ?? v.identifier,
                value: v.name ?? v.value ?? v.identifier,
            }));
            setLookupOptions((prev) => ({ ...prev, [lookupIdentifier]: options }));
        } catch (_) { /* ignore */ }
    }, [lookupOptions]);

    useEffect(() => {
        if (showFilter) loadDataTypes();
    }, [showFilter, loadDataTypes]);

    const handleApplyFilter = useCallback((payload: QBFilterPayload | null, tree: QueryBuilderTree | null) => {
        if (payload) {
            setFilterPayload(payload as FilterPayload);
            setFilterTree(tree);
            setCookie(COOKIE_NAME, JSON.stringify({ payload, tree }));
            setPage(0);
            setSelectedRows([]);
        } else {
            setFilterPayload(null);
            setFilterTree(null);
            deleteCookie(COOKIE_NAME);
            setSelectedRows([]);
        }
    }, []);

    const handleClearFilter = useCallback(() => {
        setFilterPayload(null);
        setFilterTree(null);
        deleteCookie(COOKIE_NAME);
        setPage(0);
        setSelectedRows([]);
    }, []);

    const commonTargetSystems = useCallback((): string[] => {
        if (selectedRows.length === 0) return [];
        const sets = selectedRows.map((r) => new Set(r.exports.map((e) => e.targetSystem)));
        const first = sets[0]!;
        for (let i = 1; i < sets.length; i++) {
            const s = sets[i]!;
            for (const ts of first) {
                if (!s.has(ts)) first.delete(ts);
            }
        }
        return Array.from(first);
    }, [selectedRows]);

    const handleExport = useCallback(async () => {
        if (!exportTargetSystem) return;
        try {
            await exportProductRequests(
                exportTargetSystem,
                exportFormat,
                selectedRows.map((r) => r.identifier),
            );
            setShowExportDialog(false);
            setExportTargetSystem(null);
            toast.current?.show({ severity: "success", summary: "Exported", detail: "File downloaded successfully.", life: 3000 });
        } catch (e: any) {
            toast.current?.show({ severity: "error", summary: "Export error", detail: e.message, life: 5000 });
        }
    }, [exportTargetSystem, exportFormat, selectedRows]);

    const handleImport = useCallback(async () => {
        if (!importFile || !importTargetSystem) return;
        try {
            const result = await importProductExports(importFile, importTargetSystem);
            setImportResult(result);
            fetchData();
            if (result.exportedCount > 0 || result.importedCount > 0) {
                toast.current?.show({ severity: "success", summary: "Import complete", detail: `Exported: ${result.exportedCount}, Imported: ${result.importedCount}`, life: 5000 });
            }
            if (result.errors.length > 0) {
                toast.current?.show({ severity: "warn", summary: "Import warnings", detail: `${result.errors.length} rows had errors`, life: 8000 });
            }
        } catch (e: any) {
            toast.current?.show({ severity: "error", summary: "Import error", detail: e.message, life: 5000 });
        }
    }, [importFile, importTargetSystem, fetchData]);

    const handleStatusChange = useCallback(async (
        requestId: string,
        targetSystemId: string,
        newStatus: ExportStatus,
        currentStatus: ExportStatus,
    ) => {
        if (newStatus === currentStatus) return;
        const actionKey = newStatus === "exported"
            ? `exported:${requestId}:${targetSystemId}`
            : `imported:${requestId}:${targetSystemId}`;
        pendingOwnActionRef.current.add(actionKey);
        try {
            let updatedRow: ProductExportRow;
            if (newStatus === "exported") {
                updatedRow = await markAsExported(requestId, targetSystemId);
            } else {
                updatedRow = await markAsImported(requestId, targetSystemId);
            }
            setData((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    requests: prev.requests.map((req) => {
                        if (req.identifier !== requestId) return req;
                        return {
                            ...req,
                            exports: req.exports.map((exp) => {
                                if (exp.targetSystem !== targetSystemId) return exp;
                                return { ...exp, ...updatedRow };
                            }),
                        };
                    }),
                };
            });
        } catch (e: any) {
            pendingOwnActionRef.current.delete(actionKey);
            toast.current?.show({ severity: "error", summary: "Error", detail: e.message, life: 5000 });
        }
    }, []);

    const targetSystems = data?.targetSystems ?? [];
    const requests = data?.requests ?? [];
    const hasFilter = filterPayload !== null;
    const commonTs = commonTargetSystems();
    const canExport = selectedRows.length > 0 && commonTs.length > 0;

    const productNumberBody = (row: ProductExportRequestRow) => (
        <a
            href={`/product-requests/${row.identifier}`}
            onClick={(e) => { e.stopPropagation(); }}
            style={{ color: "var(--primary-color)", cursor: "pointer" }}
        >
            {row.productNumber}
        </a>
    );

    const statusBody = () => (
        <Tag value="importing" severity="info" />
    );

    const exportCellBody = (row: ProductExportRequestRow, tsId: string) => {
        const exp = row.exports.find((e) => e.targetSystem === tsId);
        if (!exp) return <span></span>;

        const currentStatus = getExportStatus(exp);

        if (currentStatus === "exported") {
            return (
                <div>
                    <ToggleButton
                        checked={false}
                        onLabel="Imported"
                        offLabel="Exported"
                        onChange={() => {
                            handleStatusChange(row.identifier, tsId, "imported", currentStatus);
                        }}
                        className="p-button-sm"
                    />
                    {exp.exportedAt && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-color-secondary)", marginTop: "2px" }}>
                            {formatTimestamp(exp.exportedAt)}
                            {exp.exportedByDisplay && <div>{exp.exportedByDisplay}</div>}
                        </div>
                    )}
                </div>
            );
        }

        if (currentStatus === "imported") {
            return (
                <div>
                    <Tag value="imported" severity="success" />
                    {exp.importedAt && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-color-secondary)", marginTop: "2px" }}>
                            {formatTimestamp(exp.importedAt)}
                            {exp.importedByDisplay && <div>{exp.importedByDisplay}</div>}
                        </div>
                    )}
                </div>
            );
        }

        return <Tag value="pending" severity="warning" />;
    };

    return (
        <div style={{ padding: "1rem" }}>
            <Toast ref={toast} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ margin: 0 }}>Product Exports</h2>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button label="Filter" icon="pi pi-filter" className="p-button-outlined" onClick={() => setShowFilter(true)} />
                    {hasFilter && (
                        <Button label="Clear Filter" icon="pi pi-times" className="p-button-outlined p-button-danger" onClick={handleClearFilter} />
                    )}
                    {canExport && (
                        <Button
                            label="Export"
                            icon="pi pi-download"
                            className="p-button-outlined"
                            onClick={() => {
                                setExportTargetSystem(null);
                                setExportFormat("xlsx");
                                setShowExportDialog(true);
                            }}
                        />
                    )}
                    <Button
                        label="Import"
                        icon="pi pi-upload"
                        className="p-button-outlined"
                        onClick={() => {
                            setImportTargetSystem(null);
                            setImportFile(null);
                            setImportResult(null);
                            setShowImportDialog(true);
                        }}
                    />
                </div>
            </div>

            <DataTable
                value={requests}
                loading={loading}
                paginator
                rows={pageSize}
                totalRecords={data?.total ?? 0}
                lazy
                first={page * pageSize}
                onPage={(e) => { setPage(e.page ?? 0); setPageSize(e.rows ?? 20); }}
                rowsPerPageOptions={data?.availablePageSizes ?? [10, 20, 50, 100]}
                selectionMode="multiple"
                selection={selectedRows}
                onSelectionChange={(e) => setSelectedRows(e.value as ProductExportRequestRow[])}
                emptyMessage="No product requests in importing status"
                dataKey="identifier"
            >
                <Column selectionMode="multiple" headerStyle={{ width: "3rem" }} />
                <Column field="productNumber" header="Product #" body={productNumberBody} sortable />
                <Column field="productTypeName" header="Product Type" sortable />
                <Column field="createdByName" header="Created By" sortable />
                {targetSystems.map((ts) => (
                    <Column
                        key={ts.identifier}
                        header={ts.name}
                        body={(row: ProductExportRequestRow) => exportCellBody(row, ts.identifier)}
                    />
                ))}
                <Column header="Status" body={statusBody} />
            </DataTable>

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

            <Dialog
                header="Export Product Requests"
                visible={showExportDialog}
                onHide={() => { setShowExportDialog(false); setExportTargetSystem(null); }}
                style={{ width: "450px" }}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <Dropdown
                        value={exportTargetSystem}
                        options={targetSystems
                            .filter((ts) => commonTs.includes(ts.identifier))
                            .map((ts) => ({ label: ts.name, value: ts.identifier }))}
                        onChange={(e) => setExportTargetSystem(e.value)}
                        placeholder="Select Target System"
                        style={{ width: "100%" }}
                    />
                    <Dropdown
                        value={exportFormat}
                        options={[
                            { label: "XLSX", value: "xlsx" },
                            { label: "CSV", value: "csv" },
                        ]}
                        onChange={(e) => setExportFormat(e.value)}
                        placeholder="Select Format"
                        style={{ width: "100%" }}
                    />
                    <Button label="Export" icon="pi pi-download" onClick={handleExport} disabled={!exportTargetSystem} />
                </div>
            </Dialog>

            <Dialog
                header="Import Export Status"
                visible={showImportDialog}
                onHide={() => { setShowImportDialog(false); setImportFile(null); setImportResult(null); }}
                style={{ width: "500px" }}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <Dropdown
                        value={importTargetSystem}
                        options={targetSystems.map((ts) => ({ label: ts.name, value: ts.identifier }))}
                        onChange={(e) => setImportTargetSystem(e.value)}
                        placeholder="Select Target System"
                        style={{ width: "100%" }}
                    />
                    <input
                        type="file"
                        accept=".xlsx"
                        onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    />
                    <Button label="Import" icon="pi pi-upload" onClick={handleImport} disabled={!importFile || !importTargetSystem} />
                    {importResult && (
                        <div style={{ padding: "0.5rem", border: "1px solid var(--surface-border)", borderRadius: "0.375rem" }}>
                            <p><strong>Total rows:</strong> {importResult.totalRows}</p>
                            <p><strong>Exported:</strong> {importResult.exportedCount}</p>
                            <p><strong>Imported:</strong> {importResult.importedCount}</p>
                            <p><strong>Errors:</strong> {importResult.errors.length}</p>
                            {importResult.errors.length > 0 && (
                                <div style={{ maxHeight: "200px", overflowY: "auto", marginTop: "0.5rem" }}>
                                    {importResult.errors.map((err: any, i: number) => (
                                        <div key={i} style={{ color: "var(--red-500)", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                                            Row {err.row}: {err.productNumber} - {err.message}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Dialog>
        </div>
    );
}