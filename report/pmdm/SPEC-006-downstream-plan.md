# Downstream Plan: SPEC-006 — Login redirect parameter unified on returnTo

## Upstream Change
Reference: `/report/Fix SPEC-006 - Login redirect parameter unified on returnTo.md`. The `/login` URL contract changed from `target` to `returnTo` (401 interceptor as producer; `Login.tsx` consumer); the post-login recovery param also changed name, producer and consumer aligned.

## Upstream's Own Assessment
"Yes — the `/login` URL contract changed (`target` → `returnTo`); the 401 interceptor is the only producer of that URL and `Login.tsx` already expected `returnTo`. The post-login recovery param also changed name (producer and consumer aligned)."

## Applicability to This Project
Affected: No

Evidence:
- All producer/consumer sites are shared and already fixed via the merge: `src/ui/api/session.ts:10-11` builds `/login?returnTo=…`, `src/ui/index.tsx:17-19` recovers from `returnTo`.
- Project-wide search finds no pmdm-owned code producing `/login` URLs with the old `target` parameter. pmdm's `src/login/index.html` differs from upstream only in the `<title>` text ("PMDM - Login").

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
