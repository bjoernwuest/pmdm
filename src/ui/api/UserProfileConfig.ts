import { apiGet, apiPut } from "./index.ts";

export type UserProfileConfigEntry = {
    domain: string;
    key: string;
    description?: string | null;
    type: string;
    value: unknown;
    userValue: unknown;
    inputFormat: string;
    outputFormat: string;
    updatedAt: string | null;
};

export type UserProfileConfigResponse = {
    entries: UserProfileConfigEntry[];
};

export type UserProfileConfigUpdateRequest = {
    value: unknown;
    knownUpdatedAt?: string;
};

export async function getUserProfileConfigEntries(): Promise<UserProfileConfigResponse> {
    return apiGet<UserProfileConfigResponse>("/api/me/config");
}

export async function updateUserProfileConfigEntry(
    domain: string,
    key: string,
    data: UserProfileConfigUpdateRequest,
): Promise<UserProfileConfigEntry> {
    return apiPut<UserProfileConfigEntry>(
        `/api/me/config/${encodeURIComponent(domain)}/${encodeURIComponent(key)}`,
        data,
    );
}
