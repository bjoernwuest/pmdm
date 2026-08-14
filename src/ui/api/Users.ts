import { apiGet } from "./index.ts";
import type { UsersResponse, UserDetailsResponse } from "@/types/ApiType.ts";

/** Paged user list. `page` is zero-based, matching the server contract. */
export async function getUsers(page: number, pageSize: number, includeInactive: boolean): Promise<UsersResponse> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (includeInactive) params.set("includeInactive", "true");
    return apiGet<UsersResponse>(`/api/users?${params.toString()}`);
}

/** One user's details, optionally including inactive groups/permissions. */
export async function getUserDetail(userId: string, includeInactive: boolean): Promise<UserDetailsResponse> {
    const params = includeInactive ? "?includeInactive=true" : "";
    return apiGet<UserDetailsResponse>(`/api/users/${encodeURIComponent(userId)}${params}`);
}
