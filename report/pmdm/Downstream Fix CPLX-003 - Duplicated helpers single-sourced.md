# Downstream Fix CPLX-003 - Duplicated helpers single-sourced

## Source
- Upstream fix: `/report/Fix CPLX-003 - Duplicated helpers single-sourced.md`
- Downstream plan: /report/pmdm/CPLX-003-downstream-plan.md

## Summary of Change
Removed the three private copies of `parseBooleanQuery` in pmdm-owned route files and replaced them with the shared `@/utils/parseBooleanQuery.ts` export (identical accepted values: `true`, `"true"`, `"1"`). The `extractErrorMessage` copy in `src/api/RequestBundlingAPI.ts` was left untouched because that file is byte-identical to upstream's fixed version.

## Files Changed
- `src/api/_crud_API.ts` — removed local `parseBooleanQuery`; imports from `@/utils/parseBooleanQuery.ts`
- `src/api/LookupsAPI.ts` — removed local `parseBooleanQuery`; imports from `@/utils/parseBooleanQuery.ts`
- `src/api/ConsumablesAPI.ts` — removed local `parseBooleanQuery`; imports from `@/utils/parseBooleanQuery.ts`

## Required Manual Follow-Up
None.

## Verification Notes
Confirmed via project-wide search that no `function parseBooleanQuery` definition remains outside `src/utils/parseBooleanQuery.ts`; confirmed the shared implementation accepts exactly the same values as the removed copies; confirmed the UI layer already single-sources `extractErrorMessage` from `@/ui/api/errors.ts`.
