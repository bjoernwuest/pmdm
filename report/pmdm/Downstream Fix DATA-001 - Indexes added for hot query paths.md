# Downstream Fix DATA-001 - Indexes added for hot query paths

## Source
- Upstream fix: `/report/Fix DATA-001 - Indexes added for hot query paths.md`
- Downstream plan: /report/pmdm/DATA-001-downstream-plan.md

## Summary of Change
No code edits were required: this project's regenerated migration chain already absorbed the upstream index changes. Verified that the merged schema files declare the three indexes (`api_keys_active_expiry_idx`, `audit_log_created_at_idx`, `functional_permissions_of_group_granted_to_idx`) and that this project's latest migration `src/migrations/20260814174708_yummy_ozymandias.sql` contains the matching `CREATE INDEX` statements (including the corrected partial-index definition from upstream's `tricky_fallen_one`). The migration itself was not executed.

## Files Changed
- None (verification only).

## Required Manual Follow-Up
- Apply the pending migration to the database (start the app — `initDatabase()` runs Umzug — or the project's migration runner).

## Verification Notes
Confirmed statement-by-statement that `src/migrations/20260814174708_yummy_ozymandias.sql` covers upstream's `20260814150000_bold_heron.sql` and `20260814102903_tricky_fallen_one.sql` index changes; confirmed the schema index declarations match (`src/schema/ApiKeySchema.ts:24`, `src/schema/AuditEntrySchema.ts:22`, `src/schema/FunctionalPermissionSchema.ts:60`); confirmed `meta/_journal.json` carries the `yummy_ozymandias` entry (uncommitted).
