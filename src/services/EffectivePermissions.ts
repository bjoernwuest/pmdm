import type { DBClient } from "@/services/DatabaseDriver.ts";
import { getLoggedinUserObject, getMyFunctionalPermissions } from "@/services/auth/permissions.ts";
import {
    ProductTypeRepo,
    getAssignedDataTypesForProductTypes,
    getProductTypesWithCancelPermission,
    type AssignedDataTypeForProductType,
} from "@/repo/ProductTypeRepo.ts";
import { buildPermissionLookup } from "@/repo/ProductRequestRepo.ts";
import type {
    EffectiveDataTypePermission,
    EffectivePermissionRole,
    EffectivePermissionsResponse,
    EffectiveProductTypePermission,
} from "@/types/EffectivePermissionsType.ts";

const CANONICAL_ROLE_ORDER: readonly EffectivePermissionRole[] = ["viewer", "writer", "approver"];
const CALCULATED_DATA_TYPE_KIND = "calculated";

/** Minimal product-type data needed to build the effective-permission matrix. */
export type EffectiveProductTypeSource = {
    identifier: string;
    name: string;
    description: string | null;
    requestorCanCancel: boolean;
};

/** Role lookup callback used by {@link buildEffectiveProductTypePermissions}. */
export type EffectivePermissionRoleLookup = (
    productTypeIdentifier: string,
    dataTypeIdentifier: string,
) => readonly string[];

/** Orders roles canonically (`viewer`, `writer`, `approver`) and drops unknown values. */
export function normalizeEffectiveRoles(roles: readonly string[]): EffectivePermissionRole[] {
    const present = new Set(roles);
    return CANONICAL_ROLE_ORDER.filter((role) => present.has(role));
}

function compareByNameThenIdentifier(
    a: { name: string; identifier: string },
    b: { name: string; identifier: string },
): number {
    return a.name.localeCompare(b.name) || a.identifier.localeCompare(b.identifier);
}

function compareAssignments(
    a: AssignedDataTypeForProductType,
    b: AssignedDataTypeForProductType,
): number {
    return a.dataTypeName.localeCompare(b.dataTypeName) || a.dataType.localeCompare(b.dataType);
}

/**
 * Applies the effective-permission semantics to pre-loaded data.
 *
 * All active product types are returned, even when the user holds no role and no
 * cancel right. Write and approve are not actionable for calculated data types,
 * but the assigned roles remain visible in `roles`.
 */
export function buildEffectiveProductTypePermissions(
    productTypes: readonly EffectiveProductTypeSource[],
    assignments: readonly AssignedDataTypeForProductType[],
    getRoles: EffectivePermissionRoleLookup,
    cancelAllProductTypes: ReadonlySet<string>,
): EffectiveProductTypePermission[] {
    const assignmentsByProductType = new Map<string, AssignedDataTypeForProductType[]>();
    for (const assignment of assignments) {
        const entries = assignmentsByProductType.get(assignment.productType) ?? [];
        entries.push(assignment);
        assignmentsByProductType.set(assignment.productType, entries);
    }

    return [...productTypes].sort(compareByNameThenIdentifier).map((productType) => {
        const dataTypes: EffectiveDataTypePermission[] = [...(assignmentsByProductType.get(productType.identifier) ?? [])]
            .sort(compareAssignments)
            .map((assignment) => {
                const roles = normalizeEffectiveRoles(getRoles(productType.identifier, assignment.dataType));
                const isCalculated = assignment.dataTypeKind === CALCULATED_DATA_TYPE_KIND;

                return {
                    identifier: assignment.dataType,
                    name: assignment.dataTypeName,
                    kind: assignment.dataTypeKind,
                    roles,
                    canRead: roles.length > 0,
                    canWrite: !isCalculated && roles.includes("writer"),
                    canApprove: !isCalculated && roles.includes("approver"),
                };
            });

        return {
            identifier: productType.identifier,
            name: productType.name,
            description: productType.description,
            cancelAllRequests: cancelAllProductTypes.has(productType.identifier),
            cancelOwnRequests: productType.requestorCanCancel,
            dataTypes,
        };
    });
}

/**
 * Resolves the logged-in principal's functional permissions and effective
 * product-type capabilities.
 *
 * Product-type roles come from actual group assignments only — the root-group
 * bypass applies to functional permissions, not to product-request gates.
 * Principals without a user row (API key or bearer token) receive an empty
 * product-type matrix.
 */
export async function getMyEffectivePermissions(
    db: DBClient,
    claims: Record<string, any>,
): Promise<EffectivePermissionsResponse> {
    const functionalPermissions = await getMyFunctionalPermissions(db, claims);
    const user = await getLoggedinUserObject(db, claims);

    if (!user) {
        return { functionalPermissions, productTypes: [] };
    }

    const productTypes = await ProductTypeRepo.get(db, false);
    if (productTypes.length === 0) {
        return { functionalPermissions, productTypes: [] };
    }

    const identifiers = productTypes.map((productType) => productType.identifier);
    const [assignments, cancelAllProductTypes, permissionLookup] = await Promise.all([
        getAssignedDataTypesForProductTypes(db, identifiers),
        getProductTypesWithCancelPermission(db, user.identifier, identifiers),
        buildPermissionLookup(db, user, identifiers),
    ]);

    return {
        functionalPermissions,
        productTypes: buildEffectiveProductTypePermissions(
            productTypes.map((productType) => ({
                identifier: productType.identifier,
                name: productType.name,
                description: productType.description ?? null,
                requestorCanCancel: productType.requestorCanCancel,
            })),
            assignments,
            (productTypeIdentifier, dataTypeIdentifier) =>
                permissionLookup(productTypeIdentifier, dataTypeIdentifier).roles,
            cancelAllProductTypes,
        ),
    };
}
