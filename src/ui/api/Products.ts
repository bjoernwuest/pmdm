import { apiGet, apiPost, apiPut, apiPatch } from "./index.ts";
import type { ProductListRow, ProductDetail, EffectivePermissions } from "@/types/ProductType.ts";

const BASE = "/api/products";

export type ProductListResponse = {
    products: ProductListRow[];
    effectivePermissions: EffectivePermissions;
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
    includeDisabled: boolean;
};

export type ProductDetailResponse = { product: ProductDetail };

export type ImportResult = {
    created: number;
    errors: { row: number; productNumber: string; field: string; message: string }[];
};

export type FilterPayload = {
    criteria: {
        dataTypeIdentifier: string;
        operator: string;
        value?: unknown;
        values?: unknown[];
    }[];
    expression: string;
    productNumberContains?: string;
    productTypeIdentifier?: string;
    disabled?: boolean;
};

export async function getProducts(
    page: number,
    pageSize: number,
    includeDisabled: boolean,
    filter?: FilterPayload,
): Promise<ProductListResponse> {
    const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        includeDisabled: String(includeDisabled),
    });
    if (filter) {
        params.set("filter", JSON.stringify(filter));
        if (filter.productNumberContains) params.set("productNumberContains", filter.productNumberContains);
        if (filter.productTypeIdentifier) params.set("productTypeIdentifier", filter.productTypeIdentifier);
        if (filter.disabled !== undefined) params.set("disabled", String(filter.disabled));
    }
    return apiGet<ProductListResponse>(`${BASE}?${params.toString()}`);
}

export async function getProduct(productNumber: string): Promise<ProductDetailResponse> {
    return apiGet<ProductDetailResponse>(`${BASE}/${encodeURIComponent(productNumber)}`);
}

export async function createProduct(data: {
    productNumber: string;
    productTypeIdentifier: string;
    values?: Record<string, unknown>;
}): Promise<ProductDetailResponse> {
    return apiPost<ProductDetailResponse>(BASE, data);
}

export async function updateProduct(
    productNumber: string,
    data: {
        productTypeIdentifier?: string;
        values?: Record<string, unknown>;
        knownUpdatedAt: string;
    },
): Promise<ProductDetailResponse> {
    return apiPut<ProductDetailResponse>(`${BASE}/${encodeURIComponent(productNumber)}`, data);
}

export async function setProductDisabled(
    productNumber: string,
    data: { disabled: boolean; knownUpdatedAt: string },
): Promise<ProductDetailResponse> {
    return apiPatch<ProductDetailResponse>(`${BASE}/${encodeURIComponent(productNumber)}/disabled`, data);
}

export async function requestProductUpdate(productNumber: string): Promise<{ productRequestId: string }> {
    return apiPost<{ productRequestId: string }>(`${BASE}/${encodeURIComponent(productNumber)}/request-update`, {});
}

export async function copyProduct(productNumber: string, targetProductNumber?: string): Promise<{ productRequestId: string }> {
    const body: Record<string, string> = {};
    if (targetProductNumber) {
        body.productNumber = targetProductNumber;
    }
    return apiPost<{ productRequestId: string }>(`${BASE}/${encodeURIComponent(productNumber)}/copy`, body);
}

export async function importProducts(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${BASE}/import`, {
        method: "POST",
        body: formData,
        credentials: "include",
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || "Import failed");
    }
    return response.json();
}

export async function exportProductTemplate(productTypeIdentifier: string): Promise<void> {
    const response = await fetch(`${BASE}/export-template/${encodeURIComponent(productTypeIdentifier)}`, {
        method: "GET",
        credentials: "include",
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || "Failed to download template");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition");
    const filenameMatch = disposition?.match(/filename="(.+)"/);
    const filename = filenameMatch?.[1] ?? "template.xlsx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
