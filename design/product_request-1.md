# Product Request — Part 1: Schema, Migrations & Repository

> Parent: [`product_request.md`](product_request.md)

---

## 1. Schema Status

The [`ProductRequests`](../src/schema/ProductRequest.ts:24) and [`ProductRequestsValues`](../src/schema/ProductRequest.ts:39) tables already exist in the database (created in initial migration [20260624125958](../src/migrations/20260624125958_elite_zodiak.sql:164)). Subsequent migrations have kept them aligned with the TypeScript schema.

### 1.1 Current Table Structure

**`product_requests`**:

| Column | Type | Notes |
|--------|------|-------|
| `identifier` | uuid PK | Auto-generated uuidv7 |
| `created_at` / `updated_at` | timestamp | Standard timestamps |
| `created_by` / `updated_by` | uuid FK→users | Standard audit columns |
| `product_type` | uuid FK→product_types | The product type for this request |
| `product_number` | text NOT NULL | Target product number |
| `product_to_update_from` | text FK→products.product_number | Set only for "update" requests |
| `status` | text NOT NULL | `open`, `importing`, `done`, `cancelled`; default `open` |

**Unique constraint**: `ux_product_requests_active_product_number` — Only one active (`open`, `importing`) request per `product_number`.

**`product_requests_values`**:

| Column | Type | Notes |
|--------|------|-------|
| `identifier` | uuid PK | Auto-generated uuidv7 |
| `data_type` | uuid FK→data_types | Data type this value belongs to |
| `product_request` | uuid FK→product_requests | Owning product request |
| `created_at` / `updated_at` | timestamp | Standard timestamps |
| `created_by` / `updated_by` | uuid FK→users | Standard audit columns |
| `approved_at` (column: `approvated_at`) | timestamp | When approved (note: column name has typo, kept for consistency) |
| `approved_by` | uuid FK→users | Who approved |
| `default_value` | jsonb | Calculated default, default `"null"` |
| `value` | jsonb | User-provided value; if null, `defaultValue` is shown |

**Unique constraint**: `product_requests_values_product_request_data_type_index` — One value per data type per request.

### 1.2 No Migration Required

The existing schema matches the TypeScript definitions. No migration is needed for this feature. The `ProductNumberState` sentinel table also already exists.

---

## 2. Types Enhancements

Add to [`src/types/ProductRequestSchema.ts`](../src/types/ProductRequest.ts):

```typescript
// PubSub message topics
export const message_CreateProductRequest: string = "create.ProductRequest";
export const message_UpdateProductRequestValue: string = "update.ProductRequestValue";
export const message_ApproveProductRequestValue: string = "approve.ProductRequestValue";
export const message_CancelProductRequest: string = "cancel.ProductRequest";
export const message_ImportingProductRequest: string = "importing.ProductRequest";

// Enriched types for API responses
export type ProductRequestListRow = ProductRequestType & {
    productTypeName: string;
    createdByName: string;
    actionableSummary: {
        needsValue: boolean;
        needsApproval: boolean;
    };
};

export type ProductRequestValueEnriched = ProductRequestValueType & {
    dataTypeName: string;
    dataTypeKind: string;
    dataTypeConfig: Record<string, unknown>;
    mandatory: boolean | null;       // Resolved from ProductTypesDataTypes > DataTypeSchema
    requestorCanEdit: boolean | null;
    editableOnUpdate: boolean;
    businessDomainName: string | null;
    // Resolved permissions for current user
    userRoles: DataTypeGroupRoles[];
    showByDefault: boolean;
};

export type ProductRequestDetail = ProductRequestType & {
    productTypeName: string;
    createdByName: string;
    values: ProductRequestValueEnriched[];
};
```

---

## 3. Repository: `ProductRequestRepo`

Create [`src/repo/ProductRequestRepo.ts`](../src/repo/ProductRequestRepo.ts).

### 3.1 `generateProductNumber(tx)`

Atomically generates a product number of pattern `5XXXXXX-01`.

```typescript
export async function generateProductNumber(tx: DBClient): Promise<string>
```

**Algorithm**:
1. `SELECT * FROM product_number_state WHERE locked = false FOR UPDATE` — locks the sentinel row
2. Read the current max product number matching `5______-01` from `products` and `product_requests` tables
3. Extract the six-digit numeric part, increment by 1, zero-pad to 6 digits
4. Return `5{XXXXXX}-01`
5. The row lock is released when the transaction commits/rolls back

**Important**: Must be called within a transaction (the caller wraps in `runInTransaction`).

### 3.2 `createProductRequest(tx, claims, input)`

```typescript
export async function createProductRequest(
    tx: DBClient,
    claims: Record<string, any>,
    input: {
        productTypeIdentifier: string;
        productNumber?: string;
        productToUpdate?: string;    // product number of product being updated
        sourceProductNumber?: string; // product number to copy values from
    },
): Promise<ProductRequestType>
```

