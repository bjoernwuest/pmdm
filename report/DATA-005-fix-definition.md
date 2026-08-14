# Fix Definition: DATA-005 — Read-only serializable read-write transactions; outer client used inside the callback

## Source Finding
07-data-drizzle.md — `src/api/UserAPI.ts:96-122` wraps pure reads in `runInTransaction` (which forces serializable + `accessMode: "read write"` per `DatabaseDriver.ts:201`) and uses `context.dbClient` (`:97`) instead of the transaction handle inside the callback — defeating the transaction entirely; `GroupAPI.ts:101-113` same pattern

## Human Directive
Domain-level (applies to every DATA-* item): "[Never run the drizzle-migration - it will be run by the human after code change]"

## Target End State
Pure read paths in `src/api/UserAPI.ts:96-122` and `src/api/GroupAPI.ts:101-113` execute without `runInTransaction` (no serializable read-write transaction around reads), calling repo functions directly on `context.dbClient`. Where a transaction is genuinely retained anywhere, the callback uses only the transaction handle (`tx`), never the outer `context.dbClient`. Responses and status codes (including the 404/`status()` early returns from inside former transaction callbacks) are unchanged — note the interplay with API-003, which owns the general "status() smuggled through transaction callbacks" problem; this fix removes the two read-only transactions outright, which dissolves those specific smuggling instances.

## Approach
- `UserAPI.ts:96-122`: drop the `runInTransaction` wrapper; the body runs directly with `context.dbClient`. Combined with DATA-004's batching of the same block (separate change, must compose).
- `GroupAPI.ts:101-113`: same removal; the block already uses `_tx` — after removal it uses `context.dbClient` directly.
- Sweep other routes for read-only `runInTransaction` usage and for `context.dbClient` used inside transaction callbacks; fix the same way (report any site where the transaction is actually load-bearing — e.g. repeatable-read requirements — rather than stripping it silently; those get the outer-client usage fixed instead).

## Affected Scope
- `src/api/UserAPI.ts`, `src/api/GroupAPI.ts` — transaction removal
- Sweep results across `src/api/`

## Explicit Constraints
- Never run the drizzle-migration - it will be run by the human after code change (stated per the domain rule; no migration expected here).
- Response shapes and status codes unchanged.
- Mutating routes keep their transactions — this fix removes transactions only from pure reads.
- Compose with DATA-004 (same `UserAPI` block) and API-003 (status-through-callback pattern).

## Out of Scope
- DATA-004 (N+1 in the same blocks) — separate fix definition.
- API-003 (status() through transaction callbacks generally) — separate fix definition covering the mutating routes where transactions remain.

## Downstream Impact
No — server-internal execution change; API responses identical.
