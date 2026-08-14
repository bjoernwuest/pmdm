# Downstream Plan: DATA-003 — Timezone-safe optimistic-lock timestamp comparison; single producer

## Upstream Change
Reference: `/report/Fix DATA-003 - Timezone-safe optimistic-lock timestamp comparison.md`. `$onUpdate` (driver-generated timestamps) was removed from the shared `timestamps` helper; every update path that relied on it now sets `updatedAt: sql\`now()\`` explicitly (database clock = single producer); optimistic-lock comparisons bind `knownUpdatedAt` directly against `timestamptz` columns instead of `::timestamp` casts. Wire format unchanged; no migration.

## Upstream's Own Assessment
"None for clients — the `updatedAt` wire format is unchanged. `$onUpdate` behavior removal is internal: update paths now write the timestamp via the database clock; optimistic-lock round-trips still compare equal values."

## Applicability to This Project
Affected: Yes

Evidence:
- `src/schema/helpers.ts` (pmdm-divergent) still carries `.$onUpdate(() => sql\`now()\`)` on the shared `timestamps.updatedAt` (upstream removed it). All pmdm domain tables inherit `timestamps` via `src/schema/_base.ts` (`baseColumns`/`baseColumnsNamed`/`baseColumnsNamedDescribed`).
- pmdm-owned update paths that rely on the driver-side generation (and therefore must set `updatedAt` explicitly once `$onUpdate` is removed):
  - `src/repo/_crud_Repo.ts` `setDisabled` (line 134) and `update` (line 165)
  - `src/repo/ConsumableRepo.ts` `markValuesAsUsed`/`markValuesAsUnused` (lines 192/210)
  - `src/repo/DataTypeRepo.ts:182` (permission update)
  - `src/repo/ProductTypeRepo.ts` lines 250/345/450 (`.set(fields as any)`)
  - `src/repo/ProductRequestRepo.ts` lines 2074/2492 (`{ approvedBy: null, approvedAt: null }`), 2546/2644 (`{ status: ... }` on `ProductRequests`) — the other PRV update sites already set `updatedAt: sql\`now()\`` explicitly
  - `src/repo/ProductExportRepo.ts` lines 208/266 (`ProductExports` exportedAt/importedAt sets)
- Pre-fix comparison casts remain in `src/repo/ProductRepo.ts:391,476` (`${Products.updatedAt} = ${knownUpdatedAt}::timestamp`).
- Already aligned: `src/repo/ProductRepo.ts` update paths set `updatedAt` explicitly (lines 381/473); `ProductRequestRepo` sites 1605/1767/1988/2188/2316/2361/2390; `ProductExportRepo` lines 64/133; the merged shared repos (`UserRepo`, `FunctionalPermissionRepo`, `ApiKeyRepo`) were fixed upstream.
- `ProductsValues` has no `updatedAt` column (only `Products` does), so its `.set({ value })` sites need no change; `NotificationRepo.ts:45`'s `::timestamptz` cast is a filter comparison, not a lock comparison — left as is.

## Target End State
`$onUpdate` removed from `src/schema/helpers.ts` (matching upstream); every pmdm-owned update path on a table with an `updatedAt` column sets `updatedAt: sql\`now()\`` explicitly; pmdm's optimistic-lock comparisons bind `knownUpdatedAt` directly against the timestamptz columns without `::timestamp` casts. Behavior (DB-clock timestamps, lock semantics) is unchanged.

## Approach
1. `src/schema/helpers.ts`: delete the `$onUpdate` chain from `timestamps.updatedAt`.
2. Add `updatedAt: sql\`now()\`` to each listed pmdm update `.set(...)`; for `.set(fields as any)` sites, spread `{ ...fields, updatedAt: sql\`now()\` }`.
3. `src/repo/ProductRepo.ts`: replace `= ${knownUpdatedAt}::timestamp` with `= ${knownUpdatedAt}` in both lock comparisons.
4. Add/verify the `sql` import from `drizzle-orm` in the touched repo files.

## Affected Scope
- `src/schema/helpers.ts`
- `src/repo/_crud_Repo.ts`, `src/repo/ConsumableRepo.ts`, `src/repo/DataTypeRepo.ts`, `src/repo/ProductTypeRepo.ts`, `src/repo/ProductRequestRepo.ts`, `src/repo/ProductExportRepo.ts`, `src/repo/ProductRepo.ts`

## Anticipated Manual Follow-Up
None. (No migration; column types unchanged.)

## Open Questions
None.
