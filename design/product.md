# Product Module Specification

## 1. Overview

This specification covers the complete Product module: types/TypeBox schemas, repository, API endpoints, functional permissions, frontend API client, and UI pages for managing products in the PMDM system.

### Key Design Decisions

| # | Decision |
|---|----------|
| 1 | Custom repo/API (no `_crud_Repo`/`_crud_API` factories) — Products table uses `productNumber` (text) PK, not `identifier` (UUID), and lacks `baseColumns` |
| 2 | ProductsValues mutations are integrated into `createProduct` / `updateProduct` — no standalone values CRUD endpoints or repo functions needed. Values are deleted automatically by FK cascades |
| 3 | Full query builder filter modal (AND/OR groups), saved to cookie |
| 4 | XLSX library: `exceljs` (add to `package.json`) |
| 5 | Full import validation: uniqueness, mandatory checks, type validation incl. validation scripts, `ProductTypesDataTypes` config takes precedence over `DataTypeSchema` config. Import delegates row-by-row to `createProduct` within a single transaction |
| 6 | Product detail page at `/products/:productNumber` is part of this task |
| 7 | Server-side viewer permission filtering — `getProductByNumber` automatically applies effective viewer permissions on values |
| 8 | ProductPage under "General" menu section (top-level), ProductDetailPage no menu entry. Both require `FP_VIEW_PRODUCTS`. Disabled products are hidden by default; visible only when actively filtered |
| 9 | Three PubSub topics: `create.Product`, `update.Product`, `disable.Product` (the latter used for both disable and enable) |
| 10 | Stub backend endpoints for request-update and copy, returning 200 with placeholder |
| 11 | `FP_CREATE_PRODUCT` covers both direct creation and import — no separate `FP_IMPORT_PRODUCTS` permission |

---

## 2. Existing Schema (no changes)

### [`Products`](src/schema/Product.ts:7-18)

| Column | Type | Notes |
|--------|------|-------|
| `productTypeIdentifier` | UUID | FK → `ProductTypes.identifier`, NOT NULL |
| `productNumber` | text | **Primary Key** |
| `updatedAt` | timestamp | NOT NULL, default `now()` |
| `disabled` | boolean | NOT NULL, default `false` |

Unique index: `ux_alt_number_ci` on `lower(productNumber)`

### [`ProductsValues`](src/schema/Product.ts:21-31)

| Column | Type | Notes |
|--------|------|-------|
| `productNumber` | text | FK → `Products.productNumber`, NOT NULL |
| `dataTypeIdentifier` | UUID | FK → `DataTypeSchema.identifier`, NOT NULL |
| `value` | jsonb | nullable |

Unique index: `ux_product_data` on `(productNumber, dataTypeIdentifier)`

---

## 3. Types & TypeBox Schemas

### File: [`src/types/Products.ts`](src/types/Products.ts) — Replace existing content

```typescript
import { Products, ProductsValues } from "@/schema/ProductSchema.ts";
import { Type, type Static } from "@sinclair/typebox";
import { createSelectSchema, createInsertSchema } from "drizzle-typebox";

// ---------------------------------------------------------------------------
// Products — TypeBox schemas & types
// ---------------------------------------------------------------------------

export const ProductSelectSchema = Type.Object(createSelectSchema(Products).properties);
export const ProductInsertSchema = Type.Object(createInsertSchema(Products).properties);

export type ProductType = Static<typeof ProductSelectSchema>;
export type NewProductType = Static<typeof ProductInsertSchema>;

// ---------------------------------------------------------------------------
// ProductsValues — TypeBox schemas & types
// ---------------------------------------------------------------------------

export const ProductValueSelectSchema = Type.Object(createSelectSchema(ProductsValues).properties);
export const ProductValueInsertSchema = Type.Object(createInsertSchema(ProductsValues).properties);

export type ProductValueType = Static<typeof ProductValueSelectSchema>;
export type NewProductValueType = Static<typeof ProductValueInsertSchema>;

// ---------------------------------------------------------------------------
// PubSub message topics
// ---------------------------------------------------------------------------

/** PubSub topic for product create events. */
export const message_CreateProduct: string = "create.Product";
/** PubSub topic for product update events. */
export const message_UpdateProduct: string = "update.Product";
/** PubSub topic for product disable/enable events (both directions). */
export const message_DisableProduct: string = "disable.Product";

// ---------------------------------------------------------------------------
// API response types (not derived from DB — used for enriched responses)
// ---------------------------------------------------------------------------

/** Product list row enriched with ProductType name. */
export type ProductListRow = ProductType & {
    productTypeName: string;
};

/** Product detail enriched with ProductType name and values. */
export type ProductDetail = ProductType & {
    productTypeName: string;
    values: ProductValueType[];
};

/** Effective viewer permissions: set of DataTypeSchema identifiers the user can view. */
export type EffectivePermissions = {
    viewableDataTypeIdentifiers: string[];
};
```

