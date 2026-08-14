# Fix Definition: PATT-002 — `authorize()` + 403 re-check boilerplate duplicated ~15 times

## Source Finding
03-patterns-concepts.md — `src/api/ApiKeyAPI.ts:46-49,130-133,213-216,276-279,322-326,379-382,430-434,481-485`; `UserAPI.ts:29-30,93-94`; `GroupAPI.ts:34-35,98-99`; `ConfigAPI.ts:61-64,104-107`; `AuditLogAPI.ts:14-17,90-93`; `FunctionalPermissionAPI.ts:25-26,83-84,127-128,179-180`

## Human Directive
None — default interpretation applies.

## Target End State
The "resolve claims → `authorize()` → deny with 403" sequence exists exactly once as a shared helper (living in the API layer or `src/services/Auth.ts`, per where it type-checks cleanest against `ApiInstance` context). Every route handler at the cited locations calls the helper instead of open-coding the pattern. The denial response remains `403` with a message naming the required permission(s), preserving the current client-visible behavior (plain-string 403 bodies unless/until API-001 canonicalizes them — the helper uses whatever API-001 defines). Handlers that need the granted-permission set for conditional response shaping (e.g. `UserAPI.ts:102-107` checking `FP_READ_GROUPS`) still receive the `authz` result back from the helper so those branches keep working.

## Approach
Introduce a single helper, e.g. `requirePermissions(context, [...FP])`, that: builds `claims` from `context.session?.idTokenClaims ?? context.tokenClaims ?? {}`, calls `authorize(context.dbClient, claims, required)`, and returns either the granted set or the ready-to-return 403 response (or throws an Elysia-recognized error the framework maps to 403 — the exact return-vs-throw shape is chosen at implementation to keep route code shortest while staying type-safe). Migrate every cited site to the helper, including the multi-permission variants in `ApiKeyAPI.ts`. Update the "Authorization check pattern" section of `src/api/AGENTS.md` to mandate the helper and show the conditional-shaping variant.

## Affected Scope
- New helper in one shared location (API layer helper module or `src/services/Auth.ts`)
- `src/api/ApiKeyAPI.ts`, `UserAPI.ts`, `GroupAPI.ts`, `ConfigAPI.ts`, `AuditLogAPI.ts`, `FunctionalPermissionAPI.ts` — boilerplate replacement
- `src/api/AGENTS.md` — pattern documentation updated

## Explicit Constraints
- Denial semantics unchanged: same status code, same required-permission naming in messages, same "session claims before token claims" precedence.
- The helper must not hide the conditional-shaping use case; routes needing `authz` afterwards still get it.
- `cfgRootUserGroup` bypass behavior (inside `authorize()`) is untouched.
- Human-user-only enforcement, where it exists, keeps its distinct 403 suffix per `src/api/AGENTS.md`'s canonical error descriptions.

## Out of Scope
- API-001 (error response shapes) — the helper adopts whatever shape API-001 defines; this fix does not redesign error bodies.
- PATT-001 (error strategies generally) — separate fix definition.
- Permission-model changes (none).

## Downstream Impact
Yes — new shared helper export; all six route files changed. `src/api/AGENTS.md` guidance changes; downstream projects with copied route files follow the new pattern when they adopt it.
