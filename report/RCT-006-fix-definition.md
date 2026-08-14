# Fix Definition: RCT-006 — Save handlers capture stale `groups` closures

## Source Finding
06-react-frontend.md — `AdminConfigList.tsx:496-511` (`handleChange`) and `:513+` (`handleSave`) read `groups` from closure while effects keyed on `groups` reseed at `:436`

## Human Directive
None — default interpretation applies.

## Target End State
`handleChange` and `handleSave` in `AdminConfigList.tsx` never act on a stale `groups` snapshot: when they need the current entry set, they read it through a ref or functional state access that always reflects the latest committed state, so the value seen at save time cannot disagree with what the effects reseeded. Save behavior is otherwise unchanged: same validation, same three-stream race handling (being extracted under PATT-011), same success/conflict paths.

## Approach
Introduce a `groupsRef` mirror (`useRef` updated via effect or at set-time) — the minimal, standard React pattern for reading latest state inside callbacks — and switch the `groups.flatMap(...).find(...)` lookups in `handleChange`/`handleSave` to read through it. (Alternative acceptable shape: functional `setGroups` access where a write is involved; reads use the ref.) The inline-edit entry lookup then always resolves against current data. Coordinate with PATT-011 (which extracts the save race from `handleSave`): the stale-closure fix must survive that extraction — the shared helper receives the current entry via the ref-based lookup, not a closed-over copy.

## Affected Scope
- `src/ui/pages/AdminConfigList.tsx` — ref mirror + lookup sites in `handleChange`/`handleSave`
- PATT-011's shared helper — interface carries the resolved entry, per coordination note

## Explicit Constraints
- No behavior change beyond eliminating the stale-read window.
- The ref mirror must be updated synchronously with state changes (same effect that owns `groups` or at set-time), not on a delay.
- Do not convert the whole page to a different state-management approach (ARCH-010 is unchecked).

## Out of Scope
- RCT-001 (dependency arrays in the same file) — separate fix definition.
- PATT-011 (three-stream race extraction) — separate fix definition; coordination required at the seam.
- CPLX-009 (seeding contract) — separate fix definition.

## Downstream Impact
No — page-internal state access pattern only.