---

## 4. Functional Permissions

### New permission constants

| Constant | Name string | Description | Group |
|----------|-------------|-------------|-------|
| `FP_VIEW_PRODUCTS` | `view_products` | Permitted to view products | General |
| `FP_CREATE_PRODUCT` | `create_product` | Permitted to create and import products | General |
| `FP_UPDATE_PRODUCT` | `update_product` | Permitted to update products | General |
| `FP_DISABLE_PRODUCT` | `disable_product` | Permitted to disable/enable products | General |
| `FP_REQUEST_PRODUCT_UPDATE` | `request_product_update` | Permitted to request updates on products | General |
| `FP_CREATE_PRODUCT_COPY` | `create_product_copy` | Permitted to create copies of products | General |

**Note**: `FP_CREATE_PRODUCT` covers both direct product creation and bulk import. Anyone who can create can import, and vice versa.

### Registration locations

- **Server-side**: Add to [`src/services/auth/app_functional_perms.ts`](src/services/auth/app_functional_perms.ts)
- **UI names**: Add to [`src/ui/auth/app_functional_permissions.ts`](src/ui/auth/app_functional_permissions.ts) in `FunctionalPermissionNames`
- These auto-propagate through the existing `registerFunctionalPermission` / re-export pattern

---

## 5. Repository Layer

### File: [`src/repo/ProductRepo.ts`](src/repo/ProductRepo.ts) (new)

Custom repository — **no factory usage** due to `productNumber` PK mismatch with `baseColumns`.

#### Product CRUD

| Function | Signature | Description |
|----------|-----------|-------------|
| `countProducts` | `(db, includeDisabled?, condition?) → number` | Count products, optionally filtered |
| `getProducts` | `(db, includeDisabled?, condition?, page?, pageSize?, ...orderBy) → ProductListRow[]` | Paginated list, joined with `ProductTypes.name`. Applies query builder filter as SQL `condition` |
| `getProductByNumber` | `(db, tokenClaims, productNumber, includeDisabled?) → ProductDetail \| null` | Single product with productTypeName and **viewer-filtered values** (auto-applies `getEffectiveViewerPermissions` internally). Returns only DataTypeSchema values the user is permitted to view |
| `createProduct` | `(db, tokenClaims, productNumber, productTypeIdentifier, values: Record<string, unknown>) → ProductType[]` | Insert product + values. Validates values against DataTypeSchema/ProductTypesDataTypes configs. Publishes `create.Product`. Called by both direct API and import |
| `updateProduct` | `(db, tokenClaims, productNumber, fields, values?, knownUpdatedAt?) → ProductType[]` | Update mutable fields + optional values. Publishes `update.Product`. Uses optimistic locking on `updatedAt` |
| `setProductDisabled` | `(db, user, productNumber, disabled, knownUpdatedAt?) → ProductType[]` | Toggle disabled flag, publish `disable.Product` |
| `disableProduct` | `(db, user, productNumber, knownUpdatedAt?) → ProductType[]` | Convenience wrapper for `setProductDisabled(…, true, …)` |
| `enableProduct` | `(db, user, productNumber, knownUpdatedAt?) → ProductType[]` | Convenience wrapper for `setProductDisabled(…, false, …)` |

#### Import

| Function | Signature | Description |
|----------|-----------|-------------|
| `importProducts` | `(db, tokenClaims, productTypeIdentifier, rows: ImportRow[]) → ImportResult` | Bulk import within a single transaction. Validates each row, then calls `createProduct` for each valid row (all within one `runInTransaction`). Validation and PubSub are handled inside `createProduct` |

