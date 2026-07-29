# Shared Component Extraction Plan

> Generated 2026-06-25 as an adjunct to `design/producttypes.md` section 12.

## 1. PermissionChipManager

**Status:** Part of the product-types implementation (see [`design/producttypes.md`](producttypes.md) section 12.1).

**Source:** [`../src/ui/pages/pmdm/ConfigurationDataTypeDetail.tsx`](../src/ui/pages/ConfigurationDataTypeDetail.tsx:304) — `PermissionChipManager` component.

**Target:** [`src/ui/components/PermissionChipManager.tsx`](../src/ui/components/PermissionChipManager.tsx)

**Action:** Extract the component to the shared location. Both `ConfigurationDataTypeDetail.tsx` and the new `ConfigurationProductTypesDataTypesTargetSystems.tsx` import from the shared path.

---

## 2. SaveRestoreField

**Status:** Deferred — not part of the product-types implementation.

**Source:** [`../src/ui/pages/pmdm/ConfigurationDataTypeDetail.tsx`](../src/ui/pages/ConfigurationDataTypeDetail.tsx:255) — `SaveRestoreField` component (inline-edit wrapper with save/revert/clear buttons).

**Proposed target:** [`src/ui/components/SaveRestoreField.tsx`](../src/ui/components/SaveRestoreField.tsx)

**Consumers after extraction:**
- `ConfigurationDataTypeDetail.tsx` (Metadata section — name, description)
- `ConfigurationProductTypesDataTypes.tsx` (ProductType name, description)
- `ConfigurationProductTypesDataTypesTargetSystems.tsx` (TargetSystem name override)
- Any future detail pages

**Note:** Until extracted, the product-types pages should inline their own save/restore logic or copy the pattern from `ConfigurationDataTypeDetail.tsx`. This avoids tight coupling between the product-types feature and the deferred extraction task.

---

## 3. MonacoField

**Status:** Deferred — not part of the product-types implementation.

**Source:** [`../src/ui/pages/pmdm/ConfigurationDataTypeDetail.tsx`](../src/ui/pages/ConfigurationDataTypeDetail.tsx:162) — `MonacoField` component (Monaco editor with save/restore/clear).

**Proposed target:** [`src/ui/components/MonacoField.tsx`](../src/ui/components/MonacoField.tsx)

**Consumers after extraction:**
- `ConfigurationDataTypeDetail.tsx` (Configuration section)
- `ConfigurationProductTypesDataTypesTargetSystems.tsx` (Configuration section)
- `ConfigurationConsumableDetail.tsx`
- `ConfigurationLookupDetail.tsx`

**Note:** The product-types implementation should inline the Monaco editor pattern until this extraction is done.
