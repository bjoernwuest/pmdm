# Downstream Plan: DATA-005 — No serializable read-write transactions around pure reads

## Upstream Change
Reference: `/report/Fix DATA-005 - No serializable read-write transactions around pure reads.md`. Upstream route files no longer wrap pure reads in serializable read-write transactions. Server-internal execution change; API responses identical.

## Upstream's Own Assessment
"None. Server-internal execution change; API responses identical."

## Applicability to This Project
Affected: No

Evidence:
- The affected route file (`src/api/UserAPI.ts`) is shared and already fixed via the merge.
- Project-wide review of pmdm-owned repos and services: no pmdm-owned code wraps pure reads in `runInTransaction` — `runInTransaction` is used only around mutations (e.g. `src/api/*` mutations, `src/services/Notifications.ts` digest marking). `src/repo/UserRepo.ts` is upstream's fixed version plus pmdm doc comments only.
- `src/services/Notifications.ts` carries an unused `runInTransaction` import — pre-existing and unrelated to this fix (no transaction around a pure read exists there).

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
