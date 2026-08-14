# Downstream Fix API-002 - TypeBox params/query schemas on all routes

## Source
- Upstream fix: `/report/Fix API-002 - TypeBox params-query schemas on all routes.md`
- Downstream plan: /report/pmdm/API-002-downstream-plan.md

## Summary of Change
Aligned the pmdm-owned list routes with the shared, strict query schemas from `src/types/ApiType.ts` and completed UUID typing on path parameters. The loose per-route page/pageSize unions (`t.Optional(t.Union([t.Number(...), t.String()]))`) and loose boolean-flag unions were replaced by `Type.Composite([PaginationQuerySchema, ...])` with pmdm-specific query parameters preserved alongside; `ProductAPI.ts`'s export-template route now declares `productTypeIdentifier` with `format: "uuid"`. Non-integer pagination values and non-UUID identifiers are now rejected with a clean 400 by Elysia validation (matching upstream's fixed behavior); all previously-valid requests behave identically.

## Files Changed
- `src/api/_crud_API.ts` — list query now `Type.Composite([PaginationQuerySchema, IncludeDisabledQuerySchema])`
- `src/api/ConsumablesAPI.ts` — values list query now `Type.Composite([PaginationQuerySchema, IncludeDisabledQuerySchema, { showUsed }])`
- `src/api/LookupsAPI.ts` — values list query now `Type.Composite([PaginationQuerySchema, IncludeDisabledQuerySchema])`
- `src/api/ProductAPI.ts` — list query now `Type.Composite([PaginationQuerySchema, { includeDisabled, productNumberContains, productTypeIdentifier, disabled, filter }])`; export-template `params` gains `format: "uuid"` on `productTypeIdentifier`
- `src/api/ProductExportAPI.ts` — list query now `Type.Composite([PaginationQuerySchema, { filter }])`
- `src/api/ProductRequestAPI.ts` — list query now `Type.Composite([PaginationQuerySchema, { status, productTypeIdentifier, productNumberContains, actionFilter }])`
- `src/api/ProductTypesAPI.ts` — both list queries now compose `PaginationQuerySchema` (second one uses it directly); `includeDisabledDataTypes` preserved
- `src/api/ScriptLogAPI.ts` — query now `Type.Composite([PaginationQuerySchema, { logLevel, scriptCategory, dataTypeIdentifier, productRequestIdentifier }])`

## Required Manual Follow-Up
None.

## Verification Notes
Confirmed via project-wide search that no pmdm-owned route reads `context.query`/`context.params` without a corresponding `query:`/`params:` schema, that no loose pagination/boolean-flag query unions remain in the owned files, and that non-UUID identifiers (`productNumber`, `permid`, notification `key`) were left untouched.
