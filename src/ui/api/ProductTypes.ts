import type { ConfigurationEntity } from "@/types/ConfigurationTypes.ts";
import { createConfigurationEntityApiClient, type ConfigurationEntityKnownUpdatedAt } from "@/ui/api/_configuration_entities.ts";
import { apiDelete, apiGet, apiPatch, apiPost } from "./index.ts";
import type { Static } from "@sinclair/typebox";
import type {
    UpdateProductTypeDataTypeBodySchema,
    GrantProductTypeDataTypePermissionBodySchema,
    RevokeProductTypeDataTypePermissionBodySchema,
    UpdateProductTypeDataTypePermissionBodySchema,
} from "@/types/ProductTypeType.ts";

const BASE = "/api/product_types";

/** A single ProductType entity as returned by the API (includes description). */
export type ProductTypeEntity = ConfigurationEntity & {
    description: string | null;
    requestorCanCancel: boolean;
};

/** Product-type list response shape returned by `/api/product_types`. */
export type ProductTypesResponse = {
    productTypes: ProductTypeEntity[];
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
    includeDisabled: boolean;
};

/** Product-type detail response shape returned by mutation endpoints. */
export type ProductTypeDetailResponse = {
    productType: ProductTypeEntity;
};

const productTypeClient = createConfigurationEntityApiClient<ProductTypesResponse, ProductTypeDetailResponse>("/product_types");

/**
 * Loads one page of product types.
 *
 * @param page Zero-based page index.
 * @param pageSize Number of rows per page.
 * @param includeDisabled Whether disabled rows should be included.
 * @returns Paginated product-type response.
 */
export async function getProductTypes(page: number, pageSize: number, includeDisabled: boolean): Promise<ProductTypesResponse> {
    return productTypeClient.getPage(page, pageSize, includeDisabled);
}

/**
 * Fetches a single product type by its identifier.
 *
 * @param identifier Product-type identifier.
 * @returns Detail response containing the requested product type.
 */
export async function getProductType(identifier: string): Promise<ProductTypeDetailResponse> {
    return apiGet<ProductTypeDetailResponse>(`${BASE}/${encodeURIComponent(identifier)}`);
}

/**
 * Creates a product type.
 *
 * @param name Product-type name.
 * @returns Detail response containing the created row.
 */
export async function createProductType(name: string): Promise<ProductTypeDetailResponse> {
    return productTypeClient.create(name);
}

/**
 * Renames a product type.
 *
 * @param productTypeIdentifier Product-type identifier.
 * @param data Update payload containing new name and optimistic-lock timestamp.
 * @returns Detail response containing the updated row.
 */
export async function updateProductType(
    productTypeIdentifier: string,
    data: { name: string } & ConfigurationEntityKnownUpdatedAt,
): Promise<ProductTypeDetailResponse> {
    return productTypeClient.update(productTypeIdentifier, data);
}

/**
 * Enables or disables a product type.
 *
 * @param productTypeIdentifier Product-type identifier.
 * @param data Disabled-state payload with optimistic-lock timestamp.
 * @returns Detail response containing the updated row.
 */
export async function setProductTypeDisabled(
    productTypeIdentifier: string,
    data: { disabled: boolean } & ConfigurationEntityKnownUpdatedAt,
): Promise<ProductTypeDetailResponse> {
    return productTypeClient.setDisabled(productTypeIdentifier, data);
}

// ---------------------------------------------------------------------------
// ProductTypesDataTypes — frontend API client
// ---------------------------------------------------------------------------

/** A single DataType assignment row (joined with DataType name/kind/description/config and owner name). */
export type ProductTypeDataTypeAssignment = {
    identifier: string;
    productType: string;
    dataType: string;
    mandatory: boolean | null;
    requestorCanEdit: boolean | null;
    editableOnUpdate: boolean;
    config: Record<string, unknown> | null;
    owner: string | null;
    dataTypeName: string;
    dataTypeKind: string;
    dataTypeDescription: string | null;
    dataTypeConfig: unknown;
    ownerBusinessDomainName: string | null;
};

/** Paginated response for DataType assignments. */
export type ProductTypeDataTypesResponse = {
    dataTypeAssignments: ProductTypeDataTypeAssignment[];
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
};

/** Single DataType assignment response. */
export type ProductTypeDataTypeAssignmentResponse = {
    assignment: ProductTypeDataTypeAssignment;
};

/**
 * Lists assigned DataTypes for a ProductType.
 *
 * @param productTypeIdentifier Product-type identifier.
 * @param page Zero-based page index.
 * @param pageSize Number of rows per page.
 * @param includeDisabledDataTypes When `false`, assignments referencing disabled data types are excluded. Defaults to `true` (include everything).
 */
