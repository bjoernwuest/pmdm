# 09 — Architectural Decisions

This section documents key architectural decisions (ADRs) with their rationale and trade-offs.

## ADR-001: Strict Layered Architecture with Import Bans

**Status**: Accepted  
**Date**: Project inception

### Context

The application needed a maintainable codebase with clear separation of concerns, preventing business logic from leaking into HTTP handlers, database access from leaking out of repositories, and schema-level imports from creating tight coupling.

### Decision

A rigid layered architecture was chosen with **explicit import bans** documented in `AGENTS.md` files in each layer directory:

```
API → Services → Repo → Schema
         │          │
         └──────────┴──→ Types (shared, browser-compatible)
```

- **Schema** is strictly isolated (only `drizzle-orm` imports).
- **Repo** fully encapsulates Drizzle ORM — no raw queries leak out.
- **Services** is the only layer with business logic. Only `DatabaseDriver.ts` may import `drizzle-orm/postgres-js`.
- **API** handlers do not contain domain logic — only data retrieval, filtering, merging, and response shaping.
- **Apps** only compose and mount sub-applications.

### Consequences

- ✅ Clear boundaries make it easy to locate and modify code.
- ✅ New developers can quickly understand where code belongs.
- ✅ The CRUD factory pattern is possible because repository and API patterns are consistent.
- ❌ Strict import bans mean some seemingly reasonable imports are disallowed (e.g., API handlers cannot import `drizzle-orm` helpers directly; they must go through repos).
- ❌ Refactoring requires touching multiple layers.

## ADR-002: Generic CRUD Factories for Configuration Entities

**Status**: Accepted  
**Date**: Project inception

### Context

Multiple domain entities (business domains, consumables, lookups, target systems) share an identical pattern: entity identified by UUID, name-based search, enable/disable, optimistic locking, and standard CRUD operations. Writing repetitive repo and API code for each would be maintenance-heavy.

### Decision

Two factory functions were created:

- **`_crud_Repo.ts`**: `createConfigurationRepository()` generates `count`, `get`, `getByIdentifier`, `create`, `update`, `disable`, `enable` with built-in PubSub publication and optimistic locking.
- **`_crud_API.ts`**: `registerConfigurationEntityRoutes()` generates full REST routes with OpenAPI documentation, pagination, and permission checks.

### Consequences

- ✅ Adding a new configuration entity requires minimal code (schema + type files + thin factory-wrapping files).
- ✅ Consistent behavior across all configuration entities (pagination, search, conflict handling).
- ❌ Entities that deviate from the standard pattern cannot use the factories. **Products** cannot use them because it uses `productNumber` (text) as PK instead of `identifier` (UUID). **DataTypes** cannot because of discriminated config typing. **ProductTypes** cannot because of nested sub-entities.
- ❌ Changes to the factory affect all consumers — must be tested carefully.

## ADR-003: Tag-Based PubSub Instead of Hierarchical Topics

**Status**: Accepted (implemented)  
**Date**: Migration from `design/pubsub.md`

### Context

