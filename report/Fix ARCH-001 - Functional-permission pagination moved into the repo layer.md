# Fix ARCH-001 - Functional-permission pagination moved into the repo layer

## Source
- Finding: ARCH-001 (see /report/01-architecture-structure.md)
- Fix definition: /report/ARCH-001-fix-definition.md

## Summary of Change
`src/api/FunctionalPermissionAPI.ts` no longer contains a Drizzle schema import or direct query building: the paginated branch of `GET /functionalpermissions` now obtains its rows via the new `getFunctionalPermissionsPage(db, { page, pageSize })` repo function in `src/repo/FunctionalPermissionRepo.ts`, which encapsulates the `orderBy(functionalPermissionName).offset(...).limit(...)` query and validates rows through the same `toValidatedFunctionalPermissionType` mapping as the non-paginated read. The route keeps its pagination math (clamping, count lookup, pagination-mode detection) and the unpaginated branch is untouched. Route behavior (request parameters, response shape, ordering) is unchanged.

## Files Changed
- `src/repo/FunctionalPermissionRepo.ts` — new `getFunctionalPermissionsPage` paginated read
- `src/api/FunctionalPermissionAPI.ts` — inline query replaced by the repo call; `@/schema/*` import removed

## Breaking Changes for Downstream Consumers
None — a new repo export was added; no existing export, type, or API response shape changes.

## Required Manual Follow-Up
None. (No test files cover the functional-permission list route in-tree.)

## Out of Scope Notes
- CPLX-001 (oversized files) and DOC-004 (AGENTS.md filename references) — handled under their own IDs.
- No re-implementation of `getFunctionalPermissionCount` or other repo functions beyond the new paginated read.

## Resolved Questions
None.
