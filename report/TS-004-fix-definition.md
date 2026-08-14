# Fix Definition: TS-004 — Two production-mode flags with different semantics

## Source Finding
05-typescript-bun.md — `apps/login.ts:145` uses `NODE_ENV === "production"`; everything else uses `devMode` (`src/devmode.ts`, `package.json:22,24` sets `DEV_MODE=1` for dev, `NODE_ENV=production` for start); `ClientBuilder.ts:54-55` keys minify/sourcemap off `devMode`

## Human Directive
None — default interpretation applies.

## Target End State
One environment-mode idiom exists, exposed from the central env module created by ARCH-002: a single canonical production/dev determination that every consumer uses. `apps/login.ts:145` (Cache-Control on the login bundle) and `ClientBuilder.ts:54-55` (minify/sourcemap) read the same source, so running with neither flag set can no longer produce the incoherent combinations the finding names. The semantics chosen: **production is the default; dev behavior is opt-in via `DEV_MODE=1`** (matching `devMode = process.env.DEV_MODE === "1"` as the existing dominant idiom, and matching `package.json`'s scripts where `dev` sets `DEV_MODE=1`). `NODE_ENV` ceases to be load-bearing inside the application; `login.ts:145` uses the same "not devMode ⇒ production caching" expression as `ClientBuilder.ts`.

## Approach
- In the ARCH-002 central env module, expose the canonical mode accessor(s) (e.g. `devMode` and a derived `isProduction = !devMode`), sourced from `DEV_MODE` only.
- `src/apps/login.ts:145`: replace `process.env.NODE_ENV === "production"` with the canonical accessor (`!devMode`).
- Verify no other file reads `NODE_ENV` after the change (sweep); `package.json`'s `start` script may keep setting `NODE_ENV=production` harmlessly for ecosystem tooling, but the application no longer branches on it — or the script is simplified to drop it if nothing else consumes it (implementation verifies, e.g. Bun/Elysia do not need it).
- `src/devmode.ts` keeps its export names (per ARCH-002, it becomes a consumer/re-exporter of the central module).

## Affected Scope
- `src/apps/login.ts` — flag usage
- Central env module / `src/devmode.ts` — canonical accessor (shared work item with ARCH-002)
- `package.json` — possibly simplified `start` script
- Docs that mention the flags (`README.md`/`.env` example) — aligned if they reference `NODE_ENV` as load-bearing

## Explicit Constraints
- One canonical source for the mode; no file branches on `NODE_ENV` afterwards.
- Dev-mode behavior (verbose logs, no minify, no-cache) and production behavior (minify, immutable caching, per SEC-004's annotation the prod cookie posture) must be identical to today's intended states.
- Coordinate with ARCH-002 so the flag lives in the central module from the start; do not create a third flag location.

## Out of Scope
- ARCH-002 (env centralization generally) — separate fix definition; this fix decides only the mode-flag semantics and its two consumers.
- SEC-004 (cookie/CSRF posture) — unchecked per its annotation ("This is on purpose..."); this fix does not alter cookie logic, only which flag drives cache headers.
- CFG-001 (env documentation) — separate fix definition; flag documentation belongs there.

## Downstream Impact
Yes — `NODE_ENV` is no longer read by application code; deployment documentation or scripts that relied on it for app behavior must use `DEV_MODE` (absence ⇒ production). One-line note for downstream: set `DEV_MODE=1` for development, nothing for production.
