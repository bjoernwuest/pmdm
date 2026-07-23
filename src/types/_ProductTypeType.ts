// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

export const ProductTypesSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Boolean(),
  description: Type.Optional(Nullable(Type.String())),
  requestorCanCancel: Type.Boolean(),
});
export type ProductTypesSelectType = Static<typeof ProductTypesSelectSchema>;

export const ProductTypesInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Optional(Type.Boolean()),
  description: Type.Optional(Nullable(Type.String())),
  requestorCanCancel: Type.Optional(Type.Boolean()),
});
export type ProductTypesInsertType = Static<typeof ProductTypesInsertSchema>;

export const ProductTypesDataTypePermissionSelectSchema = Type.Object({
  productTypeDataTypeIdentifier: Type.String({ format: 'uuid' }),
  groupIdentifier: Type.String({ format: 'uuid' }),
  role: Type.String(),
  createdAt: Type.String(),
  createdBy: Type.String({ format: 'uuid' }),
  showByDefault: Type.Boolean(),
});
export type ProductTypesDataTypePermissionSelectType = Static<typeof ProductTypesDataTypePermissionSelectSchema>;

export const ProductTypesDataTypePermissionInsertSchema = Type.Object({
  productTypeDataTypeIdentifier: Type.String({ format: 'uuid' }),
  groupIdentifier: Type.String({ format: 'uuid' }),
  role: Type.String(),
  createdAt: Type.Optional(Type.String()),
  createdBy: Type.String({ format: 'uuid' }),
  showByDefault: Type.Optional(Type.Boolean()),
});
export type ProductTypesDataTypePermissionInsertType = Static<typeof ProductTypesDataTypePermissionInsertSchema>;

export const ProductTypesDataTypePreviousApprovalSelectSchema = Type.Object({
  productType: Type.String({ format: 'uuid' }),
  dataType: Type.String({ format: 'uuid' }),
  dependsOnDataType: Type.String({ format: 'uuid' }),
});
export type ProductTypesDataTypePreviousApprovalSelectType = Static<typeof ProductTypesDataTypePreviousApprovalSelectSchema>;

export const ProductTypesDataTypePreviousApprovalInsertSchema = Type.Object({
  productType: Type.String({ format: 'uuid' }),
  dataType: Type.String({ format: 'uuid' }),
  dependsOnDataType: Type.String({ format: 'uuid' }),
});
export type ProductTypesDataTypePreviousApprovalInsertType = Static<typeof ProductTypesDataTypePreviousApprovalInsertSchema>;

export const ProductTypesDataTypesSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  productType: Type.String({ format: 'uuid' }),
  dataType: Type.String({ format: 'uuid' }),
  mandatory: Type.Optional(Nullable(Type.String())),
  mandatory_script: Type.Optional(Nullable(Type.String())),
  requestorCanEdit: Type.Optional(Nullable(Type.String())),
  requestorCanEdit_script: Type.Optional(Nullable(Type.String())),
  config: Type.Optional(Nullable(Type.Unknown())),
  owner: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  editableOnUpdate: Type.Boolean(),
});
export type ProductTypesDataTypesSelectType = Static<typeof ProductTypesDataTypesSelectSchema>;

export const ProductTypesDataTypesInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  productType: Type.String({ format: 'uuid' }),
  dataType: Type.String({ format: 'uuid' }),
  mandatory: Type.Optional(Nullable(Type.String())),
  mandatory_script: Type.Optional(Nullable(Type.String())),
  requestorCanEdit: Type.Optional(Nullable(Type.String())),
  requestorCanEdit_script: Type.Optional(Nullable(Type.String())),
  config: Type.Optional(Nullable(Type.Unknown())),
  owner: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  editableOnUpdate: Type.Optional(Type.Boolean()),
});
export type ProductTypesDataTypesInsertType = Static<typeof ProductTypesDataTypesInsertSchema>;

export const ProductTypesDataTypesTargetSystemsSelectSchema = Type.Object({
  productType: Type.String({ format: 'uuid' }),
  dataType: Type.String({ format: 'uuid' }),
  targetSystem: Type.String({ format: 'uuid' }),
  name: Type.Optional(Nullable(Type.String())),
});
export type ProductTypesDataTypesTargetSystemsSelectType = Static<typeof ProductTypesDataTypesTargetSystemsSelectSchema>;

export const ProductTypesDataTypesTargetSystemsInsertSchema = Type.Object({
  productType: Type.String({ format: 'uuid' }),
  dataType: Type.String({ format: 'uuid' }),
  targetSystem: Type.String({ format: 'uuid' }),
  name: Type.Optional(Nullable(Type.String())),
});
export type ProductTypesDataTypesTargetSystemsInsertType = Static<typeof ProductTypesDataTypesTargetSystemsInsertSchema>;

export const ProductTypesPermissionSelectSchema = Type.Object({
  productTypeIdentifier: Type.String({ format: 'uuid' }),
  groupIdentifier: Type.String({ format: 'uuid' }),
  role: Type.String(),
  createdAt: Type.String(),
  createdBy: Type.String({ format: 'uuid' }),
});
export type ProductTypesPermissionSelectType = Static<typeof ProductTypesPermissionSelectSchema>;

export const ProductTypesPermissionInsertSchema = Type.Object({
  productTypeIdentifier: Type.String({ format: 'uuid' }),
  groupIdentifier: Type.String({ format: 'uuid' }),
  role: Type.Optional(Type.String()),
  createdAt: Type.Optional(Type.String()),
  createdBy: Type.String({ format: 'uuid' }),
});
export type ProductTypesPermissionInsertType = Static<typeof ProductTypesPermissionInsertSchema>;
