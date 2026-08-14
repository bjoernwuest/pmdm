# Fix NAME-007 - Setup bundle endpoint typo /setup/clienType.js corrected

## Source
- Finding: NAME-007 (see /report/02-naming-consistency.md)
- Fix definition: /report/NAME-007-fix-definition.md

## Summary of Change
Renamed the misspelled setup bundle endpoint in lockstep inside `src/apps/setup.ts`: the `<script src>` now points to `/setup/client.js` and the route registration is `setupApp.get("/setup/client.js", ...)`, consistent with `/login/client.js` and `/ui/client.js`. The string `clienType` no longer appears in the codebase. No redirect or alias for the old path was kept; bundle serving, ETag, and caching behavior are unchanged.

## Files Changed
- `src/apps/setup.ts` — script src and route path corrected together

## Breaking Changes for Downstream Consumers
None persistent — the URL is consumed only by the setup HTML served from the same file; both sides changed together.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- ARCH-006 (port release race and `lang` attribute in the same file) — separate fix definition, implemented in the same change set.
- SPEC-004 (setup-demand polling) — unchecked.

## Resolved Questions
None.
