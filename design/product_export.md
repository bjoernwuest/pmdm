# Product Export – Design Concept

> **Status**: Draft v2  
> **Date**: 2026-07-17  
> **Feature**: Track the export/import of product requests into target systems.

---

## 1. Overview

A _ProductExport_ represents the workflow step where an approved product request (in status `importing`) is transferred into one or more target systems. The feature covers:

- Automatic creation of `ProductExport` rows when a product request enters `importing` status.
- A management page showing all `importing` product requests with per-target-system status cells.
- Status tracking: `pending` → `exported` → `imported`.
- Bulk export of selected product requests to XLSX/CSV/JSON for a chosen target system.
- Bulk import of export/import status via an Excel file.
- Automatic transition of the product request to `done` when all target systems have been imported, including creation or update of the corresponding `Product`.

---

## 2. Target System Determination

When a product request transitions to `importing`, the set of target systems to create `ProductExport` rows for is derived from `ProductTypesDataTypesTargetSystems`:

1. Load all entries from `ProductTypesDataTypesTargetSystems` where `productType = productRequest.productType`.
2. Collect the distinct `targetSystem` identifiers.
3. For each distinct target system, insert a `ProductExport` row with `productRequest = productRequest.identifier` and `targetSystem = targetSystemId`.

If no (enabled) target systems are assigned to the product type's data types, **no `ProductExport` rows are created**. The product request immediately transitions from `importing` to `done` (see §3.2 — 0 rows = all completed).

---

## 3. Status Transition: `importing` → `done` (with Product creation/update)

### 3.1 Trigger Point

`checkAndTransitionToDone()` is called **only** from `markAsImported()`, because `done` requires all rows to have both `exportedAt` and `importedAt` set — it can never be reached by setting only `exportedAt`.

It runs **within the same transaction** as the `markAsImported()` mutation.

### 3.2 Logic (in Repo)

