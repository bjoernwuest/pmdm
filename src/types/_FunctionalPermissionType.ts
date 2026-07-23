// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';

export const FunctionalPermissionSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  functionalPermissionName: Type.String(),
  description: Type.String(),
  group: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type FunctionalPermissionSelectType = Static<typeof FunctionalPermissionSelectSchema>;

export const FunctionalPermissionInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  functionalPermissionName: Type.String(),
  description: Type.String(),
  group: Type.Optional(Type.String()),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});
export type FunctionalPermissionInsertType = Static<typeof FunctionalPermissionInsertSchema>;

export const FunctionalPermissionsOfGroupSelectSchema = Type.Object({
  functionalPermissionIdentifier: Type.String({ format: 'uuid' }),
  grantedTo: Type.String({ format: 'uuid' }),
  grantedBy: Type.String({ format: 'uuid' }),
});
export type FunctionalPermissionsOfGroupSelectType = Static<typeof FunctionalPermissionsOfGroupSelectSchema>;

export const FunctionalPermissionsOfGroupInsertSchema = Type.Object({
  functionalPermissionIdentifier: Type.String({ format: 'uuid' }),
  grantedTo: Type.String({ format: 'uuid' }),
  grantedBy: Type.String({ format: 'uuid' }),
});
export type FunctionalPermissionsOfGroupInsertType = Static<typeof FunctionalPermissionsOfGroupInsertSchema>;