#### Viewer Permissions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getEffectiveViewerPermissions` | `(db, tokenClaims, productTypeIdentifier) → EffectivePermissions` | Returns DataTypeSchema identifiers the user has viewer role for, considering group memberships and `ProductTypesDataTypePermission` (ignoring `showByDefault`). Falls back to `DataTypePermission` if no ProductType-level permission exists. Called internally by `getProductByNumber` |

**Note**: ProductsValues are never mutated standalone. They are created/updated via `createProduct`/`updateProduct` and deleted automatically by FK cascades when a product or DataTypeSchema is removed. There is no `deleteProductValue` or standalone values CRUD in the repo.

#### Import Types

```typescript
type ImportRow = {
    productNumber: string;
    values: Record<string, unknown>; // keyed by DataTypeSchema.name
};

type ImportError = {
    row: number;         // 1-based row number in XLSX
    productNumber: string;
    field: string;       // DataTypeSchema.name or "productNumber"
    message: string;
};

type ImportResult = {
    created: number;
    errors: ImportError[];
};
```

---

## 6. API Layer

### File: [`src/api/ProductAPI.ts`](src/api/ProductAPI.ts) (new)

Custom API routes — **no factory usage** due to `productNumber`-based lookups.

#### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/products` | `FP_VIEW_PRODUCTS` | Paginated product list. Query params: `page`, `pageSize`, `includeDisabled` (default `false` — disabled products hidden unless explicitly requested), plus optional filter params: `productNumberContains`, `productTypeIdentifier`, `disabled` (boolean, for quick filters), and `filter` (JSON-serialized `FilterPayload` for rule-builder conditions). Response includes `effectivePermissions` |
| `GET` | `/api/products/:productNumber` | `FP_VIEW_PRODUCTS` | Product detail with viewer-filtered values (applied automatically by repo) |
| `POST` | `/api/products` | `FP_CREATE_PRODUCT` | Create product with optional values. Body: `{ productNumber, productTypeIdentifier, values?: Record<string, unknown> }` |
| `PUT` | `/api/products/:productNumber` | `FP_UPDATE_PRODUCT` | Update product fields and optionally values. Body: `{ productTypeIdentifier?, values?: Record<string, unknown>, knownUpdatedAt }` |
| `PATCH` | `/api/products/:productNumber/disabled` | `FP_DISABLE_PRODUCT` | Toggle disabled. Body: `{ disabled, knownUpdatedAt }` |
| `POST` | `/api/products/:productNumber/request-update` | `FP_REQUEST_PRODUCT_UPDATE` | **Stub** — returns `{ status: "not_implemented" }` with 200 |
| `POST` | `/api/products/:productNumber/copy` | `FP_CREATE_PRODUCT_COPY` | **Stub** — returns `{ status: "not_implemented" }` with 200 |
| `GET` | `/api/products/export-template/:productTypeIdentifier` | `FP_CREATE_PRODUCT` | Generate and download XLSX template. Header row 2 contains DataTypeSchema names (viewer-permitted only). Cell A1 = ProductType.identifier. Column A = productNumber |
| `POST` | `/api/products/import` | `FP_CREATE_PRODUCT` | Import XLSX. Body: multipart form with `file` and `productTypeIdentifier`. Returns `ImportResult`. Runs in `runInTransaction`. The import validates rows, then calls `createProduct` for each valid row within the transaction |

#### GET `/api/products` Response Shape

```typescript
{
    products: ProductListRow[];      // server-side viewer-filtered columns
    effectivePermissions: {
        viewableDataTypeIdentifiers: string[];
    };
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
    includeDisabled: boolean;
}
```

#### Filter Parameters

Quick filters are passed as individual query parameters:

| Param | Type | Description |
|-------|------|-------------|
| `productNumberContains` | string | Free-text contains match on `productNumber` |
| `productTypeIdentifier` | string (UUID) | Exact match on `productTypeIdentifier` |
| `disabled` | boolean | `true` = disabled only, `false` = active only, absent = any |

Data-type value conditions are passed as a JSON-serialized `FilterPayload` in the `filter` query parameter:

