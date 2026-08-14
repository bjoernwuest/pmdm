# Fix Definition: DATA-001 — Missing indexes on hot paths

## Source Finding
07-data-drizzle.md — `src/schema/ApiKeySchema.ts:7-19` — no index on `key_hash`/`expires_at`/`disabled` although `validateApiKeySecret` (`src/repo/ApiKeyRepo.ts:331-343`) scans per request; `src/schema/AuditEntrySchema.ts:13-18` — no index on `created_at` although every query does `desc(createdAt)` with offset pagination (`AuditRepo.ts:59-65`), and no index on `topic` although it is ILIKE-searched; `FunctionalPermissionsOfGroup` has PK `(functionalPermissionIdentifier, grantedTo)` but no index on `grantedTo` although `getFunctionalPermissionsOfUser` filters `grantedTo in (...)` (`FunctionalPermissionRepo.ts:72`)

## Human Directive
Domain-level (applies to every DATA-* item): "[Never run the drizzle-migration - it will be run by the human after code change]"

## Target End State
The schema declares indexes matching the actual hot query patterns:

- `api_keys`: an index supporting `validateApiKeySecret`'s per-request lookup (key hash lookup as executed by the repo's where clause; `expires_at`/`disabled` included per the actual filter shape of that query — the index column set is derived from the query, not from the finding's list verbatim).
- `audit_log`: an index on `created_at` backing the `desc(createdAt)` + offset pagination; an index on `topic` suitable for the ILIKE search (or a documented decision that the topic search pattern defeats btree indexing, with the chosen index type matching the actual LIKE pattern used).
- `functional_permissions_of_group`: an index with `granted_to` as the leftmost column, since the PK order `(functionalPermissionIdentifier, grantedTo)` does not serve `grantedTo in (...)` filters.

A migration file covering exactly these index additions is generated and present in `src/migrations/`, but **never executed by the implementer** — the human runs it.

## Approach
Add the index declarations to the respective schema table definitions (Drizzle index DSL in the table's extra-config, alongside the existing PK declaration style), then generate the migration via the project's migration-template tooling (`scripts/`), and stop there. Index necessity is verified against the actual queries in `ApiKeyRepo.validateApiKeySecret` and `AuditRepo` (read those where-clauses at implementation; add exactly the indexes they can use — no speculative extras).

## Affected Scope
- `src/schema/ApiKeySchema.ts`, `src/schema/AuditEntrySchema.ts`, the FunctionalPermissionsOfGroup schema file
- New generated migration file in `src/migrations/` (generated, not run)

## Explicit Constraints
- Never run the drizzle-migration - it will be run by the human after code change.
- Index set must match executed queries (verify in repo code); no blanket indexing of every column.
- No query rewrites in this fix — schema/index additions only.

## Out of Scope
- SEC-003 (bearer introspection caching) — unchecked; only its query-pattern cousin (`validateApiKeySecret`) motivates the index choice here.
- DATA-003 (timestamp comparison) and DATA-004 (N+1) — separate fix definitions.

## Downstream Impact
Yes — database schema gains indexes; the human applies the migration. No code-facing API or export changes.
