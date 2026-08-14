# Fix TS-004 - Single production/dev mode idiom

## Source
- Finding: TS-004 (see /report/05-typescript-bun.md)
- Fix definition: /report/TS-004-fix-definition.md

## Summary of Change
Established one environment-mode idiom sourced from `DEV_MODE` only: `src/services/Env.ts` (the ARCH-002 central module) now exports `isProduction` (`!devMode`), `src/apps/login.ts`'s Cache-Control branch for the login bundle reads `!devMode` instead of `process.env.NODE_ENV === "production"`, and the `start` script in `package.json` no longer sets `NODE_ENV=production`. Semantics chosen per the definition: production is the default, dev behavior is opt-in via `DEV_MODE=1`. A grep sweep confirms no application code branches on `NODE_ENV` anymore (`Env.ts` still exports the raw value, marked non-load-bearing).

## Files Changed
- `src/services/Env.ts` — added `isProduction` derived accessor
- `src/apps/login.ts` — Cache-Control uses `!devMode` instead of `NODE_ENV === "production"`
- `package.json` — `start` script simplified to `bun dist/main.js`

## Breaking Changes for Downstream Consumers
Yes — `NODE_ENV` is no longer read by application code. Deployments or scripts that relied on `NODE_ENV` for app behavior must use `DEV_MODE` instead: set `DEV_MODE=1` for development, nothing for production (production is the default). Intended dev/prod behavior states (no-cache vs. minified/immutable-cache bundles) are unchanged.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- ARCH-002 (env centralization generally) — separate fix definition, implemented first; the flag lives in its central module.
- SEC-004 (cookie/CSRF posture) — unchecked per its annotation; cookie logic untouched, only the cache-header flag source changed.
- CFG-001 (env documentation) — separate fix definition; flag documentation belongs there.

## Resolved Questions
None.
