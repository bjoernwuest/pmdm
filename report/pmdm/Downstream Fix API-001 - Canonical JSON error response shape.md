# Downstream Fix API-001 - Canonical JSON error response shape

## Source
- Upstream fix: `/report/Fix API-001 - Canonical JSON error response shape.md`
- Downstream plan: /report/pmdm/API-001-downstream-plan.md

## Summary of Change
Converted all error responses in this project's own API route files to the canonical JSON shape. Plain-string `status(code, "...")` bodies — including variable-based ones such as `status(exportData.error.status, exportData.error.message)` and `status(400, e.message)` in `ProductExportAPI.ts` — were wrapped as `{ error: "<same text>" }`, and ad-hoc `t.String({...})` / `Type.String({...})` / `t.Object({ error: t.String() }, ...)` error declarations in route `response` maps were replaced by the canonical schemas from `src/types/ApiType.ts` (`UnauthenticatedErrorResponseSchema`, `ForbiddenErrorResponseSchema`, `NotFoundErrorResponseSchema`, `ConflictErrorResponseSchema`, `OptimisticLockConflictResponseSchema`, `BadRequestErrorResponseSchema`, `InternalServerErrorResponseSchema`). Error texts and status codes are unchanged. One custom 409 declaration in `ProductRequestAPI.ts` was deliberately kept because its body carries fields beyond the canonical shape (`{ error, conflict, existingProductNumber }`). `ConfigUpdateConflictSchema` is not referenced anywhere in this project, so no migration from it was needed.

## Files Changed
- `src/api/_crud_API.ts` — wrapped all plain-string 403/404/409 bodies; replaced all ad-hoc 401/403/404/409 declarations with canonical schemas (this also fixes the BusinessDomain/TargetSystem/DataType CRUD routes registered through it)
- `src/api/ScriptApi.ts` — replaced ad-hoc 401/403 `t.Object({ error })` declarations with canonical schemas; removed now-unused `t` import
- `src/api/ScriptLogAPI.ts` — wrapped 403 bodies; replaced 401/403 declarations with canonical schemas
- `src/api/NotificationsAPI.ts` — wrapped 403/404 bodies; replaced 401/403/404 declarations; 409 declaration now uses `OptimisticLockConflictResponseSchema` (body carries `currentValue`)
- `src/api/DataTypesAPI.ts` — wrapped 400/403/404/409/500 bodies; replaced 400/401/403/404/409/500 declarations with canonical schemas
- `src/api/ProductAPI.ts` — wrapped 400/403/404/409/500 bodies; replaced all ad-hoc declarations with canonical schemas
- `src/api/LookupsAPI.ts` — wrapped 400/403/404/409 bodies; replaced all ad-hoc declarations with canonical schemas
- `src/api/ConsumablesAPI.ts` — wrapped 400/403/404/409 bodies; replaced all ad-hoc declarations with canonical schemas
- `src/api/ProductRequestAPI.ts` — wrapped 400/403/404 bodies; replaced all ad-hoc declarations with canonical schemas except the custom 409 shape (see above)
- `src/api/ProductExportAPI.ts` — wrapped 400/403/404/409 bodies; replaced all ad-hoc declarations with canonical schemas
- `src/api/ProductTypesAPI.ts` — wrapped 400/403/404/409/500 bodies; replaced all ad-hoc declarations with canonical schemas

## Required Manual Follow-Up
None. (Type checking is part of the project's normal workflow and was not executed here.)

## Verification Notes
Confirmed via project-wide search that no own route file contains a plain-string `status(code, "...")` error body or an ad-hoc error schema declaration anymore; confirmed the UI wrapper layer already parses JSON error bodies via `extractErrorMessage` (`src/ui/api/_client.ts`); confirmed zero references to `ConfigUpdateConflictSchema`/`ConfigUpdateConflict` in this project.
