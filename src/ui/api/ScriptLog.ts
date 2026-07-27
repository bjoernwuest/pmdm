import { apiDelete, apiGet } from "./index.ts";

export type ScriptLogEntry = {
    identifier: string;
    logLevel: string;
    message: string;
    scriptCategory: string;
    dataTypeIdentifier: string | null;
    productRequestIdentifier: string | null;
    principalUserId: string | null;
    createdAt: string;
};

export async function getScriptLogs(
    filters: { logLevel?: string; scriptCategory?: string; dataTypeIdentifier?: string },
    page: number,
    pageSize: number,
): Promise<{ rows: ScriptLogEntry[]; total: number; page: number; pageSize: number }> {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (filters.logLevel) params.set("logLevel", filters.logLevel);
    if (filters.scriptCategory) params.set("scriptCategory", filters.scriptCategory);
    if (filters.dataTypeIdentifier) params.set("dataTypeIdentifier", filters.dataTypeIdentifier);
    return apiGet<{ rows: ScriptLogEntry[]; total: number; page: number; pageSize: number }>(
        `/api/script-log?${params.toString()}`,
    );
}

export async function clearScriptLog(): Promise<{ success: boolean; deletedCount: number }> {
    return apiDelete<{ success: boolean; deletedCount: number }>("/api/script-log");
}