```typescript
async function checkAndTransitionToDone(tx: DBClient, productRequestId: string): Promise<void> {
    // Count total ProductExport rows for this request
    const allRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(ProductExports)
        .where(eq(ProductExports.productRequest, productRequestId));

    // Count rows where BOTH exportedAt AND importedAt are set
    const completedRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(ProductExports)
        .where(and(
            eq(ProductExports.productRequest, productRequestId),
            sql`${ProductExports.exportedAt} IS NOT NULL`,
            sql`${ProductExports.importedAt} IS NOT NULL`,
        ));

    // Transition if ALL rows are completed.
    // When no target systems exist for this product type (0 rows),
    // the request transitions immediately from `importing` to `done`.
    if (allRows[0]!.count === completedRows[0]!.count) {
        // 3.2.1 Transition the product request to done
        const [updated] = await tx
            .update(ProductRequests)
            .set({ status: ProductRequestStatus.done, updatedAt: sql`now()` })
            .where(eq(ProductRequests.identifier, productRequestId))
            .returning();

        if (!updated) return;

        // 3.2.2 Load the full product request data
        const request = await tx
            .select({
                productNumber: ProductRequests.productNumber,
                productType: ProductRequests.productType,
                productToUpdate: ProductRequests.productToUpdate,
            })
            .from(ProductRequests)
            .where(eq(ProductRequests.identifier, productRequestId))
            .limit(1);

        if (!request[0]) return;

        const { productNumber, productType, productToUpdate } = request[0];
        const isUpdateRequest = !!productToUpdate;

        // 3.2.3 Load all values from the product request.
        //        When status=importing, all values are considered approved.
        //        For each: prefer `value`, fall back to `defaultValue`.
        //        Also join ProductTypesDataTypes to get editableOnUpdate
        //        (product-type-level overrides have already been resolved
        //        during request creation, so the data-type-level default is
        //        sufficient if no assignment exists).
        const requestValues = await tx
            .select({
                dataType: ProductRequestsValues.dataType,
                value: ProductRequestsValues.value,
                defaultValue: ProductRequestsValues.defaultValue,
                editableOnUpdate: ProductTypesDataTypes.editableOnUpdate,
            })
            .from(ProductRequestsValues)
            .leftJoin(ProductTypesDataTypes, and(
                eq(ProductTypesDataTypes.productType, productType!),
                eq(ProductTypesDataTypes.dataType, ProductRequestsValues.dataType),
            ))
            .where(eq(ProductRequestsValues.productRequest, productRequestId));

        // 3.2.4 Resolve values for the Product
        //        - Use COALESCE(value, defaultValue) for each row.
        //        - Do NOT skip null values — a data type whose value is
        //          still null is intentionally left for later calculation
        //          (e.g. "calculated on export" via defaultProvider).
        //        - For UPDATE requests: exclude data types where
        //          editableOnUpdate is explicitly false. The existing
        //          product values for those fields remain unchanged.
        //        - For NEW product requests: include all data types.
        const resolvedValues: Array<{ dataType: string; value: unknown }> = [];
        for (const rv of requestValues) {
            // For update requests, skip data types explicitly marked as
            // not editable on update (editableOnUpdate defaults to true
            // in the DB, so `false` is an explicit opt-out).
            if (isUpdateRequest && rv.editableOnUpdate === false) continue;

            const resolved = rv.value ?? rv.defaultValue;
            // Handle the '"null"'::jsonb sentinel (explicit null in jsonb)
            const finalValue = (resolved === "null") ? null : resolved;
            resolvedValues.push({
                dataType: rv.dataType!,
                value: finalValue,
            });
        }

        // 3.2.5 Check if a Product with this productNumber already exists
        const existingProduct = await tx
            .select({ productNumber: Products.productNumber })
            .from(Products)
            .where(eq(Products.productNumber, productNumber))
            .limit(1);

        if (existingProduct.length > 0) {
            // UPDATE: Upsert all resolved values into the existing product.
            //         No values are deleted from the existing product.
            for (const rv of resolvedValues) {
                await tx
                    .insert(ProductsValues)
                    .values({
                        productNumber,
                        dataTypeIdentifier: rv.dataType,
                        value: rv.value as any,
                    })
                    .onConflictDoUpdate({
                        target: [ProductsValues.productNumber, ProductsValues.dataTypeIdentifier],
                        set: { value: rv.value as any },
                    });
            }
        } else {
            // CREATE: Create a new product with the productNumber and all
            //         resolved values.
            await tx
                .insert(Products)
                .values({
                    productNumber,
                    productType: productType!,
                    disabled: false,
                });

            for (const rv of resolvedValues) {
                await tx
                    .insert(ProductsValues)
                    .values({
                        productNumber,
                        dataTypeIdentifier: rv.dataType,
                        value: rv.value as any,
                    });
            }
        }

        // 3.2.6 Publish PubSub message
        PubSub.publish(message_DoneProductRequest, updated);
    }
}
```

**Value resolution rules** (step 4.2.4):

| Scenario | `value` | `defaultValue` | Resolved | Stored in Product? |
|---|---|---|---|---|
| User provided a value | non-null | any | `value` | Yes |
| User left empty, defaultProvider ran | null | non-null | `defaultValue` | Yes |
| Calculated field, script succeeded | non-null | null | `value` | Yes |
| Calculated field, script errored | null | null | null | Yes (stores null) |
| No defaultProvider, user never set value | null | null | null | Yes (stores null) |
| defaultProvider produced `"null"` sentinel | any | `"null"` | null | Yes (stores null) |
| Update request, `editableOnUpdate = false` | any | any | — | No (excluded) |

### 3.3 Call Sites

- From `markAsImported()` — after setting `importedAt`.
- From `createProductExportRows()` — when no (enabled) target systems are assigned to the product type (0 rows created), the request transitions immediately to `done`. This is handled by the `0 === 0` condition in §3.2.

---

## 4. Repository Layer (`src/repo/ProductExportRepo.ts` — new)

### 4.1 Functions

