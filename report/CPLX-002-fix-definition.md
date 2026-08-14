# Fix Definition: CPLX-002 — Duplicated admin list-page scaffolding (~4 copies)

## Source Finding
04-complexity-maintainability.md — `AdminUserList.tsx:35-52,110-138,210-233` vs. `AdminGroupList.tsx:35-52,103-131,196-219` vs. `AdminFunctionalPermissionList.tsx:35-76,123-146` vs. `AdminApiKeyList.tsx:153-200,323-340` — near-identical `updateQuery`, pagination parsing, page-size clamping, loading-state selection, and pager JSX

## Human Directive
None — default interpretation applies.

## Target End State
The pagination/query scaffolding shared by the four admin list pages exists once: a shared hook (query-param parsing with clamping, `updateQuery`, page/pageSize/showDisabled state, availablePageSizes handling) and a shared pager/loading JSX component, both living outside `src/ui/pages/` per the UI AGENTS.md rule. Each of the four pages keeps only its domain specifics: the fetch call (via the PATT-007 wrappers), the column/row rendering, and the live-update subscription wiring. Behavior parity per page: same URL params (`page`, `pageSize`, `showDisabled`), same clamping rules, same loading-state split (`isLoading` vs `isPageLoading` where present), same pager appearance.

## Approach
- Extract a `useAdminListQuery`-style hook (name finalized at implementation) encapsulating: `searchParams` parsing with integer validation and defaults (1/10), `updateQuery`, `availablePageSizes`/`total` state, and the page-size-not-available reset rule (`payload.availablePageSizes` membership check).
- Extract the pager JSX block (page-size select, page navigation, total display) into a shared component parameterized by the hook's state.
- Migrate `AdminUserList`, `AdminGroupList`, `AdminFunctionalPermissionList`, `AdminApiKeyList`. Where one copy has drifted (e.g. functional-permission list lacks `showDisabled`; api-key list's loading flags differ), the drift is either preserved via hook options or reconciled deliberately — the implementation must document which; default is preserve-as-options to avoid behavior change.
- The data-fetch effect body itself stays per-page (it differs by endpoint and response type) but consumes the hook's outputs; with PATT-007 wrappers available, each effect shrinks to a typed call.

## Affected Scope
- New shared hook + pager component under `src/ui/` (outside `pages/`, e.g. `src/ui/components/` or a `src/ui/hooks/` location consistent with existing structure)
- `src/ui/pages/AdminUserList.tsx`, `AdminGroupList.tsx`, `AdminFunctionalPermissionList.tsx`, `AdminApiKeyList.tsx`

## Explicit Constraints
- URL/query contract unchanged (bookmarkable URLs keep working identically).
- No page loses functionality it has today (e.g. `includeInactive` filtering, page-size persistence behavior).
- Coordinate with PATT-009/PATT-010 (same files): those fixes change subscription wiring, this one changes pagination scaffolding — implementations must not collide; either order is acceptable as long as both land.
- Coordinate with PATT-007 (wrapper adoption in the same files).

## Out of Scope
- ARCH-010 (unifying the pages' overall architecture paradigms) — unchecked; this fix extracts only the pagination scaffolding, not the live-update paradigms.
- PATT-010/PATT-011 subscription/save extractions — separate fix definitions.
- Admin detail pages' scaffolding — only the four list pages cited.

## Downstream Impact
Yes — new shared hook/component exports; four pages re-wired. No URL, API, or payload changes.
