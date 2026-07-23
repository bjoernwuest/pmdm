# Product Request — Part 4: Product Request Detail Page

> Parent: [`product_request.md`](product_request.md)

---

## 1. Page Overview

**File**: [`src/ui/pages/ProductRequestDetailPage.tsx`](../src/ui/pages/ProductRequestDetailPage.tsx)

**Route**: `/product-requests/:id`

**Menu**: Hidden (not shown in navigation). Accessed via navigation from the Open Requests list or after creating a new request.

**Access**: Requires `FP_VIEW_PRODUCTS` functional permission.

```typescript
export const meta: PageMeta = {
    id: "product-request-detail",
    urn: "urn:bun-starter:ui:page:product-request-detail",
    path: "/product-requests/:id",
    title: "Product Request Detail",
    description: "View and edit product request values.",
    menu: {
        section: "General",
        order: 0,
        label: "",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_VIEW_PRODUCTS.functionalPermissionName],
};
```

---

## 2. Page Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to Open requests                                     │
├──────────────────────────────────────────────────────────────┤
│  Header Panel:                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Product: 5000001-01  │  Widget (ProductType)             │ │
│  │ [Open] Tag           │                                   │ │
│  │                      │  [Filter] [Approve all] [Cancel]  │ │
│  │ (if update: "Update of [5000000-01](link to product)" )  │ │
│  └──────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│  [Show hidden] toggle                                         │
├──────────────────────────────────────────────────────────────┤
│  Data Type Table:                                             │
│  ┌────────┬──────────┬──────────┬──────────┬───────┬───────┐ │
│  │ Kind   │ Name*    │ Value    │ Last Ed. │ Owner │ Appr. │ │
│  ├────────┼──────────┼──────────┼──────────┼───────┼───────┤ │
│  │ Numeric│ Weight*  │ [42.5▾]  │JD·12:00 │ Mfg   │JD ✓  │ │
│  │ String │ Notes    │ [____▾]  │Not yet ed│ QA   │ —    │ │
│  │ Lookup │ Color    │ [Red▾]   │JS·11:30 │ Mfg   │JS ✓  │ │
│  │ Bool   │ Active   │ [✓] tog. │Not yet ed│ QA   │ —    │ │
│  │ TriBool│ Optional │ [─] chkbx│Not yet ed│ QA   │ —    │ │
│  │ Calc.  │ Total    │ 123.45   │ auto     │ Sys   │auto ✓│ │
│  └────────┴──────────┴──────────┴──────────┴───────┴───────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Header Panel

### 3.1 Left Side

| Element | Content |
|---------|---------|
| Product Number | `productNumber` prominently displayed |
| Product Type | Name of the product type |
| Status Tag | Colored tag: `open`=info, `importing`=warning, `done`=success, `cancelled`=danger |

**For "update" requests** (`productToUpdate` is set):
Show "Update of [productNumber](link)" — the product number is a clickable link to `/products/:productNumber`.

### 3.2 Right Side — Action Buttons

| Button | Condition | Action |
|--------|-----------|--------|
| **Filter** | Always visible | Opens filter popup (Section 5) |
| **Approve all** | User has Approver role on at least one data type with a value set | Calls `approveAllProductRequestValues()`, refreshes page |
| **Cancel** | User has `role=cancel` in `ProductTypesPermission` AND status is `open` | Shows confirmation dialog, calls `cancelProductRequest()`, then navigates to `/product-requests` |

### 3.3 "Show Hidden" Toggle

A toggle switch above the data table:

- **Off (default)**: Hide data types where `showByDefault` is `false`
- **On**: Show ALL data types (including those with `showByDefault: false`)

Label: "Show hidden"

---

## 4. Data Type Table

### 4.1 Visibility Rules

A row is **visible** when ALL of:
1. Data type is not disabled
2. User has at least one role (`viewer`, `writer`, `approver`) on this data type
3. `showByDefault` is `true` OR "Show hidden" toggle is on

### 4.2 Columns

