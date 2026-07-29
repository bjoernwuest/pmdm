# Product Request — Part 3: Open Requests Page

> Parent: [`product_request.md`](product_request.md)

---

## 1. Page Overview

**File**: [`../src/ui/pages/pmdm/OpenProductRequestsPage.tsx`](../src/ui/pages/pmdm/OpenProductRequestsPage.tsx)

**Route**: `/product-requests`

**Menu**: General section, above Products (order: 5), label: "Open requests"

**Access**: Requires `FP_VIEW_PRODUCTS` functional permission.

---

## 2. Page Meta Definition

```typescript
import type { PageMeta } from "@/ui/types/Page.ts";
import { FP_VIEW_PRODUCTS } from "@/ui/auth/functional_permissions.ts";

export const meta: PageMeta = {
    id: "open-product-requests",
    urn: "urn:bun-starter:ui:page:open-product-requests",
    path: "/product-requests",
    title: "Open requests",
    description: "View and manage open product requests.",
    menu: {
        section: "General",
        order: 5,
        label: "Open requests",
    },
    requiredFunctionalPermissions: [FP_VIEW_PRODUCTS.functionalPermissionName],
};
```

---

## 3. Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Open requests                    [Create new product]       │
├─────────────────────────────────────────────────────────────┤
│  Filters:                                                    │
│  Action: [Provide value│  Status: [open ▼]  ProdType: [All │
│   OR Approve value ▼] │              Product#: [________]  │
├─────────────────────────────────────────────────────────────┤
│  Data Table:                                                 │
│  ┌──────────┬──────────────┬────────┬────────┬────────────┐ │
│  │ Product# │ Product Type │ Status │ Action │ Created By │ │
│  │          │              │        │for you │            │ │
│  ├──────────┼──────────────┼────────┼────────┼────────────┤ │
│  │ 5000001 │ Widget       │ Open   │Provide │ John Doe   │ │
│  │          │              │        │value   │            │ │
│  │ 5000002 │ Service      │ Open   │Approve │ Jane Smith │ │
│  │          │              │        │value   │            │ │
│  │ 5000003 │ Widget       │ Import.│  —     │ John Doe   │ │
│  └──────────┴──────────────┴────────┴────────┴────────────┘ │
│                          < 1 2 3 >                           │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Header

- Title: "Open requests"
- "Create new product" button (pi-plus icon) — opens the create dialog (Section 4)

### 3.2 Filter Section

Inline filter bar (not a modal), positioned above the data table:

| Filter | Component | Behavior |
|--------|-----------|----------|
| Action for you | Dropdown | Values: `All`, `Provide value OR Approve value`, `Provide value`, `Approve value`. **Default: `Provide value OR Approve value`** (shows only requests where the user can contribute). `All` removes the action filter entirely |
| Status | Multi-select dropdown | Values: `open`, `importing`, `done`, `cancelled`. Default: none selected (show all). Pre-select `open` on initial load |
| Product Type | Dropdown | All enabled product types + "All". Default: "All" |
| Product Number | Input field | Case-insensitive substring search |

Filters are applied on change (debounced for the text input, immediate for dropdowns).

**Action filter semantics**: When set to a non-`All` value, the backend (or client-side filter after fetching) only returns requests where the current user's `actionableSummary` matches the selected action:
- `Provide value OR Approve value`: `needsValue === true` OR `needsApproval === true`
- `Provide value`: `needsValue === true`
- `Approve value`: `needsApproval === true`

The default of `Provide value OR Approve value` ensures the page immediately shows the user which requests need their attention.

### 3.3 Data Table

Uses PrimeReact [`DataTable`](https://primereact.org/datatable/) with lazy loading and pagination.

**Columns**:

| Column | Field | Notes |
|--------|-------|-------|
| Product # | `productNumber` | Sortable. Click navigates to detail page |
| Product Type | `productTypeName` | Sortable |
| Status | `status` | Rendered as Tag: `open`=info, `importing`=warning, `done`=success, `cancelled`=danger |
| Action for you | (computed) | See section 3.4 |
| Created By | `createdByName` | |

**Row click**: Navigate to `/product-requests/:id` (detail page).

### 3.4 "Action for your" Column Logic

For each product request, determine what actions the current user can take. This requires fetching the current user's permissions for each request's data types.

**Algorithm** (per request):
1. Fetch the enriched product request values (from list endpoint or via included permission data)
2. For each value, check:
   - **Provide value**: The user has `Writer` role (or `requestorCanEdit` + is creator), AND `ProductRequestsValues.value` IS NULL (i.e., not yet provided)
   - **Approve value**: The user has `Approver` role, AND `ProductRequestsValues.approvedBy` IS NULL (not yet approved)
3. Display logic:
   - If BOTH "Provide value" AND "Approve value" apply → show both labels (e.g., "Provide value, Approve value")
   - If only "Provide value" → show "Provide value"
   - If only "Approve value" → show "Approve value"
   - If NEITHER → show "—"

**Performance consideration**: This computation requires permission data per request. The list endpoint should include a summary of the user's actionable data types, or the client should batch-fetch permissions. For simplicity, the list endpoint can return:
```typescript
{
    actionableSummary: {
        needsValue: boolean;
        needsApproval: boolean;
    }
}
```
per request row.

---

## 4. "Create New Product" Dialog

Triggered by clicking "Create new product" button in the header.

### 4.1 Dialog Layout

```
┌──────────────────────────────────────┐
│  Create New Product Request          │
├──────────────────────────────────────┤
│                                      │
│  Product Type: [Searchable Dropdown▼]│
│                                      │
│  Product Number: [______________]    │
│  (leave empty for auto-generation)   │
│                                      │
│              [Cancel]  [Create]      │
└──────────────────────────────────────┘
```

### 4.2 Behavior

1. **Product Type dropdown**: Searchable dropdown showing all enabled product types (from [`getProductTypes`](../src/ui/api/ProductTypes.ts)). The "Create" button is disabled until a product type is selected.
2. **Product Number input**: Optional text field. Placeholder: "e.g. 5000001-01" or "auto-generated if empty"
3. **Create button** (pi-plus icon): 
   - Calls `createProductRequest({ mode: "new", productTypeIdentifier, productNumber })`
   - If product number already exists (409 response):
     - Show error toast "Product number already exists"
     - Navigate to `/products/:productNumber` (product detail page)
   - On success:
     - Navigate to `/product-requests/:id` (the newly created request)
4. **Cancel button**: Closes the dialog

---

## 5. PubSub Subscriptions

Subscribe to topic updates to auto-refresh the list:

```typescript
useEffect(() => {
    const sub1 = subscribe(message_CreateProductRequest, () => fetchRequests());
    const sub2 = subscribe(message_CancelProductRequest, () => fetchRequests());
    const sub3 = subscribe(message_ImportingProductRequest, () => fetchRequests());
    return () => {
        if (sub1) unsubscribe(sub1);
        if (sub2) unsubscribe(sub2);
        if (sub3) unsubscribe(sub3);
    };
}, [fetchRequests]);
```

---

## 6. Page Registration

Add to [`src/ui/PageRegistry.ts`](../src/ui/PageRegistry.ts:26) in the `pageModules` array:

```typescript
{ meta: OpenProductRequestsPage.meta, Component: OpenProductRequestsPage.Component },
```

Position before the Products page entry (or after AdministrationHomePage if that appears first in General section).

---

## 7. Dependencies

- **API**: [`getProductRequests`](../src/ui/api/ProductRequests.ts), [`createProductRequest`](../src/ui/api/ProductRequests.ts), [`getProductTypes`](../src/ui/api/ProductTypes.ts)
- **Components**: PrimeReact `DataTable`, `Column`, `Button`, `Dialog`, `Dropdown`, `InputText`, `Tag`, `Toast`
- **PubSub**: `subscribe`, `unsubscribe` from [`src/ui/pubsub.ts`](../src/ui/pubsub.ts)
- **PubSub topics**: `message_CreateProductRequest`, `message_CancelProductRequest`, `message_ImportingProductRequest` from [`src/types/ProductRequestSchema.ts`](../src/types/ProductRequest.ts)
