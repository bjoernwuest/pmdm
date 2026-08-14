# Downstream Plan: DATA-001 — Indexes added for hot query paths

## Upstream Change
Reference: `/report/Fix DATA-001 - Indexes added for hot query paths.md`. Schema index declarations plus a hand-authored migration adding three indexes: partial `api_keys_active_expiry_idx` on `api_keys(expires_at) WHERE disabled = false`, `audit_log_created_at_idx` on `audit_log(created_at)`, `functional_permissions_of_group_granted_to_idx` on `functional_permissions_of_group(granted_to)`. The migration was not executed upstream.

## Upstream's Own Assessment
"Yes — database schema gains indexes; the human applies the migration. No code-facing API or export changes."

## Applicability to This Project
Affected: Yes (database schema change; code already aligned)

Evidence:
- The merged schema files carry the index declarations: `src/schema/ApiKeySchema.ts:24`, `src/schema/AuditEntrySchema.ts:22`, `src/schema/FunctionalPermissionSchema.ts:60`.
- This project's migration chain does not contain upstream's migration files (pmdm regenerates its own chain); its latest migration `src/migrations/20260814174708_yummy_ozymandias.sql` already contains the three `CREATE INDEX` statements (verified statement-by-statement against upstream's `20260814150000_bold_heron.sql` and the corrected `20260814102903_tricky_fallen_one.sql`).
- The pending uncommitted change to `src/migrations/meta/_journal.json` (adding the `yummy_ozymandias` entry) completes the meta/journal bookkeeping.
- The migration has not been applied to the database (no commands executed here, per ground rule 1).

## Target End State
The three indexes exist in the running database.

## Approach
No code changes: the schema declarations and the pmdm regeneration of the migration chain already cover the upstream change. Only the human-run migration application remains.

## Affected Scope
- None (already aligned). `src/schema/*` and `src/migrations/20260814174708_yummy_ozymandias.sql` verified, not edited.

## Anticipated Manual Follow-Up
- Apply the pending migration to the database (start the app — `initDatabase()` runs Umzug — or the project's migration runner).

## Open Questions
None.