```typescript
type ApiCriterion = {
    dataTypeIdentifier: string;
    operator: string;       // "=" | "!=" | ">" | ">=" | "<" | "<=" | "CONTAINS" |
                            // "NOT CONTAINS" | "STARTS WITH" | "ENDS WITH" |
                            // "TRUE" | "FALSE" | "NOT TRUE" | "NOT FALSE" |
                            // "IN" | "NOT IN" | "EMPTY" | "NOT EMPTY"
    value?: unknown;
    values?: unknown[];
};

// The filter query parameter value
type FilterPayload = {
    criteria: ApiCriterion[];
    expression: string;     // e.g. "1 AND 2", "1 OR (2 AND 3)", "NOT 1"
};
```

Quick filters and rule-builder conditions are combined with **AND** — a product must match all specified quick filters AND the rule-builder expression.

The backend translates the `expression` + `criteria` into SQL `WHERE` conditions joined on `ProductsValues`, evaluating each criterion against the referenced DataTypeSchema's value for each product.

---

## 7. Frontend API Client

### File: [`src/ui/api/Products.ts`](src/ui/api/Products.ts) (new)

All mutating calls (`apiPost`, `apiPatch`, `apiDelete`) automatically route through the request-bundling queue. Read calls (`apiGet`) bypass bundling as direct `fetch()` calls.

```typescript
import { apiGet, apiPost, apiPatch, apiDelete } from "./index.ts";
import type { ProductListRow, ProductDetail, ProductValueType, EffectivePermissions } from "@/types/Products.ts";

const BASE = "/api/products";

export type ProductListResponse = {
    products: ProductListRow[];
    effectivePermissions: EffectivePermissions;
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
    includeDisabled: boolean;
};

export type ProductDetailResponse = { product: ProductDetail };

export type ImportResult = {
    created: number;
    errors: { row: number; productNumber: string; field: string; message: string }[];
};

export async function getProducts(
    page: number, pageSize: number, includeDisabled: boolean, filter?: object
): Promise<ProductListResponse> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), includeDisabled: String(includeDisabled) });
    if (filter) params.set("filter", JSON.stringify(filter));
    return apiGet<ProductListResponse>(`${BASE}?${params.toString()}`);
}

export async function getProduct(productNumber: string): Promise<ProductDetailResponse> {
    return apiGet<ProductDetailResponse>(`${BASE}/${encodeURIComponent(productNumber)}`);
}

export async function createProduct(data: { productNumber: string; productTypeIdentifier: string; values?: Record<string, unknown> }): Promise<ProductDetailResponse> {
    return apiPost<ProductDetailResponse>(BASE, data);
}

export async function updateProduct(productNumber: string, data: { productTypeIdentifier?: string; values?: Record<string, unknown>; knownUpdatedAt: string }): Promise<ProductDetailResponse> {
    return apiPut<ProductDetailResponse>(`${BASE}/${encodeURIComponent(productNumber)}`, data);
}

export async function setProductDisabled(productNumber: string, data: { disabled: boolean; knownUpdatedAt: string }): Promise<ProductDetailResponse> {
    return apiPatch<ProductDetailResponse>(`${BASE}/${encodeURIComponent(productNumber)}/disabled`, data);
}

export async function requestProductUpdate(productNumber: string): Promise<{ status: string }> {
    return apiPost<{ status: string }>(`${BASE}/${encodeURIComponent(productNumber)}/request-update`, {});
}

export async function copyProduct(productNumber: string): Promise<{ status: string }> {
    return apiPost<{ status: string }>(`${BASE}/${encodeURIComponent(productNumber)}/copy`, {});
}

export async function exportTemplate(productTypeIdentifier: string): Promise<Blob> {
    const response = await fetch(`${BASE}/export-template/${encodeURIComponent(productTypeIdentifier)}`, { credentials: "include" });
    if (!response.ok) throw new Error("Failed to export template");
    return response.blob();
}

export async function importProducts(productTypeIdentifier: string, file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("productTypeIdentifier", productTypeIdentifier);
    const response = await fetch(`${BASE}/import`, { method: "POST", body: formData, credentials: "include" });
    if (!response.ok) throw new Error("Import failed");
    return response.json();
}
```

---

## 8. UI Pages

### 8.1 [`../src/ui/pages/pmdm/ProductPage.tsx`](src/ui/pages/ProductPage.tsx) (new)

#### Page Meta

```typescript
export const meta: PageMeta = {
    id: "products",
    urn: "urn:bun-starter:ui:page:products",
    path: "/products",
    title: "Products",
    description: "View and manage products.",
    menu: {
        section: "General",
        order: 10,
        label: "Products",
    },
    requiredFunctionalPermissions: [FP_VIEW_PRODUCTS.functionalPermissionName],
};
```

