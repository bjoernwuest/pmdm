# Fix DATA-003 - Timezone-safe optimistic-lock timestamp comparison; single producer

## Source
- Finding: DATA-003 (see /report/07-data-drizzle.md)
- Fix definition: /report/DATA-003-fix-definition.md

## Summary of Change
Removed the `::timestamp` casts from the five optimistic-lock comparisons in `src/repo/ApiKeyRepo.ts` (`updateApiKeyMetadata`, `prolongApiKey`, `disableApiKey`, `deleteApiKey`, `replaceApiKeyFunctionalPermissions`): `knownUpdatedAt` is now bound directly against the `timestamptz` columns (`sql`${col} = ${data.knownUpdatedAt}``), so comparisons no longer depend on the session timezone. Unified the `updatedAt` producer: `$onUpdate` (driver-generated ISO strings) was removed from the `timestamps` helper in `src/schema/helpers.ts`, and every remaining update path that previously relied on it now sets `updatedAt: sql\`now()\`` explicitly (`UserRepo` disableUsers/disableGroups and the user/group upserts, `FunctionalPermissionRepo` permission registration upsert, plus the already-explicit ApiKeyRepo sites). `DatabaseDriver.ts`'s UTC connection pinning now carries a comment stating it is defense-in-depth only. The wire format of `updatedAt` (ISO string in responses) is unchanged; no migration is needed (column types unchanged, `$onUpdate` is driver-side behavior).

## Files Changed
- `src/repo/ApiKeyRepo.ts` — five comparison sites bind timestamptz directly
- `src/schema/helpers.ts` — `$onUpdate` removed; doc comment documents DB-`now()` as the single producer
- `src/repo/UserRepo.ts` — disableUsers/disableGroups and upsert paths set `updatedAt: sql`now()`` explicitly
- `src/repo/FunctionalPermissionRepo.ts` — `registerFunctionalPermission` upsert sets `updatedAt: sql`now()``
- `src/services/DatabaseDriver.ts` — comment on UTC pinning

## Breaking Changes for Downstream Consumers
None for clients — the `updatedAt` wire format is unchanged. `$onUpdate` behavior removal is internal: update paths now write the timestamp via the database clock; optimistic-lock round-trips still compare equal values.

## Required Manual Follow-Up
None. (No migration generated — column types unchanged.)

## Out of Scope Notes
- DATA-002 (config optimistic locking, which adds `updatedAt` columns to the config tables) — separate fix definition; its guarded updates will follow this comparison convention. The config/user-profile-config upserts do not yet set `updatedAt` because those columns are DATA-002's addition.
- CPLX-005 (per-row mutations in `UserRepo`) — separate fix definition.

## Resolved Questions
None.
