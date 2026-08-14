# Fix CPLX-003 - Duplicated server-side and client-side helpers single-sourced

## Source
- Finding: CPLX-003 (see /report/04-complexity-maintainability.md)
- Fix definition: /report/CPLX-003-fix-definition.md

## Summary of Change
Single-sourced the four duplicated units: (1) config value parsing — `src/apps/setup.ts` deleted its local `schemaForType`/`parseValue` copies and now imports `parseConfigValue` from `src/services/Config.ts` and `schemaForConfigType` from `src/types/ConfigType.ts`, making `design/configuration.md`'s sharing claim true; (2) `canonicalizeJson`/`equalsJson` — after API-004 removed the `knownValue` comparisons, both copies in `ConfigAPI.ts`/`UserProfileConfigAPI.ts` had no remaining consumers and were removed entirely (no shared home needed); (3) `parseBooleanQuery` — one implementation in `src/utils/parseBooleanQuery.ts`, imported by `ApiKeyAPI.ts`, `UserAPI.ts`, and `GroupAPI.ts` (the canonical pattern's home); (4) `extractErrorMessage` — one implementation in `src/ui/api/errors.ts`, imported by `_client.ts` and `sse_api.ts`. Behavior is unchanged at every call site.

## Files Changed
- `src/services/Config.ts` — (verified canonical; exports used by setup)
- `src/apps/setup.ts` — local parse copies deleted; imports from service/types
- `src/api/ConfigAPI.ts`, `src/api/UserProfileConfigAPI.ts` — dead `canonicalizeJson`/`equalsJson` removed
- `src/utils/parseBooleanQuery.ts` — new shared helper
- `src/api/ApiKeyAPI.ts`, `UserAPI.ts`, `GroupAPI.ts` — import the shared `parseBooleanQuery`
- `src/ui/api/errors.ts` — `extractErrorMessage` moved here
- `src/ui/api/_client.ts`, `src/ui/api/sse_api.ts` — import the shared `extractErrorMessage`

## Breaking Changes for Downstream Consumers
Yes — functions moved to shared modules; import sites changed. `parseBooleanQuery` is now exported from `@/utils/parseBooleanQuery.ts` and `extractErrorMessage` from `@/ui/api/errors.ts`. No runtime contract changes.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- DOC-001 (stale configuration.md generally) — unchecked; only the sharing claim was made true (no doc edit needed).
- API-001 (error shape canonicalization) — separate fix definition; the `extractErrorMessage` merge did not change shapes.
- PATT-001 (error strategies) — separate fix definition.

## Resolved Questions
None.
