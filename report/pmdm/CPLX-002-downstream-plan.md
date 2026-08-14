# Downstream Plan: CPLX-002 — Shared admin list-pagination scaffolding

## Upstream Change
Reference: `/report/Fix CPLX-002 - Shared admin list-pagination scaffolding.md`. New shared hook/component exports were added and the four template admin list pages were re-wired to use them. No URL, API, or payload changes.

## Upstream's Own Assessment
"Yes — new shared hook/component exports; four pages re-wired. No URL, API, or payload changes."

## Applicability to This Project
Affected: No

Evidence:
- The four re-wired template pages are shared files, already fixed via the merge.
- No pmdm-owned page or component imports the new shared pagination scaffolding: project-wide search for the shared scaffolding exports found no pmdm-page consumers; pmdm's own list pages (e.g. `src/ui/pages/pmdm/ConfigurationLookups.tsx:41-48`) implement their own pagination via their domain API wrappers.
- The upstream change is additive and does not alter any URL, API, or payload contract pmdm's pages depend on.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
