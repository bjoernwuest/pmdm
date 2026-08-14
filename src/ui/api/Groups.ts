import { apiDelete, apiGet, apiPost } from "./index.ts";
import type { GroupsResponse, GroupFunctionalPermissionResponseType, SuccessResponse } from "@/types/ApiType.ts";
import type { FunctionalPermissionSelectType } from "@/types/FunctionalPermissionType.ts";

/** Paged group list. `page` is zero-based, matching the server contract. */
export async function getGroups(page: number, pageSize: number, includeInactive: boolean): Promise<GroupsResponse> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (includeInactive) params.set("includeInactive", "true");
    return apiGet<GroupsResponse>(`/api/groups?${params.toString()}`);
}

/** One group's details with its assigned functional permissions. */
export async function getGroupDetail(groupId: string): Promise<GroupFunctionalPermissionResponseType> {
    return apiGet<GroupFunctionalPermissionResponseType>(`/api/groups/${encodeURIComponent(groupId)}`);
}

/** Functional permissions assigned to a group. */
export async function getGroupFunctionalPermissions(groupId: string): Promise<FunctionalPermissionSelectType[]> {
    return apiGet<FunctionalPermissionSelectType[]>(`/api/groups/${encodeURIComponent(groupId)}/functionalpermissions`);
}

/** Grant functional permissions to a group. */
export async function grantPermissionsToGroup(groupId: string, permissionIdentifiers: string[]): Promise<SuccessResponse> {
    return apiPost<SuccessResponse>(`/api/groups/${encodeURIComponent(groupId)}/functionalpermissions`, { permissionIdentifiers });
}

/** Revoke functional permissions from a group. */
export async function revokePermissionsFromGroup(groupId: string, permissionIdentifiers: string[]): Promise<SuccessResponse> {
    return apiDelete<SuccessResponse>(`/api/groups/${encodeURIComponent(groupId)}/functionalpermissions`, { permissionIdentifiers });
}
