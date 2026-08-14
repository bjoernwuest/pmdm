# Fix DATA-005 - No serializable read-write transactions around pure reads

## Source
- Finding: DATA-005 (see /report/07-data-drizzle.md)
- Fix definition: /report/DATA-005-fix-definition.md

## Summary of Change
Removed the two read-only `runInTransaction` wrappers: `GET /api/users/:userid` (`src/api/UserAPI.ts`) and `GET /api/groups/:groupid` (`src/api/GroupAPI.ts`) now execute their pure-read bodies directly on `context.dbClient` — no serializable read-write transaction, and no repo call bypassing a transaction handle. The sweep confirmed all remaining `runInTransaction` uses in `src/api/` are genuine mutations (ApiKey create/permission-replace, functional-permission grant/revoke, group grant/revoke) and were left intact. Responses and status codes are unchanged.

## Files Changed
- `src/api/UserAPI.ts` — transaction wrapper removed from the user-detail handler; body runs on `context.dbClient`
- `src/api/GroupAPI.ts` — transaction wrapper removed from the group-detail handler; `_tx` uses replaced with `context.dbClient`

## Breaking Changes for Downstream Consumers
None. Server-internal execution change; API responses identical.

## Required Manual Follow-Up
None. (No migration expected, per the domain rule.)

## Out of Scope Notes
- DATA-004 (N+1 batching in the same `UserAPI` block) — separate fix definition, implemented next in the same change set.
- API-003 (status() through transaction callbacks) — separate fix definition; this removal dissolved the `UserAPI` `status(404)`-through-transaction instance.
- Mutating routes keep their transactions — this fix removed transactions only from pure reads.

## Resolved Questions
None.
