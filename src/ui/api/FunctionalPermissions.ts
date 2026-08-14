import { apiDelete, apiGet, apiPost } from "./index.ts";
import type {
    FunctionalPermissionDetailResponseType,
    FunctionalPermissionsResponse,
    SuccessResponse,
} from "@/types/ApiType.ts";

/** Paged functional-permission list. `page` is zero-based, matching the server contract. */
export async function getFunctionalPermissions(page: number, pageSize: number): Promise<FunctionalPermissionsResponse> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return apiGet<FunctionalPermissionsResponse>(`/api/functionalpermissions?${params.toString()}`);
}

/** One functional permission's details with the groups it is granted to. */
export async function getFunctionalPermissionDetail(functionalPermissionId: string): Promise<FunctionalPermissionDetailResponseType> {
    return apiGet<FunctionalPermissionDetailResponseType>(`/api/functionalpermissions/${encodeURIComponent(functionalPermissionId)}`);
}

/** Assign groups to a functional permission (grants it to those groups). */
export async function assignGroupsToFunctionalPermission(functionalPermissionId: string, groupIdentifiers: string[]): Promise<SuccessResponse> {
    return apiPost<SuccessResponse>(`/api/functionalpermissions/${encodeURIComponent(functionalPermissionId)}/groups`, { groupIdentifiers });
}

/** Remove groups from a functional permission (revokes it from those groups). */
export async function removeGroupsFromFunctionalPermission(functionalPermissionId: string, groupIdentifiers: string[]): Promise<SuccessResponse> {
    return apiDelete<SuccessResponse>(`/api/functionalpermissions/${encodeURIComponent(functionalPermissionId)}/groups`, { groupIdentifiers });
}
