# Fix Definition: RCT-004 — Two toggle primitives used side by side; half-completed migration

## Source Finding
06-react-frontend.md — `AdminUserDetail.tsx:133` and `AdminFunctionalPermissionDetail.tsx:128-135` use PrimeReact `InputSwitch` directly, although `design/ui/Toggle.md:774-785` explicitly lists exactly these usages as replacement targets (the list pages' filter toggles were migrated)

## Human Directive
None — default interpretation applies.

## Target End State
The custom `Toggle` component is the only toggle primitive in the UI for this visual role. `AdminUserDetail.tsx:133` ("Show inactive groups and permissions") and `AdminFunctionalPermissionDetail.tsx:128-135` ("Show disabled groups") use `<Toggle<boolean> variant="toggle" ...>` per the replacement pattern documented in `design/ui/Toggle.md:774-785`, and `InputSwitch` is no longer imported by any page. Filter behavior is unchanged: same state variables (`showInactive`, `showDisabledGroups`), same side effects (`updateQuery` reset of `groupsPage` to 1 in the functional-permission page), same filtering of the rendered lists.

## Approach
Replace the two `InputSwitch` JSX blocks with the `Toggle` pattern the design doc prescribes (boolean options pair, `onChange` wired to the existing state setters and `updateQuery` side effect), following how the already-migrated list pages use `Toggle`. Remove the now-unused `InputSwitch` imports. Verify the design doc's replacement map afterwards: if `design/ui/Toggle.md` still lists these two sites as pending "Current locations", update those references to reflect completion (coordinate with DOC-006, which is unchecked — the update here is limited to no longer describing these two specific sites as unmigrated, without touching the doc's other stale references).

## Affected Scope
- `src/ui/pages/AdminUserDetail.tsx`
- `src/ui/pages/AdminFunctionalPermissionDetail.tsx`
- `design/ui/Toggle.md` — only the two line references that describe these sites as current `InputSwitch` usages

## Explicit Constraints
- Visual and interaction parity: toggle appearance/behavior per the Toggle component's existing usage in list pages; disabled-state handling per Toggle's implementation.
- No other `InputSwitch` sites may remain in `src/ui/` after this fix (sweep to confirm).
- Do not redesign the Toggle component itself (CPLX-006 is unchecked).

## Out of Scope
- SPEC-002 (dead controls/mock data) — separate fix definition.
- DOC-006 (UI design docs stale references generally) — unchecked; only the two now-completed replacement entries are touched.
- CPLX-006 (Toggle internal duplication) — unchecked.
- `AdminGroupDetail.tsx` raw checkboxes listed in the same doc section — not cited by this finding; left as-is.

## Downstream Impact
No — page-internal component swap with identical user-facing behavior.
