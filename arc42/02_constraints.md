# 02 — Constraints

## 2.1 Technical Constraints

| ID | Constraint | Rationale / Source |
|----|-----------|--------------------|
| TC1 | **Bun runtime** | The application targets the Bun JavaScript runtime. All server-side code must be compatible with Bun's APIs. `package.json` scripts use `bun` for development, building, and testing. |
| TC2 | **TypeScript** (peerDependency ^6.0.3) | All source code is written in TypeScript. `tsconfig.json` enables strict mode, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and `noImplicitOverride`. |
| TC3 | **PostgreSQL database** | The only supported database. Connection is configured via the `DATABASE_URL` environment variable. Drizzle ORM is used for schema definitions and queries. |
| TC4 | **ESM-only** | `"type": "module"` in `package.json`. All imports use ESM syntax with `.ts` extensions (`allowImportingTsExtensions: true`). |
| TC5 | **No SSR** | The frontend is 100% client-side rendered. `src/ui/index.tsx` mounts React in the browser. The server serves an HTML shell with a `<script>` tag pointing to the client bundle. |
| TC6 | **Microsoft EntraID for auth** | User authentication is exclusively via OIDC against Microsoft EntraID. No local username/password authentication exists. The EntraID sync service imports users and groups via Microsoft Graph API. |
| TC7 | **Umzug migrations** | Database migrations are managed programmatically by Umzug (not Drizzle Kit migrations at runtime). Migrations run on startup within an advisory lock. Both `.ts` and `.sql` migration files are supported. |
| TC8 | **Path alias `@/*` → `./src/*`** | All internal imports use the `@/` prefix configured in `tsconfig.json`. |

## 2.2 Organizational Constraints

### 2.2.1 Layered Architecture with Import Bans

The codebase is organized into strict layers. Each layer has an `AGENTS.md` file that defines which imports are **allowed** and which are **forbidden**. The layers, from outermost to innermost:

| Layer | Directory | May Import From | Must NOT Import From |
|-------|-----------|-----------------|----------------------|
| API | `src/api/` | `@/services/Auth.ts`, `@/repo/*`, `@/services/DatabaseDriver.ts` (only `runInTransaction`), `@/types/*`, other route files | `@/schema/*`, `@/ui/*`, `drizzle-orm` directly |
| Apps | `src/apps/` | `@/services/*`, `@/api/*` (via auto-loading), Elysia composition | Domain business logic, repository mutations |
| Services | `src/services/` | `@/repo/*`, other `@/services/*` (avoid circular), `drizzle-orm` helpers (conditions only) | `@/schema/*`, `@/apps/*`, `@/api/*`, `drizzle-orm/postgres-js`, `postgres` (except `DatabaseDriver.ts`) |
| Repo | `src/repo/` | `@/schema/*`, `drizzle-orm` | `@/api/*`, `@/services/*`, `@/ui/*` |
| Schema | `src/schema/` | `drizzle-orm` only, internal files | **Nothing outside this directory** |
| Types | `src/types/` | `@sinclair/typebox`, `elysia`, `react`, `src/types/**` | Node.js APIs (must be browser-compatible) |
| UI | `src/ui/` | `@/ui/api/*` for API calls, `@/types/*`, React, PrimeReact | Raw `fetch()` in page components, backend-only modules |

### 2.2.2 Code Conventions

- **PascalCase filenames** matching the domain entity: `UserRepo.ts`, `UserAPI.ts`, `UserSchema.ts`, `UserType.ts`.
- **Default exports** for API route files (required for auto-loading). Each exports a `register(app: ApiInstance)` function annotated with `// noinspection JSUnusedGlobalSymbols`.
- **Named exports** for everything else.
- **`satisfies` operator** used for type-safe config objects and Drizzle schema selections.
- **Optimistic locking** via `updatedAt` field: read it from the server, round-trip it through the UI and API, include it in update/delete checks. Return `409 Conflict` on mismatch.
- **PubSub after mutation**: Publish PubSub events only after successful persistence, never before.
- **Transactions**: Use `runInTransaction()` from `DatabaseDriver.ts` for multi-step mutations. It uses `serializable` isolation level.
- **`cfgRootUserGroup` bypass**: Members of the configured root user group have full permissions. This is the **only** permission bypass.
- **API keys get no root bypass**: API key authentication never inherits root group privileges.

### 2.2.3 Type System Conventions

- **Two-file pattern**: Auto-generated `_<Name>.ts` files (from Drizzle schemas via `drizzle-typebox`) are read-only. User-editable `<Name>.ts` files re-export everything from the `_` file and add custom types, TypeBox schemas, and PubSub topic constants.
- **Never import from `_` files directly** — always use the user-editable wrapper.
- **TypeScript version**: peerDependency at `^6.0.3`.
- **TypeBox version**: Pinned to `0.34` via `overrides` in `package.json`.

### 2.2.4 API Route Conventions

- Every API route file exports a single default function `register(app: ApiInstance)`.
- Routes are auto-loaded via `Bun.Glob("**/!(*.test).ts")` in `apps/api.ts`.
- All routes except `/api/health` and `/api/docs/*` require authentication (enforced by `onBeforeHandle`).
- All routes must include full OpenAPI `detail` with `response`, `body`, `params`, and `query` schemas.
- Auth context (`session`, `apiKeyAuth`, `isAuthenticated`, `authMethod`, `tokenClaims`) is pre-derived globally — handlers never re-derive it.
- Handlers check functional permissions via `authorize(context.dbClient, claims, [FP_*])`.
- Pagination follows a consistent pattern provided by `_crud_API.ts`.

### 2.2.5 Repository Conventions

- **1:1 mapping with schemas**: `XxxSchema.ts` → `XxxRepo.ts`.
- **Full Drizzle encapsulation**: No raw Drizzle ORM queries leak out of this layer. Only clean async functions are exported.
- **Never export raw query builders** or DB connections.

## 2.3 Deployment Constraints

| ID | Constraint | Description |
|----|-----------|-------------|
| DC1 | Single process | The application runs as a single Bun process. No separate API server, worker processes, or microservices. |
| DC2 | Direct PostgreSQL connection | The application connects directly to PostgreSQL via the `postgres` npm package. No connection pooling middleware. Pool size: max 10 connections. |
| DC3 | No containerization | No Docker files, Kubernetes manifests, or container orchestration. Deployment is direct Bun runtime on a host. |
| DC4 | Environment configuration | Configuration via `.env` file (`DATABASE_URL`, `ADVISORY_LOCK`, `PORT`). The `.env` file is git-ignored. |
| DC5 | No CDN | Static assets (CSS, images, client JS bundle) are served directly by the Bun server. |

## 2.4 Browser Compatibility

The frontend targets modern browsers with ES module support and `EventSource` API for SSE. No polyfills are included. Tested via Playwright with Chromium.
