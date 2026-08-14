# Fix SPEC-006 - Login redirect parameter unified on returnTo

## Source
- Finding: SPEC-006 (see /report/13-incomplete-specs-edge-cases.md)
- Fix definition: /report/SPEC-006-fix-definition.md

## Summary of Change
Unified the post-401 re-login parameter on `returnTo`: `src/ui/api/session.ts`'s 401 interceptor now redirects to `/login?returnTo=<encoded path+search>` (previously `?target=`), matching what `Login.tsx` reads. A sweep found the post-auth recovery chain also used `target`: `Auth.finishAuth` appended `?target=` to the redirect URL and `src/ui/index.tsx`'s `TargetRedirect` read it — both were aligned to `returnTo` (component renamed `ReturnToRedirect`), so one parameter name covers the whole chain (401 → login form → `auth_return_to` cookie → post-login redirect → recovery navigation). The redirect target stays same-origin relative (the existing `startsWith("/")` guard is preserved — no open-redirect surface introduced). Users now land on the page they originally headed to.

## Files Changed
- `src/ui/api/session.ts` — `?target=` → `?returnTo=`
- `src/services/Auth.ts` — `finishAuth` redirect recovery param `target` → `returnTo`
- `src/ui/index.tsx` — recovery component reads `returnTo` (renamed `ReturnToRedirect`)

## Breaking Changes for Downstream Consumers
Yes — the `/login` URL contract changed (`target` → `returnTo`); the 401 interceptor is the only producer of that URL and `Login.tsx` already expected `returnTo`. The post-login recovery param also changed name (producer and consumer aligned).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- SEC-004 (logout via GET etc.) — unchecked per its annotation.
- Broader login-flow redesign (SPEC-001 bearer path) — unchecked.

## Resolved Questions
None.
