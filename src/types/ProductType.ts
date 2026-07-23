// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend
// with hand-written exports (additional TypeBox schemas, types, constants, ...) —
// the generator only creates this file if it is missing; it will never
// overwrite or delete anything you add here afterwards.
import type {ProductsSelectType, ProductsValuesSelectType} from "@/types/_ProductType.ts";
import {TAG_CREATE, TAG_DISABLE, TAG_UPDATE, type Tag} from "./PubSubType";

export * from './_ProductType.ts';

// ---------------------------------------------------------------------------
// PubSub message topics
// ---------------------------------------------------------------------------

/** Resource tag for Product. */
export const TAG_PRODUCT = "product" as const;

/** PubSub topic for product create events. */
export const message_CreateProduct: Tag[] = [TAG_PRODUCT, TAG_CREATE];
/** PubSub topic for product update events. */
export const message_UpdateProduct: Tag[] = [TAG_PRODUCT, TAG_UPDATE];
/** PubSub topic for product disable/enable events (both directions). */
export const message_DisableProduct: Tag[] = [TAG_PRODUCT, TAG_DISABLE];

// ---------------------------------------------------------------------------
// API response types (not derived from DB — used for enriched responses)
// ---------------------------------------------------------------------------

/** Product value enriched with DataType name, kind, and BusinessDomain name. */
export type EnrichedProductValue = ProductsValuesSelectType & {
    dataTypeName: string;
    dataTypeKind: string;
    businessDomainIdentifier: string;
    businessDomainName: string | null;
    displayValue: string | null;
};

/** Product list row enriched with ProductType name. */
export type ProductListRow = ProductsSelectType & {
    productTypeName: string;
};

/** Product detail enriched with ProductType name and values. */
export type ProductDetail = ProductsSelectType & {
    productTypeName: string;
    values: EnrichedProductValue[];
};

/** Effective viewer permissions: set of DataType identifiers the user can view. */
export type EffectivePermissions = {
    viewableDataTypeIdentifiers: string[];
};
export type ImportRow = {
    productNumber: string;
    values: Record<string, unknown>; // keyed by DataType.name
};
export type ImportError = {
    row: number;         // 1-based row number in XLSX
    productNumber: string;
    field: string;       // DataType.name or "productNumber"
    message: string;
};
export type ImportResult = {
    created: number;
    errors: ImportError[];
};