#### Layout (ASCII)

```
+------------------------------------------------------------------+
| [Filter] [Clear Filter*]     [Export Template] [Import]           |
| * visible only when filter is active                              |
+----------+---------------+---------------+----------+-----+-----+
| Product #| Product Type  | Updated At    | Disabled | Act | Act |
+----------+---------------+---------------+----------+-----+-----+
| PRD-001  | Hardware      | 2026-06-25    | Active   | [R] | [C] |
| PRD-002  | Software      | 2026-06-24    | Disabled | [R] | [C] |
+----------+---------------+---------------+----------+-----+-----+
```

#### Columns

| Column | Source | Notes |
|--------|--------|-------|
| Product Number | `productNumber` | Primary column |
| Product Type | `productTypeName` | From joined `ProductTypes.name` |
| Updated At | `updatedAt` | Formatted date |
| Disabled | `disabled` | Chip/badge without action |
| Request Update (action) | — | `pi-sync` icon, visible if `FP_REQUEST_PRODUCT_UPDATE`, calls stub API, shows toast "Not yet implemented" |
| Create Copy (action) | — | `pi-copy` icon, visible if `FP_CREATE_PRODUCT_COPY`, calls stub API, shows toast "Not yet implemented" |

#### Behaviors

- **Disabled products hidden by default**: The product list loads with `includeDisabled=false`, hiding disabled products. Disabled products are only visible when the user actively enables them via the filter
- **Row click** (excluding action buttons): navigates to `/products/:productNumber`
- **Filter button**: Opens modal with full query builder (AND/OR groups). Filter config serialized to JSON and saved in a cookie (`pmdm_product_filter`). On page load, cookie is read and filter auto-applied
- **Clear filter button**: Visible only when filter is active. Clears cookie and reloads list
- **Export template**: Requires `FP_CREATE_PRODUCT`. Opens popup to select ProductType (dropdown from `/api/product_types`). On select, calls `exportTemplate()` which triggers browser download of XLSX
- **Import**: Requires `FP_CREATE_PRODUCT`. Opens popup with file input (accepts `.xlsx`). On file select, calls `importProducts()`. Displays result summary of created count and errors. If errors exist, generates and downloads error report XLSX
- **Viewer permissions**: Columns for DataTypes the user cannot view are not rendered (server already filters them from the response)
- **PubSub**: List re-fetches on `create.Product`, `update.Product`, `disable.Product` events via the PubSub subscription system

#### Filter Query Builder Modal

The filter modal is implemented as a reusable component at `src/ui/components/QueryBuilder.tsx`, adapted from the QueryBuilderDialog pattern. It provides two filtering mechanisms that combine via AND:

**A) Quick Filters** (top of modal, always visible):

| Field | UI Control | Description |
|-------|-----------|-------------|
| Product Number | `InputText` | Free-text contains match on `productNumber` |
| Product Type | `Dropdown` | Select from available ProductTypes (fetched via `/api/product_types`) |
| Disabled | `Dropdown` | Options: Any (default, shows all), Active only, Disabled only |

**B) Rule Builder** (data type value conditions, AND/OR tree):

A visual tree editor where users build complex conditions on DataTypeSchema values assigned to products.

##### Data Model

```typescript
// Top-level: a GroupNode (the root)
type QueryBuilderTree = GroupNode;

type FilterNode = RuleNode | GroupNode;

type GroupNode = {
    id: string;               // unique client-side ID
    type: "group";
    logic: "AND" | "OR";      // how children are combined
    not: boolean;             // invert the entire group
    children: FilterNode[];   // at least one child
};

type RuleNode = {
    id: string;
    type: "rule";
    dataTypeIdentifier: string | null;  // references a DataTypeSchema assigned to the ProductType
    operator: string | null;            // see operator table below
    value: unknown;                     // single value (for scalar operators)
    values: unknown[];                  // multi-value (for IN / NOT IN)
};
```

##### Operators by DataTypeSchema Kind

