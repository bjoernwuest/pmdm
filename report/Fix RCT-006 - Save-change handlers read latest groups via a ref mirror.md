# Fix RCT-006 - Save/change handlers read latest groups via a ref mirror

## Source
- Finding: RCT-006 (see /report/06-react-frontend.md)
- Fix definition: /report/RCT-006-fix-definition.md

## Summary of Change
`AdminConfigList.tsx` now keeps a `groupsRef` mirror of the committed `groups` state (updated via an effect on `groups`), and `handleChange`'s entry lookup reads through it instead of the render closure — the entry set seen at change/save time can no longer disagree with what the effects re-seeded. `handleSave` already received the resolved entry as a parameter (and, post-PATT-011, uses it through the helper's callbacks), so it needed no change. Save behavior is otherwise unchanged (same validation, same three-stream race via the shared helper, same success/conflict paths).

## Files Changed
- `src/ui/pages/AdminConfigList.tsx` — `groupsRef` mirror + lookup site in `handleChange`

## Breaking Changes for Downstream Consumers
None — page-internal state access pattern only; the stale-read window is eliminated.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- RCT-001 (dependency arrays in the same file) — separate fix definition.
- PATT-011 (three-stream race extraction) — separate fix definition, implemented earlier; the ref-based lookup composes with the shared helper (the resolved entry is passed via callbacks).

## Resolved Questions
None.