**Algorithm**:
1. Get the current user from `claims` (via `getLoggedinUserObject`)
2. If `productNumber` is not provided, call `generateProductNumber(tx)`
3. If `productNumber` IS provided:
   - Check if a product with that number already exists → if yes, throw/return a specific signal (caller redirects to product detail page)
4. Create the `product_requests` row with `status = 'open'`, `createdBy = user.identifier`
5. Load all enabled data types assigned to the product type (via `ProductTypeRepo.getDataTypes`)
6. For each data type:
   - Insert a `product_requests_values` row with:
     - `data_type` = dataType identifier
     - `default_value` = calculated default (see section 3.3)
     - `value` = source product value (if `sourceProductNumber` provided) or `null`
     - `created_by` = user identifier
7. Publish `message_CreateProductRequest` via PubSub
8. Return the created request

### 3.3 Default Value Calculation

When creating `product_requests_values` rows:

**For "copy from" requests** (`sourceProductNumber` provided):
1. Load the source product's `ProductsValues` for this dataType
2. If found, set `value` = that value
3. If NOT found, calculate default using `defaultProvider` (if present)
4. Always set `defaultValue` using `defaultProvider` (if present, for modes `OnCreate`, `OnChangeNoValue`, `OnChange`)

**For "new" and "update" requests**:
1. Set `value` = `null`
2. Set `defaultValue` using `defaultProvider` (if present, for any mode)

**For "update" requests with `editableOnUpdate: false`**:
1. Load the existing product's value
2. Set `value` = that existing value (copied from product)
3. Set `defaultValue` = null (no default needed)
4. Mark as auto-approved: set `approvedBy`, `approvedAt`

**Default value calculation function**:
```typescript
async function calculateDefaultValue(
    db: DBClient,
    dataType: DataTypeType,
    ptAssignment: ProductTypeDataTypeWithDetails,
    productRequest: ProductRequestType,
): Promise<unknown>
```
- Resolves config from `ptAssignment.config` > `dataType.config`
- If `defaultProvider` exists in resolved config, execute it
- The `defaultProvider` is a stored JS function — execution strategy TBD (likely `eval` or `new Function` with sandboxed context)

**Calculated data types**:
- If `kind === 'calculated'` and `script` is present, execute the script
- The script is a stored JS function — same execution strategy as `defaultProvider`
- Calculated types do NOT have a `defaultValue`; the `value` column holds the computed result

### 3.4 `getProductRequest(tx, claims, requestId)`

```typescript
export async function getProductRequest(
    db: DBClient,
    claims: Record<string, any>,
    requestId: string,
): Promise<ProductRequestDetail | null>
```

Returns the product request with enriched values, filtered by the current user's view permissions.

**Query**:
1. Load `product_requests` row, joined with `product_types.name` and `users` (for `createdBy` name)
2. Load all `product_requests_values` for this request
3. For each value, resolve:
   - Data type name, kind, config
   - `ProductTypesDataTypes` assignment (mandatory, requestorCanEdit, editableOnUpdate, config, owner overrides)
   - Business domain name (from `ProductTypesDataTypes.owner` > `DataTypeSchema.owner` → `BusinessDomains.name`)
   - Current user's roles (check `ProductTypesDataTypePermission` first, fall back to `DataTypePermission`)
   - `showByDefault` from the permission entry
4. Filter out values where:
   - Data type is disabled, OR
   - User has no roles assigned (`userRoles` is empty)
5. Return the enriched detail

### 3.5 `listProductRequests(tx, claims, filters, page, pageSize)`

```typescript
export async function listProductRequests(
    db: DBClient,
    claims: Record<string, any>,
    filters: {
        status?: ProductRequestStatus[];
        productTypeIdentifier?: string;
        productNumberContains?: string;
        actionFilter?: "provide_or_approve" | "provide_value" | "approve_value";
    },
    page: number,
    pageSize: number,
): Promise<{ requests: ProductRequestListRow[]; total: number; availablePageSizes: number[] }>
```

**Query**:
1. Build WHERE conditions from basic filters (status, productTypeIdentifier, productNumberContains)
2. Join with `product_types` for `productTypeName` and `users` for `createdByName`
3. For each request in the result set, compute `actionableSummary`:
   - Load all `product_requests_values` for the request, enriched with the current user's permissions
   - Set `needsValue: true` if any value is editable (Writer role OR requestorCanEdit + is creator) AND `value` IS NULL
   - Set `needsApproval: true` if any value is approvable (Approver role) AND `approvedBy` IS NULL
4. If `actionFilter` is set, filter the results:
   - `provide_or_approve`: keep rows where `needsValue === true` OR `needsApproval === true`
   - `provide_value`: keep rows where `needsValue === true`
   - `approve_value`: keep rows where `needsApproval === true`
5. Count total and paginate (apply pagination AFTER action filtering to ensure correct counts)
6. Return list with `total` and `actionableSummary` per row

