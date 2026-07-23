import { apiGet, apiPost, apiPut } from "./index.ts";
import type {ApiKeyDetailResponse, ApiKeysResponse} from "@/types/ApiKeyType.ts";
import type {
    CreateApiKeyRequest,
    CreateApiKeyResponse,
} from "@/types/ApiKeyType.ts";

export async function getApiKeys(page: number, pageSize: number, includeDisabled: boolean): Promise<ApiKeysResponse> {
    const includeDisabledParam = includeDisabled ? "&includeDisabled=true" : "";
    return apiGet<ApiKeysResponse>(`/api/api_keys?page=${page}&pageSize=${pageSize}${includeDisabledParam}`);
}

export async function getApiKeyDetail(apiKeyIdentifier: string): Promise<ApiKeyDetailResponse> {
    return apiGet<ApiKeyDetailResponse>(`/api/api_keys/${encodeURIComponent(apiKeyIdentifier)}`);
}

export async function createApiKey(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    return apiPost<CreateApiKeyResponse>("/api/api_keys", data);
}

export async function updateApiKeyMetadata(
    apiKeyIdentifier: string,
    data: { knownUpdatedAt: string; name: string; description: string | null },
): Promise<{ updatedAt: string }> {
    return apiPut<{ updatedAt: string }>(`/api/api_keys/${encodeURIComponent(apiKeyIdentifier)}`, data);
}

export async function prolongApiKey(
    apiKeyIdentifier: string,
    data: { knownUpdatedAt: string; days: number },
): Promise<{ updatedAt: string; expiresAt: string; lastProlongedAt: string | null; lastProlongedBy: string | null }> {
    return apiPut(`/api/api_keys/${encodeURIComponent(apiKeyIdentifier)}/prolong`, data);
}

export async function disableApiKey(
    apiKeyIdentifier: string,
    data: { knownUpdatedAt: string },
): Promise<{ updatedAt: string; disabled: boolean; disabledAt: string | null; disabledBy: string | null }> {
    return apiPut(`/api/api_keys/${encodeURIComponent(apiKeyIdentifier)}/disable`, data);
}

export async function replaceApiKeyPermissions(
    apiKeyIdentifier: string,
    data: { knownUpdatedAt: string; permissionIdentifiers: string[] },
): Promise<{ success: true }> {
    return apiPut(`/api/api_keys/${encodeURIComponent(apiKeyIdentifier)}/permissions`, data);
}