| Function | Description |
|---|---|
| `createProductExportRows(tx, productRequestId, productTypeId)` | Called when transitioning to `importing`. Queries `ProductTypesDataTypesTargetSystems` for distinct, enabled target systems. If at least one is found, inserts one `ProductExport` row per target system with all timestamp/user columns `null`. If **none** are found, immediately calls `checkAndTransitionToDone()` to bypass the export workflow. |
| `markAsExported(tx, productRequestId, targetSystemId, userId)` | Sets `exportedAt = now()`, `exportedBy = userId`, and **explicitly sets `importedAt = null`** (clearing any prior import status). Does NOT call `checkAndTransitionToDone()`. |
| `markAsImported(tx, productRequestId, targetSystemId, userId)` | Sets `importedAt = now()`, `importedBy = userId`. Calls `checkAndTransitionToDone()`. |
| `importProductExports(tx, targetSystemId, userId, rows)` | Bulk import from parsed Excel data. Each row specifies `{ productNumber, exported: boolean, imported: boolean }`. For matching ProductRequests in `importing` status: if `exported` is truthy, calls `markAsExported()`; if `imported` is truthy, calls `markAsImported()`. Returns a summary of applied/error counts. |
| `getExportPageData(db, filters, page, pageSize)` | Returns paginated list of product requests in `importing` status, with their `ProductExport` rows joined to target systems. Includes resolved user display strings (see §5.1 response format). |
| `getExportRowsByRequest(db, productRequestId)` | Returns all `ProductExport` rows for a given product request. |

### 4.2 `markAsExported` — importedAt Side Effect

```typescript
export async function markAsExported(
    tx: DBClient,
    productRequestId: string,
    targetSystemId: string,
    userId: string,
): Promise<void> {
    // Verify the row exists and exportedAt is not already set
    const existing = await tx
        .select({ exportedAt: ProductExports.exportedAt })
        .from(ProductExports)
        .where(and(
            eq(ProductExports.productRequest, productRequestId),
            eq(ProductExports.targetSystem, targetSystemId),
        ))
        .limit(1);

    if (existing.length === 0) {
        throw new Error("ProductExport row not found");
    }
    if (existing[0]!.exportedAt !== null) {
        throw new AlreadyExportedError(productRequestId, targetSystemId);
    }

    await tx
        .update(ProductExports)
        .set({
            exportedAt: sql`now()`,
            exportedBy: userId,
            importedAt: null,  // explicitly clear import status
            importedBy: null,
        })
        .where(and(
            eq(ProductExports.productRequest, productRequestId),
            eq(ProductExports.targetSystem, targetSystemId),
        ));
}
```

### 4.3 Integration with ProductRequestRepo

Modify `ProductRequestRepo.ts`:

- In `approveProductRequestValue()` and `approveAllProductRequestValues()`, after the status transition to `importing`, call:
  ```typescript
  await createProductExportRows(tx, request.identifier, request.productType);
  ```
- This call is **inside the existing transaction** so it's atomic with the approval.

---

## 5. API Layer (`src/api/ProductExportAPI.ts` — new)

### 5.1 Endpoints

#### `GET /api/product_exports`

List product requests in `importing` status with their export status per target system.

- **Permission:** `FP_VIEW_PRODUCT_EXPORTS`
- **Query params:** `page`, `pageSize`, `filter` (optional — same filter structure as `GET /api/products`)
- **Response:**
  ```json
  {
    "requests": [
      {
        "identifier": "uuid",
        "productNumber": "5000001-01",
        "productType": "uuid",
        "productTypeName": "Widget",
        "createdByName": "John Doe",
        "exports": [
          {
            "targetSystem": "uuid",
            "targetSystemName": "SAP",
            "targetSystemDisabled": false,
            "exportedAt": null,
            "exportedByDisplay": null,
            "importedAt": null,
            "importedByDisplay": null
          },
          {
            "targetSystem": "uuid",
            "targetSystemName": "Oracle",
            "targetSystemDisabled": false,
            "exportedAt": "2026-07-17T10:00:00.000Z",
            "exportedByDisplay": "Jane Smith (jane@example.com)",
            "importedAt": "2026-07-17T11:30:00.000Z",
            "importedByDisplay": "John Doe (john@example.com)"
          }
        ]
      }
    ],
    "targetSystems": [ { "identifier": "uuid", "name": "SAP", "disabled": false } ],
    "page": 0,
    "pageSize": 20,
    "total": 42
  }
  ```

  **User display format** (`exportedByDisplay` / `importedByDisplay`):
  - Single string field in format `"<Firstname> <Lastname> (<email>)"`.
  - If Firstname and Lastname are both empty/null → `"(<email>)"`.
  - If email is null → `"<Firstname> <Lastname>"`.
  - SQL generation:
    ```sql
    CASE
      WHEN u.first_name IS NULL AND u.last_name IS NULL THEN '(' || u.email || ')'
      ELSE u.first_name || ' ' || u.last_name || ' (' || u.email || ')'
    END
    ```
    (with proper null handling — `NULL` concatenation produces `NULL`, so use `COALESCE` as needed).

