# Downstream Plan: DATA-002 — Atomic optimistic locking for config updates

## Upstream Change
Reference: `/report/Fix DATA-002 - Atomic optimistic locking for config updates.md`. Config tables gained `createdAt`/`updatedAt` columns (timestamptz); config update API requests/responses moved to the `updatedAt` round-trip with a repo-side compare-and-swap (`updateConfigEntry`); seeding/setup paths remain unguarded. Generated types `_ConfigType.ts`/`_UserProfileConfigType.ts` were hand-extended; regeneration produces the same output.

## Upstream's Own Assessment
"Yes — DB schema change (the human applies the migration); config update API requests/responses gain the `updatedAt` round-trip: `PUT /api/config/:domain/:key` requires `knownUpdatedAt` (string) instead of `knownValue`, `PUT /api/me/config/:domain/:key` accepts optional `knownUpdatedAt` instead of `knownValue`, and both responses include `updatedAt` (profile entries: `updatedAt` of the override, nullable). Seeding/setup paths remain unguarded and unchanged."

## Applicability to This Project
Affected: Yes (DB schema change; code already aligned)

Evidence:
- Schema/type/repo files are byte-identical to upstream's fixed versions: `src/schema/ConfigSchema.ts`, `src/types/ConfigType.ts`, `src/types/_ConfigType.ts` (carries `createdAt`/`updatedAt`, lines 41-42/58-59), `src/repo/ConfigRepo.ts` (guarded `updateConfigEntry` present).
- This project's latest migration `src/migrations/20260814174708_yummy_ozymandias.sql` contains the `config`/`user_profile_config` `created_at`/`updated_at` column additions (verified against upstream's `20260814140000_rainy_peacock.sql`).
- The pmdm-owned config mutation route (`src/api/NotificationsAPI.ts`) was already migrated to the `knownUpdatedAt` contract under the API-004 adaptation (`updateConfigEntry` + 409/`currentValue` + `updatedAt` round-trip).
- pmdm-owned seeding paths (`src/services/ScriptLog.ts`, `Notifications.ts` via `upsertConfigEntry`) remain unguarded — unchanged, as upstream's design specifies.
- The migration has not been applied to the database (no commands executed here, per ground rule 1).

## Target End State
The `config`/`user_profile_config` timestamps exist in the running database; all config update consumers use the `updatedAt` round-trip.

## Approach
No further code changes: the merged shared code plus the API-004 adaptation cover the contract; the pmdm migration chain already contains the schema change. Only the human-run migration application (and optional typegen) remains.

## Affected Scope
- None (already aligned). Verified, not edited.

## Anticipated Manual Follow-Up
- Apply the pending migration to the database (start the app — `initDatabase()` runs Umzug — or the project's migration runner).
- Optional: run `bun run typegen` to regenerate `_ConfigType.ts`/`_UserProfileConfigType.ts` (shared files already match the upstream hand-extended output, so regeneration is only a consistency check).

## Open Questions
None.
