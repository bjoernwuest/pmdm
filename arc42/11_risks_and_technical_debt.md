# 11 — Risks and Technical Debt

## 11.1 Technical Risks

### TR-1: Serializable Transaction Failures Under Load

**Risk**: `runInTransaction()` uses PostgreSQL `serializable` isolation for all multi-step mutations. Under high concurrent load, serialization failures increase, causing transactions to abort. There is **no automatic retry logic** — client requests will simply fail.

**Impact**: Medium — affects concurrent operations on the same entities (product request approval, configuration edits).

**Probability**: Low at current scale. Increases with user count and concurrent usage.

**Mitigation**: Implement automatic retry with exponential backoff in `runInTransaction()`. Document the need for idempotent transaction callbacks.

### TR-2: In-Memory Session Loss on Restart

**Risk**: All user sessions are stored in a `TTLMap` (in-memory). A server restart or crash loses all sessions, requiring all users to re-authenticate.

**Impact**: Medium — user experience disruption on deployment or crash.

**Probability**: High on deployment; low for unplanned crashes.

**Mitigation**: Consider session persistence to database or Redis for production deployments. Accept as trade-off for simplicity in current scope.

### TR-3: Single Point of Failure

**Risk**: The application is a single Bun process with a single PostgreSQL database. No clustering, replication, or failover is configured. A crash of either component takes the entire application offline.

**Impact**: High — complete service outage.

**Probability**: Low for Bun process crash (Bun is stable); medium for database issues.

**Mitigation**: Set up PostgreSQL replication/backup. Consider a process supervisor (systemd, pm2) for auto-restart. For higher availability, consider Bun clustering or a reverse proxy with health checks.

### TR-4: EntraID Dependency for Login

**Risk**: Authentication requires Microsoft EntraID to be reachable. If EntraID is down, no users can log in (though existing sessions continue working until expiry).

**Impact**: Medium — no new logins during EntraID outage.

**Probability**: Low (EntraID SLA is high).

**Mitigation**: The session TTL of 15 minutes with auto-refresh means short EntraID outages are mostly invisible. For longer outages, a degraded mode or offline authentication would be needed.

### TR-5: No Rate Limiting

**Risk**: No rate limiting on API endpoints. Malicious or buggy clients could overwhelm the server with requests.

**Impact**: Medium — degraded performance or denial of service.

**Probability**: Low for internal applications; medium for internet-facing deployments.

**Mitigation**: Implement rate limiting middleware in Elysia, at minimum for the login and API endpoints. Consider per-IP and per-API-key limits.

## 11.2 Known Technical Debt

### TD-1: Outdated AGENTS.md Documentation

**Location**: `src/services/AGENTS.md` and potentially other layer-level AGENTS.md files

**Issue**: AGENTS.md files may document outdated conventions or patterns that no longer match the codebase. Regular audits are needed to keep them in sync.

**Impact**: New developers may write incorrect code following outdated AGENTS.md instructions.

**Fix**: Regular review of all AGENTS.md files against current codebase conventions. Ensure PubSub documentation matches tag-based model, not hierarchical topics.

### TD-2: Config Caching Without Invalidation

**Location**: `src/services/RequestBundling.ts`

**Issue**: `getRequestBundlingServerConfig()` and `getRequestBundlingClientRuntimeConfig()` cache config values in module-level variables. Once loaded, config changes in the database do not take effect until the server restarts, even though the admin UI allows editing them.

**Impact**: Operators editing bundling thresholds in the admin UI would see no effect until restart.

**Fix**: Subscribe to PubSub `["config", "update"]` events to invalidate the cache, or read from DB on every request (with appropriate caching TTL).

### TD-3: No Lint or Format Check in CI

**Location**: `package.json` scripts

**Issue**: `prettier` is a devDependency but no `lint` or `format:check` script exists. No CI pipeline enforces code style.

**Impact**: Inconsistent code formatting over time.

**Fix**: Add `"format": "prettier --write ."` and `"format:check": "prettier --check ."` scripts. Add TypeScript type checking (`tsc --noEmit`). Consider adding a CI configuration.

### TD-4: Product Export `importing` → `done` Transition Deferred

**Location**: `design/product_export.md`, referenced in `design/product_request.md`

**Issue**: The `importing` → `done` status transition for product requests (which creates/updates the actual `Product` row and transitions the request to `done`) is documented as deferred. Only `open` → `importing` is implemented.

**Impact**: Product requests that reach `importing` status cannot be completed to `done`. The workflow is incomplete.