| Column | Content |
|--------|---------|
| **Kind** | Data type kind (`numeric`, `string`, `boolean`, `lookup`, `consumable`, `product`, `calculated`) |
| **Name** | Data type name. Asterisk (`*`) suffix if mandatory (resolved: `ProductTypesDataTypes.mandatory` > `DataTypeSchema.mandatory` > `false`) |
| **Value** | Input element (see Section 4.3). Initialize with `ProductRequestsValues.value` ?? `ProductRequestsValues.defaultValue` |
| **Last Editor** | `ProductRequestsValues.updatedBy` name + `ProductRequestsValues.updatedAt` timestamp, or "Not yet edited" if `value` is null |
| **Owner** | Business Domain name (resolved: `ProductTypesDataTypes.owner` > `DataTypeSchema.owner` → `BusinessDomains.name`) |
| **Approval** | See Section 4.4 |

### 4.3 Input Elements by Kind

| Kind | Input Component | Behavior |
|------|----------------|----------|
| `boolean` (dual-state, `permitEmpty: false`) | PrimeReact `ToggleButton` or `InputSwitch` | Toggle between `true`/`false` |
| `boolean` (tri-state, `permitEmpty: true`) | PrimeReact `TriStateCheckbox` | Cycles: checked → unchecked → indeterminate. Values: `true`, `false`, `null` |
| `numeric` | `SaveRestoreField` with number input | Apply `min`, `max`, `decimals` constraints. Show current value; edit opens inline |
| `string` (single-line, `multi: false`) | `SaveRestoreField` with text input | Apply `min`, `max` length constraints |
| `string` (multi-line, `multi: true`) | `SaveRestoreField` with textarea | Apply `min`, `max` length constraints |
| `lookup` | Dropdown (single or multi) | See Section 4.3.1 |
| `consumable` | Dropdown (single or multi) | See Section 4.3.1 |
| `product` | Dropdown (single or multi) | See Section 4.3.1 |
| `calculated` | Read-only display | Shows computed value; not editable |

**Editable**: Input elements are enabled when:
- User has `Writer` role, OR (`requestorCanEdit` is `true` AND user is `createdBy`)
- AND (for update requests only) `editableOnUpdate` is `true`

**Read-only**: All other cases (including `editableOnUpdate: false` for update requests).

#### 4.3.1 Lookup / Consumable / Product Dropdowns

| Dropdown Type | Display | Filtering |
|---------------|---------|-----------|
| Lookup | Show `name` of lookup value | Hide disabled; filter by `source` config |
| Consumable | Show `name` of consumable value | Hide disabled; hide `is_used: true` (unless already assigned to this request); filter by `source` config |
| Product | Show `productNumber` of product | Hide disabled; hide "self" (`productToUpdate`); filter by config |

**Single vs Multi**:
- If `multi` config is `true` → PrimeReact `MultiSelect` (checkboxes)
- If `multi` config is `false` or unset → PrimeReact `Dropdown` (single select)

**Filterable**: All dropdowns support type-ahead filtering (case-insensitive substring match).

**Save on change**: When the user selects a new value, immediately call `updateProductRequestValue()`. Show a toast on success/error.

### 4.4 Approval Column

For each row, show:

| State | Display |
|-------|---------|
| Not yet approved | Empty or "—" |
| Approved | Checkmark + approver name + timestamp (e.g., "JD ✓ 12:00") |

**Approve button**: Chip-style button labeled "Approve" (pi-check icon).

**Visible when**:
- User has `Approver` role on this data type
- Value is not yet approved (`approvedBy` is null)
- A value exists (`value` IS NOT NULL OR `defaultValue` IS NOT NULL — using the displayed value)

**Disabled when**: No value is set (no `value` and no `defaultValue`).

**On click**: Calls `approveProductRequestValue()`. On success:
- If `allApproved` is `true`, show a toast "All values approved — request moved to importing"
- Refresh the values

**Calculated data types**: Always show "Auto-approved" or similar.

---

## 5. Filter Popup

Triggered by "Filter" button in the header.

