# Fix TS-002 - Non-null assertions replaced with guard-carrying constructs

## Source
- Finding: TS-002 (see /report/05-typescript-bun.md)
- Fix definition: /report/TS-002-fix-definition.md

## Summary of Change
Replaced the cited non-null assertions with constructs that carry the invariant: `Toggle.tsx` gained an `optionAt()` helper that fails with a descriptive error when the options array is empty or the index is out of bounds, replacing all `opts[i]!` accesses; `PageRegistry.ts`'s `menu.parent!` mappings became `flatMap` type-guard filters, `visiblePages[0]!` became an explicit first-element check, and the two `acc[key]!.push` reduce bodies became guard-dominant (get-or-create with push); `document.getElementById("root")!` in `src/ui/index.tsx` now throws a descriptive error when the root element is missing; the six `availablePageSizes[0]!` sites destructure after their length/inclusion guard and act only when the first element is a number (identical behavior — previously the access was also skipped when the array was empty); the four `labelRefs.current.get(id)!` row-render lookups restructure to get-or-create without assertions; `UserProfileConfigList`'s grouped-reduce uses get-or-create. The `useRef<Handle>(null!)` pattern in `Toggle.tsx`/`InputField.tsx`/`Label.tsx` is TS-007's subject (unchecked) and was deliberately not touched.

## Files Changed
- `src/ui/components/Toggle.tsx` — `optionAt()` helper replaces indexed `!` accesses
- `src/ui/PageRegistry.ts` — parent-set filter/map, default-path check, reduce bodies
- `src/ui/index.tsx` — root-element existence check with descriptive error
- `src/ui/pages/AdminApiKeyDetail.tsx`, `AdminUserList.tsx`, `AdminGroupList.tsx`, `AdminFunctionalPermissionList.tsx`, `AdminFunctionalPermissionDetail.tsx`, `AdminGroupDetail.tsx` — guarded `availablePageSizes[0]` access
- `src/ui/pages/AdminUserList.tsx`, `AdminGroupList.tsx`, `AdminApiKeyList.tsx` — get-or-create label refs
- `src/ui/pages/UserProfileConfigList.tsx` — get-or-create domain grouping

## Breaking Changes for Downstream Consumers
None — internal code constructs only; no exports or behavior contracts change. The genuinely-undefined paths now fail with descriptive errors instead of TypeErrors (both previously crashed).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- TS-007 (`useRef<Handle>(null!)` + render-phase assignment) — unchecked; the `null!` ref-initialization sites in `Toggle.tsx`/`InputField.tsx`/`Label.tsx` were explicitly excluded and deferred.
- CPLX-006 (Toggle/InputField duplication) — unchecked.
- Any `!` sites outside the cited files beyond the verifying sweep — reported, not fixed.

## Resolved Questions
None.
