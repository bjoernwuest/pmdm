// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

export const BusinessDomainsSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Boolean(),
});
export type BusinessDomainsSelectType = Static<typeof BusinessDomainsSelectSchema>;

export const BusinessDomainsInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  name: Type.String(),
  disabled: Type.Optional(Type.Boolean()),
});
export type BusinessDomainsInsertType = Static<typeof BusinessDomainsInsertSchema>;
