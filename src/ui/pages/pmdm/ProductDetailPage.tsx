import type { PageMeta } from "@/types/PageType.ts";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import { FP_VIEW_PRODUCTS, FP_REQUEST_PRODUCT_UPDATE, FP_CREATE_PRODUCT_COPY } from "@/ui/auth/functional_permissions.ts";
import { getProduct, requestProductUpdate, copyProduct, type ProductDetailResponse } from "@/ui/api/Products.ts";
import { findOpenRequestForProduct } from "@/ui/api/ProductRequests.ts";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { Card } from "primereact/card";
import { Toast } from "primereact/toast";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { apiGet } from "@/ui/api";

export const meta: PageMeta = {
    id: "product-detail",
    urn: "urn:bun-starter:ui:page:product-detail",
    path: "/products/:productNumber",
    title: "Product Detail",
    description: "View product details.",
    menu: {
        section: "General",
        order: 0,
        label: "",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_VIEW_PRODUCTS.functionalPermissionName],
};

type ViewerContext = { permissionNames: string[] };

export function Component() {
    const { productNumber } = useParams<{ productNumber: string }>();
    const navigate = useNavigate();
    const toast = useRef<Toast>(null);
    const [loading, setLoading] = useState(true);
    const [product, setProduct] = useState<ProductDetailResponse["product"] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [copyTargetProductNumber, setCopyTargetProductNumber] = useState("");
    const [copying, setCopying] = useState(false);

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

    useEffect(() => {
        if (!productNumber) return;
        let cancelled = false;
        setLoading(true);
        void (async () => {
            try {
                const response = await getProduct(productNumber);
                if (!cancelled) {
                    setProduct(response.product);
                    setError(null);
                }
            } catch (e: any) {
                if (!cancelled) {
                    setError(e.message);
                    setProduct(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [productNumber]);

    const handleRequestUpdate = useCallback(async () => {
        if (!productNumber) return;
        try {
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
    }, [productNumber, navigate]);

    const handleCopy = useCallback(() => {
        setCopyTargetProductNumber("");
        setShowCopyDialog(true);
    }, []);

    const handleCopyConfirm = useCallback(async () => {
        if (!productNumber) return;
        setCopying(true);
        try {
            const result = await copyProduct(
                productNumber,
                copyTargetProductNumber.trim() || undefined,
            );
            setShowCopyDialog(false);
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
    }, [productNumber, copyTargetProductNumber, navigate]);

    if (loading) {
        return (
            <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
                <div style={{ padding: "2rem", textAlign: "center" }}>
                    <i className="pi pi-spin pi-spinner" style={{ fontSize: "2rem" }} />
                    <p>Loading product...</p>
                </div>
            </PageTemplate>
        );
    }

    if (error || !product) {
        return (
            <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
                <div style={{ padding: "2rem" }}>
                    <Button label="Back to Products" icon="pi pi-arrow-left" className="p-button-outlined" onClick={() => navigate("/products")} style={{ marginBottom: "1rem" }} />
                    <Card>
                        <p style={{ color: "var(--red-500)" }}>{error ?? "Product not found"}</p>
                    </Card>
                </div>
            </PageTemplate>
        );
    }

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <Toast ref={toast} />
            <Button label="Back to Products" icon="pi pi-arrow-left" className="p-button-outlined" onClick={() => navigate("/products")} style={{ marginBottom: "1rem" }} />

            <Card style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                        <h2 style={{ margin: "0 0 0.25rem 0" }}>Product: {product.productNumber}</h2>
                        <p style={{ margin: "0 0 0.25rem 0", color: "var(--text-color-secondary)" }}>
                            Product Type: {product.productTypeName}
                        </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <Tag value={product.disabled ? "Disabled" : "Active"} severity={product.disabled ? "danger" : "success"} style={{ marginBottom: "0.25rem" }} />
                        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-color-secondary)" }}>
                            Updated: {new Date(product.updatedAt).toISOString()}
                        </p>
                        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem", flexWrap: "wrap" }}>
                            {viewerContext.permissionNames.includes(FP_REQUEST_PRODUCT_UPDATE.functionalPermissionName) && (
                                <Button label="Request update" icon="pi pi-sync" className="p-button-outlined p-button-sm" onClick={handleRequestUpdate} />
                            )}
                            {viewerContext.permissionNames.includes(FP_CREATE_PRODUCT_COPY.functionalPermissionName) && (
                                <Button label="Create copy" icon="pi pi-copy" className="p-button-outlined p-button-sm" onClick={handleCopy} />
                            )}
                        </div>
                    </div>
                </div>
            </Card>

            <Card title="Data Type Values">
                <DataTable
                    value={product.values ?? []}
                    loading={false}
                    emptyMessage="No data type values assigned"
                    paginator={product.values && product.values.length > 20}
                    rows={20}
                    rowsPerPageOptions={[20, 50, 100]}
                >
                    <Column field="dataTypeName" header="Data Type" sortable />
                    <Column field="businessDomainName" header="Business Domain" sortable body={(row: any) => <span>{row.businessDomainName ?? <span style={{ fontStyle: "italic", color: "var(--text-color-secondary)" }}>—</span>}</span>} />
                    <Column field="value" header="Value" body={(row: any) => {
                        const resolved = row.displayValue ?? row.value;
                        if (resolved === null || resolved === undefined) return <span style={{ fontStyle: "italic", color: "var(--text-color-secondary)" }}>—</span>;
                        if (typeof resolved === "boolean") return <Tag value={resolved ? "true" : "false"} severity={resolved ? "success" : "danger"} />;
                        if (typeof resolved === "object") return <code style={{ fontSize: "0.85rem" }}>{JSON.stringify(resolved)}</code>;
                        return <span>{String(resolved)}</span>;
                    }} sortable />
                </DataTable>
            </Card>

            <Dialog
                header="Create Copy"
                visible={showCopyDialog}
                onHide={() => { setShowCopyDialog(false); setCopyTargetProductNumber(""); }}
                style={{ width: "450px" }}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <p>Create a copy of product <strong>{productNumber}</strong>.</p>
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
                            onClick={() => { setShowCopyDialog(false); setCopyTargetProductNumber(""); }}
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
