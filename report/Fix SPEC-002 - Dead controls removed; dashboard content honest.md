# Fix SPEC-002 - Dead controls removed; dashboard content honest; Monaco schema scoped

## Source
- Finding: SPEC-002 (see /report/13-incomplete-specs-edge-cases.md)
- Fix definition: /report/SPEC-002-fix-definition.md

## Summary of Change
Removed the two dead controls per the default resolutions: the "View docs" sidebar button (no handler; the docs remain reachable via navigation) and the notifications bell (no notifications subsystem). `Dashboard.tsx` no longer presents fabricated KPIs/charts/orders as app data — it is now a minimal, honest start page (welcome with the real user display name fetched via the `getViewerContext()` wrapper, plus a navigation hint); it stays a valid page module (`meta` + `Component`) so the registry and default route keep working. The Monaco `jsonDefaults` global mutation in `AdminConfigList.tsx` no longer leaks: the last monaco instance is kept in a ref and the diagnostics options (with the dialog's model-URI-scoped schema) are reset to an empty schema set when the object dialog closes, so other JSON editors are unaffected after the dialog was used. Orphaned CSS rules exclusively serving the removed controls were cleaned up. All new UI text is English.

## Files Changed
- `src/ui/app.tsx` — "View docs" button and notifications bell removed
- `src/ui/pages/Dashboard.tsx` — honest minimal start page
- `src/ui/pages/AdminConfigList.tsx` — Monaco schema reset on dialog close (URI-scoped schema retained)
- `static/public/styles.css` — orphaned `sidebar-upgrade-btn`/`app-topbar-icon-btn`/`app-topbar-avatar` rules removed

## Breaking Changes for Downstream Consumers
None — UI-internal removals/replacement; no API or route changes (the dashboard's route path is unchanged).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- RCT-004 (toggle migration) — separate fix definition, implemented in the same change set.
- SEC-009 (audit gaps) — separate fix definition, implemented in the same change set.
- ARCH-010 (page paradigm unification) — unchecked; the dashboard rewrite is minimal, not a paradigm showcase.
- DOC-006 (Toggle.md stale refs) — unchecked.

## Resolved Questions
None.
