# 07 — Deployment View

## 7.1 Infrastructure Overview

PMDM is deployed as a **single Bun process** on a Linux host, connecting directly to a PostgreSQL database. There is no containerization, orchestration, or load balancing.

```
┌─────────────────────────────────────────────────────────────┐
│                      Linux Host                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  Bun Process                          │   │
│  │                                                       │   │
│  │  PORT: 8000 (configurable via env)                    │   │
│  │                                                       │   │
│  │  ┌─────────────────────────────────────────────┐     │   │
│  │  │  HTTP Server (Elysia.js)                    │     │   │
│  │  │                                             │     │   │
│  │  │  /login/*    OIDC auth flow                 │     │   │
│  │  │  /api/*      REST API (auth enforced)        │     │   │
│  │  │  /ui/client.js  JS bundle (ETag cached)     │     │   │
│  │  │  /public/*   Static assets                  │     │   │
│  │  │  /           SPA catch-all                   │     │   │
│  │  └─────────────────────────────────────────────┘     │   │
│  │                         │                             │   │
│  │  ┌──────────────────────▼───────────────────────┐    │   │
│  │  │  postgres pool (max 10 connections)          │    │   │
│  │  └──────────────────────┬───────────────────────┘    │   │
│  └─────────────────────────┼────────────────────────────┘   │
│                             │                                │
│                             │ TCP :5432                       │
│                    ┌────────▼────────┐                       │
│                    │   PostgreSQL    │                       │
│                    │   Database      │                       │
│                    │   (pmdm2)       │                       │
│                    └─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘

                               ▲
                               │ HTTPS (OIDC, Graph API)
                               │
                    ┌──────────┴──────────┐
                    │  Microsoft EntraID  │
                    │  (Azure cloud)      │
                    └─────────────────────┘
```

## 7.2 Runtime Requirements

| Requirement | Detail |
|-------------|--------|
| Runtime | Bun (latest stable) |
| Database | PostgreSQL (accessible via connection string) |
| Network | Outbound HTTPS to Microsoft EntraID (login, Graph API) |
| Port | `PORT` env var (default 8000) |
| Memory | No specific requirements; single process with in-memory session store |

## 7.3 Environment Variables

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://pmdm:****@10.0.1.2:5432/pmdm2` |
| `ADVISORY_LOCK` | Yes | Unique 64-bit integer for migration lock | `9158437265819472037` |
| `PORT` | No | HTTP listen port (default 8000) | `8000` |
| `DEV_MODE` | No | Enables dev mode (verbose logging, watch rebuilds) | `1` |
| `SQL_LOGGING` | No | Enables Drizzle SQL query logging | `1` |

The `.env` file is git-ignored and contains only `DATABASE_URL` and `ADVISORY_LOCK`. OIDC secrets (ClientID, ClientSecret, TenantID) are stored in the database `config` table, not in environment variables.

## 7.4 Build & Deployment Pipeline

### 7.4.1 Development

```bash
# Generate database migrations
bun run drizzle

# Generate TypeBox types from Drizzle schemas
bun run typegen

# Start dev server with hot reload
DEV_MODE=1 bun run dev
# (runs: DEV_MODE=1 bun src/main.ts)

# Run tests
bun test --timeout 30000
```

In dev mode:
- `DEV_MODE=1` enables verbose console logging for startup and route loading.
- `ClientBuilder.ts` watches source files and rebuilds the client bundle on changes.
- `@elysia/server-timing` adds performance headers.
- `Cache-Control` for `client.js` is `no-cache` (vs. `max-age=31536000, immutable` in production).

### 7.4.2 Production

```bash
# Build the application
bun run build
# (runs: bun build src/main.ts --target bun --outdir ./dist)

# Start the production server
NODE_ENV=production bun run start
# (runs: NODE_ENV=production bun dist/main.js)
```

The build step uses `bun build` with target `bun`, producing a single output directory (`./dist`). The production start runs the bundled output directly with Bun.

**No Docker image is built.** Deployment is expected to be a direct `bun dist/main.js` invocation on the host, possibly managed by a process supervisor (systemd, pm2, etc.).

### 7.4.3 Type Generation

```bash
# One-time generation
bun run typegen

# Watch mode (for development)
bun run typegen:watch
```

The `scripts/generate_types.ts` script uses `ts-morph` to parse Drizzle schema files and auto-generate `src/types/_*.ts` files with TypeBox schemas.

## 7.5 Static Assets

### 7.5.1 Asset Locations

