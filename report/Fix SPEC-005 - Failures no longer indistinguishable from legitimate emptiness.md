# Fix SPEC-005 - Failures no longer indistinguishable from legitimate emptiness

## Source
- Finding: SPEC-005 (see /report/13-incomplete-specs-edge-cases.md)
- Fix definition: /report/SPEC-005-fix-definition.md

## Summary of Change
Removed the `.catch(() => [])` swallow in `src/api/MeAPI.ts`: a `getMyFunctionalPermissions` failure (DB error, permission-layer fault) now propagates and the endpoint returns 500 (Elysia's error mapping) instead of a 200 with empty permissions; the `500` response was added to the route's `response` map with the canonical schema. A user with legitimately zero permissions still gets 200 with an empty list. In `AdminConfigList.tsx`, the `/api/me/config` (profile-override) fetch no longer swallows errors into an empty map — its rejection flows into the page's existing combined load-error path (the whole load fails visibly). The default resolution (whole-load failure) was used since config and overrides form one logical dataset for the page.

## Files Changed
- `src/api/MeAPI.ts` — swallow removed; 500 response schema added
- `src/ui/pages/AdminConfigList.tsx` — override-fetch rejection flows into the existing load-error path

## Breaking Changes for Downstream Consumers
Yes — `/api/me/context` can now return 500 (previously never); clients must already handle non-200 paths (the UI API helpers throw `ApiError`, landing in the pages' load-error handling). Error-body shape follows API-001's canonical `{ error }`.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- ARCH-011's silent `.catch(() => undefined)` in breadcrumb label fetches — deliberate degradation (static-label fallback), documented in ARCH-011's definition; not this fix.
- RCT-002 (page error surfaces generally) — separate fix definition; this fix reused the page's existing error state.
- DOC-003's related SPEC-005 mention — DOC-003's scope.

## Resolved Questions
None.
