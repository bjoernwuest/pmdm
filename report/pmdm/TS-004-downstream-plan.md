# Downstream Plan: TS-004 — Single production-dev mode idiom

## Upstream Change
Reference: `/report/Fix TS-004 - Single production-dev mode idiom.md`. `NODE_ENV` is no longer read by application code; the single production/dev mode idiom is `DEV_MODE=1` for development, nothing for production (production is the default). Intended dev/prod bundle behavior unchanged.

## Upstream's Own Assessment
"Yes — `NODE_ENV` is no longer read by application code. Deployments or scripts that relied on `NODE_ENV` for app behavior must use `DEV_MODE` instead: set `DEV_MODE=1` for development, nothing for production (production is the default). Intended dev/prod behavior states (no-cache vs. minified/immutable-cache bundles) are unchanged."

## Applicability to This Project
Affected: No

Evidence:
- Project-wide search: the only `NODE_ENV` references are the shared `src/services/Env.ts` accessor/comment ("not load-bearing inside application code"). No pmdm-owned code or script reads `NODE_ENV` for behavior.
- `package.json` scripts already use the canonical idiom (`"dev": "DEV_MODE=1 bun src/main.ts"`, `"start": "bun dist/main.js"`).
- The mode-flag consumer in `src/apps/login.ts` (shared) was fixed via the merge.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
