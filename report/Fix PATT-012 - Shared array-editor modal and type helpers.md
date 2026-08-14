# Fix PATT-012 - Shared array-editor modal and type helpers

## Source
- Finding: PATT-012 (see /report/03-patterns-concepts.md)
- Fix definition: /report/PATT-012-fix-definition.md

## Summary of Change
Extracted the duplicated array-editor code into `src/ui/components/ArrayEditor.tsx`: the shared type helpers (`isInlineType`, `isArrayType`, `normalizeArrayValues`, `validateArrayItem`, `formatArraySummary` — typed against a minimal `{ type, inputFormat, value }` entry so both page entry types satisfy them), the `ArrayEditorModalState` state machine with `openArrayEditor(entry)`, and the `ArrayEditorDialog` component (add/edit/remove/revert dialog, parameterized by `state`, `onChange`, `onClose`, `onSave`). Both `AdminConfigList` and `UserProfileConfigList` now import the shared helpers/dialog; each page keeps only its wiring (a full-entry state for the save mutation and the API call). Two deliberate reconciliations (noted per the definition): the profile page's summary now uses the normalized-value formatting from the admin page (previously it printed the raw effective array), and the admin page's German "Fertig" save-button label became "Save" (English UI text per the root AGENTS.md rule).

## Files Changed
- `src/ui/components/ArrayEditor.tsx` — new shared helpers + dialog
- `src/ui/pages/AdminConfigList.tsx` — ~240 lines of duplicated helpers/modal removed; wired to the shared component
- `src/ui/pages/UserProfileConfigList.tsx` — same (effective-value mapping applied at the call sites)

## Breaking Changes for Downstream Consumers
Yes — new shared UI exports (`ArrayEditorDialog`, `openArrayEditor`, `validateArrayItem`, `normalizeArrayValues`, `formatArraySummary`, `isArrayType`, `isInlineType`, `ArrayEditorModalState`); two page files re-wired. No API or type-contract changes.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- CPLX-002 (admin list-page scaffolding) — separate fix definition.
- CPLX-009 (Label/InputField double-seeding) — separate fix definition; the shared component does not change InputField/Label APIs.
- CPLX-006 (Toggle/InputField internal duplication) — unchecked.

## Resolved Questions
None. (The two drifted behaviors — summary formatting and the "Fertig" label — were reconciled deliberately per the fix definition's approach and are recorded above.)
