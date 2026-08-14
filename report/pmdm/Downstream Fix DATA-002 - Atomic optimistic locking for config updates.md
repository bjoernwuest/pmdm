# Downstream Fix DATA-002 - Atomic optimistic locking for config updates

## Source
- Upstream fix: `/report/Fix DATA-002 - Atomic optimistic locking for config updates.md`
- Downstream plan: /report/pmdm/DATA-002-downstream-plan.md

## Summary of Change
No code edits were required for the schema/type/repo core: the merged shared files (`ConfigSchema.ts`, `ConfigType.ts`, `_ConfigType.ts`, `ConfigRepo.ts`) already match upstream's fixed state, and this project's regenerated migration `src/migrations/20260814174708_yummy_ozymandias.sql` contains the `config`/`user_profile_config` `created_at`/`updated_at` column additions. The pmdm-owned config update route was migrated to the `knownUpdatedAt` contract under the API-004 adaptation (guarded `updateConfigEntry`, `updatedAt` round-trip, 409 with `currentValue`). The migration itself was not executed.

## Files Changed
- None (verification only; the code-side contract change is recorded under `Downstream Fix API-004`).

## Required Manual Follow-Up
- Apply the pending migration to the database (start the app — `initDatabase()` runs Umzug — or the project's migration runner).
- Optional: run `bun run typegen` to regenerate `_ConfigType.ts`/`_UserProfileConfigType.ts` (already in sync with upstream's hand-extended output).

## Verification Notes
Confirmed `src/migrations/20260814174708_yummy_ozymandias.sql` covers upstream's `20260814140000_rainy_peacock.sql` column additions; confirmed `_ConfigType.ts` carries `createdAt`/`updatedAt`; confirmed `updateConfigEntry` performs the guarded update in the shared `ConfigRepo.ts`; confirmed the pmdm-owned `NotificationsAPI.ts` uses it (see API-004).