| Kind | Operators |
|------|-----------|
| `boolean` | `TRUE` (is true), `FALSE` (is false), `NOT TRUE` (is not true), `NOT FALSE` (is not false), `EMPTY` (is empty), `NOT EMPTY` (is not empty) |
| `numeric` | `=` (equals), `!=` (not equals), `>` (greater than), `>=` (greater or equal), `<` (less than), `<=` (less or equal), `EMPTY`, `NOT EMPTY` |
| `string` | `=` (equals), `!=` (does not equal), `CONTAINS`, `NOT CONTAINS`, `STARTS WITH`, `ENDS WITH`, `EMPTY`, `NOT EMPTY` |
| `lookup` | `=` (is), `!=` (is not), `IN` (is any of), `NOT IN` (is none of), `EMPTY`, `NOT EMPTY` |
| `consumable` | Same as `string` |
| `product` | `=` (is), `!=` (is not), `IN` (is any of), `NOT IN` (is none of), `EMPTY`, `NOT EMPTY` |
| `calculated` | No operators (calculated values cannot be filtered) |

**Value-less operators** (no value input needed): `EMPTY`, `NOT EMPTY`, `TRUE`, `FALSE`, `NOT TRUE`, `NOT FALSE`.

**Lookup value resolution**: For `lookup` DataTypes, the UI fetches the referenced Lookup's values and displays them as a dropdown/multi-select. The `onEnsureLookup` callback triggers lazy loading of lookup option lists.

**Product value resolution**: For `product` DataTypes, a `ProductSelect` component allows searching/selecting existing product numbers.

##### UI Layout

```
+------------------------------------------------------------------+
| Filter products                                          [×]     |
+------------------------------------------------------------------+
| Quick filters                                                     |
| [Product Number contains...]  [Product Type ▼]  [Disabled ▼]    |
+------------------------------------------------------------------+
| Rule builder                                                      |
|                                                                    |
| ┌ [NOT] [AND] [OR]                        [+ Condition] [+ Group] ┐
| │                                                                    │
| │ [DataTypeSchema ▼] [Operator ▼] [Value...    ] [×]                      │
| │ [DataTypeSchema ▼] [Operator ▼] [Value...    ] [×]                      │
| │                                                                   │
| │ ┌ [NOT] [AND] [OR]              [+ Condition] [+ Group] [Remove] ┐│
| │ │ [DataTypeSchema ▼] [Operator ▼] [Value...] [×]                       ││
| │ └────────────────────────────────────────────────────────────────┘│
| └────────────────────────────────────────────────────────────────────┘
+------------------------------------------------------------------+
| [Clear filter]                        [Cancel] [Apply filter (3)] |
+------------------------------------------------------------------+
```

##### Group Accent Colours

Groups are color-coded by nesting depth, cycling through: indigo → sky blue → emerald → amber → pink.

##### Validation

When "Apply filter" is clicked:
- Every rule must have a DataTypeSchema selected, an operator selected, and a value (unless value-less operator)
- Rules with validation errors are highlighted with red border and error message
- The "Apply filter" button is disabled only if there are zero active rules AND zero quick filters

##### Filter Payload (sent to API as `?filter=` query param or POST body)

```typescript
type ApiCriterion = {
    dataTypeIdentifier: string;
    operator: string;
    value?: unknown;        // single value for scalar operators
    values?: unknown[];     // multi-value for IN / NOT IN
};

type FilterPayload = {
    criteria: ApiCriterion[];
    expression: string;          // e.g. "1 AND 2", "1 OR (2 AND 3)", "NOT 1"
    productNumberContains?: string;
    productTypeIdentifier?: string;
    disabled?: boolean;          // undefined = any, true = disabled, false = active
};
```

The `expression` string uses integer references (`1`, `2`, …) that map positionally to the `criteria` array. The backend translates this into SQL WHERE conditions.

##### Cookie Persistence

- Filter state serialized as JSON, stored in cookie `pmdm_product_filter`
- On page load, cookie is read and filter auto-applied via `includeDisabled`, `productNumberContains`, `productTypeIdentifier`, and the rule tree
- The `QueryBuilderTree` is stored alongside the `FilterPayload` so the dialog can be re-populated exactly as the user left it
- "Clear filter" button removes the cookie and resets to default (no filter, `includeDisabled=false`)

##### Component Contract

