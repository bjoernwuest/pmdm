# Product Request — High-Level Feature Design

> **Status**: Draft  
> **Related**: [`product_request-1.md`](product_request-1.md) · [`product_request-2.md`](product_request-2.md) · [`product_request-3.md`](product_request-3.md) · [`product_request-4.md`](product_request-4.md) · [`product_request-5.md`](product_request-5.md)

---

## Overview

A **Product Request** is a workflow entity for updating or creating a product. Instead of mutating products directly, users create a *request* that collects and approves data type values before the system imports the changes into the actual product.

Product requests progress through a status lifecycle: `open` → `importing` → `done` (or `cancelled`). Only the `open` → `importing` transition is implemented in this feature; `importing` → `done` is deferred.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                  UI Layer                    │
│  OpenRequestsPage  ProductRequestDetailPage │
│  ProductPage (buttons) ProductDetailPage    │
└──────────────┬──────────────────────────────┘
               │ HTTP (REST + Request Bundling)
┌──────────────▼──────────────────────────────┐
│              API Layer                       │
│  /api/product-requests  (new route file)    │
│  /api/products/:pn/request-update (revised) │
│  /api/products/:pn/copy           (revised) │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│             Repo Layer                       │
│  ProductRequestRepo (new)                   │
│  ProductRepo (existing, minor additions)    │
└──────────────┬──────────────────────────────┘
               │ Drizzle ORM
