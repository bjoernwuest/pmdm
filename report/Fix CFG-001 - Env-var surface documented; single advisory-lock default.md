# Fix CFG-001 - Env-var surface documented; single advisory-lock default

## Source
- Finding: CFG-001 (see /report/11-config-deps.md)
- Fix definition: /report/CFG-001-fix-definition.md

## Summary of Change
Root `AGENTS.md`'s `.env` entry now documents the complete environment-variable surface (name, meaning, default, where consumed) for `DATABASE_URL`, `ADVISORY_LOCK`, `APP_BASE_URL`, `PORT`, `DEV_MODE`, `SQL_LOGGING`, `INTERNAL_API_BASE_URL`, `BUNDLING_DEBUG`, `TRUST_PROXY` (added by SEC-006), and `NODE_ENV` (marked non-load-bearing per TS-004). The advisory-lock default now lives exactly once — `defaultAdvisoryLockId` in `src/services/Env.ts` (created by ARCH-002), consumed by `DatabaseDriver.initDatabase()`. `README.md`'s `.env` template describes `ADVISORY_LOCK` as optional with the application default stated, so no second hard-coded copy remains. The live local `.env` file was not modified.

## Files Changed
- `AGENTS.md` (root) — `.env` bullet expanded into a full env-var table
- `README.md` — `ADVISORY_LOCK` template line notes the optional/default form
- `src/services/Env.ts` — (`defaultAdvisoryLockId` single source was established under ARCH-002; verified here as the sole definition)
- `src/services/DatabaseDriver.ts` — (verified: no local default copy remains; consumes `advisoryLockId` from `Env.ts`)

## Breaking Changes for Downstream Consumers
None. No variable renamed, no default changed, no new required variable. The advisory-lock default is now sourced from code (`Env.ts`) instead of being duplicated; behavior is identical when `ADVISORY_LOCK` is unset.

## Required Manual Follow-Up
None. (The human's local `.env` keeps its explicit `ADVISORY_LOCK` value — an explicit value remains fully supported.)

## Out of Scope Notes
- ARCH-002 (central env module implementation) — separate fix definition, implemented first; this fix documented its surface and confirmed the deduplication.
- TS-004 (production-flag semantics) — separate fix definition; `NODE_ENV` is documented per its resolution (non-load-bearing).
- DOC-003 (other root AGENTS.md inaccuracies) — separate fix definition; it owns the AGENTS.md-side acceptance verification of this table.
- SEC-006 (trusted-proxy implementation) — separate fix definition; `TRUST_PROXY`'s row landed in the table established here, with configuration detail in `README.md`.

## Resolved Questions
None. Note: `APP_BASE_URL` is not read by application runtime code; the finding's "where consumed" for it is the Playwright E2E test infrastructure (`design/playwright_testing.md`). The table documents that reality.
