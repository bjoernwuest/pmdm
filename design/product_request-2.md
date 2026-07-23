# Product Request — Part 2: API Routes

> Parent: [`product_request.md`](product_request.md)

---

## 1. New File: `src/api/ProductRequestAPI.ts`

Auto-loaded by the API app ([`src/apps/api.ts`](../src/apps/api.ts:150)). Follows the standard route pattern with `authorize()`, OpenAPI `detail` blocks, and TypeBox validation.

### 1.1 Functional Permissions Required

Reuse existing FPs from [`src/services/auth/app_functional_perms.ts`](../src/services/auth/app_functional_perms.ts:47):
- `FP_VIEW_PRODUCTS` — to view product requests (same as viewing products)
- `FP_REQUEST_PRODUCT_UPDATE` — to create update requests
- `FP_CREATE_PRODUCT_COPY` — to create copy requests
- `FP_CREATE_PRODUCT` — to create new product requests from scratch

No new functional permissions are needed; the existing set covers all operations.

### 1.2 Route: `POST /api/product-requests` — Create

Creates a new product request.

**Auth**: Requires `FP_CREATE_PRODUCT` (new), `FP_REQUEST_PRODUCT_UPDATE` (update), or `FP_CREATE_PRODUCT_COPY` (copy) depending on the `mode`.

**Request Body**:
```typescript
{
    mode: "new" | "update" | "copy";
    productTypeIdentifier: string;     // UUID, required for "new" mode
    productNumber?: string;            // Optional, auto-generate if missing
    sourceProductNumber?: string;       // Required for "update" and "copy" modes
}
```

**Logic**:
1. Validate mode:
   - `"new"`: require `FP_CREATE_PRODUCT`, require `productTypeIdentifier`
   - `"update"`: require `FP_REQUEST_PRODUCT_UPDATE`, require `sourceProductNumber`
   - `"copy"`: require `FP_CREATE_PRODUCT_COPY`, require `sourceProductNumber`
2. For `"update"` and `"copy"`: load source product, use its `productTypeIdentifier`
3. If `productNumber` is provided and a product with that number already exists:
   - For `"new"`: return 409 with `{ conflict: true, existingProductNumber: "..." }` — client redirects
   - For `"copy"`: return 409 with `{ conflict: true, existingProductNumber: "..." }` — client shows warning
4. Call `ProductRequestRepo.createProductRequest(tx, claims, input)` in a transaction
5. Return the created request detail

**Response**: `ProductRequestDetail` (enriched with productTypeName, values, etc.)

### 1.3 Route: `GET /api/product-requests` — List

Paginated list with filtering.

**Auth**: Requires `FP_VIEW_PRODUCTS`.

