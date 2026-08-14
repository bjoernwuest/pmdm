# Downstream Plan: PATT-007 — Complete UI API wrapper layer

## Upstream Change
Reference: `/report/Fix PATT-007 - Complete UI API wrapper layer.md`. New wrapper modules and exports were added; template pages import from them; `src/ui/AGENTS.md`'s file list changed.

## Upstream's Own Assessment
"Yes — new wrapper modules and exports; pages import from them. `src/ui/AGENTS.md`'s file list changed. Downstream projects with inline URL strings now have a complete convention to copy."

## Applicability to This Project
Affected: No

Evidence:
- The upstream change is additive (new wrapper exports); nothing pmdm-owned imported a removed path.
- This project's own UI code already uses its own complete wrapper layer (`src/ui/api/*.ts` pmdm modules, e.g. `Products.ts`, `Notifications.ts`), which routes through the shared `apiGet`/`apiPut`/`apiPost` helpers; no pmdm page uses inline `fetch()` against API URLs.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
