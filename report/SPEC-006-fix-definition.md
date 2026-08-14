# Fix Definition: SPEC-006 — Login redirect parameter mismatch

## Source Finding
13-incomplete-specs-edge-cases.md — `src/ui/api/session.ts:8` redirects to `/login?target=...` (from the 401 interceptor); `src/login/Login.tsx:10` reads `returnTo`, not `target`

## Human Directive
None — default interpretation applies.

## Target End State
The post-401 re-login flow round-trips the user's intended destination: the parameter name is the same on both sides. Canonical name: **`returnTo`** (the name `Login.tsx` reads, and consistent with `auth_return_to` cookie naming in `Auth.ts`). `src/ui/api/session.ts:8` redirects to `/login?returnTo=<encoded path+search>`. After re-authentication, the user lands on the page they were originally headed to. (If implementation finds other producers/consumers of `target`/`returnTo`, the sweep aligns all of them to `returnTo`.)

## Approach
One-parameter rename at the producer (`session.ts`), plus a sweep for other `?target=` producers or `returnTo` consumers to confirm exactly one convention remains. Verify the login flow actually consumes `returnTo` into the post-auth redirect (the cookie mechanism in `Auth.ts` — `getCookie(request, "auth_return_to")`) so the parameter is not just read by the login page but survives the OIDC round-trip; if the chain is broken further downstream, that continuation is fixed as part of this item (the finding's intent is a working redirect, not a cosmetic rename).

## Affected Scope
- `src/ui/api/session.ts` — parameter name
- `src/login/Login.tsx` — verified consumer (no change expected)
- `src/services/Auth.ts` / `src/apps/login.ts` — only if the `returnTo` → `auth_return_to` cookie chain is also broken (verify at implementation)

## Explicit Constraints
- One parameter name across the chain after the fix.
- The redirect target must remain same-origin relative path (no open-redirect surface introduced; if the login flow lacks such a guard, note it in the implementation — do not add open-redirect capability).
- Behavior change is the point: users now return to their original destination after re-login.

## Out of Scope
- SEC-004 (logout via GET etc.) — unchecked per its annotation.
- Broader login-flow redesign (SPEC-001 bearer path) — unchecked.

## Downstream Impact
Yes — the `/login` URL contract changes (`target` → `returnTo`); only the internal 401 interceptor produces this URL, and `Login.tsx` already expects `returnTo`, so no external consumer breakage is expected.
