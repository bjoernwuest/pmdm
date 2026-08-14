# Fix PATT-002 - Shared requirePermissions() 403 helper

## Source
- Finding: PATT-002 (see /report/03-patterns-concepts.md)
- Fix definition: /report/PATT-002-fix-definition.md

## Summary of Change
Added `requirePermissions()` to `src/services/Auth.ts`: it builds the same authorization call (via `authorize()`), accepts required permissions plus optional additional-granted permissions for conditional response shaping, and returns either `{ ok: true, authz }` or `{ ok: false, denial }` where `denial` is a ready-to-return 403 response with the canonical `Permission denied. Required: …` message. All ~18 open-coded claims→authorize→403 blocks in `ApiKeyAPI.ts`, `UserAPI.ts`, `GroupAPI.ts`, `ConfigAPI.ts`, `AuditLogAPI.ts`, and `FunctionalPermissionAPI.ts` were replaced by helper calls; conditional-shaping call sites (user detail, group detail) use `permissionCheck.authz`. The `authorize`-pattern section of `src/api/AGENTS.md` was rewritten to mandate the helper and show the multi-permission and conditional-shaping variants.

## Files Changed
- `src/services/Auth.ts` — new `requirePermissions()` + `PermissionCheckResult` type export
- `src/api/ApiKeyAPI.ts`, `UserAPI.ts`, `GroupAPI.ts`, `ConfigAPI.ts`, `AuditLogAPI.ts`, `FunctionalPermissionAPI.ts` — boilerplate replaced with helper calls
- `src/api/AGENTS.md` — authorization-check pattern documented via the helper

## Breaking Changes for Downstream Consumers
Yes — new shared helper export `requirePermissions` in `@/services/Auth.ts`; route files no longer call `authorize` directly for the 403 pattern. Denial semantics unchanged (same status code, same required-permission naming in messages, same session-claims-before-token-claims precedence); `cfgRootUserGroup` bypass behavior inside `authorize()` is untouched.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- API-001 (error response shapes) — separate fix definition, implemented first; the helper emits its canonical `{ error }` shape.
- PATT-001 (error strategies generally) — separate fix definition.
- The human-user-only 403 check (`getLoggedinUserObject` + "Must be executed by human user") is a distinct enforcement and was not folded into the helper.

## Resolved Questions
None.
