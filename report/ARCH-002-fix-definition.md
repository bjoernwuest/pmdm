# Fix Definition: ARCH-002 — Environment-variable reading duplicated across entry points, no central env module

## Source Finding
01-architecture-structure.md — `src/main.ts:83`, `src/apps/setup.ts:228` (`Number(process.env.PORT) || 8000` duplicated verbatim), `src/api/RequestBundlingAPI.ts:142-144`, `src/services/DatabaseDriver.ts:30,114`, `src/devmode.ts:2,4`

## Human Directive
None — default interpretation applies.

## Target End State
A single server-side env module exports one parsed, typed accessor per environment variable (`PORT`, `DATABASE_URL`, `ADVISORY_LOCK`, `INTERNAL_API_BASE_URL`, `BUNDLING_DEBUG`, `DEV_MODE`, `NODE_ENV`, `SQL_LOGGING`). Every use site listed above reads from that module; the string `process.env` no longer appears in `src/main.ts`, `src/apps/setup.ts`, `src/api/RequestBundlingAPI.ts`, `src/services/DatabaseDriver.ts`, or `src/devmode.ts` outside the central module. Parsing rules (default `8000` for `PORT`, `"1"`-means-true flags, missing-`DATABASE_URL` startup error, `BigInt` advisory lock with the existing default) behave exactly as today.

## Approach
Create one central env module (placed under `src/services/`, consistent with the layer that owns cross-cutting configuration). Each variable gets a named export with a single canonical parse; boolean flags keep the `=== "1"` convention; `PORT` keeps its `Number(...) || 8000` semantics; `DATABASE_URL` keeps its throw-on-missing behavior (the throw may move into the accessor). `src/devmode.ts` becomes a consumer of the central module (or is folded into it, keeping the `devMode`/`sqlLogging` export names as re-exports so existing import sites stay valid). All call sites are switched to the named accessors. This is a pure refactor of where parsing lives, not of values or defaults.

## Affected Scope
- New central env module under `src/services/`
- `src/devmode.ts` — becomes consumer or re-exporter
- `src/main.ts`, `src/apps/setup.ts`, `src/api/RequestBundlingAPI.ts`, `src/services/DatabaseDriver.ts` — replace ad-hoc `process.env` reads
- A repo-wide sweep at implementation time to catch any `process.env` reads the finding did not enumerate

## Explicit Constraints
- No change to any variable name, default value, or parse semantics observable at runtime.
- The fix centralizes *parsing* only; documenting the env-var surface is CFG-001's scope and must not be duplicated here.
- The duplicated advisory-lock default value is CFG-001's scope; this fix may reference the shared accessor but the deduplication decision belongs to CFG-001.

## Out of Scope
- CFG-001 (env documentation, advisory-lock constant duplication) — separate fix definition.
- TS-004 (two production-mode flags with different semantics) — the semantic question of `DEV_MODE` vs `NODE_ENV` is resolved there; this fix only centralizes where both are read.
- DB-backed `Config` structure — unrelated to process env vars.

## Downstream Impact
Yes — new module exports; import sites across entry points, services, and the API layer are updated. No env var names or values change, so deployment configuration is unaffected.
