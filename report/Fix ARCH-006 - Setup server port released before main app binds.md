# Fix ARCH-006 - Setup server port released before main app binds; lang attribute fixed

## Source
- Finding: ARCH-006 (see /report/01-architecture-structure.md)
- Fix definition: /report/ARCH-006-fix-definition.md

## Summary of Change
The setup wizard's completion branch now awaits `server.stop()` before calling `resolve()`, so the setup server's port is guaranteed released before `src/main.ts` proceeds to bind the main application to the same port — the `EADDRINUSE` race on the setup-completion path is closed without restructuring `main.ts` (graceful close, no abrupt flag, no fixed sleep). The setup HTML document's `lang` attribute was corrected from `de` to `en` (all user-visible strings in the template were already English).

## Files Changed
- `src/apps/setup.ts` — `await server.stop()` in the polling completion branch; `lang="de"` → `lang="en"`

## Breaking Changes for Downstream Consumers
None — internal startup sequencing and an HTML attribute only; no exports, API shapes, or configuration change.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- SPEC-004 (setup-demand cache logic and polling rescan) — related to the polling loop's config detection, not the port race; unchecked.
- NAME-007 (`/setup/clienType.js` endpoint typo) — same file, separate fix definition, implemented in the same change set.

## Resolved Questions
None.
