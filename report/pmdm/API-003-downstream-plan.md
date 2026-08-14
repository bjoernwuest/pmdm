# Downstream Plan: API-003 — No HTTP responses across transaction boundaries

## Upstream Change
Reference: `/report/Fix API-003 - No HTTP responses across transaction boundaries.md`. The two remaining `status()`-through-`runInTransaction` sites in `src/api/FunctionalPermissionAPI.ts` were restructured so transaction callbacks return typed domain outcomes (`{ ok: true }` / `{ ok: false, reason }`) and the handler maps them to HTTP after the transaction resolves; the `"status" in result` duck-type check was removed. `src/api/AGENTS.md` gained the outcome-mapping rule. HTTP contract unchanged.

## Upstream's Own Assessment
"None. Server-internal control flow; HTTP contract unchanged."

## Applicability to This Project
Affected: No

Evidence:
- Project-wide search for `"status" in` result-sniffing: zero hits in `src/api/*`, `src/repo/*`, `src/services/*`.
- All pmdm-owned route files with `runInTransaction` calls were reviewed (`_crud_API.ts`, `ConsumablesAPI.ts`, `LookupsAPI.ts`, `DataTypesAPI.ts`, `ProductAPI.ts`, `ProductRequestAPI.ts`, `ProductExportAPI.ts`, `ProductTypesAPI.ts`): every transaction callback returns domain data (rows, `null`, `false`, or repo results) and every `status(...)` call sits outside the transaction — e.g. `ConsumablesAPI.ts:572-577` (`const created = await runInTransaction(...)`; the 409 mapping at line 577 runs after the transaction resolves).
- Own repo/service/autostart files contain no `status()` usage at all.
- Upstream's own `FunctionalPermissionAPI.ts` fix is already present via the merge; pmdm has no own copy of that file (identical to upstream).

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
