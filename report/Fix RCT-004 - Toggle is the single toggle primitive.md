# Fix RCT-004 - Toggle is the single toggle primitive; last two InputSwitch sites migrated

## Source
- Finding: RCT-004 (see /report/06-react-frontend.md)
- Fix definition: /report/RCT-004-fix-definition.md

## Summary of Change
Replaced the last two direct `InputSwitch` usages with the custom `Toggle` component per the design doc's replacement pattern: `AdminUserDetail.tsx`'s "Show inactive groups and permissions" toggle and `AdminFunctionalPermissionDetail.tsx`'s "Show disabled groups" toggle now use `<Toggle<boolean> variant="toggle" ...>` with the same state variables (`showInactive`, `showDisabledGroups`), the same `onChange` wiring (including the `updateQuery` reset of `groupsPage` to 1 on the functional-permission page), and the same filtering of the rendered lists. The `InputSwitch` imports were removed from both pages; a sweep confirms no page in `src/ui/` imports `InputSwitch` anymore (only `Toggle.tsx` itself uses it internally). `design/ui/Toggle.md`'s replacement map now marks these two sites as migrated.

## Files Changed
- `src/ui/pages/AdminUserDetail.tsx` — `Toggle` replaces `InputSwitch`; import swapped
- `src/ui/pages/AdminFunctionalPermissionDetail.tsx` — same
- `design/ui/Toggle.md` — the two site references marked as migrated

## Breaking Changes for Downstream Consumers
None — page-internal component swap with identical user-facing behavior.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- SPEC-002 (dead controls/mock data) — separate fix definition.
- DOC-006 (UI design docs stale references generally) — unchecked; only the two now-completed entries were touched.
- CPLX-006 (Toggle internal duplication) — unchecked.
- `AdminGroupDetail.tsx` raw checkboxes — not cited by this finding; left as-is.

## Resolved Questions
None.
