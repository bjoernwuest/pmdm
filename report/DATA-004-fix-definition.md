# Fix Definition: DATA-004 — N+1 query patterns

## Source Finding
07-data-drizzle.md — `src/api/ApiKeyAPI.ts:58-75` (per-key `getApiKeyFunctionalPermissions` over page rows); `src/api/UserAPI.ts:107-112` (per-group `getFunctionalPermissionsOfGroup`, then per-permission `getGroupsAssignedToFunctionalPermission` — up to 2N queries inside a serializable transaction opened at `:96`); `src/services/EntraIDSync.ts:142-157` (per-id Graph API calls)

## Human Directive
Domain-level (applies to every DATA-* item): "[Never run the drizzle-migration - it will be run by the human after code change]"

## Target End State
The cited endpoints execute a constant number of database queries regardless of page/entity count:

- `GET /api/api_keys`: permissions for the page's keys are fetched in one set-based repo call (e.g. `getApiKeyFunctionalPermissionsForKeys(db, identifiers[])` returning a grouped map), replacing the per-key loop.
- `GET /api/users/:userid`: the permission expansion is set-based — one query for the groups' permissions (`getFunctionalPermissionsOfGroups(db, groupIds[])`) and one for the granting groups of the resulting permission set (`getGroupsAssignedToFunctionalPermissions(db, permissionIds[])`), replacing the per-group/per-permission loops.
- `EntraIDSync.ts:142-157`: per-id Microsoft Graph calls are batched where the Graph API supports batching ($batch or `$filter`/`in` equivalents); where the Graph API genuinely requires per-id calls, that constraint is documented in a comment at the site and the loop remains (external-API limits are not a DB N+1).

Response shapes, permission semantics, and result contents are unchanged — only query count changes.

## Approach
Add the plural/batch repo functions to `ApiKeyRepo`/`FunctionalPermissionRepo` (accepting identifier arrays, using `inArray`), and rewire the two route handlers to assemble responses from the grouped results. The `UserAPI` fix lands together with DATA-005 (which removes the needless transaction around the same block) — implementations are separate changes but must compose. For EntraIDSync, evaluate the Graph batch endpoint; if used, chunk per Graph's batch limits; if not viable, document the constraint inline.

## Affected Scope
- `src/repo/ApiKeyRepo.ts`, `src/repo/FunctionalPermissionRepo.ts` — new batched reads
- `src/api/ApiKeyAPI.ts`, `src/api/UserAPI.ts` — loop removal
- `src/services/EntraIDSync.ts` — batched Graph calls or documented constraint
- Route response types unchanged

## Explicit Constraints
- Never run the drizzle-migration - it will be run by the human after code change (no migration expected here; stated per the domain rule).
- No response-shape changes; clients are unaffected.
- New repo functions follow repo-layer conventions (db-first parameter, typed returns).
- Coordinate with DATA-005 on `UserAPI.ts` (same code block); with CPLX-002/PATT-007 on the UI side (no interaction — this is server-side).

## Out of Scope
- DATA-005 (transaction misuse in the same `UserAPI` block) — separate fix definition.
- CPLX-005 (per-row *mutations* in repo batch operations) — separate fix definition; this fix covers read-path N+1.
- SEC-003 (bearer introspection per request) — unchecked.

## Downstream Impact
Yes — new repo exports; route files updated. No API contract change.
