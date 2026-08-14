# Fix Definition: CPLX-009 — Label/InputField double-seeding (prop + imperative effect)

## Source Finding
04-complexity-maintainability.md — `AdminUserList.tsx:65-76` (effect calling `ref.setText` on every data change) + `:197-203` (same value passed as `text` prop); `AdminApiKeyDetail.tsx:140-147` + `:467-490`; `AdminGroupDetail.tsx:104-108` + `:177-181`

## Human Directive
None — default interpretation applies. (Resolution approach confirmed with the human via Q&A: "Keep both, document and guard.")

## Target End State
Both seeding mechanisms remain, with an explicit, documented contract and no redundant work:

- The `Label`/`InputField` component docs (docstring on the `text` prop / component header) state the three-phase model plainly: the prop seeds the initial mount value; the data-reload effect re-seeds from fresh server data; PubSub handlers apply live patches via `setText`. The `Label.tsx` docstring already gestures at this ("After mount, text is managed internally via `setText()`") — it is extended to name the re-seed path explicitly.
- The re-seeding effects (`AdminUserList.tsx:65-76`, `AdminApiKeyDetail.tsx:140-147`, `AdminGroupDetail.tsx:104-108`) are guarded so they call `setText` only when the incoming value actually differs from the component's current value (via the handle's getter), eliminating redundant re-seeding on every data refresh.
- No component API changes; no page architecture changes.

## Approach
Per cited site: wrap each `setText` call in the seeding effect with a current-value comparison using the handle's existing getter (`getText()`), skipping no-op writes. Extend the `Label` (and `InputField` if it carries the same prop pattern) docstrings to document the three-phase ownership model. No other code motion.

## Affected Scope
- `src/ui/pages/AdminUserList.tsx` — guarded seeding effect
- `src/ui/pages/AdminApiKeyDetail.tsx` — guarded seeding effect
- `src/ui/pages/AdminGroupDetail.tsx` — guarded seeding effect
- `src/ui/components/Label.tsx` (and `InputField.tsx` if applicable) — docstring contract only

## Explicit Constraints
- No unification of the two mechanisms — the human directive is to keep both.
- No visual/behavioral change: displayed text identical before/after; only redundant `setText` invocations are skipped.
- The guard must compare against the component's current value, not introduce new state.

## Out of Scope
- RCT-001 (useEffect dependency problems) — separate fix definition; the effect's dependency array is not redesigned here beyond the guard.
- CPLX-006 (Toggle/InputField internal duplication) — unchecked.
- CPLX-001 (file size) — separate fix definition.

## Downstream Impact
No — internal page effects and docstrings only.

## Resolved Questions
- Q: Which end state — prop-driven (controlled) components, imperative-only with the prop dropped, or keep both documented and guarded?
- A: "Keep both, document and guard."
