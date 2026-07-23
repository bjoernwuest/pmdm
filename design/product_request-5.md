# Product Request — Part 5: Integration Points & Status Auto-Progression

> Parent: [`product_request.md`](product_request.md)

---

## 1. ProductPage.tsx Integration

### 1.1 "Request Update" Button

**Current state**: [`handleRequestUpdate`](../src/ui/pages/ProductPage.tsx:236) calls `requestProductUpdate()` stub which shows "Not yet implemented" toast.

**New behavior**:
1. Call `createProductRequest({ mode: "update", sourceProductNumber: productNumber })` via the client API
2. On success: navigate to `/product-requests/:id` (the new request's detail page)
3. On error: show error toast

```typescript
const handleRequestUpdate = useCallback(async (productNumber: string) => {
    try {
        const result = await createProductRequest({ mode: "update", sourceProductNumber: productNumber });
        navigate(`/product-requests/${result.productRequestId}`);
    } catch (e: any) {
        toast.current?.show({ severity: "error", summary: "Error", detail: e.message, life: 5000 });
    }
}, [navigate]);
```

### 1.2 "Create Copy" Button

**Current state**: [`handleCopy`](../src/ui/pages/ProductPage.tsx:245) calls `copyProduct()` stub.

**New behavior**:
1. Show a popup dialog requesting the target `productNumber` (optional, auto-generate if empty)
2. Dialog has: `productNumber` input field + "Create" button (pi-copy icon) + "Cancel" button
3. "Create" button calls `createProductRequest({ mode: "copy", sourceProductNumber: productNumber, productNumber: enteredValue })`
4. If the product number already exists (409 response): show warning "Product number already exists" and keep dialog open
5. On success: navigate to `/product-requests/:id`
6. "Cancel" closes the dialog

**Dialog layout**:
```
┌──────────────────────────────────────┐
│  Create Copy of [productNumber]      │
├──────────────────────────────────────┤
│                                      │
│  New Product Number: [__________]   │
│  (leave empty for auto-generation)   │
│                                      │
│              [Cancel]  [Create]      │
└──────────────────────────────────────┘
```

### 1.3 Action Buttons Visibility

The "Request Update" and "Create Copy" buttons should only be visible when the user has the respective functional permissions:
- Request Update: `FP_REQUEST_PRODUCT_UPDATE`
- Create Copy: `FP_CREATE_PRODUCT_COPY`

The current code always shows both buttons — add permission checks.

### 1.4 PubSub — No Changes Needed

The existing PubSub subscriptions for product changes (`message_CreateProduct`, `message_UpdateProduct`, `message_DisableProduct`) remain unchanged. Product request changes are tracked via their own PubSub topics.

---

## 2. ProductDetailPage.tsx Integration

### 2.1 "Request update" Button

**Current state**: [`onClick={() => {}}`](../src/ui/pages/ProductDetailPage.tsx:95) — empty handler.

**New behavior**: Same as ProductPage "Request Update":
1. Call `createProductRequest({ mode: "update", sourceProductNumber: productNumber })`
2. Navigate to `/product-requests/:id`

### 2.2 "Create copy" Button

**Current state**: [`onClick={() => {}}`](../src/ui/pages/ProductDetailPage.tsx:96) — empty handler.

**New behavior**: Same as ProductPage "Create Copy" (show popup, create, navigate).

### 2.3 Permission Checks

Add permission-based visibility for both buttons (same as ProductPage).

---

## 3. Client-Side API Wrappers

### 3.1 Update `src/ui/api/Products.ts`

Replace the stub implementations of [`requestProductUpdate`](../src/ui/api/Products.ts:86) and [`copyProduct`](../src/ui/api/Products.ts:90):

```typescript
// These become thin wrappers that call the product request API
import { createProductRequest } from "./ProductRequests.ts";

export async function requestProductUpdate(productNumber: string): Promise<{ productRequestId: string }> {
    return createProductRequest({ mode: "update", sourceProductNumber: productNumber });
}

export async function copyProduct(productNumber: string, targetProductNumber?: string): Promise<{ productRequestId: string }> {
    return createProductRequest({ mode: "copy", sourceProductNumber: productNumber, productNumber: targetProductNumber });
}
```

**Or** deprecate these wrapped functions and have the pages call `createProductRequest` directly (cleaner approach). The choice depends on whether the existing API surface should be preserved.

---

## 4. Status Auto-Progression Flow

### 4.1 Trigger Points

Auto-progression from `open` → `importing` happens at:

| Trigger | Location |
|---------|----------|
| Single approve | [`approveProductRequestValue`](product_request-1.md#37-approveproductrequestvaluetx-claims-requestid-datatypeid) in repo |
| Approve all | [`approveAllProductRequestValues`](product_request-1.md#38-approveallproductrequestvaluestx-claims-requestid) in repo |

Both call `checkAllApproved()` at the end of their transaction.

### 4.2 `checkAllApproved` Logic

```
function checkAllApproved(tx, requestId):
    totalDataTypes = COUNT(product_requests_values WHERE product_request = requestId AND kind != 'calculated')
    approvedDataTypes = COUNT(product_requests_values WHERE product_request = requestId AND kind != 'calculated' AND approved_by IS NOT NULL)
    
    // Calculated data types are always considered approved (excluded from count)
    
    if totalDataTypes == approvedDataTypes:
        UPDATE product_requests SET status = 'importing' WHERE identifier = requestId
        PubSub.publish(message_ImportingProductRequest, { identifier: requestId })
        return true
    return false
```

### 4.3 Sequence Diagram

```
User clicks "Approve" on a data type value
    │
    ▼
PUT /api/product-requests/:id/approve/:dataType
    │
    ▼
approveProductRequestValue(tx, claims, id, dt)
    │
    ├─ Verify user has Approver role
    ├─ Verify value exists
    ├─ UPDATE product_requests_values SET approved_by, approved_at
    ├─ PubSub.publish(message_ApproveProductRequestValue)
    │
    └─ checkAllApproved(tx, id)
        │
        ├─ COUNT unapproved non-calculated types
        ├─ COUNT total non-calculated types
        │
        └─ IF all approved:
            ├─ UPDATE product_requests SET status = 'importing'
            └─ PubSub.publish(message_ImportingProductRequest)
```

---

## 5. PageRegistry Registration

Add both new pages to [`src/ui/PageRegistry.ts`](../src/ui/PageRegistry.ts):

```typescript
import * as OpenProductRequestsPage from "./pages/OpenProductRequestsPage.tsx";
import * as ProductRequestDetailPage from "./pages/ProductRequestDetailPage.tsx";

export const pageModules: readonly PageModule[] = [
    // ... existing pages ...
    { meta: OpenProductRequestsPage.meta, Component: OpenProductRequestsPage.Component },
    // ... existing pages ...
    { meta: ProductRequestDetailPage.meta, Component: ProductRequestDetailPage.Component },
    // ... existing pages ...
];
```

**Order**: The Open Requests page should appear in the `General` section before the Products page (order 5 vs order 10). The order in the array doesn't affect menu order (that's determined by `meta.menu.section` + `meta.menu.order`).

---

## 6. File Creation/Modification Summary

### New Files
| File | Lines (est.) |
|------|-------------|
| `src/repo/ProductRequestRepo.ts` | ~400 |
| `src/api/ProductRequestAPI.ts` | ~250 |
| `src/ui/api/ProductRequests.ts` | ~80 |
| `src/ui/pages/OpenProductRequestsPage.tsx` | ~300 |
| `src/ui/pages/ProductRequestDetailPage.tsx` | ~600 |

### Modified Files
| File | Changes |
|------|---------|
| `src/types/ProductRequestSchema.ts` | Add PubSub topics + enriched types (~50 lines) |
| `src/api/ProductAPI.ts` | Implement `request-update` and `copy` endpoints (~60 lines changed) |
| `src/ui/api/Products.ts` | Update `requestProductUpdate`/`copyProduct` or deprecate (~20 lines changed) |
| `src/ui/pages/ProductPage.tsx` | Wire up buttons with dialogs and API calls (~80 lines changed) |
| `src/ui/pages/ProductDetailPage.tsx` | Wire up buttons with dialogs and API calls (~40 lines changed) |
| `src/ui/PageRegistry.ts` | Register 2 new pages (~4 lines added) |

---

## 7. Things NOT in Scope

The following are explicitly deferred:
- `importing` → `done` status transition (manual or automatic)
- Actual product import/update from an approved request
- `done` status handling (what happens after import)
- Extracting `SaveRestoreField` to a shared component (can inline the pattern)
- `MonacoField` extraction
