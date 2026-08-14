# Fix API-001 - Canonical JSON error response shape

## Source
- Finding: API-001 (see /report/09-api-interfaces.md)
- Fix definition: /report/API-001-fix-definition.md

## Summary of Change
Established one canonical error contract and applied it across the API surface. `ErrorSchema.message` was tightened from `Type.Any()` to `Type.String()`, `ErrorResponseSchema` (`{ error }`) became the canonical minimal base, and a 409 variant `OptimisticLockConflictResponseSchema` (`{ error, currentValue? }`) was added in `src/types/ApiType.ts`, along with canonical per-status schema constants (401/403/403-human-user/404/409/400/500) that carry the canonical descriptions from `src/api/AGENTS.md`. Every plain-string `status(code, "...")` error body in `src/api/*` was converted to the JSON object form with the same human-readable text inside; the ad-hoc `Type.String()` 401/403/404/409/500 declarations in route `response` maps were replaced by the shared schemas; the now-duplicate `ConfigUpdateConflictSchema` was removed from `ConfigType.ts`. The global 401 hook in `src/apps/api.ts` kept its `{error, message}` body and its route-level documentation now matches it. `src/api/AGENTS.md` states the JSON error contract explicitly.

## Files Changed
- `src/types/ApiType.ts` — `ErrorSchema.message` → `Type.String()`; `ErrorResponseSchema` documented as canonical base; new `OptimisticLockConflictResponseSchema` + canonical per-status error schemas
- `src/types/ConfigType.ts` — removed `ConfigUpdateConflictSchema`/`ConfigUpdateConflict` (superseded by the canonical 409 schema)
- `src/api/ApiKeyAPI.ts` — all 403/404/409/500 bodies and declarations converted to JSON object shape
- `src/api/ConfigAPI.ts` — 400/403/404 bodies and declarations converted; 409 uses `OptimisticLockConflictResponseSchema`
- `src/api/UserProfileConfigAPI.ts` — 400/401/403/404 bodies and declarations converted; 409 uses `OptimisticLockConflictResponseSchema`
- `src/api/GroupAPI.ts`, `UserAPI.ts`, `FunctionalPermissionAPI.ts`, `AuditLogAPI.ts` — 403/404 bodies and declarations converted
- `src/api/ServerSentEventAPI.ts` — 401 body converted; 400/401 declarations use canonical schemas
- `src/api/MeAPI.ts`, `RequestBundlingAPI.ts` — 401 declarations use `UnauthenticatedErrorResponseSchema`
- `src/api/AGENTS.md` — response-schema pattern and error-shape contract documented as JSON

## Breaking Changes for Downstream Consumers
Yes — error response bodies changed shape: 403/404/409/500 endpoints now return `{ "error": "<text>" }` instead of a plain string. The 401 global-hook body remains `{ error, message }`; route-level 401s return `{ error }`. Clients must parse JSON error bodies (the UI's `extractErrorMessage` already does). `ConfigUpdateConflictSchema`/`ConfigUpdateConflict` were removed from `@/types/ConfigType.ts` — the equivalent is `OptimisticLockConflictResponseSchema` in `@/types/ApiType.ts`.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- PATT-001 (error propagation strategy and `message: String(_err)` conversions at catch sites, 401 hook mechanism) — separate fix definition, implemented in the same change set; those sites are documented under PATT-001.
- PATT-002 (403 helper) — separate fix definition; the helper will emit this exact shape.
- API-003 (status() through transaction callbacks) — separate fix definition.
- UI error display handling (RCT-002) — separate fix definition.

## Resolved Questions
None.
