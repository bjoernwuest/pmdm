// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

export const ProductRequestStatus = {
    open: "open" as const, // To be set when creating a product "from scratch" (incl. "copy of")
    importing: "importing" as const,
    done: "done" as const,
    cancelled: "cancelled" as const, // "free" consumables!
};

export type ProductRequestStatus = typeof ProductRequestStatus[keyof typeof ProductRequestStatus];

export const ProductNumberStateSelectSchema = Type.Object({
  locked: Type.Boolean(),
  notes: Type.Optional(Nullable(Type.String())),
});
export type ProductNumberStateSelectType = Static<typeof ProductNumberStateSelectSchema>;

export const ProductNumberStateInsertSchema = Type.Object({
  locked: Type.Optional(Type.Boolean()),
  notes: Type.Optional(Nullable(Type.String())),
});
export type ProductNumberStateInsertType = Static<typeof ProductNumberStateInsertSchema>;

export const ProductRequestsSelectSchema = Type.Object({
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  productType: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  productNumber: Type.String(),
  productToUpdate: Type.Optional(Nullable(Type.String())),
  status: Type.String(),
});
export type ProductRequestsSelectType = Static<typeof ProductRequestsSelectSchema>;

export const ProductRequestsInsertSchema = Type.Object({
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  productType: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  productNumber: Type.String(),
  productToUpdate: Type.Optional(Nullable(Type.String())),
  status: Type.Optional(Type.String()),
});
export type ProductRequestsInsertType = Static<typeof ProductRequestsInsertSchema>;

export const ProductRequestsValuesSelectSchema = Type.Object({
  dataType: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  productRequest: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  approvedAt: Type.Optional(Nullable(Type.String())),
  approvedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  defaultValue: Type.Optional(Nullable(Type.Unknown())),
  value: Type.Optional(Nullable(Type.Unknown())),
});
export type ProductRequestsValuesSelectType = Static<typeof ProductRequestsValuesSelectSchema>;

export const ProductRequestsValuesInsertSchema = Type.Object({
  dataType: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  productRequest: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  createdBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  updatedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  approvedAt: Type.Optional(Nullable(Type.String())),
  approvedBy: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  defaultValue: Type.Optional(Nullable(Type.Unknown())),
  value: Type.Optional(Nullable(Type.Unknown())),
});
export type ProductRequestsValuesInsertType = Static<typeof ProductRequestsValuesInsertSchema>;
