# Fix CPLX-009 - Label re-seeding guarded and documented (prop + imperative model)

## Source
- Finding: CPLX-009 (see /report/04-complexity-maintainability.md)
- Fix definition: /report/CPLX-009-fix-definition.md

## Summary of Change
Both seeding mechanisms remain, now guarded and documented per the resolved approach ("Keep both, document and guard."): the three data-reload re-seeding effects (`AdminUserList.tsx` user-label seeding, `AdminApiKeyDetail.tsx` read-only label seeding, `AdminGroupDetail.tsx` group-label seeding) call `setText` only when the incoming value differs from the component's current value (via the handle's `getText()`), eliminating redundant re-seeding on every data refresh. `Label.tsx`'s `text` prop docstring now states the three-phase model plainly (prop seeds the initial mount value; the page's data-reload effect re-seeds from fresh server data, guarded; PubSub handlers apply live patches via `setText()`). No component API changes; `InputField.tsx` has no equivalent value-prop docstring pattern and was not touched.

## Files Changed
- `src/ui/pages/AdminUserList.tsx` — guarded seeding effect
- `src/ui/pages/AdminApiKeyDetail.tsx` — guarded seeding block
- `src/ui/pages/AdminGroupDetail.tsx` — guarded seeding block
- `src/ui/components/Label.tsx` — three-phase ownership model documented on the `text` prop

## Breaking Changes for Downstream Consumers
None — internal page effects and docstrings only; displayed text identical, only redundant `setText` invocations are skipped.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- RCT-001 (useEffect dependency problems) — separate fix definition; the effects' dependency arrays were not redesigned here.
- CPLX-006 (Toggle/InputField internal duplication) — unchecked.
- CPLX-001 (file size) — separate fix definition.

## Resolved Questions
- Q: Which end state — prop-driven (controlled) components, imperative-only with the prop dropped, or keep both documented and guarded?
- A: "Keep both, document and guard." (Resolution was recorded in the fix definition; adopted here.)
