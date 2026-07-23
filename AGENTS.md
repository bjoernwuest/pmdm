# AGENTS.md – Repository Guidance for AI Coding Agents

This root file provides repo-wide guidance and a map of the repository. Folder-local `AGENTS.md` files take precedence for detailed, layer-specific rules.

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

- `.env` — local runtime configuration such as `DATABASE_URL` and `ADVISORY_LOCK`; keep it out of version control.
- `.gitignore` — ignore rules for generated output, local config, and template scratch files.
- `LICENSE` — project license text.
- `README.md` — template overview, setup instructions, and first-run guidance.
- `package.json` — package metadata, dependencies, and Bun scripts.
- `tsconfig.json` — TypeScript compiler configuration and the `@/*` path alias.
- `TODO.md` — informal backlog / scratchpad for follow-up work.

## Root directories

- `debug_analysis/` — investigation artifacts, logs, and captured debugging material.
- `design/` — architecture and design documents; read these before changing behavior that has a dedicated design note.
- `scripts/` — development and generation scripts such as type generation and migration-template generation.
- `src/` — application source code; see the `src/` subdirectory notes below.
- `static/` — static assets used by the application, such as CSS, images, fonts, and icons.

### Static asset subdirectories

- `static/public/` — publicly served assets, mounted without authorization.
- `static/` other than `static/public/` — static assets that are generally served only when the user is authenticated or during setup flows.

## `src/` subdirectories

The following folders already have their own `AGENTS.md` files unless noted otherwise:

- `src/api/` — REST route handlers, request/response schemas, and OpenAPI documentation.
- `src/apps/` — Elysia sub-application entry points that compose the server.
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
- Use the folder-local `AGENTS.md` files for detailed instructions when editing anything under `src/api/`, `src/apps/`, `src/login/`, `src/migrations/`, `src/repo/`, `src/schema/`, `src/services/`, `src/setup/`, `src/types/`, `src/ui/`, or `src/utils/`.
- Avoid duplicating detailed layer rules here unless they apply to the whole repository.