┌──────────────▼──────────────────────────────┐
│           PostgreSQL                         │
│  product_requests, product_requests_values  │
│  product_number_state (locking sentinel)    │
└─────────────────────────────────────────────┘
```

---

## Core Design Decisions

### 1. Permission Precedence

For product-request data types, permissions follow this precedence:

| Aspect | Precedence |
|--------|-----------|
| Role assignments | [`ProductTypesDataTypePermission`](../src/schema/ProductType.ts:67) > [`DataTypePermission`](../src/schema/DataType.ts:138) |
| `showByDefault` | [`ProductTypesDataTypePermission.showByDefault`](../src/schema/ProductType.ts:76) > [`DataTypePermission.showByDefault`](../src/schema/DataType.ts:147) |
| `mandatory` | [`ProductTypesDataTypes.mandatory`](../src/schema/ProductType.ts:43) > [`DataTypeSchema.mandatory`](../src/schema/DataType.ts:121) |
| `requestorCanEdit` | [`ProductTypesDataTypes.requestorCanEdit`](../src/schema/ProductType.ts:44) > [`DataTypeSchema.requestorCanEdit`](../src/schema/DataType.ts:122) |
| `config` | [`ProductTypesDataTypes.config`](../src/schema/ProductType.ts:45) > [`DataTypeSchema.config`](../src/schema/DataType.ts:123) |
| `owner` (BusinessDomain) | [`ProductTypesDataTypes.owner`](../src/schema/ProductType.ts:46) > [`DataTypeSchema.owner`](../src/schema/DataType.ts:124) |

Each field individually falls back to the DataTypeSchema-level value when the ProductTypesDataTypes value is `null`/`undefined`.

### 2. Data Type Visibility on Product Request Detail

A data type is **visible** to a user on a product request detail page when ALL of:
1. The data type is **enabled** (not disabled)
2. The user has at least one role (`viewer`, `writer`, `approver`) assigned — checked via `ProductTypesDataTypePermission` first, falling back to `DataTypePermission`
3. AND either:
   - `showByDefault` is `true` on the user's permission entry, OR
   - The "Show hidden" toggle is enabled on the UI

### 3. Edit Permissions on Product Request Detail

A data type value is **editable** by a user when:
- `editableOnUpdate` is `true` on the `ProductTypesDataTypes` assignment (or if the request is NOT an update request, this field is not checked), AND
- Either:
  - The user has `DataTypeGroupRoles.Writer` assigned, OR
  - `requestorCanEdit` is `true` AND the user is the `createdBy` of the product request

For "Request update" product requests: if `editableOnUpdate` is `false`, the data type is read-only (not editable) and automatically approved. It is visible only if the user has view permission.

### 4. Approval Permissions

A data type value can be **approved** by a user when:
- The user has `DataTypeGroupRoles.Approver` assigned
- AND there is a value assigned (`ProductRequestsValues.value` is not null, or `ProductRequestsValues.defaultValue` is not null)
- "Calculated" data types are always considered approved (no approval action needed)

### 5. Tri-State Boolean

Boolean data types with `permitEmpty: true` support three states:
- `true` → checked
- `false` → unchecked
- `null` → indeterminate

Stored as JSON `true`, `false`, or `null` in the `value` column.

### 6. Product Number Generation

When no `productNumber` is provided, generate one using pattern `5xxxxxx-01`:
- `xxxxxx` = six-digit zero-padded incrementing counter
- Counter stored/maintained via [`ProductNumberState`](../src/schema/ProductRequest.ts:9) sentinel table
- Lock via `SELECT ... FOR UPDATE` on the single row to prevent race conditions
- The lock is held within a database transaction

### 7. Status Auto-Progression

After any approval action (single approve or approve-all), the backend checks: are ALL non-calculated data types approved? If yes, transition status from `open` → `importing`. Calculated data types are always considered approved.

### 8. Cancellation

User with `role=cancel` in [`ProductTypesPermission`](../src/schema/ProductType.ts:26) can cancel. On cancel:
- Set status to `cancelled`
- Clean up consumable values (free any consumable value reservations)
- No further cleanup

### 9. "Enabled", "Self" and "Used" Filtering in Dropdowns

- **Product dropdowns**: Hide the product being updated (`productToUpdate`) to prevent self-referencing. For new requests, no filtering needed.
- **Consumable dropdowns**: Hide consumable values where `is_used` is `true` (and the value is not already assigned to this request).
- Hide all products / consumable values / lookup values that are disabled.

### 10. Default Value Calculation

- **On creation** (all request types): Calculate defaults using `defaultProvider` for data types with mode `OnCreate`, `OnChangeNoValue`, or `OnChange`
- **On value change** (via API): Recalculate for data types with mode `OnChangeNoValue` (only if value is null and not approved) or `OnChange` (unless approved)
- **"Copy from" requests**: Initialize values from the source product; only calculate defaults where no value was copied
- **Calculated data types**: Use `script` function (not `defaultProvider`). For update requests with `editableOnUpdate: false`, use the existing value from the product being updated.
- Calculated data type scripts execute on creation and on every value change (mode `OnChange`)

---

## Sub-Design Documents

| Document | Scope |
|----------|-------|
| [`product_request-1.md`](product_request-1.md) | Schema migrations, `ProductRequestRepo` |
| [`product_request-2.md`](product_request-2.md) | API routes (CRUD, approve, cancel) |
| [`product_request-3.md`](product_request-3.md) | Open Requests page UI |
| [`product_request-4.md`](product_request-4.md) | Product Request Detail page UI |
| [`product_request-5.md`](product_request-5.md) | Integration points & status auto-progression |

---

## Files to Create / Modify

### New Files
| File | Purpose |
|------|---------|
| `src/repo/ProductRequestRepo.ts` | Repository for product request CRUD + value management |
| `src/api/ProductRequestAPI.ts` | API routes for product requests |
| `src/ui/api/ProductRequests.ts` | Client-side API functions |
| `src/ui/pages/OpenProductRequestsPage.tsx` | Open requests list page |
| `src/ui/pages/ProductRequestDetailPage.tsx` | Product request detail page |

### Modified Files
| File | Change |
|------|--------|
| `src/schema/ProductRequestSchema.ts` | Add PubSub message constants, types |
| `src/types/ProductRequestSchema.ts` | Add enriched types for API responses |
| `src/api/ProductAPI.ts` | Implement `request-update` and `copy` endpoints |
| `src/ui/api/Products.ts` | Update `requestProductUpdate` / `copyProduct` to call new endpoints |
| `src/ui/pages/ProductPage.tsx` | Wire up "Request Update" and "Create Copy" buttons |
| `src/ui/pages/ProductDetailPage.tsx` | Wire up "Request update" and "Create copy" buttons |
| `src/ui/PageRegistry.ts` | Register new pages |
| `src/ui/auth/app_functional_permissions.ts` | Add new FP entries if needed |

### Migration Files
| File | Purpose |
|------|---------|
| `src/migrations/[timestamp]_product_request_tweaks.sql` | Any schema fixes needed (e.g., column renames) |