export async function getProductTypeDataTypes(
    productTypeIdentifier: string,
    page: number,
    pageSize: number,
    includeDisabledDataTypes: boolean = true,
): Promise<ProductTypeDataTypesResponse> {
    const includeDisabledParam = includeDisabledDataTypes ? "" : "&includeDisabledDataTypes=false";
    return apiGet<ProductTypeDataTypesResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes?page=${page}&pageSize=${pageSize}${includeDisabledParam}`,
    );
}

/**
 * Assigns a DataType to a ProductType.
 */
export async function assignDataType(
    productTypeIdentifier: string,
    dataTypeIdentifier: string,
): Promise<ProductTypeDataTypeAssignmentResponse> {
    return apiPost<ProductTypeDataTypeAssignmentResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes`,
        { dataTypeIdentifier },
    );
}

/**
 * Unassigns a DataType from a ProductType.
 */
export async function unassignDataType(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
): Promise<void> {
    await apiDelete(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}`,
    );
}

/**
 * Updates fields on a DataType assignment.
 */
export async function updateDataTypeAssignment(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
    data: Static<typeof UpdateProductTypeDataTypeBodySchema>,
): Promise<ProductTypeDataTypeAssignmentResponse> {
    return apiPatch<ProductTypeDataTypeAssignmentResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}`,
        data,
    );
}

// ---------------------------------------------------------------------------
// ProductTypesDataTypesTargetSystems — frontend API client
// ---------------------------------------------------------------------------

/** A single TargetSystem assignment row (joined with TargetSystem name). */
export type ProductTypeDataTypeTargetSystemRow = {
    productType: string;
    dataType: string;
    targetSystem: string;
    name: string | null;
    targetSystemName: string;
};

/** Paginated response for TargetSystem assignments. */
export type ProductTypeDataTypeTargetSystemsResponse = {
    targetSystems: ProductTypeDataTypeTargetSystemRow[];
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
};

/** Single TargetSystem assignment response. */
export type ProductTypeDataTypeTargetSystemAssignmentResponse = {
    targetSystem: ProductTypeDataTypeTargetSystemRow;
};

/**
 * Lists assigned TargetSystems for a ProductType+DataType.
 */
export async function getProductTypeDataTypeTargetSystems(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
    page: number,
    pageSize: number,
): Promise<ProductTypeDataTypeTargetSystemsResponse> {
    return apiGet<ProductTypeDataTypeTargetSystemsResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}/targetsystems?page=${page}&pageSize=${pageSize}`,
    );
}

/**
 * Assigns a TargetSystem to a ProductType+DataType.
 */
export async function assignTargetSystem(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
    targetSystemIdentifier: string,
): Promise<ProductTypeDataTypeTargetSystemAssignmentResponse> {
    return apiPost<ProductTypeDataTypeTargetSystemAssignmentResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}/targetsystems`,
        { targetSystemIdentifier },
    );
}

/**
 * Unassigns a TargetSystem.
 */
export async function unassignTargetSystem(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
    targetSystemIdentifier: string,
): Promise<void> {
    await apiDelete(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}/targetsystems/${encodeURIComponent(targetSystemIdentifier)}`,
    );
}

/**
 * Updates the name override on a TargetSystem assignment.
 */
export async function updateTargetSystemAssignment(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
    targetSystemIdentifier: string,
    name: string | null,
): Promise<ProductTypeDataTypeTargetSystemAssignmentResponse> {
    return apiPatch<ProductTypeDataTypeTargetSystemAssignmentResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}/targetsystems/${encodeURIComponent(targetSystemIdentifier)}`,
        { name },
    );
}

// ---------------------------------------------------------------------------
// ProductTypesDataTypePermission — frontend API client
// ---------------------------------------------------------------------------

/** One permission entry (joined with group name). */
export type ProductTypeDataTypePermissionEntry = {
    productTypeDataTypeIdentifier: string;
    groupIdentifier: string;
    groupName: string;
    role: "viewer" | "writer" | "approver";
    showByDefault: boolean;
    createdAt: string;
    createdBy: string;
};

/** Permissions list response. */
export type ProductTypeDataTypePermissionsResponse = {
    permissions: ProductTypeDataTypePermissionEntry[];
};

/** Grant permission response. */
export type ProductTypeDataTypePermissionGrantResponse = {
    permission: ProductTypeDataTypePermissionEntry;
};

