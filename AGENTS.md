# AGENTS.md – Repository Guidance for AI Coding Agents

This root file provides repo-wide guidance and a map of the repository. **Precedence:** sub-directory `AGENTS.md` files take precedence over parent `AGENTS.md` files (and over this root file) for the layers they govern. Where a folder restates a root rule, the folder's operational detail wins; the root file keeps the policy statement.

## Project-wide rules

- The stack is Elysia.js + React + PostgreSQL + Bun + TypeScript.
- The frontend is 100% client-side rendered.
- Each Elysia sub-application gets its own client JavaScript bundle with long-lived caching and ETag support.
- Configuration parameters must follow the `Config` structure documented in `design/configuration.md`.
- Request bundling is the normal path for mutating client requests; use the helpers in `src/ui/api/` instead of calling `fetch()` directly from domain UI code.
- Database mutations must stay inside `src/repo/`; use `runInTransaction()` from `src/services/DatabaseDriver.ts` for multi-step mutations.
- Optimistic locking uses the `updatedAt` field: read it from the server, round-trip it through UI/API, and include it in update/delete checks. Return `409 Conflict` on mismatch.
- PubSub / Server-Sent-Event updates should be narrowly scoped to the affected resources and published only after the mutation succeeds.
- Client and server both validate input; permissions must always be checked on the server.
- Members of `cfgRootUserGroup` have full permissions and this is the only permission bypass.
- All UI text must be in English.
- Unit tests are expected to run with `bun test`; Playwright is the E2E path.
- When functionality changes, review and update existing tests as needed.

## Root files

- `.env` — local runtime configuration; keep it out of version control. The complete environment-variable surface read by this project:

| Variable | Meaning | Default | Where consumed |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | none — startup fails without it | `src/services/Env.ts` (throws at module load) |
| `ADVISORY_LOCK` | Advisory-lock id for programmatic migrations | `-7482650123549836421` (single source: `defaultAdvisoryLockId` in `src/services/Env.ts`) | `src/services/DatabaseDriver.ts` `initDatabase()` |
| `APP_BASE_URL` | Base URL used by the Playwright E2E test infrastructure | `http://localhost:8000` (test-side fallback) | E2E test setup per `design/playwright_testing.md`; not read by application code |
| `PORT` | HTTP server port | `8000` | `src/services/Env.ts` (`port`); `src/main.ts`, `src/apps/setup.ts` |
| `DEV_MODE` | Opt-in development mode (`"1"`) | unset ⇒ production behavior | `src/services/Env.ts` (`devMode`/`isProduction`) |
| `SQL_LOGGING` | Drizzle SQL logging (`"1"`) | unset | `src/services/Env.ts` (`sqlLogging`) |
| `INTERNAL_API_BASE_URL` | Base URL for request-bundling loopback calls | falls back to `http://localhost:<PORT>` | `src/api/RequestBundlingAPI.ts` |
| `BUNDLING_DEBUG` | Extra request-bundling debug logging (`"1"`) | unset | `src/api/RequestBundlingAPI.ts` |
| `TRUST_PROXY` | Trust `X-Forwarded-Proto`/`X-Forwarded-Host` (`"1"`) | unset ⇒ forwarded headers ignored | `src/services/Env.ts` (`trustProxy`); `src/utils/ProxyHeaders.ts`; configuration instructions in `README.md` |
| `NODE_ENV` | Not load-bearing; exported raw only | unset | `src/services/Env.ts` (`nodeEnv`) |
- `.gitignore` — ignore rules for generated output, local config, and template scratch files.
- `LICENSE` — project license text.
- `README.md` — template overview, setup instructions, and first-run guidance.
- `package.json` — package metadata, dependencies, and Bun scripts.
- `tsconfig.json` — TypeScript compiler configuration and the `@/*` path alias.
- `TODO.md` — git-ignored scratch file, not part of the project documentation; its content is void (the file instructs readers to ignore it).

## Root directories

- `debug_analysis/` — investigation artifacts, logs, and captured debugging material.
- `design/` — architecture and design documents; read these before changing behavior that has a dedicated design note.
- `scripts/` — development and generation scripts such as type generation and migration-template generation.
- `src/` — application source code; see the `src/` subdirectory notes below.
- `static/` — static assets used by the application, such as CSS, images, fonts, and icons.

### Static asset subdirectories

- `static/public/` — publicly served assets, mounted without authorization at `/static/public/*`.
- `./public/` (repo root) — mounted without authorization at `/public/*` (`src/main.ts`). The directory may not exist in the base template; it is available for derived projects, and `Bun.file` returns misses (404s) for absent files. Requests with dot-segment traversal (`/public/../…`, encoded variants) are normalized before routing or treated as literal filenames and cannot escape the `./public/` root.
- `static/` other than `static/public/` — static assets that are generally served only when the user is authenticated or during setup flows.

## `src/` subdirectories

The following folders already have their own `AGENTS.md` files unless noted otherwise:

- `src/api/` — REST route handlers, request/response schemas, and OpenAPI documentation.
- `src/apps/` — Elysia sub-application entry points that compose the server.
- `src/autostart/` — startup tasks (croner jobs, background services, subscribers) that are auto-discovered on startup by [`src/main.ts`](src/main.ts) (convention-based, no explicit import needed). See [`design/autostart.md`](design/autostart.md) for the contract and how-to-use guide.
- `src/login/` — login application assets and entry points for OIDC authentication.
- `src/migrations/` — generated Umzug/Drizzle migration files and their template hooks.
- `src/repo/` — data-access layer; all database mutations are encapsulated here.
- `src/schema/` — Drizzle schema definitions and related schema-local constants.
- `src/services/` — business logic, configuration, auth, PubSub, and integration services.
- `src/setup/` — setup wizard application used when mandatory configuration is missing.
- `src/types/` — shared TypeScript and TypeBox definitions, including generated browser-safe types.
- `src/ui/` — browser-only React application, API wrappers, and UI page registry.
- `src/utils/` — miscellaneous reusable utilities.

## Working with the layered guidance

- Keep root-level changes focused on repository-wide conventions and cross-cutting structure.
- Use the folder-local `AGENTS.md` files for detailed instructions when editing anything under `src/api/`, `src/apps/`, `src/autostart/`, `src/login/`, `src/migrations/`, `src/repo/`, `src/schema/`, `src/services/`, `src/setup/`, `src/types/`, `src/ui/`, or `src/utils/`.
- Avoid duplicating detailed layer rules here unless they apply to the whole repository.
