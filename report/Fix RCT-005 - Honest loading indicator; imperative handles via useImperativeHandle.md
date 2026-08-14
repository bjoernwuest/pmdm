# Fix RCT-005 - Honest loading indicator; imperative handles via useImperativeHandle

## Source
- Finding: RCT-005 (see /report/06-react-frontend.md)
- Fix definition: /report/RCT-005-fix-definition.md

## Summary of Change
Two independent end states: (1) the `Loading` component in `src/ui/app.tsx` no longer animates a fake asymptotic percentage — it now renders an indeterminate CSS-animated bar (no percentage, no "press F5 to retry" hint), keeping `role="status"`/`aria-live`; the stylesheet gained the indeterminate track/fill/keyframes rules and the obsolete progress/hint rules were replaced. (2) The render-phase `handleRef.current = {...}` assignments in `Toggle.tsx`, `InputField.tsx`, and `Label.tsx` were moved to a React-sanctioned pattern: each imperative handle is built once via `useMemo` and exposed through `useImperativeHandle(ref, () => handle, [handle])` — the components are render-pure under StrictMode and the imperative API (`setText`, `getText`, `setValue`, `setOriginalValue`, etc.) is unchanged. The internal dirty-transition helper was split into `applyDirty` (returns whether the state changed) with the `onDirty` callback invoked by the handle, breaking the declaration cycle without changing callbacks.

## Files Changed
- `src/ui/app.tsx` — `Loading` component replaced by an indeterminate indicator
- `static/public/styles.css` — indeterminate track/fill/keyframes replace the progress rules
- `src/ui/components/Toggle.tsx`, `InputField.tsx`, `Label.tsx` — imperative handles via `useMemo` + `useImperativeHandle`

## Breaking Changes for Downstream Consumers
None — component internals and the shell loading screen only; imperative APIs unchanged.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- TS-007 (`null!` typing of the refs) — unchecked; the ref-init typing was not changed (the refs still exist for internal state, but the handle objects no longer live on render-mutated refs).
- CPLX-006 (Toggle/InputField duplication) — unchecked.
- SPEC-002 (dead controls/mock data) — separate fix definition.

## Resolved Questions
None.
