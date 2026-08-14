# Fix CPLX-002 - Shared admin list-pagination scaffolding

## Source
- Finding: CPLX-002 (see /report/04-complexity-maintainability.md)
- Fix definition: /report/CPLX-002-fix-definition.md

## Summary of Change
Extracted the duplicated list-page pagination scaffolding into shared modules outside `src/ui/pages/`: `useAdminListQuery` (`src/ui/useAdminListQuery.ts`) encapsulates the URL-param parsing with integer validation and defaults (page 1/pageSize 10), `showDisabled` parsing, the `updateQuery` writer (functional `setSearchParams`), and the `availablePageSizes`/`total` state; `AdminPager` (`src/ui/AdminPager.tsx`) is the shared pager JSX (Previous/Next, page-size select, total display) parameterized by the hook outputs and an entity label. All four pages (`AdminUserList`, `AdminGroupList`, `AdminFunctionalPermissionList`, `AdminApiKeyList`) now use them and keep only their domain specifics (fetch, columns, subscriptions). Behavior parity preserved: same URL params (`page`, `pageSize`, `showDisabled`), same clamping rules, same page-size-not-available reset rule, same loading-state split, same pager appearance; the functional-permission list's lack of a showDisabled toggle is preserved (the hook's `showDisabled` is simply unused there). The redundant `searchParams.toString()` effect dependencies were replaced by the derived primitive values (consistent with RCT-001).

## Files Changed
- `src/ui/useAdminListQuery.ts` — new shared hook
- `src/ui/AdminPager.tsx` — new shared pager component
- `src/ui/pages/AdminUserList.tsx`, `AdminGroupList.tsx`, `AdminFunctionalPermissionList.tsx`, `AdminApiKeyList.tsx` — migrated to the shared scaffolding

## Breaking Changes for Downstream Consumers
Yes — new shared hook/component exports; four pages re-wired. No URL, API, or payload changes.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- ARCH-010 (unifying the pages' overall architecture paradigms) — unchecked; only the pagination scaffolding was extracted.
- PATT-010/PATT-011 (subscription/save extractions) — separate fix definitions, implemented in the same change set.
- Admin detail pages' scaffolding — only the four list pages cited.

## Resolved Questions
None.
