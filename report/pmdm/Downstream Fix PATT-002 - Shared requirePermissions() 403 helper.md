# Downstream Fix PATT-002 - Shared requirePermissions() 403 helper

## Source
- Upstream fix: `/report/Fix PATT-002 - Shared requirePermissions() 403 helper.md`
- Downstream plan: /report/pmdm/PATT-002-downstream-plan.md

## Summary of Change
Replaced all open-coded `claims → authorize → 403` sequences in the pmdm-owned route files with the shared `requirePermissions()` helper (same denial semantics: 403, same permission names, same auth precedence). AND checks (gatekeeper + domain permission) pass both permissions as required; OR checks (alternative list permissions in `_crud_API.ts`, `FP_READ_PRODUCT_FILTER` combinations, and the export/import permission probes in `ProductExportAPI.ts`) request the OR set as additional-granted permissions and evaluate the subset against `permissionCheck.authz`, preserving the existing message texts.

## Files Changed
- `src/api/_crud_API.ts` — all five route permission blocks use `requirePermissions` (gatekeeper as required, alternative list permissions as additional with the OR check kept)
- `src/api/ConsumablesAPI.ts` — 7 blocks converted (AND pairs as required; OR block via additional permissions)
- `src/api/LookupsAPI.ts` — 7 blocks converted (same shapes)
- `src/api/DataTypesAPI.ts` — 4 blocks converted
- `src/api/NotificationsAPI.ts` — 6 blocks converted
- `src/api/ProductAPI.ts` — 9 blocks converted
- `src/api/ProductRequestAPI.ts` — 4 blocks converted (incl. the dynamic `requiredPerm` case)
- `src/api/ProductExportAPI.ts` — 5 blocks converted (incl. the OR permission probe)
- `src/api/ProductTypesAPI.ts` — 18 blocks converted
- `src/api/ScriptApi.ts` — 2 blocks converted; unused `status` import dropped
- `src/api/ScriptLogAPI.ts` — 2 blocks converted; unused `status` import dropped

## Required Manual Follow-Up
None.

## Verification Notes
Project-wide search confirms no `authorize(` call remains in any pmdm-owned route file; every file that still imports `status` still uses it; denial texts keep the same permission names ("Permission denied. Required: …"); `requirePermissions` import is present in each touched file.
