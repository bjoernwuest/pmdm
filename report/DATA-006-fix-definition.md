# Fix Definition: DATA-006 — Multi-step mutations without transactions; fragile insert/update discrimination

## Source Finding
07-data-drizzle.md — `src/repo/UserRepo.ts:69-73` (`disableUsers`: update + N deletes, no tx); `:208-210` and `:226-231` (`setUserMemberships`/`setGroupMemberships`: delete + insert, no tx); `src/api/AuditLogAPI.ts:98-110` (`clearAuditEntries` + `insertAuditEntries` not in one transaction — the audit "cleared by" entry is lost if the insert fails after the delete); insert-vs-update decided by `createdAt !== returningUser.updatedAt` string comparison (`UserRepo.ts:106,162`)

## Human Directive
Domain-level (applies to every DATA-* item): "[Never run the drizzle-migration - it will be run by the human after code change]"

## Target End State
Every multi-statement mutation in the cited locations is atomic:

- `disableUsers`/`disableGroups` (update + membership deletes) run as one transaction — with CPLX-005 turning the per-row deletes into a single set-based delete, each function becomes a two-statement unit wrapped in a transaction internally (repo-level `runInTransaction(db, ...)` so atomicity no longer depends on the caller remembering to wrap).
- `setUserMemberships`/`setGroupMemberships` (delete + insert) run inside `runInTransaction` within the repo functions.
- `AuditLogAPI.ts:98-110`: the clear-and-record sequence runs inside one `runInTransaction`, so the "audit log cleared by" record cannot be lost after a successful delete.
- Insert-vs-update discrimination in `upsertUsers` (`UserRepo.ts:106,162`) no longer relies on comparing `createdAt !== updatedAt` strings: the upsert returns the distinction structurally (e.g. via `xmax = 0`-style system-column check or a two-phase approach chosen at implementation against Drizzle/postgres-js capabilities), with the CREATE/UPDATE event split preserving current semantics (an inserted row publishes CREATE, a conflict-updated row publishes UPDATE).

PubSub events continue to publish per the PATT-004 timing rule (post-commit) and PATT-003 granularity.

## Approach
- Repo functions gain internal `runInTransaction` wrappers (they accept `DBClient`, which may already be a transaction — `runInTransaction` nesting behavior must be verified at implementation: if nested transactions/savepoints are unsupported, the functions instead document "must be called within a transaction" and callers are updated; the decision is made once, in favor of internal wrapping if the driver supports savepoints).
- `AuditLogAPI.ts`: wrap the clear+insert pair in `runInTransaction(context.dbClient, ...)`.
- `upsertUsers`: replace the timestamp-string heuristic with a reliable insert/update signal from the database; keep the return shape `{inserted, updated}` and per-entity events identical for callers.
- Coordinate with CPLX-005, which rewrites the same functions' data access — the two fixes are implemented as one coherent rewrite of these functions but remain separately scoped decisions (CPLX-005: set-based; DATA-006: atomicity + discrimination).

## Affected Scope
- `src/repo/UserRepo.ts` — `disableUsers`, `disableGroups`, `setUserMemberships`, `setGroupMemberships`, `upsertUsers`
- `src/services/DatabaseDriver.ts` — only if nested-transaction support needs a helper
- `src/api/AuditLogAPI.ts` — clear endpoint transaction
- Callers of the membership functions (`EntraIDSync`, `UserAPI`/`GroupAPI` routes) — verified to still compose (they already wrap some calls in `runInTransaction`)

## Explicit Constraints
- Never run the drizzle-migration - it will be run by the human after code change (no migration expected; stated per the domain rule).
- No signature or return-shape changes; event payloads unchanged in form (per PATT-003 normalization where applicable).
- The audit "cleared by" entry must be recorded in the same transaction as the deletion.
- Serializable-isolation semantics of `runInTransaction` are accepted for these paths (they are mutations per root AGENTS.md).

## Out of Scope
- CPLX-005 (set-based rewrite of the same functions) — separate fix definition; coordinated.
- DATA-005 (read-only transactions) — separate fix definition.
- PATT-003/PATT-004 (publish granularity/timing) — separate fix definitions.

## Downstream Impact
No external contract changes; repo functions become internally transactional (callers that already wrap them are unaffected once nesting behavior is settled).
