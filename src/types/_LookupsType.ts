// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

/** Source marker used for manually maintained lookup values. */
export const LOOKUP_SOURCE_SYSTEM_MANUAL = "manual" as const;

export const LookupsSchemaSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Boolean(),
  description: Type.Optional(Nullable(Type.String())),
  sourceSystem: Type.String(),
});
export type LookupsSchemaSelectType = Static<typeof LookupsSchemaSelectSchema>;

export const LookupsSchemaInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Optional(Type.Boolean()),
  description: Type.Optional(Nullable(Type.String())),
  sourceSystem: Type.Optional(Type.String()),
});
export type LookupsSchemaInsertType = Static<typeof LookupsSchemaInsertSchema>;

export const LookupsValuesSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Boolean(),
  description: Type.Optional(Nullable(Type.String())),
  sourceSystemIdentifier: Type.Optional(Nullable(Type.String())),
  lookupIdentifier: Type.String({ format: 'uuid' }),
});
export type LookupsValuesSelectType = Static<typeof LookupsValuesSelectSchema>;

export const LookupsValuesInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Optional(Type.Boolean()),
  description: Type.Optional(Nullable(Type.String())),
  sourceSystemIdentifier: Type.Optional(Nullable(Type.String())),
  lookupIdentifier: Type.String({ format: 'uuid' }),
});
export type LookupsValuesInsertType = Static<typeof LookupsValuesInsertSchema>;
