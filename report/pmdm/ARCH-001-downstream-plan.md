# Downstream Plan: ARCH-001 — Functional-permission pagination moved into the repo layer

## Upstream Change
Reference: `/report/Fix ARCH-001 - Functional-permission pagination moved into the repo layer.md`. The paginated branch of `GET /functionalpermissions` no longer builds its Drizzle query inline in the route file; rows come from the new repo export `getFunctionalPermissionsPage(db, { page, pageSize })` in `src/repo/FunctionalPermissionRepo.ts`. Route behavior (request parameters, response shape, ordering) unchanged.

## Upstream's Own Assessment
"None — a new repo export was added; no existing export, type, or API response shape changes."

## Applicability to This Project
Affected: No

Evidence:
- `src/api/FunctionalPermissionAPI.ts` and `src/repo/FunctionalPermissionRepo.ts` are byte-identical to upstream's fixed versions (diff against `bun-starter`: no differences) — the merged fix already applies here.
- Project-wide search for functional-permission pagination logic in pmdm-owned code: no pmdm-owned route or repo file paginates functional permissions (the only hits are in the shared `FunctionalPermissionAPI.ts`/`FunctionalPermissionRepo.ts` above).
- The new export is additive; nothing pmdm owns imports or shadows it.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
