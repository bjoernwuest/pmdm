# Downstream Plan: RCT-002 — One failure convention across admin pages

## Upstream Change
Reference: `/report/Fix RCT-002 - One failure convention across admin pages.md`. Template admin pages adopted one error-handling convention. Page-internal; no API or component API changes.

## Upstream's Own Assessment
"None — page-internal error handling; no API or component API changes."

## Applicability to This Project
Affected: No

Evidence:
- The affected admin pages are shared and already fixed via the merge.
- No pmdm-owned page consumed the affected pages' error handling; the shared `extractErrorMessage`/`ApiError` helpers pmdm's own pages use are unchanged.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
