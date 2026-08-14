# Fix DOC-007 - Comment rot corrected; TODO/FIXME inventory resolved

## Source
- Finding: DOC-007 (see /report/12-docs-style.md)
- Fix definition: /report/DOC-007-fix-definition.md

## Summary of Change
Corrected or removed every cited comment: `UserRepo.ts`'s `_systemUser` docstring now describes the cached DB seed/system-user row used as the actor for system-initiated grants (the "user interacting with the system" wording and the `objecType`/`distabledUser` typos and the nonexistent `UserInsert`/`UserType` type references are gone — the latter two disappeared with the CPLX-005/DATA-006/NAME-006 rewrite of that file); `Auth.ts`'s "sessin" → "session", the session-store docstring no longer hardcodes "900 seconds" (points at `DEFAULT_SESSION_TIMEOUT`/`SessionExpirationSeconds`), the cookie `maxAge` FIXME was resolved with the correct meaning (10-minute lifetime of the short-lived OIDC code-verifier exchange window), and the bearer-permissions FIXME was replaced by a comment documenting the current intentional behavior (bearer tokens carry no group claims; permission resolution is intentionally unsupported — SPEC-001 is unchecked, no feature change); `UserSchema.ts`'s comments now name the `disabled` column and the `user_disabled_idx`/`group_disabled_idx` indexes (no fictitious `isActive` index); `FunctionalPermissionSchema.ts`'s duplicated doc block now exists once; `main.ts`'s injection comment was already rewritten under ARCH-008; `PageRegistry.ts`'s FIXME was replaced by a description of the current intentional default-path behavior; `app.tsx`'s product-name FIXME was resolved by extracting a `PRODUCT_NAME` constant (behavior identical). A repo-wide `TODO|FIXME|XXX|HACK` sweep over `src/` now returns zero hits.

## Files Changed
- `src/repo/UserRepo.ts` — docstrings corrected (with the function rewrite)
- `src/services/Auth.ts` — "sessin" typo, TTL docstring, cookie maxAge comment, bearer-permissions comment
- `src/schema/UserSchema.ts` — `disabled`/index comments corrected
- `src/schema/FunctionalPermissionSchema.ts` — duplicated doc block removed
- `src/ui/PageRegistry.ts` — FIXME replaced by behavior description
- `src/ui/app.tsx` — `PRODUCT_NAME` constant extracted

## Breaking Changes for Downstream Consumers
None — comment and documentation corrections only (the `PRODUCT_NAME` constant is UI-internal, behavior identical).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- DOC-003 (root AGENTS.md) — separate fix definition.
- SPEC-001 (bearer path) — unchecked; the bearer-permissions comment documents current behavior only.
- SEC-005 (SSE session keying; its stale comment at `ServerSentEventAPI.ts`) — unchecked; that comment was not edited.
- CPLX-005 (loop removal containing the `distabledUser` typo) — separate fix definition, implemented earlier in the same change set.

## Resolved Questions
None.
