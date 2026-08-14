# Fix DATA-002 - Atomic optimistic locking for config updates

## Source
- Finding: DATA-002 (see /report/07-data-drizzle.md)
- Fix definition: /report/DATA-002-fix-definition.md

## Summary of Change
Config updates are now optimistic-locked atomically. The `config` and `user_profile_config` tables gained `createdAt`/`updatedAt` via the shared `timestamps` helper; a hand-authored migration (`20260814140000_rainy_peacock`, SQL + pre/post hooks + drizzle meta snapshot/journal entry) covers the four new columns and was **not** executed. `ConfigRepo` gained `updateConfigEntry(db, domain, key, value, knownUpdatedAt)` — a compare-and-swap whose WHERE clause includes the expected `updatedAt`, returning no row on mismatch — and the user-profile repo gained the equivalent `updateUserProfileConfigEntry`. `upsertConfigEntry`/`upsertUserProfileConfigEntry` remain for seeding and now write `updatedAt: sql\`now()\`` with publishes using the stored `updatedAt`. `PUT /api/config/:domain/:key` uses the guarded update inside the request flow (single-statement CAS) and maps a no-row result to the canonical 409 with `currentValue`; the old read-compare-write `knownValue` JSON check is gone. `PUT /api/me/config/:domain/:key` uses the guarded update when `knownUpdatedAt` is provided (upsert on creation without a lock), returns 409 with the stored override value on mismatch, and round-trips `updatedAt` in responses.

## Files Changed
- `src/schema/ConfigSchema.ts` — `config` table gains `...timestamps`
- `src/schema/UserProfileConfigSchema.ts` — `user_profile_config` table gains `...timestamps`
- `src/migrations/20260814140000_rainy_peacock.sql`, `20260814140000_0_pre.ts`, `20260814140000_z_post.ts` — new (not executed)
- `src/migrations/meta/20260814140000_snapshot.json`, `meta/_journal.json` — meta extended to match the schema
- `src/repo/ConfigRepo.ts` — `updateConfigEntry` guarded CAS; upsert writes `updatedAt: now()` and publishes stored timestamp
- `src/repo/UserProfileConfigRepo.ts` — `updateUserProfileConfigEntry` guarded CAS; same upsert treatment
- `src/api/ConfigAPI.ts` — PUT uses guarded CAS; 409 with fresh `currentValue`
- `src/api/UserProfileConfigAPI.ts` — PUT uses guarded CAS/upsert; 409 with stored override; `updatedAt` in responses
- `src/types/_ConfigType.ts`, `src/types/_UserProfileConfigType.ts` — (hand-extended per the generator's output shape, since typegen cannot be run in this session)
- `src/services/AuditLog.ts`, `Auth.ts`, `EntraIDSync.ts`, `RequestBundling.ts`, `ui_config.ts` — config declaration templates now `satisfies ConfigEntryInsertType` (timestamps are DB-generated)

## Breaking Changes for Downstream Consumers
Yes — DB schema change (the human applies the migration); config update API requests/responses gain the `updatedAt` round-trip: `PUT /api/config/:domain/:key` requires `knownUpdatedAt` (string) instead of `knownValue`, `PUT /api/me/config/:domain/:key` accepts optional `knownUpdatedAt` instead of `knownValue`, and both responses include `updatedAt` (profile entries: `updatedAt` of the override, nullable). Seeding/setup paths remain unguarded and unchanged.

## Required Manual Follow-Up
- Apply the migration (start the app — `initDatabase()` runs Umzug — or the project's migration runner). Per the domain directive, the drizzle migration was **not** run by the implementer.
- Run `bun run typegen` to regenerate `_ConfigType.ts`/`_UserProfileConfigType.ts` (hand-extended here; regeneration produces the same output).
- `bun run drizzle` is safe afterwards (meta/journal were extended so no duplicate migration is generated).

## Out of Scope Notes
- API-004 (client/server contract drift, UI sending `knownUpdatedAt`, URLSearchParams unification) — separate fix definition, implemented in the same change set; this fix owns schema + server-side atomicity.
- TS-001 (casts) and VB-AI-001 — separate/unchecked.
- DATA-003 (timestamp comparison convention) — separate fix definition, implemented first; the guarded updates follow its timestamptz binding convention.

## Resolved Questions
None.