#### `GET /api/product_exports/export`

Export selected product requests for a target system as a downloadable file.

- **Permission:** `FP_EXPORT_PRODUCT_REQUESTS`
- **Query params:**
  - `targetSystem` (required) — target system identifier
  - `format` (required) — `"xlsx"` | `"csv"` | `"json"`
  - `productRequests` (required) — comma-separated list of product request identifiers
- **Behavior:**
  1. Verify all selected product requests share the same product type (return `400` if not).
  2. Load the data types assigned to the target system via `ProductTypesDataTypesTargetSystems` for that product type.
  3. Build the export file with columns: `productNumber` + one column per assigned data type (sorted by data type name).
  4. For each data type, resolve the value from `ProductRequestsValues`: use `value` if non-null, otherwise `defaultValue`. If both are null, export an empty cell. (Same resolution logic as §3.2.4.)
  5. **Side effect:** After successful generation, within a transaction, for each selected product request where `exportedAt` is still `null`, call `markAsExported()`.
  6. For already-exported rows, skip silently (no error).

- **Response (XLSX):**
  ```
  HTTP 200
  Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  Content-Disposition: attachment; filename="product_exports_SAP_2026-07-17.xlsx"
  ```

- **Response (CSV):**
  ```
  HTTP 200
  Content-Type: text/csv
  Content-Disposition: attachment; filename="product_exports_SAP_2026-07-17.csv"
  ```

- **Response (JSON):**
  ```
  HTTP 200
  Content-Type: application/json
  ```
  Body:
  ```json
  [
    {
      "productNumber": "5000001-01",
      "Name": "Widget A",
      "Price": "9.99"
    }
  ]
  ```

#### `POST /api/product_exports/import`

Import export/import status from an Excel file.

- **Permission:** `FP_EXPORT_PRODUCT_REQUESTS` (for setting `exportedAt`) and/or `FP_CONFIRM_IMPORT` (for setting `importedAt`). The endpoint checks per-row: if the row requests `exported=true` and user lacks `FP_EXPORT_PRODUCT_REQUESTS`, that row is skipped with an error. Same for `imported=true` and `FP_CONFIRM_IMPORT`.
- **Content-Type:** `multipart/form-data`
- **Form field:** `file` — an Excel (`.xlsx`) file with exactly 3 columns:
  | Column | Header | Values |
  |---|---|---|
  | A | `productNumber` | Product number string (e.g. `5000001-01`) |
  | B | `exported` | Truthy: `true`, `yes`, `1`, `x`, `y`. Falsy: `false`, `no`, `0`, empty, absent. |
  | C | `imported` | Truthy: `true`, `yes`, `1`, `x`, `y`. Falsy: `false`, `no`, `0`, empty, absent. |
- **Query param:** `targetSystem` (required) — the target system to apply the import to.
- **Behavior:**
  1. Parse the Excel file.
  2. Within a transaction, for each data row:
     a. Find the `ProductRequest` by `productNumber` where `status = 'importing'`. Skip if not found.
     b. Find the `ProductExport` row for `(productRequestId, targetSystemId)`. Skip if not found.
     c. If `exported` is truthy and `exportedAt` is `null` and user has `FP_EXPORT_PRODUCT_REQUESTS`: call `markAsExported()`.
     d. If `imported` is truthy and `importedAt` is `null` and user has `FP_CONFIRM_IMPORT`: call `markAsImported()`.
     e. If `exportedAt` is already set and file requests exported again: record as error (already exported).
     f. If `importedAt` is already set and file requests imported again: record as error (already imported).
     g. If user lacks required permission: record as error (permission denied).
  3. Return summary with counts.
- **Response (200):**
  ```json
  {
    "totalRows": 10,
    "exportedCount": 7,
    "importedCount": 8,
    "errors": [
      { "row": 3, "productNumber": "5000099-01", "message": "Product request not in importing status" },
      { "row": 5, "productNumber": "5000100-01", "message": "Already exported" },
      { "row": 7, "productNumber": "5000102-01", "message": "Permission denied: FP_CONFIRM_IMPORT required" }
    ]
  }
  ```

