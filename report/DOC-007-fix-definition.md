# Fix Definition: DOC-007 — Comment rot, typos, and TODO/FIXME inventory

## Source Finding
12-docs-style.md — `src/repo/UserRepo.ts:21-27` (`_systemUser` docstring describes a "user interacting with the system" — it is a DB seed constant), `:34` ("objecType" typo), `:83` (references `UserInsert`/`UserType` type names that do not exist), `:70` (`distabledUser` typo); `src/services/Auth.ts:294` ("sessin"), `:149-155` (hardcodes "900 seconds" though configurable), `:416` (FIXME cookie maxAge), `:768` (FIXME: bearer-token users get zero permissions); `src/schema/UserSchema.ts:9,35` (comments reference an `isActive` column/index; actual column is `disabled`); `src/schema/FunctionalPermissionSchema.ts:32-62` (doc block duplicated verbatim twice); `src/main.ts:42` (comment "not transaction" contradicts `DatabaseDriver.ts:200-201`); `src/ui/PageRegistry.ts:162` (FIXME default path), `src/ui/app.tsx:242` (FIXME hard-coded product name)

## Human Directive
None — default interpretation applies.

## Target End State
Every cited comment is either corrected to describe the current code or removed:

- `UserRepo.ts` — `_systemUser` docstring describes what it is (cached DB seed/system-user row used as actor for system-initiated grants); "objecType" → "object"; the `:83` docstring names real types (`UserInsertType`/`UserSelectType`); the `distabledUser` typo disappears (CPLX-005 removes that loop — whichever fix lands second confirms the typo is gone).
- `Auth.ts` — "sessin" → "session"; the `:149-155` comment stops hardcoding "900 seconds" and points at the configurable default (`DEFAULT_SESSION_TIMEOUT` / `cfgSessionExpirationInSeconds`); the two FIXMEs are resolved in place (the cookie `maxAge` comment gets its correct meaning written down; the bearer-permissions FIXME at `:768` is either resolved with a correct comment describing the intentional behavior or removed if the behavior is intentional — SPEC-001, which covers the half-implemented bearer path, is unchecked, so the comment resolution here is documentation of *current intentional behavior*, not a feature change).
- `UserSchema.ts` — comments name the `disabled` column and drop the fictitious `isActive` index claims (indexes mentioned must exist; per DATA-001 new indexes may be added — the comment then matches the post-DATA-001 schema).
- `FunctionalPermissionSchema.ts:32-62` — the duplicated doc block exists once.
- `main.ts:42` — the injection comment is rewritten to accurately describe what `dbClient` is (non-transactional client; transactions are scoped per operation via `runInTransaction`), reconciling it with `DatabaseDriver.ts:200-201`.
- `PageRegistry.ts:162` and `app.tsx:242` FIXMEs — resolved: either implemented trivially (if the fix is a one-liner, e.g. constant extraction) or the FIXME text is replaced by an accurate description of current intentional behavior; no new TODO/FIXME remains untracked.
- **Inventory rule**: after this fix, `grep -rn "FIXME\|TODO"` over `src/` returns only items that are also listed in a tracked place — since `TODO.md` is void/ignored (DOC-003 corrects its description), the tracked place becomes the report's successor process: implementation either resolves every remaining FIXME or documents it as intentional behavior in the code comment itself. No silent retention of action-demanding FIXMEs.

## Approach
Comment-only edits at the cited sites plus a repo-wide `TODO|FIXME|XXX|HACK` sweep; each hit is resolved (trivial fix), reworded as intentional-behavior documentation, or removed. Typos in identifiers that are purely internal (comments, local variables already gone via CPLX-005) are corrected; no exported identifier is renamed under this ID.

## Affected Scope
- `src/repo/UserRepo.ts`, `src/services/Auth.ts`, `src/schema/UserSchema.ts`, `src/schema/FunctionalPermissionSchema.ts`, `src/main.ts`, `src/ui/PageRegistry.ts`, `src/ui/app.tsx`
- Repo-wide comment sweep results

## Explicit Constraints
- Documentation/comments only, except where a FIXME's trivial resolution is genuinely a one-line code change (e.g. extracting the product-name constant in `app.tsx` is allowed; behavior must be identical).
- No behavior change; no type renames that ripple to other files (NAME-006 owns the repo-layer renames).
- The bearer-permissions FIXME must not be "fixed" by implementing bearer group permissions (SPEC-001 is unchecked) — document current behavior only.

## Out of Scope
- DOC-003 (root AGENTS.md) — separate fix definition.
- SPEC-001 (bearer path) and SEC-005 (SSE session keying; its stale comment at `ServerSentEventAPI.ts:21-26` belongs to SEC-005's unchecked scope — do not edit it here) — unchecked.
- CPLX-005 (loop removal containing the `distabledUser` typo) — separate fix definition.

## Downstream Impact
No — comment and documentation corrections only.
