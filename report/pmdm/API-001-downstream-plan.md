# Downstream Plan: API-001 — Canonical JSON error response shape

## Upstream Change
Reference: `/report/Fix API-001 - Canonical JSON error response shape.md`. Error response bodies across the API surface were canonicalized to JSON objects: plain-string `status(code, "...")` bodies became `{ "error": "<text>" }` (catch sites use `{ error, message: String(_err) }`). Ad-hoc `Type.String()`/`Type.Object()` 401/403/404/409/500 declarations in route `response` maps were replaced by canonical shared schemas in `src/types/ApiType.ts` (`UnauthenticatedErrorResponseSchema`, `ForbiddenErrorResponseSchema`, `ForbiddenHumanUserErrorResponseSchema`, `NotFoundErrorResponseSchema`, `ConflictErrorResponseSchema`, `OptimisticLockConflictResponseSchema`, `BadRequestErrorResponseSchema`, `InternalServerErrorResponseSchema`). `ConfigUpdateConflictSchema`/`ConfigUpdateConflict` were removed from `src/types/ConfigType.ts` (superseded by `OptimisticLockConflictResponseSchema` in `src/types/ApiType.ts`).

## Upstream's Own Assessment
"Yes — error response bodies changed shape: 403/404/409/500 endpoints now return `{ "error": "<text>" }` instead of a plain string. The 401 global-hook body remains `{ error, message }`; route-level 401s return `{ error }`. Clients must parse JSON error bodies (the UI's `extractErrorMessage` already does). `ConfigUpdateConflictSchema`/`ConfigUpdateConflict` were removed from `@/types/ConfigType.ts` — the equivalent is `OptimisticLockConflictResponseSchema` in `@/types/ApiType.ts`."

## Applicability to This Project
Affected: Yes

Evidence:
- Upstream's shared files are already fixed in this tree via the `upstream/master` merge; `src/types/ApiType.ts` contains all canonical schemas, and shared route files (`src/api/GroupAPI.ts:116`, `ConfigAPI.ts:98`) already emit `{ error }` bodies.
- This project's own API route files were NOT part of the upstream fix and still use the old idiom:
  - Plain-string bodies: `src/api/_crud_API.ts:197,201,279,282,287,321,324,335,362,365,380,381,420,423,437,438`; `src/api/ProductAPI.ts:49,253,262,266,268,272,275,285,330,336,370,376,382,416,426,467,478,515,521,564,571` and more; `src/api/NotificationsAPI.ts:33,80,85,150,184,217,256`; `src/api/ProductTypesAPI.ts` (~100+ hits); `src/api/ScriptLogAPI.ts:14,123`; `src/api/DataTypesAPI.ts:94,97,102,138,141,152,153,206,209,214,223,263,266,274,280,291`; plus `LookupsAPI.ts`, `ConsumablesAPI.ts`, `ProductRequestAPI.ts`, `ProductExportAPI.ts` (158 plain-string hits total across own files).
  - Ad-hoc error schema declarations: `_crud_API.ts:238-239,293-295,341-343,391-394,448-451`; `ScriptApi.ts:77-78,118-119`; `ScriptLogAPI.ts:57-58,144-145`; `NotificationsAPI.ts:68-69,136-139,172-173,205-206,244-245,279-280`; `DataTypesAPI.ts:125-127,192-195,250-252,326-330`; same pattern in the other own API files.
- No usage of `ConfigUpdateConflictSchema`/`ConfigUpdateConflict` anywhere in this project (project-wide grep: zero hits).
- Client side is already compatible: this project's UI wrappers throw `ApiError` via `extractErrorMessage` (`src/ui/api/_client.ts:34,38`), which parses JSON error bodies.

## Target End State
Every route file owned by this project (`src/api/_crud_API.ts` plus the pmdm-specific API files and the modified `HealthAPI.ts`) emits JSON error bodies `{ error: "<text>" }` (never plain strings) and references the canonical per-status schemas from `@/types/ApiType.ts` in `response` maps, matching the shape documented in `src/api/AGENTS.md`. Error texts remain unchanged.

## Approach
Mechanical transformation per file, no behavior change beyond body shape:
1. Wrap plain-string `status(code, "...")` bodies in `{ error: ... }`.
2. Replace ad-hoc `401/403/404/409/400/500` `t.String({...})`/`Type.String({...})`/`Type.Object({ error: ... })` declarations with the canonical schema imports (409 bodies carrying `currentValue` use `OptimisticLockConflictResponseSchema`; other 409s use `ConflictErrorResponseSchema`; 403-with-human-user-restriction uses `ForbiddenHumanUserErrorResponseSchema` where applicable).
3. Add the required imports from `@/types/ApiType.ts`.
4. Leave shared (upstream-fixed) route files untouched.

## Affected Scope
- `src/api/_crud_API.ts`
- `src/api/DataTypesAPI.ts`, `src/api/LookupsAPI.ts`, `src/api/NotificationsAPI.ts`, `src/api/ProductAPI.ts`, `src/api/ProductExportAPI.ts`, `src/api/ProductRequestAPI.ts`, `src/api/ProductTypesAPI.ts`, `src/api/ConsumablesAPI.ts`, `src/api/ScriptApi.ts`, `src/api/ScriptLogAPI.ts`, `src/api/HealthAPI.ts` (verify only — already object-shaped where applicable)
- `src/api/BusinessDomainsAPI.ts`, `src/api/TargetSystemsAPI.ts` — fixed transitively via `_crud_API.ts`; no direct edits needed unless they contain own routes (they do not).

## Anticipated Manual Follow-Up
None. (Type checking is part of the project's normal workflow; nothing is executed here.)

## Open Questions
None.
