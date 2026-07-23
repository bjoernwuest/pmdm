import { apiDelete, apiGet } from "./index.ts";

export interface AuditEntry {
    identifier: string;
    topic: string;
    payload: Record<string, any>;
    createdAt: string;
    updatedAt: string;
}

export interface AuditLogResponse {
    entries: AuditEntry[];
    page: number;
    pageSize: number;
    total: number;
}

export interface ClearAuditLogResponse {
    success: boolean;
    deletedCount: number;
}

export async function getAuditEntries(
    page: number,
    pageSize: number,
    opts?: { jsonPathFilter?: string; search?: string },
): Promise<AuditLogResponse> {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (opts?.jsonPathFilter) params.set("jsonPathFilter", opts.jsonPathFilter);
    if (opts?.search) params.set("search", opts.search);

    return apiGet<AuditLogResponse>(`/api/audit-log?${params.toString()}`);
}

export async function clearAuditLog(): Promise<ClearAuditLogResponse> {
    return apiDelete<ClearAuditLogResponse>("/api/audit-log");
}

