// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

export const ScriptLogSchemaSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  logLevel: Type.String(),
  message: Type.String(),
  scriptCategory: Type.String(),
  dataTypeIdentifier: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  productRequestIdentifier: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  principalUserId: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type ScriptLogSchemaSelectType = Static<typeof ScriptLogSchemaSelectSchema>;

export const ScriptLogSchemaInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  logLevel: Type.String(),
  message: Type.String(),
  scriptCategory: Type.String(),
  dataTypeIdentifier: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  productRequestIdentifier: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  principalUserId: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});
export type ScriptLogSchemaInsertType = Static<typeof ScriptLogSchemaInsertSchema>;