#### `PATCH /api/product_exports/:productRequestId/:targetSystemId/exported`

Mark a single export as exported.

- **Permission:** `FP_EXPORT_PRODUCT_REQUESTS`
- **Requires:** `FP_EDIT_EXPORT_STATUS` (for UI dropdown usage)
- **Body:** (empty)
- **Behavior:**
  1. Verify the `ProductRequest.status` is `importing` (return `409` if not).
  2. Verify the `ProductExport` row exists (return `404` if not).
  3. Verify `exportedAt` is `null` (return `409 Conflict` with message `"Already exported"` if not).
  4. Set `exportedAt = now()`, `exportedBy = userId`, **`importedAt = null`**, **`importedBy = null`**.
- **Response:** `200` with updated `ProductExport` row including resolved `exportedByDisplay`.

#### `PATCH /api/product_exports/:productRequestId/:targetSystemId/imported`

Mark a single export as imported.

- **Permission:** `FP_CONFIRM_IMPORT`
- **Requires:** `FP_EDIT_EXPORT_STATUS` (for UI dropdown usage)
- **Body:** (empty)
- **Behavior:**
  1. Verify the `ProductRequest.status` is `importing` (return `409` if not).
  2. Verify the `ProductExport` row exists (return `404` if not).
  3. Verify `importedAt` is `null` (return `409 Conflict` with message `"Already imported"` if not).
  4. Set `importedAt = now()`, `importedBy = userId`.
  5. Call `checkAndTransitionToDone()`.
- **Response:** `200` with updated `ProductExport` row including resolved `importedByDisplay`.

### 5.2 OpenAPI Documentation

All endpoints include full `detail` objects with `tags: ["Product Exports"]`, `summary`, `description`, `response` schemas for all status codes (200, 400, 403, 404, 409), and `parameters` following the conventions in `src/api/AGENTS.md`.

---

## 6. Permissions

### 6.1 Permission Definitions

Define in `src/services/auth/ApplicationDefinedFunctionalPermissions.ts`:

```typescript
const FP_VIEW_PRODUCT_EXPORTS_DEF = {
    functionalPermissionName: "FP_VIEW_PRODUCT_EXPORTS",
    description: "View the product exports management page and list of pending exports.",
    group: "General"
};

const FP_EXPORT_PRODUCT_REQUESTS_DEF = {
    functionalPermissionName: "FP_EXPORT_PRODUCT_REQUESTS",
    description: "Export product requests to XLSX/CSV/JSON for a target system. Also marks the export as 'exported'.",
    group: "General"
};

const FP_CONFIRM_IMPORT_DEF = {
    functionalPermissionName: "FP_CONFIRM_IMPORT",
    description: "Confirm that a product request was successfully imported into a target system.",
    group: "General"
};

const FP_EDIT_EXPORT_STATUS_DEF = {
    functionalPermissionName: "FP_EDIT_EXPORT_STATUS",
    description: "Change the export status dropdown on the product exports page.",
    group: "General"
};
```

Also add to `src/ui/auth/app_functional_permissions.ts`:

```typescript
export const FunctionalPermissionNames = {
    // ... existing ...
    FP_VIEW_PRODUCT_EXPORTS:   "FP_VIEW_PRODUCT_EXPORTS",
    FP_EXPORT_PRODUCT_REQUESTS: "FP_EXPORT_PRODUCT_REQUESTS",
    FP_CONFIRM_IMPORT:         "FP_CONFIRM_IMPORT",
    FP_EDIT_EXPORT_STATUS:     "FP_EDIT_EXPORT_STATUS",
} as const;

export const FP_VIEW_PRODUCT_EXPORTS   = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCT_EXPORTS } as const;
export const FP_EXPORT_PRODUCT_REQUESTS = { functionalPermissionName: FunctionalPermissionNames.FP_EXPORT_PRODUCT_REQUESTS } as const;
export const FP_CONFIRM_IMPORT         = { functionalPermissionName: FunctionalPermissionNames.FP_CONFIRM_IMPORT } as const;
export const FP_EDIT_EXPORT_STATUS     = { functionalPermissionName: FunctionalPermissionNames.FP_EDIT_EXPORT_STATUS } as const;
```

