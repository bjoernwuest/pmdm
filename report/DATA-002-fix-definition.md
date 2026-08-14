# Fix Definition: DATA-002 — Optimistic locking on config is a non-atomic TOCTOU check

## Source Finding
07-data-drizzle.md — `src/api/ConfigAPI.ts:112` compares `knownValue` via JSON canonicalization, then writes via `upsertConfigEntry` (`:128-131`) with no transaction and no `updatedAt` guard (`ConfigRepo.ts:80-85`); `src/api/UserProfileConfigAPI.ts:96-131` same pattern; the `config` table has no `updatedAt` at all (`src/schema/ConfigSchema.ts:55-69`) and neither does `UserProfileConfig`

## Human Directive
Domain-level (applies to every DATA-* item): "[Never run the drizzle-migration - it will be run by the human after code change]"

## Target End State
Config updates are optimistic-locked atomically per the root AGENTS.md contract:

- The `config` table and the `UserProfileConfig` table gain an `updatedAt` column (same `timestamps` helper convention as other tables).
- The config update paths (`PUT /api/config/:domain/:key` and the user-profile-config equivalent) perform the lock check and the write as one atomic operation: the write's WHERE clause includes the expected `updatedAt` (compare-and-swap), so a concurrent modification turns the update into a no-row result, which the API maps to `409 Conflict`. The read-compare-write race no longer exists.
- The client contract round-trips `updatedAt` for these endpoints: the UI sends `knownUpdatedAt` (per API-004's contract alignment — that fix owns the client/server shape; this fix owns the server-side atomicity and schema), and responses carry the fresh `updatedAt`. The existing `knownValue` JSON comparison is either retained as an additional check or superseded by the `updatedAt` CAS — the canonical mechanism per root AGENTS.md is `updatedAt`, so the end state uses `updatedAt` as the lock token, coordinated with API-004.
- `upsertConfigEntry` is split or parameterized so that *user-initiated updates* go through a guarded update (with `updatedAt` check) while *seed/upsert paths* (startup seeding, setup wizard) remain unguarded inserts/updates — seeding must not suddenly require lock tokens.

## Approach
- Schema: add `updatedAt`/`createdAt` via the existing `timestamps` helper to both tables; do not generate the migration, do not run it.
- Repo: add a guarded update function (e.g. `updateConfigEntry(db, domain, key, value, knownUpdatedAt)`) that returns no row on lock mismatch; keep `upsertConfigEntry` for seeding.
- API: both update endpoints use the guarded function inside `runInTransaction` where read-modify-write composition requires it, mapping empty result to the canonical 409 body (per API-001's shape and the existing 409 convention in `src/api/AGENTS.md`).
- UI: the config pages send the `updatedAt` they last received — coordinate exactly with API-004, which owns the contract drift details.

## Affected Scope
- `src/schema/ConfigSchema.ts`, `src/schema/UserProfileConfigSchema.ts` (verify actual filename) — new columns
- New generated migration (not run)
- `src/repo/ConfigRepo.ts`, `src/repo/UserProfileConfigRepo.ts` — guarded update function
- `src/api/ConfigAPI.ts`, `src/api/UserProfileConfigAPI.ts` — use guarded update, 409 mapping
- UI config pages — send `knownUpdatedAt` (with API-004)

## Explicit Constraints
- Never run the drizzle-migration - it will be run by the human after code change.
- Seeding/setup paths must keep working without lock tokens.
- 409 responses follow the canonical description ("Conflict. The resource was modified concurrently; retry with the current value (optimistic locking).") and the shape defined by API-001.
- Timestamp handling follows DATA-003's resolution (timestamptz-consistent comparison); the two fixes must not introduce a new mixed-cast site.

## Out of Scope
- API-004 (client/server contract drift on config optimistic locking) — owns the wire-shape alignment; this fix owns schema + atomicity.
- TS-001 (casts) — related, separate fix definition.
- VB-AI-001 — unchecked.
- DATA-003 (timestamp cast mixing) — separate fix definition; dependency noted above.

## Downstream Impact
Yes — DB schema change (migration applied by human); config update API requests/responses gain `updatedAt` round-trip (coordinated with API-004); UI config pages send the new field.
