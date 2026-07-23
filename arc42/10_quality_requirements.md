# 10 — Quality Requirements

This chapter maps the quality goals from chapter 1 to specific architectural solutions and design patterns.

## 10.1 Security (Q1 — High)

### Authentication

- All endpoints except `/api/health` and `/api/docs/*` require authentication.
- Three authentication methods: session cookie (OIDC), API key, Bearer token — checked in priority order.
- `onBeforeHandle` in `apps/api.ts` enforces authentication globally — individual route handlers don't need to check.
- OIDC flow uses PKCE (Proof Key for Code Exchange) to prevent authorization code interception.
- State and nonce parameters prevent CSRF and replay attacks.

### Authorization

- Fine-grained functional permissions control access to every operation.
- `authorize()` returns the intersection of requested and held permissions — callers check what was granted.
- API keys do NOT inherit root group privileges — even if the key's owner is a root group member.
- The `cfgRootUserGroup` is the **only** permission bypass.
- Product request permissions use a two-level precedence chain with six independent aspects per field.

### API Key Security

- API key secrets are hashed before storage — the plaintext is only shown once at creation.
- Configurable key length (32–256 characters) and validity period (1–730 days).
- Keys can be disabled or deleted. Disabled keys are retained but cannot authenticate.

### Data Protection

- Database credentials in `.env` file (git-ignored).
- OIDC client secrets stored in the database (not in environment variables or source code).
- The `AuditLog` records the identity of the actor for every mutation.

### Known Gaps

- **No rate limiting** — brute-force protection on API endpoints is not implemented.
- **No CORS configuration** — the API does not restrict cross-origin requests.
- **No CSP headers** — Content Security Policy is not configured.

## 10.2 Data Integrity (Q2 — High)

### Transaction Isolation

- All multi-step mutations run inside `runInTransaction()` with **serializable** isolation level.
- Prevents dirty reads, non-repeatable reads, phantom reads, and serialization anomalies.
- Product number generation uses `SELECT ... FOR UPDATE` row-level locking to prevent duplicate numbers.

### Optimistic Locking

- All entity mutations include `knownUpdatedAt` — server checks for concurrent modifications.
- Returns `409 Conflict` on mismatch, allowing the client to reload and retry.
- Prevents lost updates without holding pessimistic row locks.

### PubSub Consistency

- PubSub events are published **after** successful persistence, never before.
- If a transaction fails, no events are published.
- If publishing fails after persistence, a partial inconsistency exists (row committed, event not sent) — this is an accepted risk.

### Audit Trail

- Every mutation (create, update, delete, grant, revoke, disable, enable) is audited.
- Audit entries include actor identity, resource identifiers, and timestamps.
- Batched flush to database with failure retry.

### Known Gaps

- **No event sourcing** — if audit log desynchronizes from actual state, there is no rebuild path.
- **Serializable isolation** can cause transaction failures under high concurrency — automatic retry logic is not implemented.
- **PubSub publishing failures** are not retried — events are fire-and-forget.

## 10.3 Auditability (Q3 — High)

### Audit Log

- Immutable `audit_log` table — no update or delete of audit records (except `DELETE /api/audit_log` for clearing).
- Batched subscriber to PubSub — captures all mutation events.
- Configurable flush interval (default 60s) and batch size (default 500).
- Admin UI page for viewing and filtering audit entries.
- Failure recovery: if DB write fails, entries are re-queued for retry.

### Operational Visibility

- `GET /api/health` for liveness/readiness checks.
- Console logging in dev mode for startup sequence, route loading, and rebuilds.
- `@elysia/server-timing` in dev mode for request performance metrics.
- OpenAPI documentation at `/api/docs` and `llms.txt` at `/api/docs/llms.txt`.

### Known Gaps

- **No metrics export** — no Prometheus or StatsD integration.
- **No structured logging** — all logs are plain `console.log` / `console.warn` / `console.error`.
- **No health check depth** — `GET /api/health` doesn't verify database connectivity.

## 10.4 Maintainability (Q4 — High)

### Layered Architecture

- Strict layer boundaries with explicit import bans — each `AGENTS.md` defines what is allowed.
- 1:1 file naming convention matches domain entities across layers.
- Clear separation: schema (data definition), repo (data access), services (business logic), api (HTTP handling), ui (presentation).

### Code Generation

- `drizzle-typebox` auto-generates TypeBox schemas from Drizzle definitions — types stay in sync with schema.
- `_crud_Repo.ts` and `_crud_API.ts` factories eliminate boilerplate for standard configuration entities.
- `scripts/generate_types.ts` automates type generation; `typegen:watch` mode for development.

### Extension Points

- `app_PageRegistry.ts` is the extension point for domain page registrations that survive template updates.
- `ApplicationDefinedFunctionalPermissions.ts` is the extension point for domain-specific permissions.
- `src/ui/api/` wrappers provide a consistent API communication pattern.

### Documentation

- OpenAPI documentation auto-generated from Elysia route definitions.
- `AGENTS.md` files in every layer directory provide developer guidance.
- Design documents in `design/` capture architectural decisions.

### Known Gaps

- **No code coverage measurement** configured in test scripts.
- **No linting** — `prettier` is a devDependency but no lint step exists in `package.json` scripts.
- **The services `AGENTS.md` documents hierarchical topics** — outdated since the PubSub tag-based migration.