**Fix**: Implement the deferred transition per `design/product_export.md`. This includes `checkAndTransitionToDone()` logic, `Product` creation/update from request values, and handling of `editableOnUpdate: false` exclusions.

### TD-5: Stub Endpoints

**Location**: `src/api/ProductAPI.ts`

**Issue**: The `request-update` and `copy` endpoints were originally stubs. Per `design/product_request.md`, they have been or need to be replaced with real implementations. Verify current status.

**Fix**: If still stubs, implement them. If implemented, remove the "stub" designation from design docs.

### TD-6: Shared Component Extraction Deferred

**Location**: `design/components.md`

**Issue**: Three shared UI components were identified for extraction from `ConfigurationDataTypeDetail.tsx`:
- `PermissionChipManager` — partially extracted (part of product-types implementation)
- `SaveRestoreField` — deferred
- `MonacoField` — deferred

**Impact**: Code duplication in pages that use similar permission management, inline editing, or code editing patterns.

**Fix**: Extract `SaveRestoreField` and `MonacoField` to `src/ui/components/`. Ensure `PermissionChipManager` is fully extracted.

### TD-7: No Graceful Shutdown

**Location**: `src/main.ts`

**Issue**: No signal handler for SIGTERM/SIGINT. The server does not drain connections, flush audit log batches, or close DB connections before exiting.

**Impact**: In-flight requests are terminated. Audit log entries in the in-memory batch are lost. Database connections are left open until they timeout.

**Fix**: Add signal handlers that gracefully close the HTTP server, call `stopAuditLog()`, and call `closeDatabaseConnection()`.

### TD-8: No Database Indexing Strategy Documented

**Location**: Schema definitions

**Issue**: No explicit database indexes are defined in the schema files (besides primary keys and foreign keys auto-indexed by PostgreSQL). As the data grows, query performance on search fields (name, productNumber) may degrade.

**Impact**: Slow queries on large datasets.

**Fix**: Audit query patterns in repos. Add indexes for commonly searched/filtered columns (e.g., `name` on configuration entities, `productNumber` on products, `status` on product requests, `domain` + `key` on config entries — though that's already a composite PK).

### TD-9: E2E Tests Not Yet Implemented

**Location**: `design/playwright_testing.md`

**Issue**: A comprehensive Playwright E2E testing plan exists but tests are not yet implemented.

**Impact**: No automated end-to-end test coverage. Regression risk during development.

**Fix**: Implement the three-stage test pyramid as designed: API contract tests → Page tests → Workflow tests.

### TD-10: Page Default Path FIXME

**Location**: `src/ui/PageRegistry.ts:186`

**Issue**: A `FIXME` comment notes that the `getDefaultPath()` function should read the default path from a user profile rather than computing it from granted permissions. The fallback is `"/"` which may not have a registered page.

**Impact**: Users with no permissions could land on a blank page.

**Fix**: Implement user profile-based default path or ensure a fallback page exists at `/`.

## 11.3 Architectural Risks

### AR-1: Factory Pattern Limitations

The `_crud_Repo` and `_crud_API` factories serve most entities well, but the exceptions are significant:
- **Products** (custom PK type)
- **DataTypes** (discriminated config union)
- **ProductTypes** (nested sub-entities)
- **ProductRequests** (workflow state machine)
- **Config** (composite PK, different semantics)

If more entities need custom behavior, the factory approach may need extension (e.g., making the factory more configurable) or replacement (e.g., composition over inheritance).

### AR-2: Tag-Based PubSub Migration Completeness

The PubSub migration from hierarchical topics to tag-based expressions has been fully executed in code. However, the `src/services/AGENTS.md` still documents the old model, and there may be uncaught regressions where publishers use old-style topic strings.

### AR-3: TypeBox Schema Drift

Auto-generated TypeBox schemas in `_*.ts` files can drift from the actual Drizzle schema if `typegen` is not run after every schema change. There is no CI check to verify that generated types match the current schema.

## 11.4 Risk Matrix

| Risk | Impact | Probability | Priority |
|------|--------|-------------|----------|
| Serializable transaction failures | Medium | Low (growing) | Medium |
| Session loss on restart | Medium | High | Medium |
| Single point of failure | High | Low | High |
| EntraID dependency | Medium | Low | Low |
| No rate limiting | Medium | Low | Medium |
| Outdated AGENTS.md | Low | Present | Low |
| Config cache staleness | Low | Present | Low |
| Incomplete workflow (importing→done) | Medium | Present | High |
| No E2E tests | Medium | Present | Medium |
| No graceful shutdown | Low | Present | Low |