### 6.2 Permission Matrix

| Action | Required Permissions |
|---|---|
| View exports page | `FP_VIEW_PRODUCT_EXPORTS` |
| `GET /api/product_exports` | `FP_VIEW_PRODUCT_EXPORTS` |
| `GET /api/product_exports/export` | `FP_EXPORT_PRODUCT_REQUESTS` |
| Click "Export" button → dialog | `FP_EXPORT_PRODUCT_REQUESTS` |
| Click "Import" button → dialog | `FP_EXPORT_PRODUCT_REQUESTS` (at minimum; `FP_CONFIRM_IMPORT` needed for import rows) |
| `POST /api/product_exports/import` | `FP_EXPORT_PRODUCT_REQUESTS` and/or `FP_CONFIRM_IMPORT` (per-row) |
| `PATCH …/exported` (API) | `FP_EXPORT_PRODUCT_REQUESTS` |
| `PATCH …/imported` (API) | `FP_CONFIRM_IMPORT` |
| Dropdown: pending → exported | `FP_EDIT_EXPORT_STATUS` + `FP_EXPORT_PRODUCT_REQUESTS` |
| Dropdown: exported → imported | `FP_EDIT_EXPORT_STATUS` + `FP_CONFIRM_IMPORT` |
| Dropdown: pending → imported (skip export) | `FP_EDIT_EXPORT_STATUS` + `FP_CONFIRM_IMPORT` |

---

## 7. UI (`src/ui/pages/ProductExportsPage.tsx` — new)

### 7.1 Page Registration

```typescript
export const meta: PageMeta = {
    id: "product-exports",
    urn: "urn:pmdm:ui:page:product-exports",
    path: "/product-exports",
    title: "Product Exports",
    description: "Manage export and import of product requests into target systems.",
    menu: {
        section: "General",
        order: 15,
        label: "Product Exports",
    },
    requiredFunctionalPermissions: [FP_VIEW_PRODUCT_EXPORTS.functionalPermissionName],
};
```

Registered in `src/ui/app_PageRegistry.ts` alongside other pages.

### 7.2 Component Structure

```
ProductExportsPage
├── Toast (notifications)
├── Toolbar
│   ├── Filter button (opens QueryBuilder modal)
│   ├── Clear filter button (conditional: visible when filter is active)
│   ├── Export button (conditional: visible when rows selected AND they share ≥1 target system)
│   ├── Import button (always visible if user has FP_EXPORT_PRODUCT_REQUESTS)
│   │   └── Opens Import Dialog
│   │       ├── Target System dropdown
│   │       ├── File upload (accepts .xlsx)
│   │       └── Import button
│   └── Import summary dialog (post-import: shows success/error counts)
├── DataTable (PrimeReact, with selection)
│   ├── Selection column (checkbox)
│   ├── Product Number column (link → /product-requests/:id)
│   ├── Product Type column
│   ├── Created By column
│   ├── [dynamic: one column per target system]
│   │   └── Single-selection Dropdown with custom template
│   └── Status column (Tag: importing)
├── Export Dialog
│   ├── Target System dropdown (filtered to target systems present in ALL selected rows)
│   ├── Output Format dropdown (XLSX, CSV)
│   ├── Cancel button
│   └── Export button (disabled until both fields are set)
└── Filter Dialog (QueryBuilder — same as ProductPage)
```

### 7.3 Per-Target-System Cell Rendering

Each cell renders a single-selection Dropdown with three visual states:

| State | Condition | Display |
|---|---|---|
| **Empty** | No `ProductExport` row exists for this (request, targetSystem) | Empty cell (no dropdown) |
| **pending** | `exportedAt === null && importedAt === null` | Dropdown shows "pending" pill (amber/warning) |
| **exported** | `exportedAt !== null && importedAt === null` | Dropdown shows "exported" pill (blue/info); below pill: formatted timestamp + `exportedByDisplay` string |
| **imported** | `importedAt !== null` | Dropdown shows "imported" pill (green/success); below pill: formatted timestamp + `importedByDisplay` string |