## 10.5 Configurability (Q5 — High)

### Database-Backed Configuration

- All runtime parameters stored in the `config` table, editable via admin UI.
- Setup wizard blocks startup until mandatory config is provided.
- Optimistic locking prevents concurrent editing conflicts.
- PubSub events published on config changes for real-time notification.

### Config Value Validation

- `parseConfigValue()` handles type-aware deserialization for 6 value types.
- `validateConfigInputFormat()` enforces regex-based validation rules.
- Setup wizard and admin UI both use the same validation logic.

### Known Gaps

- **Config caching without invalidation** — `RequestBundling.ts` caches config on first read; changes require restart.
- **No config versioning or audit** — config changes are audited as regular mutations but there's no config-specific history.
- **Config import/export** — no way to export/import configuration between environments.

## 10.6 Real-Time Updates (Q6 — Medium)

### Server-Sent Events

- SSE bridges PubSub events to browser clients with per-session tag expression filtering.
- Persistent filters survive browser disconnections (event queue up to 100 events, 30-minute TTL).
- Heartbeat keepalive every 25 seconds.
- Multi-tab support — shared filter, events split across tabs.

### PubSub Performance

- Tag-based expression matching with short-circuit evaluation (`or` stops at first match, `and` stops at first non-match).
- Subscriber counts are in the low tens — linear iteration is acceptable.
- No pre-filtering index needed at current scale.

### Known Gaps

- **No WebSocket fallback** — SSE requires `EventSource` support in the browser.
- **No client-side debouncing of rapid events** — UI re-renders on every event.
- **No event replay** — disconnected clients miss events that exceed the 100-event buffer.

## 10.7 Performance (Q7 — Medium)

### Request Bundling

- Coalesces multiple client mutations into a single HTTP request.
- NDJSON streaming enables progressive resolution.
- Benchmarks: 10 mutations go from 10 requests to 1 (4.5–5x reduction); 50 mutations go from 50 to ~5 (10x reduction).

### Client-Side Rendering

- 100% CSR eliminates server rendering overhead.
- ETag-based long-lived caching for the JS bundle (`max-age=31536000, immutable` in production).
- Single bundle — no chunk loading waterfall.

### Database

- Connection pool (max 10) with idle timeout.
- Serializable isolation — may cause retry overhead under high contention.
- No query result caching.

### Known Gaps

- **No response compression** — gzip/brotli not configured.
- **No CDN** — static assets served directly by Bun.
- **No database query optimization** — no query analysis or indexing strategy documented.
- **No performance monitoring** — no APM or tracing instrumentation.

## 10.8 Testability (Q8 — Medium)

### Unit Testing

- `bun test` with 30-second timeout.
- Tests are co-located or in `*.test.ts` files.

### End-to-End Testing

- Playwright as a library within `bun test` (not Playwright's own test runner).
- Real EntraID authentication — no auth bypass for tests.
- Three-stage test pyramid: API contract tests (40–60) → Page tests (20–30) → Workflow tests (10–16).
- Tag-based selective execution: `@smoke`, `@p0`, `@p1`, `@p2`, `@slow`.
- Test data prefixed with `E2E_` or `TEST_` for cleanup identification.

### Known Gaps

- **No CI/CD integration** — tests are run manually or via local scripts.
- **No coverage thresholds** — `bun test` doesn't enforce minimum coverage.
- **Playwright tests are planned but not yet implemented** — the design exists in `design/playwright_testing.md`.

## 10.9 Deployability (Q9 — Low)

### Single Process

- Single Bun process serves API, UI, and static assets.
- Single PostgreSQL database for all data.
- No separate services, databases, or caches to deploy.

### Startup Automation

- Umzug migrations run automatically at startup.
- Configuration setup wizard automates first-run setup.
- Graceful handling of external dependency failures (EntraID sync failure doesn't block startup).

### Known Gaps

- **No health check probes** — `GET /api/health` exists but no readiness/liveness split.
- **No graceful shutdown** — no signal handling for SIGTERM.
- **No zero-downtime deployment strategy** — in-memory sessions are lost on restart.
- **No Docker image** — deployment requires manual Bun runtime installation.

## 10.10 Quality Goal Summary

| ID | Quality Goal | Priority | Status |
|----|-------------|----------|--------|
| Q1 | Security | High | Implemented. Gaps: rate limiting, CORS, CSP headers. |
| Q2 | Data integrity | High | Implemented. Gaps: no retry logic for serialization failures. |
| Q3 | Auditability | High | Implemented. Gaps: no structured logging, limited health check. |
| Q4 | Maintainability | High | Implemented. Gaps: no lint script, outdated AGENTS.md docs. |
| Q5 | Configurability | High | Implemented. Gaps: config caching without invalidation, no import/export. |
| Q6 | Real-time updates | Medium | Implemented. Gaps: no WebSocket fallback, no event replay. |
| Q7 | Performance | Medium | Implemented. Gaps: no compression, no CDN, no query optimization. |
| Q8 | Testability | Medium | Planned. Gaps: E2E tests not yet implemented, no CI/CD. |
| Q9 | Deployability | Low | Implemented. Gaps: no Docker, no graceful shutdown, no zero-downtime deploy. |
