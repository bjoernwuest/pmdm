# Fix RCT-001 - Correct, minimal useEffect dependency arrays

## Source
- Finding: RCT-001 (see /report/06-react-frontend.md)
- Fix definition: /report/RCT-001-fix-definition.md

## Summary of Change
Corrected the cited effects: in `AdminApiKeyDetail.tsx` and `AdminApiKeyList.tsx`, `load` is now a `useCallback` with its true dependencies (detail: `[apikeyid, permissionsPage, permissionsPageSize, updateQuery]`; list: `[page, pageSize, showDisabled, updateQuery]`), `updateQuery` uses react-router's functional `setSearchParams` (removing the `searchParams` closure), the redundant `searchParams.toString()` dependency was removed (the derived primitive values are the single source of truth), and the list page's loading-indicator choice reads `apiKeys` through a ref so it never re-triggers the effect; the load effects depend on `[load]`. In `AdminConfigList.tsx`, the inline-edit re-subscribe/re-seed effects no longer depend on the whole `groups` array — a derived `editingEntry` (useMemo over `groups` + `inlineEdit`) is the dependency, so SSE updates to other keys no longer churn subscriptions or re-seed an in-progress edit. The seeding effects in `AdminUserList.tsx`/`AdminApiKeyList.tsx` were verified: their dependency arrays (`[users]`/`[apiKeys]`) are the data source itself, and the redundant `setText` re-invocations were eliminated by CPLX-009's guards (joint ownership as defined). Loading behavior for the intended triggers is preserved; the spurious triggers (SSE for unrelated keys, param double-counting) are eliminated.

## Files Changed
- `src/ui/pages/AdminApiKeyDetail.tsx` — `load`/`updateQuery` useCallback; effect deps `[load]`
- `src/ui/pages/AdminApiKeyList.tsx` — same; `apiKeysRef` for the loading choice
- `src/ui/pages/AdminConfigList.tsx` — `editingEntry` derivation; both edit effects depend on `[inlineEdit, editingEntry]`

## Breaking Changes for Downstream Consumers
None — page-internal effect restructuring only.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- CPLX-009 (double-seeding contract) and CPLX-010 (overlapping subscriptions) — separate fix definitions, implemented in the same change set; the end state satisfies all three simultaneously.
- PATT-009 (unsubscribe idiom) — separate fix definition, implemented earlier.
- ARCH-010 (page paradigm unification) — unchecked.

## Resolved Questions
None.
