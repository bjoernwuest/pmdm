# Fix Definition: PATT-012 — Duplicated array-editor modal and helper functions (~180 lines)

## Source Finding
03-patterns-concepts.md — `AdminConfigList.tsx:908-1087` + helpers `:78-225` vs. `UserProfileConfigList.tsx:427-606` + helpers `:47-124` — `isInlineType`, `isArrayType`, `normalizeArrayValues`, `validateArrayItem`, `formatArraySummary` near-verbatim

## Human Directive
None — default interpretation applies.

## Target End State
The array-editor modal (the `ArrayModalState` add/edit/remove/revert Dialog state machine) and the shared type helpers (`isInlineType`, `isArrayType`, `normalizeArrayValues`, `validateArrayItem`, `formatArraySummary`) each exist exactly once, in a shared UI location outside `src/ui/pages/` (per the UI AGENTS.md subdirectory rule — e.g. `src/ui/components/`). Both `AdminConfigList` and `UserProfileConfigList` import the shared modal component and helpers. Behavioral differences that are real (per-page value sources, entry shapes like `ConfigEntryUI` vs `UserProfileConfigEntry`) are expressed through the shared component's props/parameterization, not through copied code.

## Approach
- Extract the type helpers into a shared module; where the two copies differ only in parameter typing (`ConfigEntryUI["type"]` vs `string`), pick the more permissive signature that satisfies both.
- Extract the array-editor Dialog into a shared component parameterized by: current values, item type, validation callback, summary formatter defaults, and the save/revert callbacks. Both pages render the shared component with their own wiring.
- Delete the duplicated bodies from both page files.
- Where the two copies have drifted in behavior (implementation must diff them carefully), choose the more correct behavior, apply it to both pages, and note the reconciliation in the change; no silent divergence may be preserved.

## Affected Scope
- New shared module(s) under `src/ui/components/` (or equivalent non-pages location)
- `src/ui/pages/AdminConfigList.tsx` — remove ~330 lines of duplicated modal+helpers, wire shared versions
- `src/ui/pages/UserProfileConfigList.tsx` — same

## Explicit Constraints
- No user-visible behavior change intended: same modal flows (add/edit/remove/revert), same validation rules, same summaries — except where the two copies already drifted, which is reconciled deliberately and noted.
- Shared code must be browser-only and follow the UI layer rules (no backend imports).
- Coordinate with CPLX-002 (scaffolding duplication): this extraction covers only the array editor and its helpers, not list-page scaffolding.

## Out of Scope
- CPLX-002 (admin list-page scaffolding) — separate fix definition.
- CPLX-009 (Label/InputField double-seeding) — separate fix definition; the shared component must not change InputField/Label APIs.
- CPLX-006 (Toggle/InputField internal duplication) — unchecked.

## Downstream Impact
Yes — new shared UI exports; two page files re-wired. No API or type-contract changes.
