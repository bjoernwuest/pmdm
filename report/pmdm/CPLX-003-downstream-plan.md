# Downstream Plan: CPLX-003 — Duplicated helpers single-sourced

## Upstream Change
Reference: `/report/Fix CPLX-003 - Duplicated helpers single-sourced.md`. `parseBooleanQuery` was single-sourced in `@/utils/parseBooleanQuery.ts` and `extractErrorMessage` in `@/ui/api/errors.ts`; duplicated local definitions in upstream route files were removed and import sites changed. No runtime contract changes.

## Upstream's Own Assessment
"Yes — functions moved to shared modules; import sites changed. `parseBooleanQuery` is now exported from `@/utils/parseBooleanQuery.ts` and `extractErrorMessage` from `@/ui/api/errors.ts`. No runtime contract changes."

## Applicability to This Project
Affected: Yes

Evidence:
- Three pmdm-owned route files still carry their own private copy of `parseBooleanQuery` with identical semantics (`value === true || value === "true" || value === "1"`):
  - `src/api/_crud_API.ts:165-168` (used at line 216)
  - `src/api/LookupsAPI.ts:40-42` (used at line 491)
  - `src/api/ConsumablesAPI.ts:40-42` (used at lines 481-482)
- The shared `@/utils/parseBooleanQuery.ts` exists in this tree (merged) with the same accepted values.
- `extractErrorMessage` duplications: this project's UI wrapper layer already imports it from `@/ui/api/errors.ts` (`src/ui/api/_client.ts`, `sse_api.ts`); the remaining local copy at `src/api/RequestBundlingAPI.ts:57` is byte-identical to upstream's fixed file and is not pmdm-owned, so it is left as upstream shipped it.

## Target End State
The three pmdm-owned route files import `parseBooleanQuery` from `@/utils/parseBooleanQuery.ts`; no private duplicate definitions remain in pmdm-owned code.

## Approach
Remove the local `parseBooleanQuery` function from each of the three files and add the import from `@/utils/parseBooleanQuery.ts`.

## Affected Scope
- `src/api/_crud_API.ts`
- `src/api/LookupsAPI.ts`
- `src/api/ConsumablesAPI.ts`

## Anticipated Manual Follow-Up
None.

## Open Questions
None.
