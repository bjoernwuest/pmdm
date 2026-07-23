// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';

export const AuditEntrySchemaSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  topic: Type.String(),
  payload: Type.Unknown(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type AuditEntrySchemaSelectType = Static<typeof AuditEntrySchemaSelectSchema>;

export const AuditEntrySchemaInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  topic: Type.String(),
  payload: Type.Unknown(),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});
export type AuditEntrySchemaInsertType = Static<typeof AuditEntrySchemaInsertSchema>;