```typescript
export type QueryBuilderProps = {
    visible: boolean;
    onHide: () => void;
    /** DataTypes assigned to the currently selected ProductType (or all if no ProductType filter). */
    dataTypes: DataTypeMeta[];
    /** Lookup value options keyed by Lookup identifier, lazy-loaded on demand. */
    lookupOptionsByType: Record<string, Array<{ label: string; value: string }>>;
    /** Callback to trigger loading of lookup options for a given Lookup identifier. */
    onEnsureLookup: (lookupIdentifier: string) => void;
    /** Called with the payload and tree, or null to clear. */
    onApply: (payload: FilterPayload | null, tree: QueryBuilderTree | null) => void;
    /** Previously applied tree (for re-opening the dialog pre-populated). */
    currentTree?: QueryBuilderTree | null;
    /** Previously applied payload (for quick filter pre-population). */
    currentPayload?: FilterPayload | null;
};

type DataTypeMeta = {
    identifier: string;
    name: string;
    kind: string;
    lookupTypeIdentifier?: string | null;  // set for lookup DataTypes
};
```

### 8.2 [`../src/ui/pages/pmdm/ProductDetailPage.tsx`](src/ui/pages/ProductDetailPage.tsx) (new)

#### Page Meta

```typescript
export const meta: PageMeta = {
    id: "product-detail",
    urn: "urn:bun-starter:ui:page:product-detail",
    path: "/products/:productNumber",
    title: "Product Detail",
    description: "View product details.",
    // No menu entry — reachable via ProductPage only
    requiredFunctionalPermissions: [FP_VIEW_PRODUCTS.functionalPermissionName],
};
```

#### Layout (ASCII)

```
+------------------------------------------------------------------+
| Product: PRD-001                            [Disabled: No]        |
| Product Type: Hardware                      Updated: 2026-06-25   |
+------------------+----------+-------------------------------------+
| Data Type        | Kind     | Value                               |
+------------------+----------+-------------------------------------+
| Manufacturer     | string   | Acme Corp                           |
| Weight (kg)      | numeric  | 2.5                                 |
| In Stock         | boolean  | true                                |
| Category         | lookup   | Electronics                         |
+------------------+----------+-------------------------------------+
```

#### Columns

| Column | Source | Notes |
|--------|--------|-------|
| Data Type | `DataTypeSchema.name` | Via ProductType→DataTypeSchema assignment |
| Kind | `DataTypeSchema.kind` | Displayed as badge/chip |
| Value | `ProductsValues.value` | Rendered appropriately per kind (string, number, boolean, lookup name, etc.) |

#### Behaviors

- **Read-only**: No edit functionality
- **Viewer permissions**: Only DataTypes the user has viewer permission for are shown (server-side filtered)
- **Back navigation**: Button to return to `/products`

---

## 9. PubSub Events

| Topic | Published When | Payload |
|-------|---------------|---------|
| `create.Product` | Product created (via API or import) | `ProductType` row |
| `update.Product` | Product updated (fields, values, or import upsert) | `ProductType` row |
| `disable.Product` | Product disabled or enabled | `ProductType` row |

**Note**: `disable.Product` serves for both disable and enable, consistent with the existing `message_DisableLookup` / `message_DisableProductType` pattern in the codebase.

---

## 10. XLSX Import/Export Format

### Template Structure

| Row | Col A | Col B | Col C | ... |
|-----|-------|-------|-------|-----|
| 1 | `{productTypeIdentifier}` | | | |
| 2 | `productNumber` | `{DataTypeSchema.name}` | `{DataTypeSchema.name}` | ... |
| 3+ | (data) | (data) | (data) | ... |

- Row 1, Col A: The ProductType.identifier (UUID) — identifies which ProductType this template is for
- Row 2: Header row. Col A = `productNumber`. Col B+ = `DataTypeSchema.name` for each DataTypeSchema assigned to the ProductType (ordered alphabetically)
- Rows 3+: Data rows

### Import Validation Rules

For each row, the following validations are performed. **`ProductTypesDataTypes` config overrides take precedence over `DataTypeSchema` config**. Rows with ANY error are rejected entirely (atomic per row). **Import works even if the ProductType or DataTypeSchema is disabled.**

