# Downstream Fix DATA-003 - Timezone-safe optimistic-lock timestamp comparison; single producer

## Source
- Upstream fix: `/report/Fix DATA-003 - Timezone-safe optimistic-lock timestamp comparison.md`
- Downstream plan: /report/pmdm/DATA-003-downstream-plan.md

## Summary of Change
Removed the `$onUpdate` driver-side timestamp generation from the pmdm-divergent `timestamps` helper (matching upstream), making the database clock the single producer of `updatedAt`. All pmdm-owned update paths that previously relied on `$onUpdate` now set `updatedAt: sql\`now()\`` explicitly, and the two pmdm optimistic-lock comparisons in `ProductRepo.ts` bind `knownUpdatedAt` directly against the timestamptz column instead of a `::timestamp` cast. Wire format and lock semantics unchanged; no migration.

## Files Changed
- `src/schema/helpers.ts` — `$onUpdate(() => sql\`now()\`)` removed from `timestamps.updatedAt`
- `src/repo/_crud_Repo.ts` — `setDisabled` and `update` set `updatedAt: sql\`now()\`` explicitly
- `src/repo/ConsumableRepo.ts` — `markValuesAsUsed`/`markValuesAsUnused` set `updatedAt: sql\`now()\``
- `src/repo/DataTypeRepo.ts` — permission update sets `updatedAt: sql\`now()\``
- `src/repo/ProductTypeRepo.ts` — the three `{ ...fields }` update paths set `updatedAt: sql\`now()\``
- `src/repo/ProductRequestRepo.ts` — the two approval-break updates and the two status transitions (`importing`/`cancelled`) set `updatedAt: sql\`now()\``
- `src/repo/ProductRepo.ts` — both lock comparisons bind `knownUpdatedAt` directly (no `::timestamp` cast)

## Required Manual Follow-Up
None.

## Verification Notes
Confirmed `ProductExports` has no `updatedAt` column (its update paths correctly left without it); confirmed `ProductsValues` has no `updatedAt` column (its `.set({ value })` paths unchanged); confirmed all other pmdm-owned update sites on `timestamps`-inheriting tables were already explicit or are now patched; confirmed `src/schema/helpers.ts` now matches upstream apart from a pmdm-added doc comment; confirmed `NotificationRepo.ts:45`'s `::timestamptz` filter cast is a comparison filter, not a lock comparison, and was left as is.