**Performance note**: Computing `actionableSummary` for each request requires loading values and permissions per request. For large datasets, consider:
- Computing `actionableSummary` only when `actionFilter` is set (and always including it in the response)
- Using a materialized per-user permission view for faster lookups
- Limiting the page size to keep per-request computation bounded

### 3.6 `updateProductRequestValue(tx, claims, requestId, dataTypeId, newValue)`

```typescript
export async function updateProductRequestValue(
    tx: DBClient,
    claims: Record<string, any>,
    requestId: string,
    dataTypeIdentifier: string,
    value: unknown,
): Promise<ProductRequestValueType>
```

**Algorithm**:
1. Verify the product request exists and is `open`
2. Verify the user has write permission (Writer role OR requestorCanEdit + is creator)
3. Verify `editableOnUpdate` allows editing (for update requests)
4. Update the `product_requests_values` row:
   - Set `value` = new value
   - Set `updated_by` = user identifier
   - Set `updated_at` = now
5. Publish `message_UpdateProductRequestValue` via PubSub
6. **Recalculate dependent defaults**:
   - For all other data types on this request where `defaultValueCalculationMode` is `OnChangeNoValue` or `OnChange`:
     - If mode is `OnChangeNoValue`: recalculate only if value is null AND not approved
     - If mode is `OnChange`: recalculate unless already approved
   - For calculated data types with mode `OnChange`: recalculate the script

### 3.7 `approveProductRequestValue(tx, claims, requestId, dataTypeId)`

```typescript
export async function approveProductRequestValue(
    tx: DBClient,
    claims: Record<string, any>,
    requestId: string,
    dataTypeIdentifier: string,
): Promise<{ value: ProductRequestValueType; allApproved: boolean }>
```

**Algorithm**:
1. Verify the product request exists and is `open`
2. Verify the user has Approver role
3. Verify the row has `value` OR `defaultValue` set (not null)
4. Update the row:
   - Set `approved_by` = user identifier
   - Set `approved_at` = now
5. Publish `message_ApproveProductRequestValue` via PubSub
6. **Check auto-progression**: Call `checkAllApproved(tx, requestId)`
7. Return `{ value, allApproved }` where `allApproved` indicates if status was progressed

### 3.8 `approveAllProductRequestValues(tx, claims, requestId)`

```typescript
export async function approveAllProductRequestValues(
    tx: DBClient,
    claims: Record<string, any>,
    requestId: string,
): Promise<{ approvedCount: number; allApproved: boolean }>
```

**Algorithm**:
1. Load all unapproved values where the user has Approver role AND the value/ defaultValue is not null
2. For each, call the same logic as `approveProductRequestValue` (batched)
3. After all, call `checkAllApproved`
4. Return count of approved + allApproved flag

### 3.9 `checkAllApproved(tx, requestId)`

```typescript
export async function checkAllApproved(
    tx: DBClient,
    requestId: string,
): Promise<boolean>
```

**Algorithm**:
1. Count all non-calculated data types on this request
2. Count all approved non-calculated data types on this request
3. If counts match (all approved):
   - Update `product_requests.status` = `importing`
   - Publish `message_ImportingProductRequest`
   - Return `true`
4. Return `false`

### 3.10 `cancelProductRequest(tx, claims, requestId)`

```typescript
export async function cancelProductRequest(
    tx: DBClient,
    claims: Record<string, any>,
    requestId: string,
): Promise<ProductRequestType>
```

**Algorithm**:
1. Verify the product request exists and is `open`
2. Verify the user has `role=cancel` in `ProductTypesPermission` for this product type
3. **Clean up consumables**: For all consumable-type data type values in this request, un-mark any `is_used` reservations
4. Update `product_requests.status` = `cancelled`
5. Publish `message_CancelProductRequest` via PubSub
6. Return the updated request

### 3.11 `getEffectivePermissions(tx, claims, productTypeIdentifier, dataTypeIdentifier)`

```typescript
export async function getEffectivePermissions(
    db: DBClient,
    claims: Record<string, any>,
    productTypeIdentifier: string,
    dataTypeIdentifier: string,
): Promise<{ roles: DataTypeGroupRoles[]; showByDefault: boolean }>
```

**Algorithm**:
1. Get the user's groups (via `UserGroup`)
2. Check `ProductTypesDataTypePermission` for matching `productTypeDataTypeIdentifier` (need to find the assignment first)
3. If no product-type-specific permissions found, check `DataTypePermission`
4. Return the union of roles + `showByDefault` (from highest-precedence source)

---

## 4. Schema File Changes

### 4.1 `src/schema/ProductRequestSchema.ts`

Add PubSub message constants (if not in types):

No schema changes needed — the table definitions are complete.

### 4.2 `src/types/ProductRequestSchema.ts`

Add (as described in Section 2):
- PubSub message topic constants
- `ProductRequestListRow` type
- `ProductRequestValueEnriched` type
- `ProductRequestDetail` type
