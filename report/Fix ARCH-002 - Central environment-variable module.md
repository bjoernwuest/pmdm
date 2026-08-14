# Fix ARCH-002 - Central environment-variable module

## Source
- Finding: ARCH-002 (see /report/01-architecture-structure.md)
- Fix definition: /report/ARCH-002-fix-definition.md

## Summary of Change
Created `src/services/Env.ts` as the single server-side env module: it reads `Bun.env` and exports one parsed, typed accessor per environment variable (`port`, `databaseUrl`, `advisoryLockId` plus `defaultAdvisoryLockId` as its single default source, `internalApiBaseUrl`, `bundlingDebug`, `devMode`, `sqlLogging`, `nodeEnv`). `src/devmode.ts` became a re-export of `devMode`/`sqlLogging` so existing import sites stay valid. `src/main.ts`, `src/apps/setup.ts`, `src/api/RequestBundlingAPI.ts`, and `src/services/DatabaseDriver.ts` now read the accessors instead of ad-hoc `process.env` reads; parse semantics (default `8000` for `PORT`, `"1"`-means-true flags, throw-on-missing `DATABASE_URL`, `BigInt` advisory lock with the existing default) are unchanged. `NODE_ENV` is exported but its consumer in `src/apps/login.ts` was left for TS-004, which owns the mode-flag semantics.

## Files Changed
- `src/services/Env.ts` — new central env module with typed accessors for all env vars
- `src/devmode.ts` — re-exports `devMode`/`sqlLogging` from the central module
- `src/main.ts` — `PORT` read via `envPort` accessor
- `src/apps/setup.ts` — `PORT` read via `envPort` accessor
- `src/api/RequestBundlingAPI.ts` — `PORT`/`INTERNAL_API_BASE_URL`/`BUNDLING_DEBUG` reads via accessors
- `src/services/DatabaseDriver.ts` — `DATABASE_URL`/`ADVISORY_LOCK` reads via accessors; advisory-lock default now lives in `Env.ts`

## Breaking Changes for Downstream Consumers
None for the existing surface: `@/devmode.ts` still exports `devMode`/`sqlLogging` with identical values. New exports (`@/services/Env.ts`) are additive. No env var names, defaults, or parse semantics changed.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- CFG-001 (env-var documentation and advisory-lock default deduplication in `.env`/docs) — separate fix definition.
- TS-004 (semantics of `DEV_MODE` vs `NODE_ENV`) — separate fix definition; `src/apps/login.ts:145` still reads `process.env.NODE_ENV` until TS-004 lands.
- TS-003 owns the `Bun.env` idiom decision inside the central module (adopted here: `Bun.env` is the accessor).

## Resolved Questions
None.
