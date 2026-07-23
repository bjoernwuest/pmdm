# 04 — Solution Strategy

## 4.1 High-Level Architectural Approach

PMDM follows a **layered monolith** architecture with a strict separation of concerns enforced by import bans between layers. The application is a single Bun process that serves both a REST API and a client-side rendered React single-page application.

### 4.1.1 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Layered architecture** (schema → repo → services → api → ui) | Each layer has a well-defined responsibility and import rules. This prevents business logic from leaking into API handlers and keeps database access encapsulated behind repositories. |
| **Single-process monolith** | Simplifies deployment, eliminates inter-service communication overhead, and is appropriate for the expected load. No need for microservices at this scale. |
| **Elysia.js as HTTP framework** | Type-safe, Bun-native, supports derive/inject patterns for auth context, and integrates with OpenAPI/Swagger for documentation. |
| **Drizzle ORM** | Type-safe SQL queries with TypeBox schema generation. The `drizzle-typebox` package auto-generates TypeBox schemas from Drizzle definitions, enabling end-to-end type safety from database to API response validation. |
| **React 19 SPA** | Client-side rendering eliminates server rendering complexity. PrimeReact provides a rich component library. React Router handles client-side navigation. |
| **TypeBox schemas everywhere** | API input/output validation, configuration validation, and type definitions all use TypeBox schemas generated from Drizzle models. This ensures the API contract matches the database schema. |
| **Tag-based PubSub** | Boolean expression matching (`and`/`or`/`not`) over flat tags provides flexible event routing without hierarchical topic string parsing. Used for audit logging, SSE, and cross-service notifications. |
| **Request bundling** | Transparent NDJSON-based coalescing of client mutations reduces HTTP round trips without changing the API programming model. Domain code calls `apiPost()` normally; the bundling layer intercepts and batches. |
| **Optimistic locking via `updatedAt`** | Prevents lost updates without pessimistic row locks. The `updatedAt` timestamp is read, round-tripped, and checked on write. |

### 4.1.2 Technology Stack Summary

| Category | Technology | Version |
|----------|-----------|---------|
| Runtime | Bun | latest |
| Language | TypeScript | ^6.0.3 |
| HTTP Framework | Elysia.js | ^1.4.29 |
| Database | PostgreSQL | via `postgres` ^3.4.9 |
| ORM | Drizzle ORM | ^0.45.2 |
| Schema → TypeBox | drizzle-typebox | ^0.3.3 |
| Type Validation | @sinclair/typebox | 0.34 (pinned) |
| Frontend | React | ^19.2.7 |
| Router | React Router DOM | ^7.18.1 |
| UI Components | PrimeReact | ^10.9.8 |
| Icons | PrimeIcons | ^7.0.0 |
| Code Editor | Monaco Editor (React) | ^4.7.0 |
| Auth (OIDC) | openid-client, @azure/msal-node | ^6.8.4, ^5.4.0 |
| Graph API | microsoft-graph-client | ^1.0.49 |
| Migrations | Umzug | ^3.8.3 |
| Scheduling | croner | ^10.0.1 |
| Excel | @office-kit/xlsx | ^0.9.0 |
| API Docs | @elysiajs/swagger, @scalar/openapi-to-markdown | ^1.3.1, ^0.5.33 |
| Testing (E2E) | Playwright | ^1.61.1 |

## 4.2 Architectural Patterns

### 4.2.1 Generic CRUD Factories

Configuration entities (business domains, consumables, lookups, target systems, data types) share a common pattern: name-based identification, enable/disable, and optimistic locking. Two factories eliminate boilerplate:

- **`_crud_Repo.ts`** (`src/repo/`) — Provides `createConfigurationRepository()` with `count`, `get`, `getByIdentifier`, `create`, `update`, `disable`, `enable` functions. Handles PubSub publication and optimistic locking internally.
- **`_crud_API.ts`** (`src/api/`) — Provides `registerConfigurationEntityRoutes()` which generates `GET /entity`, `GET /entity/:identifier`, `POST /entity`, `PUT /entity/:identifier`, `PATCH /entity/:identifier` routes with pagination, OpenAPI documentation, and permission checks.

