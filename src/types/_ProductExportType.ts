// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

export const ProductExportsSelectSchema = Type.Object({
  productRequest: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  targetSystem: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  exportedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  exportedAt: Type.Optional(Nullable(Type.String())),
  importedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  importedAt: Type.Optional(Nullable(Type.String())),
});
export type ProductExportsSelectType = Static<typeof ProductExportsSelectSchema>;

export const ProductExportsInsertSchema = Type.Object({
  productRequest: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  targetSystem: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  exportedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  exportedAt: Type.Optional(Nullable(Type.String())),
  importedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  importedAt: Type.Optional(Nullable(Type.String())),
});
export type ProductExportsInsertType = Static<typeof ProductExportsInsertSchema>;
