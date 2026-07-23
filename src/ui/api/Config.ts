import { apiGet, apiPut } from "./index.ts";
import type {
    ConfigListResponse,
    ConfigUpdateRequest,
    ConfigEntryUI
} from "@/types/ConfigType.ts";

export async function getConfigEntries(): Promise<ConfigListResponse> {
    return apiGet<ConfigListResponse>("/api/config");
}

export async function updateConfigEntry(
    domain: string,
    key: string,
    data: ConfigUpdateRequest,
): Promise<ConfigEntryUI> {
    return apiPut<ConfigEntryUI>(
        `/api/config/${encodeURIComponent(domain)}/${encodeURIComponent(key)}`,
        data,
    );
}