1. **productNumber**: Must be non-empty, unique within the import batch
2. **Mandatory fields**: DataTypes where `mandatory` is true must have a non-null value
3. **Type validation** (per DataTypeSchema kind):
   - `string`: `min`/`max` length constraints from config
   - `numeric`: `min`/`max` range, `decimals` precision from config
   - `boolean`: Must be `true`/`false` (or string equivalents like `"true"`, `"1"`, `"yes"`). **May be empty if `permitEmpty` is `true`** — a boolean with `permitEmpty: true` supports tri-state (true / false / empty)
   - `lookup`: Values are resolved against the referenced Lookup's values. Resolution sequence: match by **`name`** first, then **`identifier`**, then **`sourceSystemIdentifier`**. For **multi-value** (`multi: true`): the Excel cell must contain a JSON array string, e.g. `"['Value A','Value B']"`. Single values are plain text
   - `consumable`: Values are resolved against the referenced Consumable's values. Resolution sequence: match by **`name`** first, then **`identifier`**, then **`sourceSystemIdentifier`**. On successful match, the imported value is set to the **`isUsed`** field of the matched ConsumablesValues row. For **multi-value**: same JSON array format as lookup
   - `product`: Values must reference existing product numbers. For **multi-value**: same JSON array format as lookup
   - `calculated`: Skipped during import (calculated server-side)
4. **Validation scripts**: If a DataTypeSchema has a `validate` function defined in its config, it is executed on the backend
5. **Config precedence**: For `mandatory`, `min`, `max`, `decimals`, `permitEmpty`, `multi`: check `ProductTypesDataTypes.config` first; if null/undefined there, fall back to `DataTypeSchema.config`

### Import Process (Backend)

```
1. Read XLSX file using exceljs
2. Extract productTypeIdentifier from cell A1, validate ProductType exists (even if disabled)
3. Parse header row (row 2) to map column indices -> DataTypeSchema names
4. Resolve DataTypeSchema names -> DataTypeSchema identifiers via ProductTypesDataTypes assignments (even if DataTypeSchema is disabled)
5. Load all DataTypeSchema and ProductTypesDataTypes config for validation
6. For each data row (row 3+):
   a. Validate productNumber
   b. Validate each DataTypeSchema value against resolved configs
   c. If any error -> add to error list, skip row
   d. If valid -> queue for creation
7. [Transaction begins via runInTransaction]
   a. For each valid row:
      - Call createProduct(productNumber, productTypeIdentifier, values)
      - createProduct handles: insert/upsert of Products row, upsert of ProductsValues, no-op detection, PubSub publication
   b. [Transaction commits]
8. Return ImportResult with created count and errors
9. If errors exist, generate and stream error report XLSX as download
```

The entire import process runs in [`runInTransaction`](src/services/database.ts) for atomicity. Only rows without errors are imported. `createProduct` internally detects whether a product is new or existing and publishes the appropriate PubSub event. Only values that actually differ from existing DB values trigger an UPDATE (no-op detection).

---

## 11. Dependency Changes

Add to [`package.json`](package.json) dependencies:
```json
"exceljs": "^4.4.0"
```

Run `bun install` after adding.

---

## 12. Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `src/repo/ProductRepo.ts` | Repository: CRUD, values, import, permissions |
| `src/api/ProductAPI.ts` | API routes |
| `src/ui/api/Products.ts` | Frontend API client |
| `../src/ui/pages/pmdm/ProductPage.tsx` | Product list page |
| `../src/ui/pages/pmdm/ProductDetailPage.tsx` | Product detail page |
| `src/ui/components/QueryBuilder.tsx` | Reusable AND/OR query builder component |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/Products.ts` | Replace with TypeBox schemas + PubSub topics + response types |
| `src/services/auth/app_functional_perms.ts` | Register 6 new functional permissions |
| `src/ui/auth/app_functional_permissions.ts` | Add 6 new permission name constants |
| `package.json` | Add `exceljs` dependency |

---

## 13. Implementation Order

1. **Types & Permissions**: Update `src/types/Products.ts`, register functional permissions in both server and UI auth files
2. **Dependencies**: Add exceljs to `package.json`, run `bun install`
3. **Repository**: Implement `src/repo/ProductRepo.ts`
4. **API Layer**: Implement `src/api/ProductAPI.ts`
5. **Frontend API Client**: Implement `src/ui/api/Products.ts`
6. **UI Components**: Implement `QueryBuilder.tsx` (reusable)
7. **UI Pages**: Implement `ProductPage.tsx`, then `ProductDetailPage.tsx`