The initial PubSub design used hierarchical dot-separated topic strings (e.g., `"auth.session.login"`). Subscribers matched on topic prefixes. This approach had several limitations:
- Topic strings required convention and documentation.
- Prefix matching was coarse-grained (couldn't express "A OR B but NOT C").
- Adding new topic levels required updating all subscribers.

### Decision

The PubSub system was migrated to **tag-based boolean expression matching** with `and`/`or`/`not` operators. Publishers emit flat `Tag[]` arrays. Subscribers use `TagExpression` structures.

### Consequences

- ✅ Subscribers can express precise matching criteria (e.g., "all 'create' events on 'user' OR 'group' resources").
- ✅ Tags have no hierarchy — adding new resource types doesn't affect existing subscribers.
- ✅ The matching algorithm (`expressionMatches`) is simple, recursive, and short-circuits.
- ❌ The tag model requires translators at both ends to convert tags to/from meaningful events, adding complexity compared to hierarchical topics.

## ADR-004: Configuration-as-Code with Database Storage

**Status**: Accepted  
**Date**: Project inception

### Context

Runtime parameters (OIDC credentials, feature flags, performance tuning knobs) needed to be:
- Declared alongside the code that uses them
- Editable at runtime without restart
- Validated with type-aware rules
- Enforced at startup for mandatory values

### Decision

Services export `config` objects declaring their runtime parameters. The setup system discovers missing mandatory entries at startup and blocks the application until they're configured. All config is stored in a single `config` table with composite PK `(domain, key)`.

Two seeding patterns:
- **Pattern A** (startup): Seed all entries at once — for critical config that must exist.
- **Pattern B** (lazy): Upsert on first read — for optional tuning knobs with sensible defaults.

### Consequences

- ✅ Configuration is co-located with the code that depends on it.
- ✅ The setup wizard provides a guided first-run experience.
- ✅ Runtime editing via the admin UI with optimistic locking prevents conflicts.
- ❌ Config caching in some services (e.g., `RequestBundling.ts`) means changes require a restart to take effect.
- ❌ The `value` column is `text` — all types are stored as strings, requiring `parseConfigValue()` on read.

## ADR-005: Products Module — Custom Repository and API (No Factories)

**Status**: Accepted  
**Date**: `design/product.md` decision #1

### Context

The Products module has a fundamentally different data model from other domain entities:
- Primary key is `productNumber` (text, pattern `5XXXXXX-01`) instead of `identifier` (UUID).
- Products have associated `products_values` (many values per product) that are created/updated atomically.
- Product values support server-side viewer permission filtering.
- Products can be imported (XLSX) and copied.

### Decision

The Products module has a **fully custom** repository and API — it does NOT use the `_crud_Repo` or `_crud_API` factories. All product operations are hand-written in `ProductRepo.ts` and `ProductAPI.ts`.

### Consequences

- ✅ The data model is not forced into the factory's constraints.
- ✅ The `productNumber` text PK allows human-readable product identifiers.
- ✅ Atomic product + values mutations are possible.
- ❌ More code to maintain compared to factory-based entities.
- ❌ No shared behavior with other entities — bugs in product code may not be caught by factory tests.

## ADR-006: Request Bundling for Client Mutations

**Status**: Accepted  
**Date**: `design/request_bundling.md`

### Context

The browser client frequently performs multiple independent mutations in quick succession (e.g., updating several data type values on a product request detail page). Each mutation would normally be a separate HTTP request, adding latency and server load.

### Decision

Implement a **transparent request bundling** layer in `src/ui/api/_request_bundling.ts` that intercepts all mutating requests, queues them, and dispatches them as a single NDJSON batch to `POST /api/request_bundling`. Each individual request still returns its own Promise — the bundling is invisible to domain UI code.

### Consequences

- ✅ Domain UI code is unchanged — `apiPost()` calls work the same with or without bundling.
- ✅ Benchmarks show 4.5–10x reduction in HTTP requests for bulk operations.
- ✅ Server-side dispatch uses concurrent `fetch()` for sub-requests with configurable timeouts.
- ✅ Nested bundling is explicitly rejected (400) to prevent infinite recursion.
- ❌ Added complexity in the transport layer — debugging requires understanding the NDJSON stream.
- ❌ Long-polling or streaming responses are not supported through bundling.

## ADR-007: Optimistic Locking via `updatedAt`

**Status**: Accepted  
**Date**: Project inception (documented in root `AGENTS.md`)

### Context

Concurrent modifications to the same entity (e.g., two administrators editing the same configuration entry) could result in lost updates if last-write-wins is used without protection.

### Decision

All mutating operations use **optimistic locking** via the `updatedAt` timestamp. The client reads `updatedAt`, includes it in the mutation request, and the server checks that the DB's `updatedAt` matches. If it doesn't match, a `409 Conflict` is returned with the current value.

### Consequences

- ✅ Prevents lost updates without holding database locks.
- ✅ The `updatedAt` timestamp serves dual purpose: audit (when was it changed) and concurrency (has it changed since I read it).
- ✅ Standard pattern across all entity types.
- ❌ Clients must handle 409 Conflict responses (reload and retry).
- ❌ Does not prevent all race conditions — serializable transactions handle those.

## ADR-008: Serializable Transaction Isolation

**Status**: Accepted  
**Date**: Project inception

### Context

Multi-step mutations (e.g., creating a product request with auto-generated product number, inserting request values, and creating export rows) require atomicity and must prevent anomalies like phantom reads or serialization conflicts.

### Decision

`runInTransaction()` in `DatabaseDriver.ts` uses **`isolationLevel: "serializable"`** — PostgreSQL's strongest isolation level. This prevents all concurrency anomalies (dirty reads, non-repeatable reads, phantom reads, serialization anomalies).

### Consequences

- ✅ Strongest possible data integrity guarantee.
- ✅ No need for explicit row locks in most cases (exception: `SELECT ... FOR UPDATE` for product number generation).
- ❌ Higher likelihood of serialization failures under concurrent load — clients must be prepared to retry.
- ❌ Not documented in `AGENTS.md` — developers may not be aware they're using serializable isolation.

## ADR-009: Permission Model with `ProductTypesDataTypePermission` Precedence

**Status**: Accepted  
**Date**: `design/product_request.md`

### Context

Product requests need per-data-type permissions that can be overridden at the product type level. A simple global permission per data type is insufficient because different product types may have different access rules for the same data type.

### Decision

Implement a **precedence chain** for permission resolution:
1. Check `ProductTypesDataTypePermission` (product-type-specific override)
2. Fall back to `DataTypePermission` (global data type default)

For each field individually, six aspects are checked: `role`, `showByDefault`, `mandatory`, `requestorCanEdit`, `config`, and `owner`. Tri-state booleans (`null` = inherit from the lower-precedence level) allow partial overrides.

### Consequences

- ✅ Flexible permission model that can be fine-tuned per product type.
- ✅ Default permissions defined once on data types, overridden only where needed.
- ❌ Complex permission resolution logic — six aspects × two levels × tri-state inheritance.
- ❌ Debugging permission issues requires understanding the full resolution chain.

## ADR-010: 100% Client-Side Rendering (No SSR)

**Status**: Accepted  
**Date**: Project inception

### Context

The application needed a modern, interactive UI. Server-side rendering (SSR) adds complexity (hydration, isomorphic code, separate build targets) without significant benefit for an authenticated business application where SEO is irrelevant.

### Decision

The frontend is a pure React SPA with **zero server-side rendering**. The server serves an `index.html` shell with a `<script>` tag pointing to the client bundle. React takes over entirely in the browser.

### Consequences

- ✅ Simplified build pipeline — single bundle target (browser ESM).
- ✅ No isomorphic code constraints — browser APIs can be used freely.
- ✅ ETag-based long-lived caching for the JS bundle.
- ❌ Initial page load requires JS execution — slightly slower time-to-interactive than SSR.
- ❌ No SEO — irrelevant for an authenticated business application.

## ADR-011: In-Memory Session Store

**Status**: Accepted  
**Date**: Project inception

### Context

User sessions needed to be managed after OIDC authentication. The options were database-backed sessions (persistent across restarts) or in-memory sessions (simpler, faster).

### Decision

Sessions are stored in an **in-memory `TTLMap`** with sliding-window expiry. No database persistence for sessions.

### Consequences

- ✅ Simple implementation — no session table or cleanup jobs.
- ✅ Fast reads (no DB query for every request).
- ❌ Server restart loses all sessions — all users must re-authenticate.
- ❌ Cannot scale horizontally — sessions are not shared across processes.

## ADR-012: Pattern A vs. Pattern B Config Seeding

**Status**: Accepted  
**Date**: Documented in `design/configuration.md`

### Context

Configuration entries needed to be seeded into the database. Two approaches were possible: seed all entries at startup, or seed them lazily on first read.

### Decision

Both patterns are used, chosen per config entry:

- **Pattern A** (seed at startup): Used for critical config that must exist before any operation (e.g., `cfgRootUserGroup`, OIDC credentials, audit log settings).
- **Pattern B** (lazy upsert): Used for optional tuning knobs with sensible defaults (e.g., request bundling thresholds, page sizes). On first read, if the DB row is missing, the hardcoded default is returned and upserted.

### Consequences

- ✅ Critical config is guaranteed to exist (or setup wizard blocks startup).
- ✅ Optional config doesn't pollute the DB until actually needed.
- ❌ Two different patterns for config seeding — developers must choose correctly per entry.

## ADR-013: Products Table Uses `productNumber` (Text) as Primary Key

**Status**: Accepted  
**Date**: `design/product.md` decision #1

### Context

Products needed human-readable identifiers. UUIDs (`550e8400-e29b-41d4-a716-446655440000`) are not user-friendly for a product catalog where users expect identifiers like `5XXXXXX-01`.

### Decision

The `products` table uses `productNumber` (text) as its primary key instead of the standard `identifier` (UUID). Product numbers follow the pattern `5XXXXXX-01` and are auto-generated via a `product_number_state` sentinel table with `SELECT ... FOR UPDATE`.

### Consequences

- ✅ Human-readable product identifiers.
- ✅ Centralized number generation prevents duplicates.
- ❌ Cannot use the `_crud_Repo` or `_crud_API` factories — fully custom repository and API required.
- ❌ All FK references to products use a text column instead of UUID.

## ADR-014: EntraID as Sole Identity Provider

**Status**: Accepted  
**Date**: Project inception

### Context

The application needed user authentication. Options included local username/password accounts, OIDC with various providers, or a combination.

### Decision

Microsoft EntraID (Azure AD) is the **only** supported authentication method. No local accounts exist. User and group data is synchronized from EntraID via Microsoft Graph API at startup and on a configurable schedule.

### Consequences

- ✅ No password storage or management in the application.
- ✅ Group membership stays aligned with the organization's directory.
- ✅ Single sign-on for users already authenticated with EntraID.
- ❌ Requires EntraID tenant — not suitable for organizations using other identity providers.
- ❌ No offline authentication — EntraID must be reachable for login.
