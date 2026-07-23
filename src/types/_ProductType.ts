// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

export const ProductsSelectSchema = Type.Object({
  productTypeIdentifier: Type.String({ format: 'uuid' }),
  productNumber: Type.String(),
  updatedAt: Type.String(),
  disabled: Type.Boolean(),
});
export type ProductsSelectType = Static<typeof ProductsSelectSchema>;

export const ProductsInsertSchema = Type.Object({
  productTypeIdentifier: Type.String({ format: 'uuid' }),
  productNumber: Type.String(),
  updatedAt: Type.Optional(Type.String()),
  disabled: Type.Optional(Type.Boolean()),
});
export type ProductsInsertType = Static<typeof ProductsInsertSchema>;

export const ProductsValuesSelectSchema = Type.Object({
  productNumber: Type.String(),
  dataTypeIdentifier: Type.String({ format: 'uuid' }),
  value: Type.Optional(Nullable(Type.Unknown())),
});
export type ProductsValuesSelectType = Static<typeof ProductsValuesSelectSchema>;

export const ProductsValuesInsertSchema = Type.Object({
  productNumber: Type.String(),
  dataTypeIdentifier: Type.String({ format: 'uuid' }),
  value: Type.Optional(Nullable(Type.Unknown())),
});
export type ProductsValuesInsertType = Static<typeof ProductsValuesInsertSchema>;
