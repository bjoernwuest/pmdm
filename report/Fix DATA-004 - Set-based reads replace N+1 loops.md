# Fix DATA-004 - Set-based reads replace N+1 loops

## Source
- Finding: DATA-004 (see /report/07-data-drizzle.md)
- Fix definition: /report/DATA-004-fix-definition.md

## Summary of Change
Replaced the cited N+1 patterns with set-based reads. `GET /api/api_keys` now fetches the page's key permissions in one `getApiKeyFunctionalPermissionsForKeys(db, identifiers[])` repo call returning a grouped map. `GET /api/users/:userid` now uses `getFunctionalPermissionsOfGroups(db, groupIds[])` and `getGroupsAssignedToFunctionalPermissions(db, permissionIds[])` (both set-based, `inArray`) instead of per-group and per-permission loops. `EntraIDSync.membershipSync` now fetches member/memberOf pages via Microsoft Graph `$batch` (chunked at Graph's 20-request limit, following `@odata.nextLink` pages through subsequent batches), replacing the per-id sequential Graph calls; per-identifier and batch-level failure behavior matches the former semantics (an identifier continues with its collected — possibly empty — member set). The number of DB queries per request is now constant with respect to entity count.

## Files Changed
- `src/repo/ApiKeyRepo.ts` — new `getApiKeyFunctionalPermissionsForKeys` batched read
- `src/api/ApiKeyAPI.ts` — list route uses the batched read; per-key `Promise.all` loop removed
- `src/repo/FunctionalPermissionRepo.ts` — new `getFunctionalPermissionsOfGroups` and `getGroupsAssignedToFunctionalPermissions` batched reads
- `src/api/UserAPI.ts` — detail route uses the batched reads
- `src/services/EntraIDSync.ts` — `membershipSync` uses Graph `$batch` via `BatchRequestContent`/`BatchResponseContent`

## Breaking Changes for Downstream Consumers
Yes — new repo exports (`getApiKeyFunctionalPermissionsForKeys`, `getFunctionalPermissionsOfGroups`, `getGroupsAssignedToFunctionalPermissions`); route files updated. No API contract change. Note: the ordering of permission arrays within the two responses is now determined by the set-based queries' join order (same elements, possibly different order than the previous per-entity loop order).

## Required Manual Follow-Up
None. (No migration expected, per the domain rule.)

## Out of Scope Notes
- DATA-005 (transaction misuse in the same `UserAPI` block) — separate fix definition, implemented first; the two changes compose.
- CPLX-005 (per-row *mutations* in repo batch operations) — separate fix definition; this fix covers the read-path N+1 only.
- SEC-003 (bearer introspection per request) — unchecked.

## Resolved Questions
None.
