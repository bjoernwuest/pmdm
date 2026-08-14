# Fix Definition: SPEC-002 — Dead user-visible controls and mock data presented as the app

## Source Finding
13-incomplete-specs-edge-cases.md — `src/ui/app.tsx:250` ("View docs" button, no handler), `:291-293` (notifications bell, no handler); `src/ui/pages/Dashboard.tsx` entirely hard-coded mock data (e.g. $24k budget) as the start page; `AdminConfigList.tsx:711-723` (`configureObjectSchema` mutates Monaco's global `jsonDefaults` on every dialog open without reset)

## Human Directive
None — default interpretation applies.

## Target End State
- **"View docs" button** (`app.tsx:250`): either removed or wired — the docs destination exists (`/api/docs` and the in-app API documentation page `AdminApiDocumentation`). Resolution: wire it to navigate to the in-app API documentation page if the user has `FP_READ_API_DOCUMENTATION`, else `/api/docs`; simpler acceptable resolution: remove the button. Implementation default: **remove the button** (a sidebar-footer "View docs" with a permission-gated destination adds conditional UI complexity; the docs are reachable via navigation). If implementation finds the design docs mandate this button, wire it instead and note the deviation.
- **Notifications bell** (`app.tsx:291-293`): removed — there is no notifications subsystem; a control without a function is not kept. (If a notifications feature is planned, it returns with the feature.)
- **`Dashboard.tsx` mock data**: the dashboard stops presenting fabricated KPIs as app data. Since this is a starter template, the resolution is to replace the hard-coded mock content with a minimal real start page (e.g. a welcome/section overview using real data available — user display name, links to admin sections) or clearly-marked placeholder structure without fake values. No invented numbers ($24k budget etc.) remain. The page stays registered (it is the landing page); only its content becomes honest.
- **Monaco global mutation** (`AdminConfigList.tsx:711-723`): `configureObjectSchema` no longer leaks global state — the Monaco JSON defaults are configured once with a schema scope that does not clobber other dialogs, or the mutation is reset when the dialog closes. Other JSON editors on the page are unaffected by the object-schema dialog having been opened.

## Approach
Delete dead controls; replace the dashboard's mock section with real, minimal content; scope or reset the Monaco `jsonDefaults` configuration (per Monaco's API, `jsonDefaults.setDiagnosticsOptions` is global — so either set it once at module scope with a model-URI-matched schema via `fileMatch`, or restore the previous options on dialog close). English UI text only for any new strings.

## Affected Scope
- `src/ui/app.tsx` — remove/wire the two controls
- `src/ui/pages/Dashboard.tsx` — honest content
- `src/ui/pages/AdminConfigList.tsx` — Monaco schema scoping/reset
- Possibly `static/public` styles if the removed controls' CSS becomes orphaned (clean up only the rules exclusively serving them)

## Explicit Constraints
- No new half-features: do not wire the bell to a stub.
- The dashboard must remain a valid page module (`meta` + `Component`) so the registry and default route keep working.
- Monaco behavior for the object-schema editor itself must keep working (schema validation in the dialog remains).
- All UI text in English (root AGENTS.md).

## Out of Scope
- RCT-004 (toggle migration) — separate fix definition.
- SEC-009 (audit gaps) — separate fix definition.
- ARCH-010 (page paradigm unification) — unchecked; the dashboard rewrite is minimal, not a paradigm showcase.
- DOC-006 (Toggle.md stale refs) — unchecked.

## Downstream Impact
No — UI-internal removals/replacement; no API or route changes (the dashboard's route path is unchanged).