| Path | Content | Auth Required |
|------|---------|---------------|
| `/public/*` | Public assets (CSS, images, fonts, icons) | No (before app mount, but caught by UI catch-all) |
| `/static/public/*` | Static public assets | No |
| `/ui/client.js` | Client React bundle (built by `ClientBuilder.ts`) | Yes (served via UI app) |
| `/login/client.js` | Login page bundle | No (served within login app) |
| `/setup/client.js` | Setup wizard bundle | No (served within setup app) |

### 7.5.2 Client Bundle Caching

| Mode | Cache-Control | ETag |
|------|--------------|------|
| Development | `no-cache` | SHA-256 of bundle content |
| Production | `max-age=31536000, immutable` | SHA-256 of bundle content |

The ETag enables conditional requests (`If-None-Match` → `304 Not Modified`). The bundle filename (`client.js`) is intentionally static — content changes are detected via ETag mismatch, not filename rotation.

## 7.6 Database Deployment

### 7.6.1 Connection Pool

The `postgres` npm package manages a connection pool with:
- **Max connections**: 10
- **Idle timeout**: 20 seconds
- **Connect timeout**: 10 seconds

The pool is created lazily on first `getDatabaseConnection()` call (a module-level singleton).

### 7.6.2 Migrations

Migrations run automatically at application startup (before any HTTP traffic):

```
initDatabase()
  ├─ Acquire pg_try_advisory_lock(ADVISORY_LOCK)
  ├─ Umzug.pending() → get pending migrations
  ├─ Umzug.up() → run each pending migration
  │   ├─ .ts files: execute JavaScript (direct DB operations via Drizzle)
  │   └─ .sql files: execute raw SQL
  ├─ Release pg_advisory_unlock(ADVISORY_LOCK)
  └─ Return
```

The advisory lock ensures only one application instance runs migrations at a time. If the lock cannot be acquired, the process blocks until the lock is released. Migration files are in `src/migrations/` with the format: `YYYYMMDDHHMMSS_description.{ts,sql}`.

### 7.6.3 Schema Overview

The database contains approximately 22 tables:
- `config` — Runtime configuration (domain + key composite PK)
- `users`, `groups`, `user_groups` — Identity and group membership (many-to-many)
- `user_profile_config` — Per-user configuration overrides
- `api_keys`, `api_key_functional_permissions` — Long-lived API authentication tokens with permission assignments
- `functional_permissions`, `functional_permissions_of_group` — Permission system
- `audit_log` — Immutable audit log
- `business_domains` — Organization categories
- `data_types`, `data_types_permissions` — Typed data field definitions (7 kinds) with permissions
- `product_types`, `product_types_data_types`, `product_types_data_types_target_systems`, `product_types_data_types_permissions`, `product_types_data_types_previous_approval` — Product type configuration
- `consumables`, `consumables_values` — Predefined selectable values
- `lookups`, `lookup_values` — Reference data tables
- `products`, `products_values` — Product instances
- `product_requests`, `product_requests_values` — Product request workflow
- `product_exports` — Export status tracking
- `target_systems` — External system definitions
- `product_number_state` — Sentinel table for product number generation (`SELECT ... FOR UPDATE`)

## 7.7 Startup Dependencies

The startup sequence has one external dependency that can fail gracefully:

| Dependency | Critical | Fallback |
|------------|----------|----------|
| PostgreSQL | **Yes** | Application cannot start. Migration and config checks fail. |
| Microsoft EntraID (sync) | No | Start continues; `console.warn` logged. Sync retries on cron schedule. |
| Microsoft EntraID (login) | No | Login will fail when attempted, but server starts. |

## 7.8 Logging & Monitoring

| Aspect | Implementation |
|--------|---------------|
| Application logs | `console.log` / `console.warn` / `console.error` to stdout/stderr |
| Dev mode logging | Verbose startup steps, route loading, bundle rebuilds |
| Health check | `GET /api/health` returns `{ status: "ok", ... }` |
| Audit log | All mutations recorded to `audit_log` table via PubSub subscription |
| Error handling | PubSub subscriber errors swallowed by default (`immediateExceptions: false`) and re-thrown via `setTimeout` |

## 7.9 Backup & Recovery

- **Database**: Standard PostgreSQL backup strategies apply (pg_dump, WAL archiving, replication).
- **Application state**: No state outside the database. Session store is in-memory — lost on restart.
- **Configuration**: All runtime configuration is in the database. The `.env` file only contains `DATABASE_URL` and `ADVISORY_LOCK`.
- **Migration rollback**: Umzug supports `down()` functions in migration files for manual rollback.
