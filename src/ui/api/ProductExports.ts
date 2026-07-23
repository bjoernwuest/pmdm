import { apiGet, apiPatch } from "./index.ts";
import type { ProductExportsListResponse, ImportProductExportsResponse, ProductExportRow } from "@/types/ProductExportType.ts";
import type { FilterPayload } from "./Products.ts";

const BASE = "/api/product_exports";

export async function getProductExports(
    page: number,
    pageSize: number,
    filter?: FilterPayload,
): Promise<ProductExportsListResponse & { availablePageSizes: number[] }> {
    const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
    });
    if (filter) {
        params.set("filter", JSON.stringify(filter));
    }
    return apiGet<ProductExportsListResponse & { availablePageSizes: number[] }>(`${BASE}?${params.toString()}`);
}

export async function exportProductRequests(
    targetSystem: string,
    format: "xlsx" | "csv" | "json",
    productRequests: string[],
): Promise<void> {
    const params = new URLSearchParams({
        targetSystem,
        format,
        productRequests: productRequests.join(","),
    });
    const response = await fetch(`${BASE}/export?${params.toString()}`, {
        method: "GET",
        credentials: "include",
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || "Export failed");
    }
    if (format === "json") {
        const json = await response.json();
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "product_exports.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition");
    const filenameMatch = disposition?.match(/filename="(.+)"/);
    const filename = filenameMatch?.[1] ?? `product_exports.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function importProductExports(
    file: File,
    targetSystem: string,
): Promise<ImportProductExportsResponse> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${BASE}/import?targetSystem=${encodeURIComponent(targetSystem)}`, {
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

export async function markAsExported(
    productRequestId: string,
    targetSystemId: string,
): Promise<ProductExportRow> {
    return apiPatch<ProductExportRow>(
        `${BASE}/${encodeURIComponent(productRequestId)}/${encodeURIComponent(targetSystemId)}/exported`,
        {},
    );
}

export async function markAsImported(
    productRequestId: string,
    targetSystemId: string,
): Promise<ProductExportRow> {
    return apiPatch<ProductExportRow>(
        `${BASE}/${encodeURIComponent(productRequestId)}/${encodeURIComponent(targetSystemId)}/imported`,
        {},
    );
}