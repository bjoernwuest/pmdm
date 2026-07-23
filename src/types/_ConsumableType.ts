// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

export const ConsumablesSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Boolean(),
  description: Type.Optional(Nullable(Type.String())),
});
export type ConsumablesSelectType = Static<typeof ConsumablesSelectSchema>;

export const ConsumablesInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Optional(Type.Boolean()),
  description: Type.Optional(Nullable(Type.String())),
});
export type ConsumablesInsertType = Static<typeof ConsumablesInsertSchema>;

export const ConsumablesValuesSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Boolean(),
  description: Type.Optional(Nullable(Type.String())),
  isUsed: Type.Boolean(),
  consumableIdentifier: Type.String({ format: 'uuid' }),
});
export type ConsumablesValuesSelectType = Static<typeof ConsumablesValuesSelectSchema>;

export const ConsumablesValuesInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Optional(Type.Boolean()),
  description: Type.Optional(Nullable(Type.String())),
  isUsed: Type.Optional(Type.Boolean()),
  consumableIdentifier: Type.String({ format: 'uuid' }),
});
export type ConsumablesValuesInsertType = Static<typeof ConsumablesValuesInsertSchema>;
