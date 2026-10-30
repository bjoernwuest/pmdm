import { Type, type Static } from "@sinclair/typebox";
import { FunctionalPermissionSelectSchema } from "@/types/FunctionalPermissionType.ts";

/** Canonical data-type role names available on the effective-permissions page. */
export const EffectivePermissionRoleSchema = Type.Union([
    Type.Literal("viewer"),
    Type.Literal("writer"),
    Type.Literal("approver"),
], { description: "Canonical data-type role held by the user." });
export type EffectivePermissionRole = Static<typeof EffectivePermissionRoleSchema>;

/** Role-based capabilities for one data type within one product type. */
export const EffectiveDataTypePermissionSchema = Type.Object({
    identifier: Type.String({ description: "Data type identifier." }),
    name: Type.String({ description: "Data type name." }),
    kind: Type.String({ description: "Data type kind, e.g. string, lookup or calculated." }),
    roles: Type.Array(EffectivePermissionRoleSchema, { description: "Roles the user holds on this data type, in canonical order." }),
    canRead: Type.Boolean({ description: "Whether the user holds at least one role on this data type." }),
    canWrite: Type.Boolean({ description: "Whether the user holds the writer role and the data type is not calculated." }),
    canApprove: Type.Boolean({ description: "Whether the user holds the approver role and the data type is not calculated." }),
}, { description: "Effective role-based capabilities for a data type within a product type." });
export type EffectiveDataTypePermission = Static<typeof EffectiveDataTypePermissionSchema>;

/** Effective product-type capabilities including the full data-type matrix. */
export const EffectiveProductTypePermissionSchema = Type.Object({
    identifier: Type.String({ description: "Product type identifier." }),
    name: Type.String({ description: "Product type name." }),
    description: Type.Union([Type.String(), Type.Null()], { description: "Product type description, if any." }),
    cancelAllRequests: Type.Boolean({ description: "Whether the user may cancel any request of this product type." }),
    cancelOwnRequests: Type.Boolean({ description: "Whether the product type lets requestors cancel their own requests." }),
    dataTypes: Type.Array(EffectiveDataTypePermissionSchema, { description: "Active data types assigned to this product type and the user's capabilities on them." }),
}, { description: "Effective product-type capabilities and data-type matrix for the logged-in user." });
export type EffectiveProductTypePermission = Static<typeof EffectiveProductTypePermissionSchema>;

/** Response payload of GET /api/me/effective-permissions. */
export const EffectivePermissionsResponseSchema = Type.Object({
    functionalPermissions: Type.Array(FunctionalPermissionSelectSchema, { description: "Functional permissions the user effectively holds." }),
    productTypes: Type.Array(EffectiveProductTypePermissionSchema, { description: "All active product types with the user's effective capabilities." }),
}, { description: "Functional permissions and product-type capabilities for the logged-in user." });
export type EffectivePermissionsResponse = Static<typeof EffectivePermissionsResponseSchema>;
