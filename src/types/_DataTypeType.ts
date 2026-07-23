// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

export const DataTypeGroupRoles = {
    Viewer: "viewer" as const,
    Writer: "writer" as const,
    Approver: "approver" as const,
};

export type DataTypeGroupRoles = typeof DataTypeGroupRoles[keyof typeof DataTypeGroupRoles];

export const DataTypePermissionSelectSchema = Type.Object({
  dataTypeIdentifier: Type.String({ format: 'uuid' }),
  groupIdentifier: Type.String({ format: 'uuid' }),
  role: Type.String(),
  createdAt: Type.String(),
  createdBy: Type.String({ format: 'uuid' }),
  showByDefault: Type.Boolean(),
});
export type DataTypePermissionSelectType = Static<typeof DataTypePermissionSelectSchema>;

export const DataTypePermissionInsertSchema = Type.Object({
  dataTypeIdentifier: Type.String({ format: 'uuid' }),
  groupIdentifier: Type.String({ format: 'uuid' }),
  role: Type.String(),
  createdAt: Type.Optional(Type.String()),
  createdBy: Type.String({ format: 'uuid' }),
  showByDefault: Type.Optional(Type.Boolean()),
});
export type DataTypePermissionInsertType = Static<typeof DataTypePermissionInsertSchema>;

export const DataTypeSchemaSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Boolean(),
  description: Type.Optional(Nullable(Type.String())),
  kind: Type.String(),
  mandatory: Type.String(),
  mandatory_script: Type.Optional(Nullable(Type.String())),
  requestorCanEdit: Type.String(),
  requestorCanEdit_script: Type.Optional(Nullable(Type.String())),
  config: Type.Unknown(),
  owner: Type.String({ format: 'uuid' }),
});
export type DataTypeSchemaSelectType = Static<typeof DataTypeSchemaSelectSchema>;

export const DataTypeSchemaInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Optional(Type.Boolean()),
  description: Type.Optional(Nullable(Type.String())),
  kind: Type.String(),
  mandatory: Type.String(),
  mandatory_script: Type.Optional(Nullable(Type.String())),
  requestorCanEdit: Type.String(),
  requestorCanEdit_script: Type.Optional(Nullable(Type.String())),
  config: Type.Unknown(),
  owner: Type.String({ format: 'uuid' }),
});
export type DataTypeSchemaInsertType = Static<typeof DataTypeSchemaInsertSchema>;
