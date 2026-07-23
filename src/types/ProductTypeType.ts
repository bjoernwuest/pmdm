import {
    ProductTypes,
    ProductTypesDataTypes,
    ProductTypesDataTypesTargetSystems,
    ProductTypesDataTypePermission,
    ProductTypesDataTypePreviousApproval,
} from "@/schema/ProductTypeSchema.ts";
import {Type, type Static} from "@sinclair/typebox";
import {createInsertSchema, createSelectSchema} from "drizzle-typebox";
import type {DataTypeGroupRoles} from "@/schema/DataTypeSchema.ts";
import {TAG_CREATE, TAG_DISABLE, TAG_GRANT, TAG_REVOKE, TAG_UPDATE, type Tag} from "./PubSubType";

export * from "./_ProductTypeType.ts";

// ---------------------------------------------------------------------------
// ProductType (main table) — keep existing
// ---------------------------------------------------------------------------

export const ProductTypeSchema = Type.Object(createSelectSchema(ProductTypes).properties)

export type ProductTypeType = typeof ProductTypes.$inferSelect;
export type NewProductType = typeof ProductTypes.$inferInsert;

/** Resource tag for ProductType. */
export const TAG_PRODUCT_TYPE = "product_type" as const;

/** PubSub topic for product type disable events. */
export const message_DisableProductType: Tag[] = [TAG_PRODUCT_TYPE, TAG_DISABLE];
/** PubSub topic for product type update events. */
export const message_UpdateProductType: Tag[] = [TAG_PRODUCT_TYPE, TAG_UPDATE];
/** PubSub topic for product type create events. */
export const message_CreateProductType: Tag[] = [TAG_PRODUCT_TYPE, TAG_CREATE];

// ---------------------------------------------------------------------------
// ProductTypesDataTypes — TypeBox schemas & types
// ---------------------------------------------------------------------------

export const ProductTypesDataTypeSelectSchema = Type.Object(createSelectSchema(ProductTypesDataTypes).properties);
export const ProductTypesDataTypeInsertSchema = Type.Object(createInsertSchema(ProductTypesDataTypes).properties);
export type ProductTypesDataType = Static<typeof ProductTypesDataTypeSelectSchema>;
export type NewProductTypesDataType = Static<typeof ProductTypesDataTypeInsertSchema>;

/** ProductTypesDataTypes joined with DataType name/kind/description/config and owner BusinessDomain name. */
export type ProductTypeDataTypeWithDetails = ProductTypesDataType & {
    dataTypeName: string;
    dataTypeKind: string;
    dataTypeDescription: string | null;
    dataTypeConfig: unknown;
    ownerBusinessDomainName: string | null;
};

// PATCH body for ProductTypesDataTypes — all mutable fields, all optional
export const UpdateProductTypeDataTypeBodySchema = Type.Partial(Type.Omit(
    ProductTypesDataTypeInsertSchema,
    ["identifier", "productType", "dataType"],
));

// ---------------------------------------------------------------------------
// ProductTypesDataTypesTargetSystems — TypeBox schemas & types
// ---------------------------------------------------------------------------

export const ProductTypesDataTypesTargetSystemSelectSchema = Type.Object(createSelectSchema(ProductTypesDataTypesTargetSystems).properties);
export const ProductTypesDataTypesTargetSystemInsertSchema = Type.Object(createInsertSchema(ProductTypesDataTypesTargetSystems).properties);
export type ProductTypesDataTypesTargetSystem = Static<typeof ProductTypesDataTypesTargetSystemSelectSchema>;
export type NewProductTypesDataTypesTargetSystem = Static<typeof ProductTypesDataTypesTargetSystemInsertSchema>;

/** ProductTypesDataTypesTargetSystems joined with TargetSystem name. */
export type ProductTypeDataTypeTargetSystemWithDetails = ProductTypesDataTypesTargetSystem & {
    targetSystemName: string;
};

// PATCH body for target system assignment — only name is mutable
export const UpdateProductTypeDataTypeTargetSystemBodySchema = Type.Pick(
    ProductTypesDataTypesTargetSystemInsertSchema,
    ["name"],
);

// ---------------------------------------------------------------------------
// ProductTypesDataTypePermission — TypeBox schemas & types
// ---------------------------------------------------------------------------

export const ProductTypesDataTypePermissionSelectSchema = Type.Object(createSelectSchema(ProductTypesDataTypePermission).properties);
export const ProductTypesDataTypePermissionInsertSchema = Type.Object(createInsertSchema(ProductTypesDataTypePermission).properties);
export type ProductTypesDataTypePermissionType = Static<typeof ProductTypesDataTypePermissionSelectSchema>;
export type NewProductTypesDataTypePermissionType = Static<typeof ProductTypesDataTypePermissionInsertSchema>;

/** ProductTypesDataTypePermission joined with Group name. */
export type ProductTypeDataTypePermissionWithGroup = ProductTypesDataTypePermissionType & {
    groupName: string;
};

// POST body for granting a permission — fields the client must provide
export const GrantProductTypeDataTypePermissionBodySchema = Type.Pick(
    ProductTypesDataTypePermissionInsertSchema,
    ["groupIdentifier", "role"],
);

// DELETE body for revoking a permission
export const RevokeProductTypeDataTypePermissionBodySchema = Type.Pick(
    ProductTypesDataTypePermissionInsertSchema,
    ["groupIdentifier", "role"],
);

// PATCH body for updating a permission — only showByDefault is mutable
export const UpdateProductTypeDataTypePermissionBodySchema = Type.Pick(
    ProductTypesDataTypePermissionInsertSchema,
    ["showByDefault"],
);

// ---------------------------------------------------------------------------
// PubSub message channels
// ---------------------------------------------------------------------------

