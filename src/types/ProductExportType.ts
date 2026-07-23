// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend
// with hand-written exports (additional TypeBox schemas, types, constants, ...) —
// the generator only creates this file if it is missing; it will never
// overwrite or delete anything you add here afterwards.
export * from './_ProductExportType.ts';

import { Type } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

export const ProductExportRowSchema = Type.Object({
    targetSystem: Type.String({ format: "uuid" }),
    targetSystemName: Type.String(),
    targetSystemDisabled: Type.Boolean(),
    exportedAt: Type.Optional(Nullable(Type.String())),
    exportedByDisplay: Type.Optional(Nullable(Type.String())),
    importedAt: Type.Optional(Nullable(Type.String())),
    importedByDisplay: Type.Optional(Nullable(Type.String())),
});

export const ProductExportRequestRowSchema = Type.Object({
    identifier: Type.String({ format: "uuid" }),
    productNumber: Type.String(),
    productType: Type.String({ format: "uuid" }),
    productTypeName: Type.String(),
    createdByName: Type.String(),
    exports: Type.Array(ProductExportRowSchema),
});

export const ProductExportsListResponseSchema = Type.Object({
    requests: Type.Array(ProductExportRequestRowSchema),
    targetSystems: Type.Array(Type.Object({
        identifier: Type.String({ format: "uuid" }),
        name: Type.String(),
        disabled: Type.Boolean(),
    })),
    page: Type.Number(),
    pageSize: Type.Number(),
    total: Type.Number(),
    availablePageSizes: Type.Array(Type.Number()),
});

export const ImportProductExportsRequestSchema = Type.Object({
    targetSystem: Type.String({ format: "uuid" }),
});

export const ImportProductExportsResponseSchema = Type.Object({
    totalRows: Type.Number(),
    exportedCount: Type.Number(),
    importedCount: Type.Number(),
    errors: Type.Array(Type.Object({
        row: Type.Number(),
        productNumber: Type.String(),
        message: Type.String(),
    })),
});

export type ProductExportRow = {
    targetSystem: string;
    targetSystemName: string;
    targetSystemDisabled: boolean;
    exportedAt: string | null;
    exportedByDisplay: string | null;
    importedAt: string | null;
    importedByDisplay: string | null;
};

export type ProductExportRequestRow = {
    identifier: string;
    productNumber: string;
    productType: string;
    productTypeName: string;
    createdByName: string;
    exports: ProductExportRow[];
};

export type ProductExportsListResponse = {
    requests: ProductExportRequestRow[];
    targetSystems: { identifier: string; name: string; disabled: boolean }[];
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
};

export type ImportProductExportsResponse = {
    totalRows: number;
    exportedCount: number;
    importedCount: number;
    errors: { row: number; productNumber: string; message: string }[];
};