Dropdown options (only forward transitions):
- From **pending**: `pending`, `exported`, `imported`
- From **exported**: `exported`, `imported`
- From **imported**: `imported` only

The dropdown is **disabled** when `ProductRequest.status !== "importing"`.

On selection change:
1. If pending → exported: call `PATCH …/exported`.
2. If exported → imported or pending → imported: call `PATCH …/imported`.
3. On success: optimistically update the cell using the API response data (no full page reload).
4. On error: show toast, revert dropdown to previous value.

### 7.4 Row Selection & Export Button

- DataTable uses PrimeReact's built-in selection model with checkboxes.
- Export button appears when:
  - At least one row is selected, **AND**
  - The selected rows share at least one common target system (i.e., there exists a `targetSystem` that has a `ProductExport` row in **ALL** selected product requests).

### 7.5 Export Dialog

1. **Target System dropdown:** Lists only target systems present in ALL selected rows' exports.
2. **Output Format dropdown:** Options `XLSX`, `CSV`.
3. **On confirm:**
   - Call `GET /api/product_exports/export?targetSystem=...&format=...&productRequests=...`
   - Download the file via blob/URL.createObjectURL (same pattern as `exportProductTemplate` in `src/ui/api/Products.ts`).
   - After download, the affected cells update via PubSub (see §8), no full page reload.

### 7.6 Import Button & Dialog

1. **Target System dropdown:** Lists all target systems present anywhere in the current data (the same list returned by `GET /api/product_exports`).
2. **File upload:** Accepts `.xlsx` files.
3. **On confirm:**
   - Call `POST /api/product_exports/import` with `multipart/form-data`.
   - Show a summary dialog with counts: `totalRows`, `exportedCount`, `importedCount`, and any `errors`.
   - Affected cells update via PubSub (see §8).

### 7.7 Filter Feature

- Uses the same `QueryBuilder` component as `ProductPage.tsx`.
- Filter applies to the product requests in `importing` status, filtering on their associated data type values.
- **Filter is persisted in a cookie** with a **1 year lifetime** (same pattern as `ProductPage.tsx` with `COOKIE_NAME`, `getCookie`, `setCookie`, `deleteCookie`).
- When the filter changes (apply or clear), **all row selections are reset**.
- Page navigation preserves the filter via cookie.

---

## 8. PubSub / SSE — Minimal Page Updates

### 8.1 New PubSub Messages

Define in `src/types/ProductRequestType.ts` or a new `ProductExportType.ts` extension:

```typescript
// Product request transitions to done (triggers row removal from table)
export const message_DoneProductRequest: Tag[] = [
    { resource: TAG_PRODUCT_REQUEST, action: "done" },
];

// A ProductExport was marked as exported
export const message_ProductExportExported: Tag[] = [
    { resource: "ProductExport", action: "exported" },
];

// A ProductExport was marked as imported
export const message_ProductExportImported: Tag[] = [
    { resource: "ProductExport", action: "imported" },
];
```

Each message payload carries at minimum:
```json
{
    "productRequest": "uuid",
    "targetSystem": "uuid",
    "exportedAt": "2026-07-17T10:00:00.000Z",
    "exportedByDisplay": "Jane Smith (jane@example.com)",
    "importedAt": null,
    "importedByDisplay": null
}
```

### 8.2 UI Subscriptions — Cell-Level Updates

The `ProductExportsPage` subscribes to PubSub messages and updates **only the affected cells** without reloading the full table:

| Message | Action in UI |
|---|---|
| `message_ProductExportExported` | Find the row by `productRequest`, find the column by `targetSystem`. For that cell, update `exportedAt` and `exportedByDisplay`, set `importedAt=null` and `importedByDisplay=null`. Update dropdown state to "exported". |
| `message_ProductExportImported` | Find the row by `productRequest`, find the column by `targetSystem`. For that cell, update `importedAt` and `importedByDisplay`. Update dropdown state to "imported". If this was the last incomplete row and `done` transition fires, the row will be removed by `message_DoneProductRequest`. |
| `message_ImportingProductRequest` | A new request entered `importing`. Insert the new row into the table data (or if filter is active, re-query the list to avoid filter inconsistency). |
| `message_DoneProductRequest` | Remove the product request row from the table. |

