import { apiGet, apiPatch, apiPost, apiPut } from "./index.ts";
import type {
    ConsumableDetailResponse,
    ConsumableValuesResponse,
    ConsumablesResponse,
} from "@/types/ConfigurationTypes.ts";

export type ConsumableSpreadsheetImportResult = {
    created: number;
    updated: number;
};

type BackendConsumable = ConsumableDetailResponse["consumable"];
type BackendConsumableListItem = {
    consumable: BackendConsumable;
    enabledValueCount: number;
    disabledValueCount: number;
    usedValueCount: number;
};
type BackendConsumablesResponse = Omit<ConsumablesResponse, "consumables"> & { consumables: BackendConsumableListItem[] };

type BackendConsumableValue = Omit<ConsumableValuesResponse["values"][number], "name"> & { name?: string; value?: string };
type BackendConsumableValuesResponse = Omit<ConsumableValuesResponse, "values"> & { values: BackendConsumableValue[] };
type BackendConsumableDetailLike = BackendConsumable | { consumable: BackendConsumable };

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue;
        query.set(key, String(value));
    }
    const serialized = query.toString();
    return serialized.length > 0 ? `?${serialized}` : "";
}

function normalizeValue(item: Record<string, unknown>): ConsumableValuesResponse["values"][number] {
    const rawName = item.name ?? item.value ?? "";
    const name = typeof rawName === "string" ? rawName : "";
    return {
        identifier: typeof item.identifier === "string" ? item.identifier : "",
        name,
        disabled: typeof item.disabled === "boolean" ? item.disabled : false,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
        isUsed: typeof item.isUsed === "boolean" ? item.isUsed : false,
        consumableIdentifier: typeof item.consumableIdentifier === "string" ? item.consumableIdentifier : "",
    };
}

function normalizeDetail(payload: BackendConsumableDetailLike): ConsumableDetailResponse {
    const candidate = payload as { consumable?: BackendConsumable };
    if (candidate.consumable && typeof candidate.consumable === "object") return { consumable: candidate.consumable };
    return { consumable: payload as BackendConsumable };
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

async function uploadConsumableSpreadsheet(identifier: string, file: File, fallbackError: string): Promise<ConsumableSpreadsheetImportResult> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`/api/consumables/${encodeURIComponent(identifier)}/import`, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
    });

    if (response.ok) {
        return await response.json() as ConsumableSpreadsheetImportResult;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("spreadsheetml.sheet") || (response.headers.get("Content-Disposition") ?? "").toLowerCase().includes(".xlsx")) {
        const errorCount = response.headers.get("X-Import-Error-Count");
        const blob = await response.blob();
        downloadBlob(blob, extractFilename(response.headers.get("Content-Disposition"), "consumable_import_errors.xlsx"));
        throw new Error(errorCount ? `Import failed with ${errorCount} validation error(s). Error report downloaded.` : "Import failed. Error report downloaded.");
    }

    const text = await response.text().catch(() => "");
    throw new Error(text || fallbackError);
}

export async function getConsumables(page: number, pageSize: number, includeDisabled: boolean): Promise<ConsumablesResponse> {
    const payload = await apiGet<BackendConsumablesResponse>(`/api/consumables${buildQuery({ page, pageSize, includeDisabled })}`);
    return {
        ...payload,
        consumables: payload.consumables.map((item) => ({
            ...item.consumable,
            enabledValueCount: item.enabledValueCount,
            disabledValueCount: item.disabledValueCount,
            usedValueCount: item.usedValueCount,
        })),
    };
}

export async function getConsumableDetail(identifier: string): Promise<ConsumableDetailResponse> {
    const payload = await apiGet<BackendConsumableDetailLike>(`/api/consumables/${encodeURIComponent(identifier)}`);
    return normalizeDetail(payload);
}

export async function createConsumable(name: string): Promise<ConsumableDetailResponse> {
    const payload = await apiPost<BackendConsumableDetailLike>("/api/consumables", { name });
    return normalizeDetail(payload);
}

export async function updateConsumable(identifier: string, data: { name: string; knownUpdatedAt: string }): Promise<ConsumableDetailResponse> {
    const payload = await apiPut<BackendConsumableDetailLike>(`/api/consumables/${encodeURIComponent(identifier)}`, data);
    return normalizeDetail(payload);
}

export async function setConsumableDisabled(identifier: string, data: { disabled: boolean; knownUpdatedAt: string }): Promise<ConsumableDetailResponse> {
    const payload = await apiPatch<BackendConsumableDetailLike>(`/api/consumables/${encodeURIComponent(identifier)}/disabled`, data);
    return normalizeDetail(payload);
}

export async function getConsumableValues(identifier: string, page: number, pageSize: number, includeDisabled: boolean, showUsed: boolean): Promise<ConsumableValuesResponse> {
    const payload = await apiGet<BackendConsumableValuesResponse>(`/api/consumables/${encodeURIComponent(identifier)}/values${buildQuery({ page, pageSize, includeDisabled, showUsed })}`);
    const rawValues = (payload as Record<string, unknown>).values;
    const values = (Array.isArray(rawValues) ? rawValues : []).map((item) => normalizeValue(item as Record<string, unknown>));
    return {
        ...payload,
        values,
    };
}

export async function createConsumableValue(identifier: string, data: { name: string }): Promise<{ value: ConsumableValuesResponse["values"][number] }> {
    const payload = await apiPost<Record<string, unknown>>(`/api/consumables/${encodeURIComponent(identifier)}/values`, data);
    return { value: normalizeValue(payload) };
}

export async function updateConsumableValue(consumableIdentifier: string, valueIdentifier: string, data: { name: string; knownUpdatedAt: string }): Promise<{ value: ConsumableValuesResponse["values"][number] }> {
    const payload = await apiPut<Record<string, unknown>>(`/api/consumables/${encodeURIComponent(consumableIdentifier)}/values/${encodeURIComponent(valueIdentifier)}`, data);
    return { value: normalizeValue(payload) };
}

export async function setConsumableValueFlags(consumableIdentifier: string, valueIdentifier: string, data: { disabled?: boolean; isUsed?: boolean; knownUpdatedAt: string }): Promise<{ value: ConsumableValuesResponse["values"][number] }> {
    const payload = await apiPatch<Record<string, unknown>>(`/api/consumables/${encodeURIComponent(consumableIdentifier)}/values/${encodeURIComponent(valueIdentifier)}`, data);
    return { value: normalizeValue(payload) };
}

export async function exportConsumableValues(identifier: string): Promise<void> {
    await downloadSpreadsheetResponse(await fetch(`/api/consumables/${encodeURIComponent(identifier)}/export`, {
        method: "GET",
        credentials: "same-origin",
    }), "consumable_values.xlsx", "Failed to download consumable values");
}

export async function exportConsumableTemplate(identifier: string): Promise<void> {
    await downloadSpreadsheetResponse(await fetch(`/api/consumables/${encodeURIComponent(identifier)}/export-template`, {
        method: "GET",
        credentials: "same-origin",
    }), "consumable_values_template.xlsx", "Failed to download consumable template");
}

export async function importConsumableValues(identifier: string, file: File): Promise<ConsumableSpreadsheetImportResult> {
    return await uploadConsumableSpreadsheet(identifier, file, "Import failed");
}

