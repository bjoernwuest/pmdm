# Fix Definition: RCT-005 — Render-phase ref mutation and fake loading bar

## Source Finding
06-react-frontend.md — render-phase ref assignment: `Toggle.tsx:205-217`, `InputField.tsx:178-192`, `Label.tsx:89-96` (cross-ref TS-007); `src/ui/app.tsx:20-47` animates an asymptotic progress interval unconnected to actual loading, ending with a "press F5 to retry" hint (`:43`)

## Human Directive
None — default interpretation applies.

## Target End State
Two independent end states:

1. **Fake loading bar removed or made honest** — the `Loading` component in `src/ui/app.tsx` no longer animates an asymptotic fake percentage disconnected from real loading. It is replaced by either an indeterminate loading indicator (spinner/pulse, no percentage) or a progress display driven by actual load progress if such a signal exists (it does not today — so the default resolution is an indeterminate indicator). The "if application hangs, press F5 to retry" hint is removed with the fake percentage (a hang workaround is not a UI contract; the English-only rule is unaffected either way).
2. **Render-phase ref mutation** in `Toggle.tsx`/`InputField.tsx`/`Label.tsx` (assigning `handleRef.current = {...}` during render) is moved to a React-sanctioned phase — `useImperativeHandle` with proper deps (or assignment inside an effect) — so the components are render-pure under StrictMode.

Boundary with TS-007 (unchecked): TS-007 owns the `useRef<Handle>(null!)` typing question; this fix owns the *timing* of the assignment (render phase → `useImperativeHandle`/effect). If the implementation prefers, both can be addressed in one change, but this fix must not be blocked on TS-007's unchecked scope.

## Approach
- `src/ui/app.tsx`: replace the interval-driven percentage with a CSS-driven indeterminate indicator; drop the F5 hint; keep `role="status"`/`aria-live` accessibility attributes.
- Components: convert the render-phase `handleRef.current = {...}` blocks to `useImperativeHandle(ref, () => ({...}), [deps])` (the components already forward handles via refs — verify each component's ref-forwarding shape and adapt), ensuring the imperative API surface (`setText`, `getContext`, etc.) is unchanged for all callers.

## Affected Scope
- `src/ui/app.tsx` — Loading component
- `src/ui/components/Toggle.tsx`, `InputField.tsx`, `Label.tsx` — imperative handle wiring
- Possibly `static/public/*.css` or component-adjacent styles for the indeterminate indicator

## Explicit Constraints
- The imperative handle API (methods, context parameter) must not change — pages using `ref.setText` etc. are untouched.
- StrictMode double-render must not produce double side effects from the handle setup.
- Loading screen remains accessible and English.
- No behavioral change to what triggers the Loading component (it still shows while the app shell initializes).

## Out of Scope
- TS-007 (`null!` typing of the refs) — unchecked; explicitly excluded.
- CPLX-006 (Toggle/InputField duplication) — unchecked.
- SPEC-002 (dead controls/mock data) — separate fix definition.

## Downstream Impact
No — component internals and shell loading screen only; imperative APIs unchanged.
