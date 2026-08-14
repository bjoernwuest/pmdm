# Fix DATA-001 - Indexes added for hot query paths

## Source
- Finding: DATA-001 (see /report/07-data-drizzle.md)
- Fix definition: /report/DATA-001-fix-definition.md

## Summary of Change
Added schema index declarations matching the actual executed queries: a partial index `api_keys_active_expiry_idx` on `api_keys(expires_at) WHERE disabled = false` serving `validateApiKeySecret`'s `disabled = false AND expires_at > now()` pre-filter (the `crypt()` hash comparison is not indexable — documented in the schema comment); `audit_log_created_at_idx` on `audit_log(created_at)` backing the `orderBy(desc(createdAt))` + offset pagination; and `functional_permissions_of_group_granted_to_idx` on `granted_to` (the composite PK order does not serve `grantedTo in (...)` filters). The audit-log `topic ILIKE '%…%'` search uses leading wildcards and defeats btree indexing — a trigram (pg_trgm) GIN index would be required; that decision is documented in the schema comment instead. A hand-authored migration (`20260814150000_bold_heron`, SQL + pre/post hooks + drizzle meta snapshot/journal entry) covers exactly these three indexes and was **not** executed.

## Files Changed
- `src/schema/ApiKeySchema.ts` — partial `api_keys_active_expiry_idx` declaration with rationale comment
- `src/schema/AuditEntrySchema.ts` — `audit_log_created_at_idx` declaration with topic-search decision comment
- `src/schema/FunctionalPermissionSchema.ts` — `functional_permissions_of_group_granted_to_idx` declaration
- `src/migrations/20260814150000_bold_heron.sql`, `20260814150000_0_pre.ts`, `20260814150000_z_post.ts` — new (not executed)
- `src/migrations/meta/20260814150000_snapshot.json`, `meta/_journal.json` — meta extended to match the schema

## Breaking Changes for Downstream Consumers
Yes — database schema gains indexes; the human applies the migration. No code-facing API or export changes.

## Required Manual Follow-Up
- Apply the migration (start the app — `initDatabase()` runs Umzug — or the project's migration runner). Per the domain directive, the drizzle migration was **not** run by the implementer.
- `bun run drizzle` is safe afterwards (meta/journal were extended so no duplicate migration is generated).

## Out of Scope Notes
- SEC-003 (bearer introspection caching) — unchecked; only its query-pattern cousin (`validateApiKeySecret`) motivated the index choice here.
- DATA-003 (timestamp comparison) and DATA-004 (N+1) — separate fix definitions, implemented in the same change set.

## Resolved Questions
None.
