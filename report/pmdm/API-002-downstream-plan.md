# Downstream Plan: API-002 — TypeBox params/query schemas on all routes

## Upstream Change
Reference: `/report/Fix API-002 - TypeBox params-query schemas on all routes.md`. Shared schemas were added to `src/types/ApiType.ts` (`PaginationQuerySchema` with integer page/pageSize, `IncludeInactiveQuerySchema`/`IncludeDisabledQuerySchema` with `"true"|"false"|"1"|"0"` unions, UUID-format params schemas, `AuditLogQuerySchema`) and every route reading path/query parameters in upstream's route files now declares `params:`/`query:` schemas, so invalid input (non-integer page/pageSize, non-UUID identifiers) is rejected by Elysia validation with 400 before handler code runs. Shared route files here are already fixed via the merge.

## Upstream's Own Assessment
"Yes — new shared schema exports in `@/types/ApiType.ts`; route registrations gained `params`/`query` entries, so the OpenAPI output is stricter/more accurate. Runtime behavior changes only for previously-invalid inputs (non-integer page/pageSize, non-UUID identifiers): those now get a clean 400 instead of NaN pagination or invalid-UUID DB lookups. All previously-valid requests behave identically; accepted boolean-flag values are exactly what `parseBooleanQuery` accepted before."

## Applicability to This Project
Affected: Yes

Evidence:
- All pmdm-owned routes that read `context.params`/`context.query` already declare `params:`/`query:` schemas (checked `_crud_API.ts`, `ConsumablesAPI.ts`, `LookupsAPI.ts`, `DataTypesAPI.ts`, `NotificationsAPI.ts`, `ProductAPI.ts`, `ProductExportAPI.ts`, `ProductRequestAPI.ts`, `ProductTypesAPI.ts`, `ScriptLogAPI.ts` — no missing-schema case exists).
- However, the pmdm-owned list routes still use the pre-fix loose query shapes that upstream's fix eliminated: `page: t.Optional(t.Union([t.Number({ minimum: 0 }), t.String()]))` / `pageSize: ...` / `includeDisabled: t.Optional(t.Union([t.Boolean(), t.String()]))` at `_crud_API.ts:230-234`, `ConsumablesAPI.ts:492-497`, `LookupsAPI.ts:494-498`, `ProductAPI.ts:114-122`, `ProductExportAPI.ts:78-82`, `ProductRequestAPI.ts:210-217`, `ProductTypesAPI.ts:135-140` and `:403-407`, `ScriptLogAPI.ts:43-49`. These allow NaN pagination and non-canonical boolean values — the exact pre-fix behavior.
- One UUID-identified path parameter lacks the uuid format: `src/api/ProductAPI.ts:222` (`productTypeIdentifier: t.String()`); the column is a UUID and the handler passes it to `ProductTypeRepo.getByIdentifier`.
- The merged shared schemas exist in `src/types/ApiType.ts` but are unused by pmdm's own routes.

## Target End State
pmdm-owned list routes compose the shared `PaginationQuerySchema` and `IncludeDisabledQuerySchema`/`IncludeInactiveQuerySchema` from `@/types/ApiType.ts` (via `Type.Composite`) instead of redeclaring loose unions; pmdm-specific query parameters (e.g. `filter`, `status`, `showUsed`, `logLevel`, `includeDisabledDataTypes`) keep their current shapes, composed alongside; UUID path parameters carry `format: "uuid"`. Previously-valid requests behave identically; non-integer pagination and non-UUID identifiers now get clean 400s, matching upstream's fixed behavior.

## Approach
1. Replace the loose page/pageSize/boolean-flag entries in each own list-route query object with `Type.Composite([PaginationQuerySchema, <remaining fields>])` (or the single shared schema where it is the only content). Add `import { Type } from "@sinclair/typebox"` and the shared schema imports per file.
2. `ProductAPI.ts` export-template route: `params: t.Object({ productTypeIdentifier: t.String({ format: "uuid" }) })`.
3. Leave non-UUID identifiers (`productNumber`, `permid`, notification `key`, ScriptLog string filters) and pmdm-specific query params untouched.

## Affected Scope
- `src/api/_crud_API.ts`
- `src/api/ConsumablesAPI.ts`, `src/api/LookupsAPI.ts`, `src/api/ProductAPI.ts`, `src/api/ProductExportAPI.ts`, `src/api/ProductRequestAPI.ts`, `src/api/ProductTypesAPI.ts`, `src/api/ScriptLogAPI.ts`

## Anticipated Manual Follow-Up
None.

## Open Questions
None.