### 5.1 Layout

```
┌─────────────────────────────────────┐
│  Filter Data Types                  │
├─────────────────────────────────────┤
│                                     │
│  ☑ Weight (Numeric) — Edit/Approve │
│  ☐ Notes (String) — View only      │
│  ☑ Color (Lookup) — Approve only   │
│  ☑ Active (Boolean) — View only    │
│                                     │
│         [Clear Filter]  [Apply]     │
└─────────────────────────────────────┘
```

### 5.2 Behavior

- Shows a list of ALL data types the user can view (respecting visibility rules)
- Each item shows: data type name + kind + user's role(s) on that data type
- Checkboxes: initially all checked (no filter applied)
- **Apply**: Filters the table to show only checked data types
- **Clear Filter**: Resets to show all data types (all checkboxes checked), closes popup
- **State**: Filter state is local to the page (not persisted)

---

## 6. SaveRestoreField Integration

Use the [`SaveRestoreField`](../design/components.md:17) component for `numeric` and `string` value editing.

**Integration**: The component wraps the input field and provides:
- **Save** button: Calls `updateProductRequestValue()`
- **Restore** button: Reverts to the previously saved value
- **Clear** button: Sets value to null (clears the input)

Until `SaveRestoreField` is extracted to [`src/ui/components/SaveRestoreField.tsx`](../src/ui/components/SaveRestoreField.tsx), inline the pattern from [`ConfigurationDataTypeDetail.tsx`](../src/ui/pages/ConfigurationDataTypeDetail.tsx:255).

---

## 7. PubSub Subscriptions

```typescript
useEffect(() => {
    const sub1 = subscribe(message_UpdateProductRequestValue, (payload) => {
        // If the updated value belongs to this request, refresh
        if (payload.productRequest === requestId) fetchDetail();
    });
    const sub2 = subscribe(message_ApproveProductRequestValue, (payload) => {
        if (payload.productRequest === requestId) fetchDetail();
    });
    const sub3 = subscribe(message_CancelProductRequest, (payload) => {
        if (payload.identifier === requestId) navigate("/product-requests");
    });
    const sub4 = subscribe(message_ImportingProductRequest, (payload) => {
        if (payload.identifier === requestId) fetchDetail();
    });
    return () => {
        [sub1, sub2, sub3, sub4].forEach(s => { if (s) unsubscribe(s); });
    };
}, [requestId, fetchDetail, navigate]);
```

---

## 8. Page Registration

Hidden page — add to [`src/ui/PageRegistry.ts`](../src/ui/PageRegistry.ts) in `pageModules`:

```typescript
{ meta: ProductRequestDetailPage.meta, Component: ProductRequestDetailPage.Component },
```

Since `menu.hidden: true`, it won't appear in navigation but will be accessible via `getAccessiblePages()`.

---

## 9. Dependencies

- **API**: [`getProductRequest`](../src/ui/api/ProductRequests.ts), [`updateProductRequestValue`](../src/ui/api/ProductRequests.ts), [`approveProductRequestValue`](../src/ui/api/ProductRequests.ts), [`approveAllProductRequestValues`](../src/ui/api/ProductRequests.ts), [`cancelProductRequest`](../src/ui/api/ProductRequests.ts)
- **Lookup values**: [`getLookupValues`](../src/ui/api/Lookups.ts) (for lookup dropdowns)
- **Consumable values**: [`getConsumableValues`](../src/ui/api/Consumables.ts) (for consumable dropdowns)
- **Products**: [`getProducts`](../src/ui/api/Products.ts) (for product dropdowns)
- **Components**: PrimeReact `DataTable`, `Column`, `Button`, `Tag`, `ToggleButton`, `InputSwitch`, `TriStateCheckbox`, `Dropdown`, `MultiSelect`, `InputText`, `InputTextarea`, `Dialog`, `Toast`, `Card`, `Checkbox`
- **SaveRestoreField**: Inline pattern from `ConfigurationDataTypeDetail.tsx` (or shared component if extracted)