/**
 * Lists permissions for a ProductType+DataType assignment.
 */
export async function getProductTypeDataTypePermissions(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
): Promise<ProductTypeDataTypePermissionsResponse> {
    return apiGet<ProductTypeDataTypePermissionsResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}/permissions`,
    );
}

/**
 * Grants a role to a group for a ProductType+DataType assignment.
 */
export async function grantProductTypeDataTypePermission(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
    data: { groupIdentifier: string; role: string; showByDefault?: boolean },
): Promise<ProductTypeDataTypePermissionGrantResponse> {
    return apiPost<ProductTypeDataTypePermissionGrantResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}/permissions`,
        data,
    );
}

/**
 * Revokes a role from a group.
 */
export async function revokeProductTypeDataTypePermission(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
    data: { groupIdentifier: string; role: string },
): Promise<void> {
    await apiDelete(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}/permissions`,
        data,
    );
}

/**
 * Updates the showByDefault flag on a permission.
 */
export async function updateProductTypeDataTypePermission(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
    permId: string,
    data: { showByDefault: boolean },
): Promise<ProductTypeDataTypePermissionGrantResponse> {
    return apiPatch<ProductTypeDataTypePermissionGrantResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}/permissions/${encodeURIComponent(permId)}`,
        data,
    );
}

// ---------------------------------------------------------------------------
// ProductTypesDataTypePreviousApproval — frontend API client
// ---------------------------------------------------------------------------

/** One previous approval entry (joined with data type name). */
export type PreviousApprovalEntry = {
    dependsOnDataType: string;
    dependsOnDataTypeName: string;
};

/** Previous approvals list response. */
export type PreviousApprovalsResponse = { previousApprovals: PreviousApprovalEntry[] };
/** Add previous approval response. */
export type PreviousApprovalAddResponse = { previousApproval: PreviousApprovalEntry };

/**
 * Lists previous-approval dependencies for a ProductType+DataType assignment.
 */
export async function getProductTypeDataTypePreviousApprovals(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
): Promise<PreviousApprovalsResponse> {
    return apiGet<PreviousApprovalsResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}/previous-approvals`,
    );
}

/**
 * Adds a previous-approval dependency.
 */
export async function addProductTypeDataTypePreviousApproval(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
    dependsOnDataTypeIdentifier: string,
): Promise<PreviousApprovalAddResponse> {
    return apiPost<PreviousApprovalAddResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}/previous-approvals`,
        { dependsOnDataType: dependsOnDataTypeIdentifier },
    );
}

/**
 * Removes a previous-approval dependency.
 */
export async function removeProductTypeDataTypePreviousApproval(
    productTypeIdentifier: string,
    assignmentIdentifier: string,
    dependsOnDataTypeIdentifier: string,
): Promise<void> {
    await apiDelete(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/datatypes/${encodeURIComponent(assignmentIdentifier)}/previous-approvals/${encodeURIComponent(dependsOnDataTypeIdentifier)}`,
    );
}

// ---------------------------------------------------------------------------
// ProductTypesPermission — frontend API client (product-type-level, role "cancel")
// ---------------------------------------------------------------------------

/** One product-type-level permission entry (joined with group name). */
export type ProductTypePermissionEntry = {
    productTypeIdentifier: string;
    groupIdentifier: string;
    groupName: string;
    role: string;
    createdAt: string;
    createdBy: string;
};

/** Product-type-level permissions list response. */
export type ProductTypePermissionsResponse = {
    permissions: ProductTypePermissionEntry[];
};

/** Grant product-type-level permission response. */
export type ProductTypePermissionGrantResponse = {
    permission: ProductTypePermissionEntry | null;
};

/**
 * Lists product-type-level permissions.
 */
export async function getProductTypePermissions(
    productTypeIdentifier: string,
): Promise<ProductTypePermissionsResponse> {
    return apiGet<ProductTypePermissionsResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/permissions`,
    );
}

/**
 * Grants the cancel role to a group for a product type.
 */
export async function grantProductTypePermission(
    productTypeIdentifier: string,
    data: { groupIdentifier: string },
): Promise<ProductTypePermissionGrantResponse> {
    return apiPost<ProductTypePermissionGrantResponse>(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/permissions`,
        data,
    );
}

/**
 * Revokes the cancel role from a group for a product type.
 */
export async function revokeProductTypePermission(
    productTypeIdentifier: string,
    data: { groupIdentifier: string },
): Promise<void> {
    await apiDelete(
        `${BASE}/${encodeURIComponent(productTypeIdentifier)}/permissions`,
        data,
    );
}


