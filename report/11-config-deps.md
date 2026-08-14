# 11 — Configuration, Environment, Secrets & Dependencies

## Rubric
Per root AGENTS.md and `design/configuration.md`: configuration follows the `Config` structure, env vars are documented and parsed in one place, secrets stay out of version control, dependency hygiene matches runtime vs dev needs, and runtime-config edits via the admin UI take effect (the config system advertises `editInUI`). Good means: no duplicated magic values, no forever-cached config, and a single production-flag idiom.

### [CFG-001] Env var surface undocumented and parsed ad hoc; duplicated advisory-lock value
- **Location(s):** root AGENTS.md documents only `DATABASE_URL` and `ADVISORY_LOCK`; code additionally reads `APP_BASE_URL`, `PORT` (`main.ts:83`), `DEV_MODE`/`SQL_LOGGING` (`src/devmode.ts`), `INTERNAL_API_BASE_URL`/`BUNDLING_DEBUG` (`RequestBundlingAPI.ts:144,265`), `NODE_ENV` (`apps/login.ts:145`); the advisory-lock default `-7482650123549836421n` is duplicated in `.env:2` and `DatabaseDriver.ts:114`
- **Description:** No central env module; the same magic value lives in two files.
- **Why it matters:** Onboarding docs mislead; changing one lock value without the other silently defeats the multi-instance protection intent.
- **Related findings:** ARCH-002, TS-004, DOC-003

### [CFG-002] Runtime config edits silently do not apply to some subsystems
- **Location(s):** `sessionTimeOut` cached forever at module level (`Auth.ts:108-120`, never invalidated despite config `TAG_UPSERT` events); bundling config cached forever (`RequestBundling.ts:37-38`); `userFunctionalPermissionsCache` declared but never populated, only deleted (`Auth.ts:660,724`) — dead cache; `isMemberOfRootUserGroup` performs 2 DB queries per call (`Auth.ts:676-681,712-719`) on every `authorize`
- **Description:** Some config values are read once per process, others per request, with no shared invalidation policy; one cache is dead.
- **Why it matters:** The `editInUI` promise of the config system is broken for session timeout and bundling settings; the hot-path bypass check hits the DB twice per permission check.
- **Related findings:** PATT-006, CPLX-004

### [CFG-003] Dependency hygiene issues
- **Location(s):** `package.json:39` — `playwright` in `dependencies` (shipped to production installs) rather than devDependencies; `:48-50` — global `overrides` pinning `@sinclair/typebox` to `0.34` across all transitive deps; `peerDependencies` declares `typescript ^6.0.3` while nothing installs it
- **Description:** Runtime dependencies include a test framework; a global override constrains transitive dependencies; a peer dependency is unmet.
- **Why it matters:** Heavier production installs; the typebox override can silently break Elysia/drizzle-typebox expectations; the TS version requirement is not enforced.
- **Related findings:** —

### [CFG-004] `cfgRootUserGroup` is a runtime-mutable privilege bypass
- **Location(s):** `Auth.ts:102` (`editInUI: true`), `:676-681` (read with `as string` cast), `:712-719`
- **Description:** The only permission bypass in the system is a config entry editable through the admin UI by anyone holding `FP_MANAGE_CONFIGURATION`.
- **Why it matters:** Privilege escalation by design: a config manager can add themselves to the root group at runtime.
- **Related findings:** TS-001

### [CFG-005] Test environment config contradictions
- **Location(s):** `.env.test` path mismatch (`tests/AGENTS.md:24` + `.gitignore:5` = `tests/.env.test` vs `tests/helpers/env.ts:37` reads project-root `.env.test`); base-URL default 3000 in code vs 8000 in design (`env.ts:60` vs `design/playwright_testing.md:119,346`); `.gitignore:18` ignores the entire `/tests/` directory with the note "Remove once tests are working"
- **Description:** The documented env-file location is never read; the read location is not ignored; the whole test tree is git-ignored.
- **Why it matters:** A `.env.test` placed per the docs has no effect; one placed per the code risks being committed; test infrastructure versioning state is unclear.
- **Related findings:** TEST-009, NAME-012