**Query Parameters**:
```
?page=0&pageSize=20&status=open,importing&productTypeIdentifier=uuid&productNumberContains=foo&actionFilter=provide_or_approve
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | 0-based page number |
| `pageSize` | number | Rows per page |
| `status` | string (comma-separated) | Filter by status values: `open`, `importing`, `done`, `cancelled`. Multiple allowed |
| `productTypeIdentifier` | string (UUID) | Filter by product type |
| `productNumberContains` | string | Case-insensitive substring search on product number |
| `actionFilter` | string | Filter by actionable requests for the current user. Values: `provide_or_approve`, `provide_value`, `approve_value`. When set, only returns requests where the user has the matching action(s) available |

**`actionFilter` semantics**: The backend computes `actionableSummary` per request for the current user and filters accordingly:
- `provide_or_approve`: `needsValue === true` OR `needsApproval === true`
- `provide_value`: `needsValue === true`
- `approve_value`: `needsApproval === true`

**Response**:
```typescript
{
    requests: ProductRequestListRow[];
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
}
```

Each `ProductRequestListRow` includes:
```typescript
type ProductRequestListRow = ProductRequestType & {
    productTypeName: string;
    createdByName: string;
    actionableSummary: {
        needsValue: boolean;
        needsApproval: boolean;
    };
};
```

### 1.4 Route: `GET /api/product-requests/:id` — Detail

Returns a single product request with value rows filtered by the current user's view permissions.

**Auth**: Requires `FP_VIEW_PRODUCTS`.

**Response**: `ProductRequestDetail`

### 1.5 Route: `PUT /api/product-requests/:id/values/:dataTypeIdentifier` — Update Value

Updates a single data type value on a product request.

**Auth**: Authorization is checked inside the repo (writer role OR requestorCanEdit + is creator).

**Request Body**:
```typescript
{
    value: unknown;   // JSON value matching the data type kind
}
```

**Logic**:
1. Load the product request, verify it's `open`
2. Validate the new value against the data type config (min, max, type, etc.)
3. Call `ProductRequestRepo.updateProductRequestValue(tx, claims, requestId, dataTypeId, value)` in a transaction
4. Return the updated value row

**Response**: `ProductRequestValueEnriched`

### 1.6 Route: `POST /api/product-requests/:id/approve/:dataTypeIdentifier` — Approve Single

Approves a single data type value.

**Auth**: Authorization checked inside repo (Approver role).

**Request Body**: None

**Response**:
```typescript
{
    value: ProductRequestValueEnriched;
    allApproved: boolean;  // true if request status progressed to "importing"
}
```

### 1.7 Route: `POST /api/product-requests/:id/approve-all` — Approve All

Approves all unapproved values the user can approve.

**Auth**: Authorization checked inside repo (Approver role).

**Response**:
```typescript
{
    approvedCount: number;
    allApproved: boolean;
}
```

### 1.8 Route: `POST /api/product-requests/:id/cancel` — Cancel

Cancels the product request (user must have `role=cancel` in `ProductTypesPermission`).

**Auth**: Checked inside repo.

**Response**: `ProductRequestDetail` (with status = cancelled)

---

## 2. Revised Endpoints in `src/api/ProductAPI.ts`

### 2.1 `POST /api/products/:productNumber/request-update`

Currently returns `{ status: "not_implemented" }`. Implement as:

```typescript
app.post("/products/:productNumber/request-update", async (context) => {
    const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
    const authz = await authorize(context.dbClient, claims, [FP_REQUEST_PRODUCT_UPDATE]);
    if (!authz.some(p => p.identifier === FP_REQUEST_PRODUCT_UPDATE.identifier)) {
        return status(403, `Permission denied`);
    }

    const productNumber = context.params.productNumber as string;
    const product = await getProductByNumber(context.dbClient, claims, productNumber);

    if (!product) return status(404, "Product not found");

    const result = await runInTransaction(context.dbClient, async (tx) => {
        return createProductRequest(tx, claims, {
            mode: "update",
            productTypeIdentifier: product.productTypeIdentifier,
            sourceProductNumber: productNumber,
            productToUpdate: productNumber,
        });
    });

    // Return the product request identifier for client-side redirect
    return { productRequestId: result.identifier };
});
```

**Response**: `{ productRequestId: string }` — client navigates to `/product-requests/:id`

### 2.2 `POST /api/products/:productNumber/copy`

Currently returns `{ status: "not_implemented" }`. Implement as:

```typescript
app.post("/products/:productNumber/copy", async (context) => {
    const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
    const authz = await authorize(context.dbClient, claims, [FP_CREATE_PRODUCT_COPY]);
    if (!authz.some(p => p.identifier === FP_CREATE_PRODUCT_COPY.identifier)) {
        return status(403, `Permission denied`);
    }

    const productNumber = context.params.productNumber as string;
    const body = context.body as { productNumber?: string };

    const product = await getProductByNumber(context.dbClient, claims, productNumber);
    if (!product) return status(404, "Product not found");

    const result = await runInTransaction(context.dbClient, async (tx) => {
        return createProductRequest(tx, claims, {
            mode: "copy",
            productTypeIdentifier: product.productTypeIdentifier,
            sourceProductNumber: productNumber,
            productNumber: body.productNumber, // may be undefined → auto-generate
        });
    });

    return { productRequestId: result.identifier };
});
```

**Request Body** (optional):
```typescript
{ productNumber?: string }
```

**Response**: `{ productRequestId: string }`

---

## 3. OpenAPI Documentation

Each route must include `detail` with `tags`, `summary`, and `description` for LLM-compatible API docs. Follow the pattern from [`src/api/ProductAPI.ts`](../src/api/ProductAPI.ts:109).

---

## 4. Role-Based Authorization Mapping

| Operation | Permission Check | Where |
|-----------|-----------------|-------|
| Create new request | `FP_CREATE_PRODUCT` | API route |
| Create update request | `FP_REQUEST_PRODUCT_UPDATE` | API route |
| Create copy request | `FP_CREATE_PRODUCT_COPY` | API route |
| View requests | `FP_VIEW_PRODUCTS` | API route |
| Edit value | `DataTypeGroupRoles.Writer` OR `requestorCanEdit` + is creator | Repo |
| Approve value | `DataTypeGroupRoles.Approver` | Repo |
| Cancel request | `role=cancel` in `ProductTypesPermission` | Repo |

---

## 5. Client-Side API Functions

Create [`src/ui/api/ProductRequests.ts`](../src/ui/api/ProductRequests.ts):

```typescript
import { apiGet, apiPost, apiPut } from "./index.ts";

const BASE = "/api/product-requests";

export async function createProductRequest(data: {
    mode: "new" | "update" | "copy";
    productTypeIdentifier?: string;
    productNumber?: string;
    sourceProductNumber?: string;
}): Promise<{ productRequestId: string }> {
    return apiPost(`${BASE}`, data);
}

export async function getProductRequests(
    page: number, pageSize: number,
    filters?: {
        status?: string[];
        productTypeIdentifier?: string;
        productNumberContains?: string;
        actionFilter?: "provide_or_approve" | "provide_value" | "approve_value";
    }
): Promise<ProductRequestListResponse> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filters?.status?.length) params.set("status", filters.status.join(","));
    if (filters?.productTypeIdentifier) params.set("productTypeIdentifier", filters.productTypeIdentifier);
    if (filters?.productNumberContains) params.set("productNumberContains", filters.productNumberContains);
    if (filters?.actionFilter) params.set("actionFilter", filters.actionFilter);
    return apiGet(`${BASE}?${params.toString()}`);
}

export async function getProductRequest(id: string): Promise<ProductRequestDetailResponse> {
    return apiGet(`${BASE}/${id}`);
}

export async function updateProductRequestValue(
    requestId: string, dataTypeIdentifier: string, value: unknown
): Promise<ProductRequestValueEnriched> {
    return apiPut(`${BASE}/${requestId}/values/${dataTypeIdentifier}`, { value });
}

export async function approveProductRequestValue(
    requestId: string, dataTypeIdentifier: string
): Promise<{ value: ProductRequestValueEnriched; allApproved: boolean }> {
    return apiPost(`${BASE}/${requestId}/approve/${dataTypeIdentifier}`, {});
}

export async function approveAllProductRequestValues(
    requestId: string
): Promise<{ approvedCount: number; allApproved: boolean }> {
    return apiPost(`${BASE}/${requestId}/approve-all`, {});
}

export async function cancelProductRequest(id: string): Promise<ProductRequestDetailResponse> {
    return apiPost(`${BASE}/${id}/cancel`, {});
}
```
