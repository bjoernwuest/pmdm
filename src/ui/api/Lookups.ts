import { apiGet, apiPatch, apiPost, apiPut } from "./index.ts";
import type {
    LookupDetailResponse,
    LookupValuesResponse,
    LookupResponse,
} from "@/types/ConfigurationTypes.ts";

export type LookupSpreadsheetImportResult = {
    created: number;
    updated: number;
};

type BackendLookup = LookupDetailResponse["lookup"];
type BackendLookupListItem = {
    lookup: BackendLookup;
    enabledValueCount: number;
    disabledValueCount: number;
};
type BackendLookupResponse = Omit<LookupResponse, "lookups"> & { lookups: BackendLookupListItem[] };

type BackendLookupValue = LookupValuesResponse["values"][number];
type BackendLookupValuesResponse = Omit<LookupValuesResponse, "values"> & { values: BackendLookupValue[] };
type BackendLookupDetailLike = BackendLookup | { lookup: BackendLookup };

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue;
        query.set(key, String(value));
    }
    const serialized = query.toString();
    return serialized.length > 0 ? `?${serialized}` : "";
}

function normalizeDetail(payload: BackendLookupDetailLike): LookupDetailResponse {
    const candidate = payload as { lookup?: BackendLookup };
    if (candidate.lookup && typeof candidate.lookup === "object") return { lookup: candidate.lookup };
    return { lookup: payload as BackendLookup };
}

function extractFilename(contentDisposition: string | null, fallback: string): string {
    const filenameMatch = contentDisposition?.match(/filename="?([^";]+)"?/i);
    return filenameMatch?.[1] ?? fallback;
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

async function downloadSpreadsheetResponse(response: Response, fallbackFilename: string, fallbackError: string): Promise<void> {
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || fallbackError);
    }
    const blob = await response.blob();
    downloadBlob(blob, extractFilename(response.headers.get("Content-Disposition"), fallbackFilename));
}

async function uploadLookupSpreadsheet(identifier: string, file: File, fallbackError: string): Promise<LookupSpreadsheetImportResult> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`/api/lookups/${encodeURIComponent(identifier)}/import`, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
    });

    if (response.ok) {
        return await response.json() as LookupSpreadsheetImportResult;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("spreadsheetml.sheet") || (response.headers.get("Content-Disposition") ?? "").toLowerCase().includes(".xlsx")) {
        const errorCount = response.headers.get("X-Import-Error-Count");
        const blob = await response.blob();
        downloadBlob(blob, extractFilename(response.headers.get("Content-Disposition"), "lookup_import_errors.xlsx"));
        throw new Error(errorCount ? `Import failed with ${errorCount} validation error(s). Error report downloaded.` : "Import failed. Error report downloaded.");
    }

    const text = await response.text().catch(() => "");
    throw new Error(text || fallbackError);
}

export async function getLookups(page: number, pageSize: number, includeDisabled: boolean): Promise<LookupResponse> {
    const payload = await apiGet<BackendLookupResponse>(`/api/lookups${buildQuery({ page, pageSize, includeDisabled })}`);
    return {
        ...payload,
        lookups: payload.lookups.map((item) => ({
            ...item.lookup,
            enabledValueCount: item.enabledValueCount,
            disabledValueCount: item.disabledValueCount,
        })),
    };
}

export async function getLookupDetail(identifier: string): Promise<LookupDetailResponse> {
    const payload = await apiGet<BackendLookupDetailLike>(`/api/lookups/${encodeURIComponent(identifier)}`);
    return normalizeDetail(payload);
}

export async function createLookup(name: string, sourceSystem?: string): Promise<LookupDetailResponse> {
    const payload = await apiPost<BackendLookupDetailLike>("/api/lookups", { name, sourceSystem });
    return normalizeDetail(payload);
}

export async function updateLookup(identifier: string, data: { name: string; sourceSystem?: string; knownUpdatedAt: string }): Promise<LookupDetailResponse> {
    const payload = await apiPut<BackendLookupDetailLike>(`/api/lookups/${encodeURIComponent(identifier)}`, data);
    return normalizeDetail(payload);
}

export async function setLookupDisabled(identifier: string, data: { disabled: boolean; knownUpdatedAt: string }): Promise<LookupDetailResponse> {
    const payload = await apiPatch<BackendLookupDetailLike>(`/api/lookups/${encodeURIComponent(identifier)}/disabled`, data);
    return normalizeDetail(payload);
}

export async function getLookupValues(identifier: string, page: number, pageSize: number, includeDisabled: boolean): Promise<LookupValuesResponse> {
    return apiGet<BackendLookupValuesResponse>(`/api/lookups/${encodeURIComponent(identifier)}/values${buildQuery({ page, pageSize, includeDisabled })}`);
}

export async function createLookupValue(identifier: string, data: { name: string; sourceSystemIdentifier?: string | null }): Promise<{ value: LookupValuesResponse["values"][number] }> {
    const payload = await apiPost<Record<string, unknown>>(`/api/lookups/${encodeURIComponent(identifier)}/values`, data);
    return { value: payload as BackendLookupValue };
}

export async function updateLookupValue(lookupIdentifier: string, valueIdentifier: string, data: { name: string; knownUpdatedAt: string }): Promise<{ value: LookupValuesResponse["values"][number] }> {
    const payload = await apiPut<Record<string, unknown>>(`/api/lookups/${encodeURIComponent(lookupIdentifier)}/values/${encodeURIComponent(valueIdentifier)}`, data);
    return { value: payload as BackendLookupValue };
}

export async function setLookupValueDisabled(lookupIdentifier: string, valueIdentifier: string, data: { disabled: boolean; knownUpdatedAt: string }): Promise<{ value: LookupValuesResponse["values"][number] }> {
    const payload = await apiPatch<Record<string, unknown>>(`/api/lookups/${encodeURIComponent(lookupIdentifier)}/values/${encodeURIComponent(valueIdentifier)}/disabled`, data);
    return { value: payload as BackendLookupValue };
}

export async function exportLookupValues(identifier: string): Promise<void> {
    await downloadSpreadsheetResponse(await fetch(`/api/lookups/${encodeURIComponent(identifier)}/export`, {
        method: "GET",
        credentials: "same-origin",
    }), "lookup_values.xlsx", "Failed to download lookup values");
}

export async function exportLookupTemplate(identifier: string): Promise<void> {
    await downloadSpreadsheetResponse(await fetch(`/api/lookups/${encodeURIComponent(identifier)}/export-template`, {
        method: "GET",
        credentials: "same-origin",
    }), "lookup_values_template.xlsx", "Failed to download lookup template");
}

export async function importLookupValues(identifier: string, file: File): Promise<LookupSpreadsheetImportResult> {
    return await uploadLookupSpreadsheet(identifier, file, "Import failed");
}

