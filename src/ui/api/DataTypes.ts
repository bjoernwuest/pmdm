import type {
    DataTypeDetailResponse,
    DataTypeGrantPermissionResponse,
    DataTypePermissionsResponse,
    DataTypesResponse,
} from "@/types/ConfigurationTypes.ts";
import type { ConfigurationEntityKnownUpdatedAt } from "@/ui/api/_configuration_entities.ts";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./index.ts";

const BASE = "/api/data_types";

/**
 * Loads one page of data types.
 *
 * @param page Zero-based page index.
 * @param pageSize Number of rows per page.
 * @param includeDisabled Whether disabled rows should be included.
 * @returns Paginated data-type response.
 */
export async function getDataTypes(page: number, pageSize: number, includeDisabled: boolean): Promise<DataTypesResponse> {
    const includeDisabledParam = includeDisabled ? "&includeDisabled=true" : "";
    return apiGet<DataTypesResponse>(`${BASE}?page=${page}&pageSize=${pageSize}${includeDisabledParam}`);
}

/**
 * Fetches one data type by identifier including full config.
 *
 * @param identifier Data type identifier.
 * @returns Detail response containing the data type.
 */
export async function getDataTypeDetail(identifier: string): Promise<DataTypeDetailResponse> {
    return apiGet<DataTypeDetailResponse>(`${BASE}/${encodeURIComponent(identifier)}`);
}

/**
 * Creates a new data type.
 *
 * @param data Creation payload (name, kind, owner, optional fields).
 * @returns Detail response containing the created data type.
 */
export async function createDataType(data: {
    name: string;
    kind: string;
    owner: string;
    config?: Record<string, unknown>;
    description?: string;
    mandatory?: boolean | string;
    requestorCanEdit?: boolean | string;
}): Promise<DataTypeDetailResponse> {
    return apiPost<DataTypeDetailResponse>(BASE, data);
}

/**
 * Updates a data type's metadata and config.
 *
 * @param identifier Data type identifier.
 * @param data Update payload with optimistic-lock timestamp.
 * @returns Detail response containing the updated data type.
 */
export async function updateDataType(
    identifier: string,
    data: Partial<{
        name: string;
        description: string | null;
        mandatory: boolean | string;
        mandatory_script: string | null;
        requestorCanEdit: boolean | string;
        requestorCanEdit_script: string | null;
        owner: string;
        config: Record<string, unknown>;
    }> & ConfigurationEntityKnownUpdatedAt,
): Promise<DataTypeDetailResponse> {
    return apiPut<DataTypeDetailResponse>(`${BASE}/${encodeURIComponent(identifier)}`, data);
}

/**
 * Enables or disables a data type.
 *
 * @param identifier Data type identifier.
 * @param data Disabled-state payload with optimistic-lock timestamp.
 * @returns Detail response containing the updated data type.
 */
export async function setDataTypeDisabled(
    identifier: string,
    data: { disabled: boolean } & ConfigurationEntityKnownUpdatedAt,
): Promise<DataTypeDetailResponse> {
    return apiPatch<DataTypeDetailResponse>(`${BASE}/${encodeURIComponent(identifier)}/disabled`, data);
}

/**
 * Fetches all permissions for a data type.
 *
 * @param identifier Data type identifier.
 * @returns List of permission entries with group names.
 */
export async function getDataTypePermissions(identifier: string): Promise<DataTypePermissionsResponse> {
    return apiGet<DataTypePermissionsResponse>(`${BASE}/${encodeURIComponent(identifier)}/permissions`);
}

/**
 * Grants a role to a group for a data type.
 *
 * @param identifier Data type identifier.
 * @param data Grant payload (groupIdentifier, role, showByDefault).
 * @returns The granted permission entry.
 */
export async function grantDataTypePermission(
    identifier: string,
    data: { groupIdentifier: string; role: string; showByDefault?: boolean },
): Promise<DataTypeGrantPermissionResponse> {
    return apiPost<DataTypeGrantPermissionResponse>(`${BASE}/${encodeURIComponent(identifier)}/permissions`, data);
}

/**
 * Revokes a role from a group for a data type.
 *
 * @param identifier Data type identifier.
 * @param data Revoke payload (groupIdentifier, role).
 */
export async function revokeDataTypePermission(
    identifier: string,
    data: { groupIdentifier: string; role: string },
): Promise<void> {
    await apiDelete(`${BASE}/${encodeURIComponent(identifier)}/permissions`, data);
}

/**
 * Updates the showByDefault flag on a data type permission.
 *
 * @param identifier Data type identifier.
 * @param permId Permission identifier (groupIdentifier__role).
 * @param data Update payload with optimistic-lock timestamp.
 * @returns The updated permission entry.
 */
export async function updateDataTypePermission(
    identifier: string,
    permId: string,
    data: { showByDefault: boolean } & ConfigurationEntityKnownUpdatedAt,
): Promise<DataTypeGrantPermissionResponse> {
    return apiPatch<DataTypeGrantPermissionResponse>(
        `${BASE}/${encodeURIComponent(identifier)}/permissions/${encodeURIComponent(permId)}`,
        data,
    );
}
