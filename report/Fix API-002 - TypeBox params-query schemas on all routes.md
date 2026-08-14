# Fix API-002 - TypeBox params/query schemas on all routes

## Source
- Finding: API-002 (see /report/09-api-interfaces.md)
- Fix definition: /report/API-002-fix-definition.md

## Summary of Change
Added the missing TypeBox `params:`/`query:` schemas to all routes that read path or query parameters, with shared schema definitions in `src/types/ApiType.ts`: `PaginationQuerySchema` (optional `page` ≥ 0, `pageSize` ≥ 1 integers), `IncludeInactiveQuerySchema`/`IncludeDisabledQuerySchema` (optional `"true"|"false"|"1"|"0"` string unions matching `parseBooleanQuery`'s accepted values), UUID-format `UserIdParamsSchema`/`GroupIdParamsSchema`/`ApiKeyIdParamsSchema`/`FunctionalPermissionIdParamsSchema`, and `AuditLogQuerySchema` (page/pageSize/jsonPathFilter/search). The five cited route files plus the audit-log route now declare these schemas; Elysia validation rejects invalid input with 400 before handler code runs. Handler coercions were left in place where harmless (`Number()` over already-coerced integers) and simplified in `AuditLogAPI` where the schema now supplies typed values. No `src/api/AGENTS.md` rule change was needed (the requirement already existed); its OpenAPI detail blocks already document these parameters consistently.

## Files Changed
- `src/types/ApiType.ts` — shared pagination/boolean-flag/UUID-params/audit-query schemas
- `src/api/ApiKeyAPI.ts` — `query` on list route, `params` on detail/update/prolong/disable/permissions/delete routes
- `src/api/UserAPI.ts` — `query` on list and detail routes, `params` on detail route
- `src/api/GroupAPI.ts` — `query` on list route, `params` on detail/functionalpermissions/grant/revoke routes
- `src/api/FunctionalPermissionAPI.ts` — `query` on list route, `params` on detail/grant/revoke routes
- `src/api/AuditLogAPI.ts` — `query` on list route; handler casts simplified

## Breaking Changes for Downstream Consumers
Yes — new shared schema exports in `@/types/ApiType.ts`; route registrations gained `params`/`query` entries, so the OpenAPI output is stricter/more accurate. Runtime behavior changes only for previously-invalid inputs (non-integer page/pageSize, non-UUID identifiers): those now get a clean 400 instead of NaN pagination or invalid-UUID DB lookups. All previously-valid requests behave identically; accepted boolean-flag values are exactly what `parseBooleanQuery` accepted before.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- Pagination semantics (0- vs 1-based, defaults) — preserved as-is.
- API-001 (error shapes) — separate fix definition, implemented first; the 400 shape follows its canonical `{ error }` body.
- Body-schema gaps (not cited) — not addressed.

## Resolved Questions
None.