**Exception**: Products and Notifications cannot use these factories. Products uses `productNumber` (text) instead of `identifier` (UUID). Notifications manages config entries and email sending without CRUD-style entity storage.

### 4.2.2 Configuration-as-Code

Services declare their runtime configuration requirements via exported `config` objects satisfying `ConfigEntryType`. Pattern A seeds all entries at startup (e.g., `Auth.ts` `init()`). Pattern B lazily upserts entries on first read (e.g., `RequestBundling.ts`, `AuditLog.ts`). The setup wizard (`src/apps/setup.ts`) blocks all other applications when any `mandatoryForStart=true` entry is missing.

### 4.2.3 PubSub Event System

The tag-based PubSub system (`src/services/PubSub.ts`) supports three matching operators:

- **`"tag"`** — matches a single tag
- **`{ and: [...] }`** — all sub-expressions must match
- **`{ or: [...] }`** — at least one sub-expression must match
- **`{ not: ... }`** — the sub-expression must not match

Key usage patterns:
- **Audit Log** subscribes to `{ or: [create, update, delete, grant, revoke, disable, enabled] }` to capture all mutations.
- **SSE Bridge** subscribes to all events (`subscribeAll`) and routes them to per-session filters with custom tag expressions.
- **Repository mutations** publish events with tags like `["ConfigEntry", "update"]` after successful persistence.

### 4.2.4 Auth & Permission Model

Authentication supports three methods in priority order:
1. **Session cookie** (`SessionID`) — from OIDC login flow
2. **API key** (`X-API-Key` header) — for programmatic access
3. **Bearer token** (`Authorization: Bearer ...`) — OAuth2.1 token introspection

Authorization uses functional permissions assigned to groups. The `authorize()` function returns the intersection of requested and held permissions. The **root user group** (`cfgRootUserGroup`) is the only bypass: its members receive all requested permissions. API keys never get root bypass, even if the key's owner is a root group member.

For product requests, `ProductTypesDataTypePermission` takes precedence over `DataTypePermission` for each field individually (showByDefault, mandatory, requestorCanEdit, config, owner).

### 4.2.5 Real-Time Updates via SSE

The Server-Sent Events bridge (`src/services/ServerSentEvents.ts`) connects the server-side PubSub to browser `EventSource` connections:

1. A single `subscribeAll` bridge captures every PubSub message.
2. Each authenticated browser session has a `ServerSentEventFilter` with its own `TagExpression[]`.
3. Matching events are enqueued to the session's event queue.
4. The SSE stream endpoint (`GET /api/server_sent_events/stream`) delivers events via async iteration.
5. Filters persist across disconnections (queue survives, TTL 30 minutes).
6. Heartbeat keepalive events fire every 25 seconds.
7. Stale filters (disconnected > 30 min) are cleaned every 5 minutes.

## 4.3 Startup Sequence

The application startup in `src/main.ts` follows a strict order:

```
1. initDatabase()          — Acquire advisory lock, run Umzug migrations, release lock
2. Register FPs            — Dynamic import of FunctionalPermissions.ts (top-level awaits)
3. Load app modules        — Import setup.ts, login.ts, api.ts, ui.ts
4. setupApp()              — Check for missing mandatory config, spawn setup wizard if needed
5. startEntraIDSync()      — Begin initial group/user sync, await groupsReady
6. Create Elysia app       — Static file routes, DB injection, audit log start
7. Mount sub-apps          — loginApp → apiApp → uiApp
8. listen()                — Start HTTP server on PORT (default 8000)
```

If mandatory configuration is missing, the setup wizard takes over the port. It polls every 2 seconds until all required entries are configured, then stops and the main application starts.