/** Resource tag for ProductTypeDataType (assignment). */
export const TAG_PRODUCT_TYPE_DATA_TYPE = "product_type_data_type" as const;
/** Resource tag for ProductTypeDataTypeTargetSystem (assignment). */
export const TAG_PRODUCT_TYPE_DATA_TYPE_TARGET_SYSTEM = "product_type_data_type_target_system" as const;
/** Resource tag for ProductTypeDataTypePermission. */
export const TAG_PRODUCT_TYPE_DATA_TYPE_PERMISSION = "product_type_data_type_permission" as const;
/** Action tag for assign events. */
export const TAG_ASSIGN = "assign" as const;
/** Action tag for unassign events. */
export const TAG_UNASSIGN = "unassign" as const;

/** PubSub topic for assign DataType to ProductType events. */
export const message_AssignProductTypeDataType: Tag[] = [TAG_PRODUCT_TYPE_DATA_TYPE, TAG_ASSIGN];
/** PubSub topic for unassign DataType from ProductType events. */
export const message_UnassignProductTypeDataType: Tag[] = [TAG_PRODUCT_TYPE_DATA_TYPE, TAG_UNASSIGN];
/** PubSub topic for update ProductTypeDataType assignment events. */
export const message_UpdateProductTypeDataType: Tag[] = [TAG_PRODUCT_TYPE_DATA_TYPE, TAG_UPDATE];

/** PubSub topic for assign TargetSystem to ProductTypeDataType events. */
export const message_AssignProductTypeDataTypeTargetSystem: Tag[] = [TAG_PRODUCT_TYPE_DATA_TYPE_TARGET_SYSTEM, TAG_ASSIGN];
/** PubSub topic for unassign TargetSystem from ProductTypeDataType events. */
export const message_UnassignProductTypeDataTypeTargetSystem: Tag[] = [TAG_PRODUCT_TYPE_DATA_TYPE_TARGET_SYSTEM, TAG_UNASSIGN];
/** PubSub topic for update TargetSystem assignment events. */
export const message_UpdateProductTypeDataTypeTargetSystem: Tag[] = [TAG_PRODUCT_TYPE_DATA_TYPE_TARGET_SYSTEM, TAG_UPDATE];

/** PubSub topic for grant ProductTypeDataTypePermission events. */
export const message_GrantProductTypeDataTypePermission: Tag[] = [TAG_PRODUCT_TYPE_DATA_TYPE_PERMISSION, TAG_GRANT];
/** PubSub topic for revoke ProductTypeDataTypePermission events. */
export const message_RevokeProductTypeDataTypePermission: Tag[] = [TAG_PRODUCT_TYPE_DATA_TYPE_PERMISSION, TAG_REVOKE];
/** PubSub topic for update ProductTypeDataTypePermission events. */
export const message_UpdateProductTypeDataTypePermission: Tag[] = [TAG_PRODUCT_TYPE_DATA_TYPE_PERMISSION, TAG_UPDATE];

// ---------------------------------------------------------------------------
// ProductTypesPermission (product-type-level, role "cancel")
// ---------------------------------------------------------------------------

/** Resource tag for ProductTypesPermission (product-type-level permissions). */
export const TAG_PRODUCT_TYPE_PERMISSION = "product_type_permission" as const;

/** PubSub topic for grant ProductTypePermission events. */
export const message_GrantProductTypePermission: Tag[] = [TAG_PRODUCT_TYPE_PERMISSION, TAG_GRANT];
/** PubSub topic for revoke ProductTypePermission events. */
export const message_RevokeProductTypePermission: Tag[] = [TAG_PRODUCT_TYPE_PERMISSION, TAG_REVOKE];

// ---------------------------------------------------------------------------
// ProductTypesDataTypePreviousApproval — TypeBox schemas & types
// ---------------------------------------------------------------------------

export const ProductTypesDataTypePreviousApprovalSelectSchema = Type.Object(createSelectSchema(ProductTypesDataTypePreviousApproval).properties);
export const ProductTypesDataTypePreviousApprovalInsertSchema = Type.Object(createInsertSchema(ProductTypesDataTypePreviousApproval).properties);
export type ProductTypesDataTypePreviousApprovalType = Static<typeof ProductTypesDataTypePreviousApprovalSelectSchema>;
export type NewProductTypesDataTypePreviousApprovalType = Static<typeof ProductTypesDataTypePreviousApprovalInsertSchema>;

/** ProductTypesDataTypePreviousApproval joined with dependsOnDataType name. */
export type ProductTypeDataTypePreviousApprovalWithName = {
    dependsOnDataType: string;
    dependsOnDataTypeName: string;
};

/** POST body for adding a previous approval — client only sends dependsOnDataType. */
export const AddProductTypeDataTypePreviousApprovalBodySchema = Type.Pick(
    ProductTypesDataTypePreviousApprovalInsertSchema,
    ["dependsOnDataType"],
);

// ---------------------------------------------------------------------------
// PubSub message channels for Previous Approval
// ---------------------------------------------------------------------------

/** Resource tag for ProductTypeDataTypePreviousApproval. */
export const TAG_PRODUCT_TYPE_DATA_TYPE_PREVIOUS_APPROVAL = "product_type_data_type_previous_approval" as const;

/** PubSub topic for adding a previous approval dependency. */
export const message_AddPreviousApproval: Tag[] = [TAG_PRODUCT_TYPE_DATA_TYPE_PREVIOUS_APPROVAL, TAG_ASSIGN];
/** PubSub topic for removing a previous approval dependency. */
export const message_RemovePreviousApproval: Tag[] = [TAG_PRODUCT_TYPE_DATA_TYPE_PREVIOUS_APPROVAL, TAG_UNASSIGN];
