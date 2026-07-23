// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

export const ApiKeyFunctionalPermissionSelectSchema = Type.Object({
  apiKeyIdentifier: Type.String({ format: 'uuid' }),
  functionalPermissionIdentifier: Type.String({ format: 'uuid' }),
  grantedBy: Type.String({ format: 'uuid' }),
  grantedAt: Type.String(),
});
export type ApiKeyFunctionalPermissionSelectType = Static<typeof ApiKeyFunctionalPermissionSelectSchema>;

export const ApiKeyFunctionalPermissionInsertSchema = Type.Object({
  apiKeyIdentifier: Type.String({ format: 'uuid' }),
  functionalPermissionIdentifier: Type.String({ format: 'uuid' }),
  grantedBy: Type.String({ format: 'uuid' }),
  grantedAt: Type.Optional(Type.String()),
});
export type ApiKeyFunctionalPermissionInsertType = Static<typeof ApiKeyFunctionalPermissionInsertSchema>;

export const ApiKeySchemaSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  name: Type.String(),
  description: Type.Optional(Nullable(Type.String())),
  keyHash: Type.String(),
  createdBy: Type.String({ format: 'uuid' }),
  expiresAt: Type.String(),
  lastProlongedAt: Type.Optional(Nullable(Type.String())),
  lastProlongedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  disabled: Type.Boolean(),
  disabledAt: Type.Optional(Nullable(Type.String())),
  disabledBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
});
export type ApiKeySchemaSelectType = Static<typeof ApiKeySchemaSelectSchema>;

export const ApiKeySchemaInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  name: Type.String(),
  description: Type.Optional(Nullable(Type.String())),
  keyHash: Type.String(),
  createdBy: Type.String({ format: 'uuid' }),
  expiresAt: Type.String(),
  lastProlongedAt: Type.Optional(Nullable(Type.String())),
  lastProlongedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  disabled: Type.Optional(Type.Boolean()),
  disabledAt: Type.Optional(Nullable(Type.String())),
  disabledBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
});
export type ApiKeySchemaInsertType = Static<typeof ApiKeySchemaInsertSchema>;