**Implementation approach:**
- Maintain table data in a `useState` array, keyed by `productRequest` identifier.
- On PubSub message, use `setState` with a functional updater to modify only the matching row and cell.
- This avoids the N+1 re-render problem and keeps the UI responsive under concurrent edits.

### 8.3 Concurrent Edit Handling

- If the user has a dropdown open when a PubSub message arrives for the same cell, the dropdown value is updated in-place (the dropdown re-renders with the new state).
- Pending own actions are tracked via a `pendingOwnActionRef` (same pattern as `ProductRequestDetailPage.tsx`). When a PubSub message arrives for a cell where the current user has a pending mutation, the message is suppressed (the API response already applied the update).

---

## 9. File-by-File Changes

### 9.1 New Files

| File | Description |
|---|---|
| `src/repo/ProductExportRepo.ts` | Data access layer for ProductExport operations |
| `src/api/ProductExportAPI.ts` | REST API routes for product exports |
| `src/ui/pages/ProductExportsPage.tsx` | Product exports management page |
| `src/ui/api/ProductExports.ts` | Browser-side API client wrapper |

### 9.2 Modified Files

| File | Changes |
|---|---|
| `src/types/ProductRequestType.ts` | Add `message_DoneProductRequest`, `message_ProductExportExported`, `message_ProductExportImported` PubSub tags |
| `src/repo/ProductRequestRepo.ts` | In `approveProductRequestValue()` and `approveAllProductRequestValues()`, call `createProductExportRows()` after status transition to `importing` |
| `src/services/auth/ApplicationDefinedFunctionalPermissions.ts` | Register 4 new functional permissions |
| `src/ui/auth/app_functional_permissions.ts` | Add 4 new permission name constants and shorthand exports |
| `src/ui/app_PageRegistry.ts` | Register `ProductExportsPage` |

---

## 10. Edge Cases & Error Handling

### 10.1 No Target Systems Assigned

If a product type has no (enabled) entries in `ProductTypesDataTypesTargetSystems`, no `ProductExport` rows are created. The product request transitions immediately from `importing` to `done` — the condition `0 completed rows === 0 total rows` is true, so the `Product` is created/updated without any export workflow.

### 10.2 Double Export/Import Prevention

- `markAsExported()` checks `exportedAt IS NULL` → returns `409 Conflict: "Already exported"`.
- `markAsImported()` checks `importedAt IS NULL` → returns `409 Conflict: "Already imported"`.
- The UI dropdown only shows forward transitions; the API enforces the same at the database level.

### 10.3 `exportedAt` Sets `importedAt = null`

When `markAsExported()` is called, `importedAt` and `importedBy` are explicitly set to `null`. This enforces the state machine: a row that was previously imported and is being re-exported goes back to "exported" state. (Note: re-export only happens when `exportedAt` was not previously set — this is the normal forward flow.)

### 10.4 Concurrent Exports

- The bulk export endpoint processes all selected rows within a single transaction.
- Rows already marked as `exported` for that target system are skipped (no error, just a no-op — since `markAsExported` checks for null before mutating).
- Other target systems for the same request are unaffected.

### 10.5 Product Request Cancellation While in `importing`

- When a product request in `importing` status is cancelled, the `ProductExport` rows remain (cascading delete is not triggered — they serve as an audit trail).
- The `status` column becomes `cancelled`, which makes the dropdown read-only in the UI.

### 10.6 Filter Reset on Selection

When the user applies a new filter (or clears it), all row selections are cleared to prevent confusion (the previously selected rows may no longer be visible).

### 10.7 Import File Validation

- Missing `productNumber` column → `400 Bad Request`.
- Rows with empty `productNumber` → skipped.
- `exported`/`imported` columns parse boolean-ish values case-insensitively: `true`/`yes`/`1`/`x` → true; `false`/`no`/`0`/empty → false.
- Rows where both `exported` and `imported` are falsy → skipped (no-op).

### 10.8 Product Already Exists on `done` Transition

When transitioning to `done`, if a `Product` with the same `productNumber` already exists, the values are upserted (`ON CONFLICT … DO UPDATE`). If multiple values exist for the same data type on the existing product, the most recent request value overwrites. No values are deleted from the existing product.