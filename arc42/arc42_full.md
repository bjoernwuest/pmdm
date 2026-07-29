## 01 — Introduction and Goals

### 1.1 What Is PMDM?

PMDM (Product Master Data Management) is a web application for managing structured product data across an organization. It provides:

- **Product catalog management** — Create, view, update, and disable products with typed data fields organized by product type.
- **Product request workflow** — A multi-step approval workflow where users submit requests to create or update products, approvers review values, and completed requests flow into the product catalog.
- **Product export/import** — Track the export of approved product requests to external target systems and subsequent import confirmation.
- **Configuration management** — Administer product types, data types, target systems, business domains, consumables, and lookups — the building blocks that define the product data model.
- **Administration** — Manage users, groups, API keys, functional permissions, audit logs, and runtime configuration through a web interface.
- **API-first design** — All functionality is accessible via REST APIs with OpenAPI documentation and API key authentication for integration with external systems.

The application is a single-process Bun server serving both the REST API and a 100% client-side rendered React frontend.

### 1.2 Business Goals

| ID | Goal | Description |
|----|------|-------------|
| BG1 | Centralized product data | Provide a single source of truth for product master data, eliminating spreadsheets and ad-hoc data stores. |
| BG2 | Governed data quality | Enforce typed data fields, validation rules, and approval workflows to ensure product data is correct and complete before it reaches downstream systems. |
| BG3 | Flexible data model | Allow administrators to define product types (schemas) with custom data fields (data types) and target systems without code changes. |
| BG4 | Access-controlled collaboration | Enable role-based access control so that viewers, writers, and approvers can interact with product data at appropriate permission levels. |
| BG5 | Automated sync | Synchronize users and groups from Microsoft EntraID (Azure AD) so that identity and membership management stays aligned with the organization's directory. |
| BG6 | API-driven integration | Expose all operations as REST endpoints with API key authentication, enabling external systems to query and mutate product data programmatically. |
| BG7 | Audit trail | Record all mutations across the system for compliance and troubleshooting. |

### 1.3 Stakeholders

| Role | Interest | Contact Channel |
|------|----------|-----------------|
| Product data managers | Create/manage product types, data types, and configuration | Web UI |
| Product data editors | Create products, submit update requests | Web UI |
| Approvers | Review and approve product request values | Web UI |
| Administrators | Manage users, groups, permissions, API keys, runtime config | Web UI |
| Integration developers | Consume the REST API for automated product data operations | API documentation, API keys |
| Operations / DevOps | Deploy, monitor, and maintain the application | Server logs, health endpoint |
| Security team | Ensure authentication, authorization, and audit compliance | Audit log, EntraID integration |

### 1.4 Quality Goals

The following quality goals drive architectural decisions. Each is assigned a priority level (High / Medium / Low).

| ID | Quality Goal | Priority | Description |
|----|-------------|----------|-------------|
| Q1 | Security | High | All endpoints (except health and public docs) require authentication. Fine-grained functional permissions control every operation. API keys provide programmatic access without session cookies. The root user group is the only permission bypass. |
| Q2 | Data integrity | High | Serializable database transactions for multi-step mutations. Optimistic locking via `updatedAt` prevents lost updates. PubSub events are published only after successful persistence. |
| Q3 | Auditability | High | Every mutation (create, update, delete, grant, revoke, disable, enable) is recorded in the audit log with actor identity, resource identifiers, and timestamps. |
| Q4 | Maintainability | High | Strict layered architecture with explicit import bans between layers. Generic CRUD factories reduce boilerplate for configuration entities. Centralized type definitions with auto-generation from Drizzle schemas. |
| Q5 | Configurability | High | All runtime parameters (auth settings, API key length, audit batch size, request bundling thresholds, EntraID credentials) are stored in the database and editable via the admin UI. A setup wizard blocks startup until mandatory configuration is provided. |
| Q6 | Real-time updates | Medium | Server-Sent Events (SSE) bridge PubSub events to browser clients so that UI state updates without polling. Tag-based event filtering ensures clients only receive relevant events. |
| Q7 | Performance | Medium | Request bundling coalesces multiple client mutations into a single HTTP request. Client-side rendering eliminates server-side rendering overhead. ETag-based long-lived caching for client JS bundles. |
| Q8 | Testability | Medium | `bun test` for unit tests. Playwright for end-to-end tests with real EntraID authentication. Separate `.env.test` for test credentials. |
| Q9 | Deployability | Low | Single Bun process. No containerization required (direct runtime). Umzug programmatic migrations run at startup. `.env` file for environment-specific configuration. |

### 1.5 Stakeholder Requirements (Business Constraints)

- The application must authenticate users via Microsoft EntraID (OIDC/OAuth2.1).
- The application must synchronize users and group memberships from EntraID.
- Configuration must be editable at runtime without restarting the server.
- API access must be available via long-lived API keys with configurable length and validity.
- The frontend must work in modern browsers without server-side rendering.
- All UI text must be in English.


## 02 — Constraints

### 2.1 Technical Constraints

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

### 2.2 Organizational Constraints

#### 2.2.1 Layered Architecture with Import Bans

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

#### 2.2.2 Code Conventions

- **PascalCase filenames** matching the domain entity: `UserRepo.ts`, `UserAPI.ts`, `UserSchema.ts`, `UserType.ts`.
- **Default exports** for API route files (required for auto-loading). Each exports a `register(app: ApiInstance)` function annotated with `// noinspection JSUnusedGlobalSymbols`.
- **Named exports** for everything else.
- **`satisfies` operator** used for type-safe config objects and Drizzle schema selections.
- **Optimistic locking** via `updatedAt` field: read it from the server, round-trip it through the UI and API, include it in update/delete checks. Return `409 Conflict` on mismatch.
- **PubSub after mutation**: Publish PubSub events only after successful persistence, never before.
- **Transactions**: Use `runInTransaction()` from `DatabaseDriver.ts` for multi-step mutations. It uses `serializable` isolation level.
- **`cfgRootUserGroup` bypass**: Members of the configured root user group have full permissions. This is the **only** permission bypass.
- **API keys get no root bypass**: API key authentication never inherits root group privileges.

#### 2.2.3 Type System Conventions

- **Two-file pattern**: Auto-generated `_<Name>.ts` files (from Drizzle schemas via `drizzle-typebox`) are read-only. User-editable `<Name>.ts` files re-export everything from the `_` file and add custom types, TypeBox schemas, and PubSub topic constants.
- **Never import from `_` files directly** — always use the user-editable wrapper.
- **TypeScript version**: peerDependency at `^6.0.3`.
- **TypeBox version**: Pinned to `0.34` via `overrides` in `package.json`.

#### 2.2.4 API Route Conventions

- Every API route file exports a single default function `register(app: ApiInstance)`.
- Routes are auto-loaded via `Bun.Glob("**/!(*.test).ts")` in `apps/api.ts`.
- All routes except `/api/health` and `/api/docs/*` require authentication (enforced by `onBeforeHandle`).
- All routes must include full OpenAPI `detail` with `response`, `body`, `params`, and `query` schemas.
- Auth context (`session`, `apiKeyAuth`, `isAuthenticated`, `authMethod`, `tokenClaims`) is pre-derived globally — handlers never re-derive it.
- Handlers check functional permissions via `authorize(context.dbClient, claims, [FP_*])`.
- Pagination follows a consistent pattern provided by `_crud_API.ts`.

#### 2.2.5 Repository Conventions

- **1:1 mapping with schemas**: `XxxSchema.ts` → `XxxRepo.ts`.
- **Full Drizzle encapsulation**: No raw Drizzle ORM queries leak out of this layer. Only clean async functions are exported.
- **Never export raw query builders** or DB connections.

### 2.3 Deployment Constraints

| ID | Constraint | Description |
|----|-----------|-------------|
| DC1 | Single process | The application runs as a single Bun process. No separate API server, worker processes, or microservices. |
| DC2 | Direct PostgreSQL connection | The application connects directly to PostgreSQL via the `postgres` npm package. No connection pooling middleware. Pool size: max 10 connections. |
| DC3 | No containerization | No Docker files, Kubernetes manifests, or container orchestration. Deployment is direct Bun runtime on a host. |
| DC4 | Environment configuration | Configuration via `.env` file (`DATABASE_URL`, `ADVISORY_LOCK`, `PORT`). The `.env` file is git-ignored. |
| DC5 | No CDN | Static assets (CSS, images, client JS bundle) are served directly by the Bun server. |

### 2.4 Browser Compatibility

The frontend targets modern browsers with ES module support and `EventSource` API for SSE. No polyfills are included. Tested via Playwright with Chromium.


## 03 — Context and Scope

### 3.1 System Context Diagram

```
                            ┌─────────────────────────────┐
                            │   Microsoft EntraID (Azure)   │
                            │   ┌───────────────────────┐  │
                            │   │ OIDC Identity Provider│  │
                            │   │ Microsoft Graph API   │  │
                            │   └──────────┬────────────┘  │
                            └──────────────┼───────────────┘
                                           │ OIDC / OAuth2.1
                                           │ (HTTPS)
                                           ▼
┌──────────────┐    HTTPS     ┌──────────────────────────────┐    TCP/5432    ┌──────────────┐
│   Browser    │◄────────────►│          PMDM Server          │◄─────────────►│  PostgreSQL  │
│   (React     │              │                              │               │   Database   │
│    SPA)      │              │  Bun + Elysia.js + Drizzle    │               │              │
│              │              │                              │               │              │
│  ┌─────────┐ │              │  /api/*          REST API     │               │              │
│  │ SSE      │◄──── SSE ────│  /login/*        OIDC flow    │               │              │
│  │ Client   │ │              │  /public/*       Static assets│               │              │
│  └─────────┘ │              │  /               UI shell     │               │              │
│              │              │  /setup          Setup wizard │               │              │
└──────────────┘              └──────────────────────────────┘               └──────────────┘
                                           │
                                           │ HTTPS
                                           ▼
                              ┌──────────────────────────────┐
                              │      External Systems         │
                              │  (via REST API + API Keys)    │
                              │                              │
                              │  Product data consumers       │
                              │  Integration middleware        │
                              │  Target systems               │
                              └──────────────────────────────┘
```

### 3.2 External Interfaces

#### 3.2.1 Microsoft EntraID (Azure Active Directory)

| Aspect | Detail |
|--------|--------|
| Purpose | User authentication (OIDC) and identity synchronization |
| Protocol | OIDC / OAuth2.1 with PKCE |
| Endpoints | Authorization, Token, Token Introspection, End Session |
| Sync mechanism | Microsoft Graph API delta queries for users and groups |
| Configuration | ClientID, ClientSecret, TenantID stored in database `config` table under domain `EntraID` |
| Config keys | `ClientID`, `ClientSecret`, `TenantID`, `SyncInterval` |

#### 3.2.2 PostgreSQL Database

| Aspect | Detail |
|--------|--------|
| Purpose | Persistent storage for all application data |
| Connection | `postgresql://` connection string in `DATABASE_URL` env var |
| Driver | `postgres` npm package (v3.x), max 10 connections |
| ORM | Drizzle ORM (v0.45.x) |
| Migrations | Umzug programmatic migrations, run at startup with advisory lock |
| Advisory lock | Unique 64-bit integer from `ADVISORY_LOCK` env var (prevents concurrent migration runs) |

#### 3.2.3 External System Integrations (API Consumers)

| Aspect | Detail |
|--------|--------|
| Purpose | Programmatic access to product data, configuration, and administration |
| Authentication | API keys (X-API-Key header) or Bearer tokens |
| Documentation | OpenAPI/Swagger UI at `/api/docs`, `llms.txt` at `/api/docs/llms.txt` |
| Rate limiting | Not implemented |

#### 3.2.4 Browser Client

| Aspect | Detail |
|--------|--------|
| Purpose | Human interface for all application functionality |
| Rendering | 100% client-side (React 19 SPA) |
| Real-time updates | Server-Sent Events (EventSource API) with PubSub bridge |
| Request optimization | Transparent request bundling for mutations (NDJSON streaming) |
| Caching | ETag-based long-lived caching for JS bundle |

### 3.3 Business Domain Scope

#### 3.3.1 Core Domain: Product Management

- **Product Types** — Define the schema for a class of products (e.g., "Laptop", "Monitor"). Each product type has assigned data types, target systems, and group-based permissions.
- **Data Types** — Define typed fields with validation rules, default values, and lookup/consumable references. Seven data kinds: `calculated`, `boolean`, `numeric`, `string`, `lookup`, `consumable`, `product`.
- **Products** — Instances of a product type with values for each assigned data type. Identified by `productNumber` (text, not UUID).
- **Product Requests** — Workflow objects for creating or updating products. Status lifecycle: `open` → `importing` → `done` / `cancelled`.
- **Product Exports** — Track the export status of approved product requests to target systems and subsequent import confirmation.

#### 3.3.2 Configuration Domain

- **Business Domains** — Organizational categories for grouping data types.
- **Consumables** — Predefined selectable values for data fields.
- **Lookups** — Reference data tables (key-value pairs) for data fields.
- **Target Systems** — External systems that receive exported product data.

#### 3.3.3 Administration Domain

- **Users** — Imported from EntraID. Can be assigned to groups.
- **Groups** — Imported from EntraID. Can be assigned functional permissions.
- **API Keys** — Long-lived authentication tokens for programmatic API access. Configurable length and validity.
- **Functional Permissions** — Fine-grained permission constants (e.g., `FP_VIEW_PRODUCTS`, `FP_CREATE_PRODUCT`). Assigned to groups.
- **Configuration Entries** — Runtime parameters stored in the database. Editable via admin UI with optimistic locking.
- **Audit Log** — Immutable log of all mutating operations across the system.
- **Notifications** — Email digest notifications for product request status changes. Configured via admin UI with HTML template support.

#### 3.3.4 UI Page Map

```
PMDM
├── Administration
│   ├── Administration Home
│   ├── Users (list → detail)
│   ├── Groups (list → detail)
│   ├── Functional Permissions (list → detail)
│   ├── API Keys (list → detail)
│   ├── Configuration Entries (list)
│   ├── Audit Log
│   ├── Notifications
│   └── API Documentation
├── Configuration
│   ├── Configuration Home
│   ├── Target Systems
│   ├── Product Types (→ Data Type Assignments → Target System Assignments)
│   ├── Business Domains
│   ├── Consumables (list → detail)
│   ├── Lookups (list → detail)
│   └── Data Types (list → detail)
├── Products
│   ├── Products (list → detail)
│   ├── Product Exports
│   └── Open Product Requests (list → detail)
└── General
    └── Dashboard
```

### 3.4 Out of Scope

The following are explicitly **not** part of PMDM:

- **User registration / password management** — Authentication is exclusively via EntraID.
- **Local user accounts** — All users are sourced from EntraID.
- **Multi-tenancy** — The application serves a single organization.
- **Content Management** — No CMS capabilities. Pages are static React components.
- **Externally triggered notifications** — No webhook-based or third-party notification triggers. Email notifications are internal via Microsoft Graph.
- **File / media storage** — No binary file upload or storage beyond XLSX import/export.
- **Workflow engine** — The product request workflow is a hardcoded state machine, not a generic workflow engine.
- **Reporting / analytics** — No built-in reporting dashboards beyond the product list with query builder.
- **Mobile app** — No native mobile client. The browser UI is responsive but not optimized for mobile.
- **Rate limiting / throttling** — Not implemented.
- **Horizontal scaling** — The application is a single process; no clustering or load balancing is built in.
- **GDPR / data retention policies** — No automated data purging or anonymization.


## 04 — Solution Strategy

### 4.1 High-Level Architectural Approach

PMDM follows a **layered monolith** architecture with a strict separation of concerns enforced by import bans between layers. The application is a single Bun process that serves both a REST API and a client-side rendered React single-page application.

#### 4.1.1 Key Architectural Decisions

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

#### 4.1.2 Technology Stack Summary

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

### 4.2 Architectural Patterns

#### 4.2.1 Generic CRUD Factories

Configuration entities (business domains, consumables, lookups, target systems, data types) share a common pattern: name-based identification, enable/disable, and optimistic locking. Two factories eliminate boilerplate:

- **`_crud_Repo.ts`** (`src/repo/`) — Provides `createConfigurationRepository()` with `count`, `get`, `getByIdentifier`, `create`, `update`, `disable`, `enable` functions. Handles PubSub publication and optimistic locking internally.
- **`_crud_API.ts`** (`src/api/`) — Provides `registerConfigurationEntityRoutes()` which generates `GET /entity`, `GET /entity/:identifier`, `POST /entity`, `PUT /entity/:identifier`, `PATCH /entity/:identifier` routes with pagination, OpenAPI documentation, and permission checks.

**Exception**: The Products module cannot use these factories because its primary key is `productNumber` (text) instead of the standard `identifier` (UUID). Products has a fully custom repository and API.

#### 4.2.2 Configuration-as-Code

Services declare their runtime configuration requirements via exported `config` objects satisfying `ConfigEntryType`. Pattern A seeds all entries at startup (e.g., `Auth.ts` `init()`). Pattern B lazily upserts entries on first read (e.g., `RequestBundling.ts`, `AuditLog.ts`). The setup wizard (`src/apps/setup.ts`) blocks all other applications when any `mandatoryForStart=true` entry is missing.

#### 4.2.3 PubSub Event System

The tag-based PubSub system (`src/services/PubSub.ts`) supports three matching operators:

- **`"tag"`** — matches a single tag
- **`{ and: [...] }`** — all sub-expressions must match
- **`{ or: [...] }`** — at least one sub-expression must match
- **`{ not: ... }`** — the sub-expression must not match

Key usage patterns:
- **Audit Log** subscribes to `{ or: [create, update, delete, grant, revoke, disable, enabled] }` to capture all mutations.
- **SSE Bridge** subscribes to all events (`subscribeAll`) and routes them to per-session filters with custom tag expressions.
- **Repository mutations** publish events with tags like `["ConfigEntry", "update"]` after successful persistence.

#### 4.2.4 Auth & Permission Model

Authentication supports three methods in priority order:
1. **Session cookie** (`SessionID`) — from OIDC login flow
2. **API key** (`X-API-Key` header) — for programmatic access
3. **Bearer token** (`Authorization: Bearer ...`) — OAuth2.1 token introspection

Authorization uses functional permissions assigned to groups. The `authorize()` function returns the intersection of requested and held permissions. The **root user group** (`cfgRootUserGroup`) is the only bypass: its members receive all requested permissions. API keys never get root bypass, even if the key's owner is a root group member.

For product requests, `ProductTypesDataTypePermission` takes precedence over `DataTypePermission` for each field individually (showByDefault, mandatory, requestorCanEdit, config, owner).

#### 4.2.5 Real-Time Updates via SSE

The Server-Sent Events bridge (`src/services/ServerSentEvents.ts`) connects the server-side PubSub to browser `EventSource` connections:

1. A single `subscribeAll` bridge captures every PubSub message.
2. Each authenticated browser session has a `ServerSentEventFilter` with its own `TagExpression[]`.
3. Matching events are enqueued to the session's event queue.
4. The SSE stream endpoint (`GET /api/server_sent_events/stream`) delivers events via async iteration.
5. Filters persist across disconnections (queue survives, TTL 30 minutes).
6. Heartbeat keepalive events fire every 25 seconds.
7. Stale filters (disconnected > 30 min) are cleaned every 5 minutes.

### 4.3 Startup Sequence

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


## 05 — Building Block View

### 5.1 Level 1: System Decomposition

```
┌──────────────────────────────────────────────────────────────────────┐
│                          PMDM System                                 │
│                                                                      │
│  ┌─────────┐  ┌─────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  login   │  │  setup  │  │     api      │  │       ui         │  │
│  │  App     │  │  App    │  │     App      │  │      App         │  │
│  │          │  │         │  │              │  │                  │  │
│  │ OIDC     │  │ Wizard  │  │ REST API     │  │ React SPA        │  │
│  │ flow     │  │ for     │  │ /api/*       │  │ /*               │  │
│  │ /login/* │  │ mandatory│  │ Auto-loaded  │  │ Client bundle    │  │
│  │          │  │ config  │  │ routes       │  │ SSE bridge       │  │
│  └─────────┘  └─────────┘  └──────┬───────┘  └────────┬─────────┘  │
│                                   │                    │            │
│                          ┌────────▼────────────────────▼────────┐   │
│                          │            Services Layer             │   │
│                          │                                       │   │
│                          │ Auth │ PubSub │ SSE │ RequestBundling │   │
│                          │ Config │ AuditLog │ DatabaseDriver    │   │
│                          │ EntraIDSync │ ClientBuilder │ Setup   │   │
│                          └────────┬──────────────────────────────┘   │
│                                   │                                  │
│                          ┌────────▼──────────────────────────┐       │
│                          │           Repo Layer               │       │
│                          │                                    │       │
│                          │ UserRepo │ GroupRepo │ ConfigRepo  │       │
│                          │ ProductRepo │ ProductRequestRepo   │       │
│                          │ ProductTypeRepo │ DataTypeRepo ... │       │
│                          │ _crud_Repo (factory)               │       │
│                          └────────┬──────────────────────────┘       │
│                                   │                                  │
│                          ┌────────▼──────────────────────────┐       │
│                          │          Schema Layer              │       │
│                          │                                    │       │
│                          │ UserSchema │ ConfigSchema │ ...    │       │
│                          │ _base.ts (baseColumns, helpers)    │       │
│                          └───────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────────┘
```

**Allowed import directions between layers:**

```
  Apps ──────► API ──────► Services ──────► Repo ──────► Schema
                                                           ▲
  UI ────────► Types ◄──── API ◄──── Services ◄───────────┘
```

- **Apps** may import from Services and API (composition only).
- **API** may import from Services (for auth, PubSub) and Repo (for data access).
- **Services** may import from Repo and other Services. Only `DatabaseDriver.ts` may import `drizzle-orm/postgres-js` and `postgres`.
- **Repo** may import from Schema and `drizzle-orm`. Full Drizzle encapsulation.
- **Schema** is strictly isolated — only `drizzle-orm` imports.
- **Types** are browser-compatible and importable by all layers.
- **UI** uses `src/ui/api/` wrappers for all API calls and never calls `fetch()` directly.

### 5.2 Level 2: Application Sub-Applications

#### 5.2.1 login App (`src/apps/login.ts`)

**Purpose**: OIDC authentication flow with Microsoft EntraID.

**Routes**:
| Route | Method | Purpose |
|-------|--------|---------|
| `/login` | POST | Start OIDC flow (PKCE challenge, redirect to EntraID) |
| `/login/oauth2/code/entraid` | GET | OIDC callback — code exchange, user sync, session creation |
| `/login/logout` | GET | End session, OIDC end_session_endpoint redirect, clear cookie |
| `/login/local-logout` | GET | Client-side logout page |
| `/login` | GET | Serve login page (HTML shell + client bundle) |
| `/login/loading` | GET | Post-login loading/interstitial page |
| `/login/client.js` | GET | Login page JS bundle (ETag-cached) |

**Dependencies**: `Auth.ts` (OIDC flows), `EntraIDSync.ts` (user/group sync on login), `ClientBuilder.ts` (login page bundle)

#### 5.2.2 setup App (`src/apps/setup.ts`)

**Purpose**: Setup wizard for mandatory configuration entries. Blocks the application until all `mandatoryForStart=true` config values are configured.

**Routes**:
| Route | Method | Purpose |
|-------|--------|---------|
| `GET /` | GET | Setup wizard HTML page |
| `GET /setup/client.js` | GET | Wizard JS bundle (ETag-cached) |
| `POST /setup/demand` | POST | Return list of missing mandatory config entries grouped by domain |
| `POST /setup` | POST | Submit config values (parsed and validated by `Config.ts`) |

**State**: A one-time setup key (50 random alphanumeric characters) is printed to the console. The wizard polls every 2 seconds for setup completion.

#### 5.2.3 api App (`src/apps/api.ts`)

**Purpose**: Main REST API application with auto-loaded route modules, OpenAPI documentation, and global auth enforcement.

**Key features**:
- **Prefix**: `/api`
- **Auth context derivation**: Global `derive` that checks `SessionID` cookie, `X-API-Key` header, and `Authorization: Bearer` header in priority order. Sets `isAuthenticated`, `session`, `apiKeyAuth`, `authMethod`, and `tokenClaims`.
- **Auth enforcement**: `onBeforeHandle` blocks all routes except `/api/health` and `/api/docs/*` if not authenticated.
- **OpenAPI documentation**: Swagger UI at `/api/docs`, `llms.txt` generation from OpenAPI spec at `/api/docs/llms.txt`.
- **Route auto-loading**: `Bun.Glob("**/!(*.test).ts")` scans `src/api/` and calls each file's `default` export as `register(app)`.
- **Server timing**: `@elysia/server-timing` in dev mode.

#### 5.2.4 ui App (`src/apps/ui.ts`)

**Purpose**: Serve the main React single-page application.

**Key features**:
- **Client bundle**: Built by `ClientBuilder.ts` with `Bun.build()`. Served at `/ui/client.js` with SHA-256 ETag and long-lived `Cache-Control` (dev: no-cache, prod: max-age=31536000 immutable).
- **Catch-all route**: `GET /*` — redirects unauthenticated users to `/login`, serves `index.html` shell for authenticated users.
- **SSE bridge**: Initializes the Server-Sent Events connection lazily when the UI app is mounted.

### 5.3 Level 2: Services Layer

The services layer (`src/services/`, 12 files + `auth/` subdirectory) contains all business logic and cross-cutting concerns. It is the **only** layer allowed to contain business logic.

#### 5.3.1 Service Inventory

| Service | File | Responsibility |
|---------|------|----------------|
| **DatabaseDriver** | `DatabaseDriver.ts` | Database connection pool, Drizzle instantiation, Umzug migrations, `runInTransaction()`. The **only service** allowed to import `drizzle-orm/postgres-js` and `postgres`. |
| **Auth** | `Auth.ts` | OIDC authentication flows (PKCE, code exchange), session management (TTLMap-based), API key validation, Bearer token introspection, `authorize()` permission check, root group bypass, session refresh deduplication. |
| **PubSub** | `PubSub.ts` | Tag-based publish/subscribe with boolean expression matching. Singleton `PubSub` instance. `publish()`, `subscribe()`, `subscribeAll()`, `subscribeOnce()`, `unsubscribe()`. |
| **ServerSentEvents** | `ServerSentEvents.ts` | SSE hub bridging PubSub to browser `EventSource` connections. Per-session `ServerSentEventFilter` with tag expression matching. Heartbeat keepalives. Stale filter cleanup. |
| **Config** | `Config.ts` | Stateless config value parsing (`parseConfigValue()`) and `inputFormat` validation (`validateConfigInputFormat()`). Type-aware deserialization for 6 value types. |
| **RequestBundling** | `RequestBundling.ts` | Server and client bundling configuration. Reads 11 config entries (6 server, 5 client) from DB with fallback defaults. |
| **EntraIDSync** | `EntraIDSync.ts` | Microsoft Graph API delta-based user and group sync. Membership sync. Cron-based scheduled sync. PubSub-driven sync on login. |
| **AuditLog** | `AuditLog.ts` | Batched PubSub subscriber. Filters for action tags. Batches entries in memory, flushes to DB on interval (default 60s) or batch size threshold (default 500). Failure recovery with batch re-queuing. |
| **ClientBuilder** | `ClientBuilder.ts` | Bundles client-side code with `Bun.build()`. SHA-256 ETags. Queue-based build to prevent concurrent builds. File watching in dev mode. |
| **Setup** | `Setup.ts` | `getSetupDemand()` discovers missing mandatory config entries by dynamically importing service modules and inspecting their `config` exports. Manages one-time setup key. |
| **ui_config** | `ui_config.ts` | UI runtime configuration. `getUserListPageSizes()` reads/upserts page size settings. Lazy upsert on first read (Pattern B). |
| **Notifications** | `Notifications.ts` | Email digest scheduling (CRON via `croner`). MS Graph `sendMail` for delivery. HTML template rendering with placeholders. Manual send, simulation/preview mode. 12 config entries under `notification` domain. |

#### 5.3.2 Auth Subdirectory (`src/services/auth/`)

| File | Responsibility |
|------|----------------|
| `FunctionalPermissions.ts` | Registers admin functional permissions (`FP_READ_USERS`, `FP_READ_GROUPS`, etc.) as top-level `await` constants executed at import time. Re-exports from `ApplicationDefinedFunctionalPermissions.ts`. |
| `ApplicationDefinedFunctionalPermissions.ts` | Registers domain-specific functional permissions (data types, target systems, product types, business domains, consumables, lookups, products, exports, imports). Extension point for template upgrades. |

### 5.4 Level 2: Repository Layer

The repository layer (`src/repo/`, 17 files) encapsulates all database access behind clean async functions. **1:1 mapping** with schema files.

#### 5.4.1 Repository Inventory

| Repository | Schema | Pattern | Description |
|------------|--------|---------|-------------|
| **UserRepo** | `UserSchema.ts` | Custom | User and group CRUD, membership management, EntraID upsert/disable, `getSystemUser` |
| **ConfigRepo** | `ConfigSchema.ts` | Custom | Config entry CRUD: `getConfigEntriesByKey` (exact/regex/contains), `upsertConfigEntry`, `getAllConfigEntries` |
| **ApiKeyRepo** | `ApiKeySchema.ts` | Custom | API key lifecycle management |
| **AuditRepo** | `AuditEntrySchema.ts` | Custom | Audit entry insertion (`insertAuditEntries`) |
| **FunctionalPermissionRepo** | `FunctionalPermissionSchema.ts` | Custom | Permission registration, group assignment |
| **ProductRepo** | `ProductSchema.ts` | Custom | Product CRUD (no factory — `productNumber` text PK), import, copy |
| **ProductRequestRepo** | `ProductRequestSchema.ts` | Custom | Product request CRUD, value management, approval, status transitions |
| **ProductExportRepo** | `ProductExportSchema.ts` | Custom | Export row creation, status tracking |
| **NotificationRepo** | (config-driven) | Custom | Notification config management, digest tracking, email simulation |
| **BusinessDomainRepo** | `BusinessDomainSchema.ts` | CRUD Factory | Standard configuration entity |
| **ConsumableRepo** | `ConsumableSchema.ts` | CRUD Factory | Standard configuration entity |
| **DataTypeRepo** | `DataTypeSchema.ts` | Custom (no factory) | Data type CRUD with discriminated config, permission management |
| **LookupRepo** | `LookupsSchema.ts` | CRUD Factory | Standard configuration entity |
| **ProductTypeRepo** | `ProductTypeSchema.ts` | Custom (no factory) | Product type CRUD with sub-entity management (data type assignments, target system assignments, permissions) |
| **UserProfileConfigRepo** | `UserProfileConfigSchema.ts` | Custom | Per-user configuration override CRUD with composite PK (domain, key, userIdentifier) |
| **TargetSystemRepo** | `TargetSystemSchema.ts` | CRUD Factory | Standard configuration entity |

#### 5.4.2 CRUD Factory Pattern

The `_crud_Repo.ts` factory (`createConfigurationRepository`) provides:

```
count(db, opts?)
get(db, opts?)                    — paginated list with optional search
getByIdentifier(db, identifier)   — single entity by UUID
create(db, data)                  — insert, publish create event
update(db, identifier, data)      — optimistic update with knownUpdatedAt, publish update event
disable(db, identifier)           — soft-delete, publish disable event
enable(db, identifier)            — re-enable, publish enabled event
```

**Preconditions for factory use**: The entity must use `baseColumns` (UUID `identifier`, `timestamps`) and `baseColumnsNamed` (name, disabled). Products cannot use the factory because it uses `productNumber` (text) as PK.

### 5.5 Level 2: Schema Layer

The schema layer (`src/schema/`, 17 files) contains Drizzle ORM table definitions. It is **strictly isolated** — only imports from `drizzle-orm` and internal files.

#### 5.5.1 Base Definitions

**`_base.ts`**: Three base column sets for consistent table structure:

| Column Set | Columns | Used By |
|-----------|---------|---------|
| `baseColumns` | `identifier` (UUID PK), `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | All entities |
| `baseColumnsNamed` | `baseColumns` + `name` (text), `disabled` (boolean) | Named configuration entities (business domains, consumables, target systems, lookups) |
| `baseColumnsNamedDescribed` | `baseColumnsNamed` + `description` (text) | Described configuration entities (data types, product types) |

**`helpers.ts`**:
- `identifierColumnType` — UUID column with `defaultRandom()` using `uuidv7()`
- `timestampColumnType` — text-mode timestamps
- `timestamps` — `createdAt` / `updatedAt` with auto-update on modification

#### 5.5.2 Domain Schemas

| Schema File | Tables | Key Characteristics |
|-------------|--------|---------------------|
| `UserSchema.ts` | `users`, `groups`, `user_groups` | Many-to-many between users and groups |
| `ConfigSchema.ts` | `config` | Composite PK `(domain, key)`. `type` enum: string, number, boolean, object, string[], number[] |
| `ApiKeySchema.ts` | `api_keys` | Hashed secret storage |
| `AuditEntrySchema.ts` | `audit_log` | Immutable log with topic, payload, actor info |
| `BusinessDomainSchema.ts` | `business_domains` | `baseColumnsNamed` |
| `ConsumableSchema.ts` | `consumables` | `baseColumnsNamed` + `business_domain_identifier` FK |
| `DataTypeSchema.ts` | `data_types` | Discriminated config by `kind` (7 kinds). FK to `business_domains` |
| `FunctionalPermissionSchema.ts` | `functional_permissions`, `functional_permissions_groups` | Permissions with group assignments |
| `LookupsSchema.ts` | `lookups`, `lookup_values` | Lookup tables with key-value pairs |
| `ProductSchema.ts` | `products`, `products_values` | `productNumber` (text) PK. FK to `product_types` |
| `ProductExportSchema.ts` | `product_exports` | Tracks export/import status per target system |
| `ProductRequestSchema.ts` | `product_requests`, `product_requests_values` | Workflow objects with status lifecycle |
| `ProductTypeSchema.ts` | `product_types`, `product_types_data_types`, `product_types_data_types_target_systems`, `product_types_data_type_permission`, `product_types_data_types_previous_approval` | Product type with multi-level sub-entities |
| `UserProfileConfigSchema.ts` | `user_profile_config` | Per-user configuration overrides. Composite PK (domain, key, userIdentifier). FK to users. |
| `TargetSystemSchema.ts` | `target_systems` | `baseColumnsNamed` |

### 5.6 Level 2: Types Layer

The types layer (`src/types/`, 37 files) provides TypeScript type definitions and TypeBox schemas shared across all layers. All files must be 100% browser-compatible.

#### 5.6.1 Two-File Pattern

For each domain entity, two files exist:

```
src/types/
  _ProductType.ts      ← Auto-generated (DO NOT EDIT). TypeBox schemas from Drizzle.
  ProductType.ts       ← User-editable. Re-exports from _ProductType.ts, adds custom types, 
                         schemas, and PubSub topic constants.
```

**Auto-generated files** (15 files): `_ApiKeyType.ts`, `_AuditEntryType.ts`, `_BusinessDomainType.ts`, `_ConfigType.ts`, `_ConsumableType.ts`, `_DataTypeType.ts`, `_FunctionalPermissionType.ts`, `_LookupsType.ts`, `_ProductType.ts`, `_ProductTypeType.ts`, `_ProductExportType.ts`, `_ProductRequestType.ts`, `_TargetSystemType.ts`, `_UserProfileConfigType.ts`, `_UserType.ts`

**User-editable files** extend the auto-generated definitions with:
- Custom TypeBox schemas (e.g., `ProductListRowSchema`, `MeContextResponseSchema`)
- PubSub topic/message constants (e.g., `TAG_CREATE`, `TAG_UPDATE`, resource-specific tags)
- Discriminated union types and type helpers
- Re-exports from `_` files (`export * from "./_ProductType"`)

**Utility files**: `helpers.ts` (`IdentifierSchema`, `UUIDType`, `AtLeastOne`), `PageType.ts` (page navigation types), `PubSubType.ts` (tag constants and `TagExpression`), `RequestBundlingType.ts`, `ServerSentEventsType.ts`, `errors.ts`

### 5.7 Level 2: UI Layer

#### 5.7.1 UI Architecture

The UI layer (`src/ui/`) is a 100% client-side rendered React SPA organized into four sub-layers:

```
src/ui/
  index.tsx          — Browser entry point, React mount, BrowserRouter, SSE init
  app.tsx            — Application shell: navigation, layout, page selection
  PageRegistry.ts    — Central page registry with permission-based visibility
  app_PageRegistry.ts — Extension point for domain page registrations
  pubsub.ts          — Browser-side PubSub (shares same PubSub pattern as server)
  server_sent_events.ts — Client SSE bridge with reconnection
  api/               — Client API wrappers (19 files)
  auth/              — Permission-aware UI helpers (2 files)
  components/        — Reusable UI components (8 files)
  pages/             — Page components (34 files)
```

#### 5.7.2 Client API Wrappers

All API communication goes through `src/ui/api/`. Domain code calls `apiPost()`, `apiGet()`, etc. — never `fetch()` directly.

| File | Domain |
|------|--------|
| `_client.ts` | Low-level request primitives, `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete` |
| `_request_bundling.ts` | Client-side bundling queue — transparently intercepts mutations |
| `_configuration_entities.ts` | Generic configuration entity API helpers |
| `session.ts` | Session management helpers |
| `Products.ts` | Product CRUD, import, copy |
| `ProductRequests.ts` | Product request CRUD, approval |
| `ProductExports.ts` | Product export management |
| `ApiKeys.ts` | API key CRUD |
| `AuditLog.ts` | Audit log queries |
| `BusinessDomains.ts` | Business domain CRUD |
| `Config.ts` | Configuration entry CRUD |
| `Consumables.ts` | Consumable CRUD |
| `DataTypes.ts` | Data type CRUD |
| `Lookups.ts` | Lookup CRUD |
| `ProductTypes.ts` | Product type CRUD |
| `TargetSystems.ts` | Target system CRUD |
| `server_sent_events.ts` | SSE client helpers |

#### 5.7.3 Page Components

34 page components organized by domain:

**Administration** (9 files): `AdministrationHome`, `AdminUserList`, `AdminUserDetail`, `AdminGroupList`, `AdminGroupDetail`, `AdminFunctionalPermissionList`, `AdminFunctionalPermissionDetail`, `AdminApiKeyList`, `AdminApiKeyDetail`, `AdminApiDocumentation`, `AdminConfigList`, `AdminAuditLog`

**Configuration** (12 files): `ConfigurationHome`, `ConfigurationEntitiesPage` (generic), `_configuration_entity_page_factory`, `ConfigurationBusinessDomains`, `ConfigurationConsumables` + `ConfigurationConsumableDetail`, `ConfigurationDataTypes` + `ConfigurationDataTypeDetail`, `ConfigurationLookups` + `ConfigurationLookupDetail`, `ConfigurationProductTypes`, `ConfigurationProductTypesDataTypes`, `ConfigurationProductTypesDataTypesTargetSystems`, `ConfigurationTargetSystems`

**Products** (5 files): `ProductPage`, `ProductDetailPage`, `ProductExportsPage`, `ProductRequestDetailPage`, `OpenProductRequestsPage`

**General** (3 files): `Dashboard`, `Doc`, `PageTemplate`

**Factory** (1 file): `_configuration_entity_page_factory.tsx`

#### 5.7.4 Page Registry & Navigation

The `PageRegistry.ts` is the single source of truth for all pages. Each page module has:

- `meta.id` — Unique page identifier
- `meta.urn` — Stable URN for programmatic lookup (e.g., `page:product-requests`)
- `meta.path` — React Router path (e.g., `/product-requests`)
- `meta.menu.section` — Navigation section ("Administration", "Configuration", "Products", "General")
- `meta.menu.order` — Sort order within section
- `meta.menu.hidden` — Whether the page appears in navigation menus
- `meta.menu.parent` — Parent page ID for hierarchical nesting (detail pages)
- `meta.requiredFunctionalPermissions` — Required permissions for access

Key functions: `isPageVisible()`, `getVisiblePages()`, `getAccessiblePages()`, `getPageByUrn()`, `getDefaultPath()`, `buildNavTree()`

### 5.8 Level 3: Key Domain Modules

#### 5.8.1 Product Module

**Architectural outlier**: Products use `productNumber` (text, pattern `5XXXXXX-01`) as primary key instead of the standard `identifier` (UUID). This means the `_crud_Repo` and `_crud_API` factories cannot be used.

```
Product Module
├── src/schema/ProductSchema.ts     — products, products_values tables
├── src/repo/ProductRepo.ts         — Custom CRUD, import, copy (no factory)
├── src/api/ProductAPI.ts           — Custom routes (no factory): CRUD, import, copy, request-update
├── src/types/ProductType.ts        — TypeBox schemas, PubSub topic constants
├── src/ui/api/Products.ts          — Client API wrappers
├── src/ui/pages/ProductPage.tsx    — List with query builder (AND/OR filter modal)
└── src/ui/pages/ProductDetailPage.tsx — Read-only detail with effective permissions display
```

**Key design decisions**:
- `ProductsValues` mutations are integrated into `createProduct`/`updateProduct` — no standalone values CRUD.
- Server-side viewer permission filtering on values (users only see data types they have viewer role for).
- XLSX import/export via `@office-kit/xlsx`.
- Query builder filter persisted to cookie `pmdm_product_filter`.
- 3 PubSub topics: `create.Product`, `update.Product`, `disable.Product`.
- 6 functional permissions: `FP_VIEW_PRODUCTS`, `FP_CREATE_PRODUCT`, `FP_UPDATE_PRODUCT`, `FP_DISABLE_PRODUCT`, `FP_REQUEST_PRODUCT_UPDATE`, `FP_CREATE_PRODUCT_COPY`.

#### 5.8.2 Product Request Module

**Workflow state machine**: `open` → `importing` → `done` / `cancelled`. Only `open` → `importing` transition is in scope; `importing` → `done` is deferred.

```
Product Request Module
├── src/schema/ProductRequestSchema.ts        — product_requests, product_requests_values
├── src/repo/ProductRequestRepo.ts            — 11 repo functions including approval, status transitions
├── src/api/ProductRequestAPI.ts              — 8 API routes + 2 revised in ProductAPI.ts
├── src/types/ProductRequestType.ts           — TypeBox schemas, PubSub constants
├── src/ui/api/ProductRequests.ts             — Client API wrappers
├── src/ui/pages/OpenProductRequestsPage.tsx  — Filterable list with "Action for you" column
└── src/ui/pages/ProductRequestDetailPage.tsx — Value provision, approval, data type filtering
```

**Key design decisions**:
- Permission precedence: `ProductTypesDataTypePermission` > `DataTypePermission` for each field individually (showByDefault, mandatory, requestorCanEdit, config, owner).
- Product number auto-generation using `ProductNumberState` sentinel table with `SELECT ... FOR UPDATE`.
- Status auto-progression when all non-calculated data types are approved.
- Tri-state booleans for `mandatory` and `requestorCanEdit` (null = inherit from DataTypeSchema).
- 5 PubSub message constants: `create.ProductRequest`, `update.ProductRequestValue`, `approve.ProductRequestValue`, `cancel.ProductRequest`, `importing.ProductRequest`.

#### 5.8.3 Configuration Module

Runtime configuration stored in a single `config` table with composite PK `(domain, key)`.

```
Configuration Lifecycle
1. DECLARE    — Services export `config` objects with `ConfigEntryType` structure
2. DISCOVER   — Setup.ts walks service files, imports modules, finds mandatory entries
3. COLLECT    — Setup wizard (React SPA) prompts for missing values
4. VALIDATE   — Config.ts parses/validates values by type and inputFormat regex
5. PERSIST    — ConfigRepo.upsertConfigEntry() stores in DB
6. READ       — Services read via getConfigEntriesByKey() with fallback logic
7. EDIT       — AdminConfigList page allows runtime editing with optimistic locking
8. PUBLISH    — ConfigRepo publishes ["config", "update"] after successful update
```

**6 value types**: `string`, `number`, `boolean`, `object`, `string[]`, `number[]`

**6 services with config entries**: Auth (4 entries: RootUserGroup, SessionExpiration, ApiKeyLength, ApiKeyValidity), EntraID (4 entries: ClientID, ClientSecret, TenantID, SyncInterval), RequestBundling (11 entries: 6 server + 5 client), AuditLog (2 entries: FlushIntervalMs, FlushMaxBatchSize), UI Config (1 entry: page sizes), Notifications (12 entries: toggles, schedule, from address, subject, HTML template, base URL, internal timestamp, content-type flags).

**Only mandatory-for-start entry**: `cfgRootUserGroup` under domain `Authentication and Authorization`.

#### 5.8.4 Administration Module

```
Administration Domain
├── Users              — Imported from EntraID. Assigned to groups.
├── Groups             — Imported from EntraID. Assigned functional permissions.
├── API Keys           — Long-lived tokens with configurable length (32-256) and validity (1-730 days).
├── Functional Permissions — FP_* constants registered at startup. Group assignments.
├── Configuration      — Runtime parameters. Editable with optimistic locking.
└── Audit Log          — Immutable log of all mutations. Batch-flushed from PubSub.
```

### 5.9 Level 3: Cross-Cutting Infrastructure

#### 5.9.1 Database Connection & Migrations

**`DatabaseDriver.ts`** — Singleton Drizzle instance with lazy-init connection pool (max 10 `postgres` connections). Supports both main DB and transaction contexts via the `DBClient` union type.

**Migrations**: Umzug programmatic runner at `initDatabase()`. Supports `.ts` (JavaScript) and `.sql` migrations. Advisory lock prevents concurrent migration runs. Lock ID from `ADVISORY_LOCK` env var.

#### 5.9.2 PubSub Infrastructure

**Tag constants** (from `PubSubType.ts`):
- Action tags: `create`, `update`, `delete`, `grant`, `revoke`, `disable`, `enabled`, `login`, `logout`, `clear`, `upsert`
- Resource tags: `ConfigEntry`, `user`, `group`, `api_key`, `config`, `functional_permission`, `audit_entry`, `auth_session`

**Envelope**: `{ tags: Tag[], data?: any, timestamp: string }`

**Matching**: Recursive `expressionMatches(expr, tags)` evaluator with short-circuit (`or` stops at first match, `and` stops at first non-match).

#### 5.9.3 SSE Infrastructure

```
PubSub ──subscribeAll──► SSE Hub ──per-session filter──► Browser EventSource
                             │
                    ┌────────▼────────┐
                    │ Session Filter 1 │──► GET /api/server_sent_events/stream
                    │ (exprs: [...] )  │    (SSE: event, heartbeat, error)
                    ├─────────────────┤
                    │ Session Filter 2 │──► ...
                    └─────────────────┘
```

**Constants**: `DEFAULT_MAX_BUFFERED_EVENTS = 100`, `HEARTBEAT_INTERVAL_MS = 25000`, `STALE_TTL_MS = 1800000` (30 min), cleanup sweep every 5 minutes.

#### 5.9.4 Request Bundling Infrastructure

```
Client mutations
  apiPost() ──► queue ──► flush (250ms / 1MB / 10 reqs) ──► POST /api/request_bundling
      │                                                            │
      │◄── NDJSON stream ──── resolved per-request Promise ◄───────┘
                                                                 (dispatched concurrently via internal fetch)
```

**Nested bundling rejected**: Sub-requests targeting `/api/request_bundling` get 400.
**Auth forwarding**: `Authorization`, `X-API-Key`, `Cookie` headers forwarded to sub-requests.
**Timeout**: `max(defaultServerTimeoutMs, clamped(clientTimeoutMs), clamped(clientExpectedProcessingMs * 2))`.


## 06 — Runtime View

### 6.1 Application Startup Sequence

```
                         main.ts Startup Flow
───────────────────────────────────────────────────────────────► time

[1] initDatabase()
    ├─ Acquire advisory lock (from ADVISORY_LOCK env var)
    ├─ Run Umzug migrations (src/migrations/*.ts, *.sql)
    └─ Release advisory lock

[2] Register Functional Permissions
    └─ import services/auth/FunctionalPermissions.ts
       └─ Top-level awaits register all FP_* constants in DB

[3] Load Application Modules (dynamic imports)
    ├─ import apps/setup.ts
    ├─ import apps/login.ts
    ├─ import apps/api.ts    (auto-loads all route files)
    └─ import apps/ui.ts     (starts ClientBuilder)

[4] setupApp() — Check mandatory config
    ├─ getSetupDemand() walks service files for mandatoryForStart entries
    ├─ If demand exists: spawn standalone Elysia on PORT
    │   └─ Serve setup wizard → poll every 2s → stop when resolved
    └─ If no demand: proceed

[5] Start EntraID Sync
    ├─ startEntraIDSync()
    ├─ Initial delta sync (Microsoft Graph API)
    └─ await syncState.groupsReady (tolerates failure)

[6] Create Elysia App
    ├─ Static file routes: /public/*, /static/public/*
    ├─ injectDb(dbClient) — global derive for DB access
    └─ startAuditLog(dbClient) — begin PubSub subscription

[7] Mount Sub-Applications (order matters)
    ├─ app.use(loginApp)   — /login/* routes (checked first)
    ├─ app.use(apiApp)     — /api/* routes (auth enforced onBeforeHandle)
    └─ app.use(uiApp)      — /* catch-all (redirects to /login or serves SPA)

[8] app.listen(PORT)       — Start HTTP server (default 8000)
```

### 6.2 Authentication Flow

#### 6.2.1 OIDC Login Flow

```
Browser                    PMDM Server                    Microsoft EntraID
  │                           │                                │
  │  POST /login              │                                │
  │  (returnTo param)         │                                │
  │──────────────────────────►│                                │
  │                           │ startAuth()                    │
  │                           │  ├─ Generate PKCE challenge    │
  │                           │  ├─ Generate state, nonce      │
  │                           │  ├─ Build auth URL             │
  │                           │  └─ Set temp cookies           │
  │  302 Redirect to EntraID  │                                │
  │◄──────────────────────────│                                │
  │                                                             │
  │  GET /.../authorize       │                                │
  │───────────────────────────────────────────────────────────►│
  │                         User authenticates                  │
  │  302 Redirect with code   │                                │
  │◄───────────────────────────────────────────────────────────│
  │                                                             │
  │  GET /login/oauth2/code/entraid?code=...&state=...         │
  │──────────────────────────►│                                │
  │                           │ finishAuth()                   │
  │                           │  ├─ Validate cookies           │
  │                           │  ├─ Exchange code for tokens   │
  │                           │  │   (authorizationCodeGrant)  │
  │                           │  │◄────────────────────────────│
  │                           │  ├─ Extract oid claim          │
  │                           │  ├─ runInTransaction():        │
  │                           │  │   ├─ Upsert user in DB      │
  │                           │  │   └─ Sync group memberships │
  │                           │  ├─ Generate session ID        │
  │                           │  ├─ Store session in TTLMap    │
  │                           │  ├─ Set SessionID cookie       │
  │                           │  └─ Publish [auth_session,     │
  │                           │              login]             │
  │  302 Redirect to /login/loading (or returnTo)              │
  │◄──────────────────────────│                                │
```

#### 6.2.2 API Request Authentication (per-request)

```
Request arrives at /api/*
  │
  ▼
onBeforeHandle — is /api/health or /api/docs/*?
  ├─ Yes → proceed (public)
  └─ No  → isAuthenticated?
            ├─ Yes → proceed
            └─ No  → 401 Unauthorized

isAuthenticated derivation (global derive, priority order):
  1. SessionID cookie → getSession(db, sessionId)
     ├─ Found + not expired → authMethod = "session"
     └─ Not found / expired → continue
  2. X-API-Key header → validateApiKey(db, secret)
     ├─ Valid → authMethod = "apiKey"
     └─ Invalid → continue
  3. Authorization: Bearer header → validateBearerToken(db, token)
     ├─ Valid (token introspection) → authMethod = "bearer"
     └─ Invalid → not authenticated

session / apiKeyAuth / tokenClaims injected into context
```

#### 6.2.3 Permission Check Flow

```
Route handler calls authorize(db, tokens, [FP_CREATE_PRODUCT, FP_VIEW_PRODUCTS])
  │
  ▼
Is tokens.apiKeyIdentifier present?
  ├─ Yes → skip root group check (API keys NEVER get root bypass)
  └─ No  → getLoggedinUserObject(db, tokens.oid)
            └─ is user member of cfgRootUserGroup?
                ├─ Yes → return ALL requested permissions
                └─ No  → getMyFunctionalPermissions(db, tokens)
                          ├─ User: getFunctionalPermissionsOfUser(db, user)
                          └─ API key: getApiKeyPermissions(db, apiKeyId)
                        Return intersection(requested, held)
```

**Cache invalidation**:
- `{ and: ["auth_session", "logout"] }` → clear user's permission cache
- `{ and: ["api_key", "update"] }` → clear API key's permission cache

### 6.3 Product CRUD Flow (typical mutation)

```
Browser (UI)                     PMDM Server                    Database
  │                                │                              │
  │ ProductPage: user clicks save │                              │
  │                                │                              │
  │ apiPut("/api/products/:pn",   │                              │
  │   { ..., knownUpdatedAt })    │                              │
  │──► Request Bundling Queue ──► │                              │
  │    (coalesced with other       │                              │
  │     pending mutations)         │                              │
  │                                │                              │
  │   POST /api/request_bundling   │                              │
  │   (NDJSON batch)               │                              │
  │───────────────────────────────►│                              │
  │                                │ Parse & validate sub-requests│
  │                                │ Forward auth headers         │
  │                                │ Dispatch concurrently        │
  │                                │  (internal fetch to          │
  │                                │   PUT /api/products/:pn)     │
  │                                │                              │
  │                                │ ProductAPI route handler     │
  │                                │  ├─ authorize(FP_UPDATE_...) │
  │                                │  ├─ runInTransaction():      │
  │                                │  │   ├─ repo.updateProduct() │
  │                                │  │   │  ├─ Check updatedAt───│──► UPDATE ... WHERE
  │                                │  │   │  │   (optimistic lock)│    identifier=... AND
  │                                │  │   │  │                    │    updatedAt=knownUpdatedAt
  │                                │  │   │  ├─ Update product────│──► UPDATE products SET ...
  │                                │  │   │  ├─ Upsert values─────│──► UPSERT products_values
  │                                │  │   │  └─ Return updated row│◄── RETURNING *
  │                                │  │   └─ If 0 rows → 409      │
  │                                │  └─ repo publishes PubSub    │
  │                                │     ["product", "update"]    │
  │                                │     { identifiers: {         │
  │                                │       product: "5XXXXXX-01"}}│
  │                                │                              │
  │  NDJSON response stream       │                              │
  │◄──────────────────────────────│                              │
  │  { clientRequestId: "r1",    │                              │
  │    status: 200, body: {...}}  │                              │
  │                                │                              │
  │ resolve per-request Promise   │                              │
  │ update UI state               │                              │
```

### 6.4 Product Request Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    Product Request States                    │
│                                                             │
│   ┌──────┐    createRequest    ┌────────────┐               │
│   │ open │───────────────────►│  importing  │               │
│   └──┬───┘                    └──────┬─────┘               │
│      │                               │                      │
│      │ cancelRequest                  │ checkAllApproved()   │
│      ▼                               ▼                      │
│   ┌──────────┐                 ┌──────┐                     │
│   │ cancelled│                 │ done │ (deferred)          │
│   └──────────┘                 └──────┘                     │
│                       create/update Product                 │
│                       create ProductExport rows              │
└─────────────────────────────────────────────────────────────┘
```

#### 6.4.1 Create Product Request

```
Browser                          Server
  │                                │
  │ POST /api/products/:pn/        │
  │      request-update            │
  │  { mode: "new",               │
  │    productTypeId, ... }        │
  │───────────────────────────────►│
  │                                │ ProductAPI handler
  │                                │  ├─ authorize(FP_CREATE_PRODUCT)
  │                                │  ├─ runInTransaction():
  │                                │  │   ├─ SELECT ... FOR UPDATE
  │                                │  │   │   ON product_number_state
  │                                │  │   │   (lock + increment)
  │                                │  │   ├─ Generate product number
  │                                │  │   ├─ Calculate default values
  │                                │  │   │   (OnCreate / OnChangeNoValue)
  │                                │  │   ├─ Insert product_requests row
  │                                │  │   ├─ Insert product_requests_values
  │                                │  │   │   (one per data type)
  │                                │  │   └─ Compute actionableSummary
  │                                │  │      { needsValue, needsApproval }
  │                                │  └─ Publish ["ProductRequest",
  │                                │               "create"]
  │  200 { id, productNumber,     │
  │        actionableSummary }     │
  │◄──────────────────────────────│
```

#### 6.4.2 Value Provision & Approval

```
Browser                          Server
  │                                │
  │ PATCH /api/product-requests/   │
  │       :id/values/:dataTypeId   │
  │  { value: "new value",        │
  │    knownUpdatedAt }            │
  │───────────────────────────────►│
  │                                │ ProductRequestAPI handler
  │                                │  ├─ authorize by role:
  │                                │  │   Writer: FP_REQUEST_PRODUCT_UPDATE
  │                                │  │   Approver: FP_CREATE_PRODUCT
  │                                │  ├─ runInTransaction():
  │                                │  │   ├─ getEffectivePermissions()
  │                                │  │   │   ├─ Check ProductTypesDataTypePermission
  │                                │  │   │   │   (role, requestorCanEdit, editableOnUpdate, owner)
  │                                │  │   │   └─ Fall back to DataTypePermission
  │                                │  │   ├─ Validate: is field editable?
  │                                │  │   ├─ Update product_requests_values
  │                                │  │   ├─ checkAllApproved()
  │                                │  │   │   └─ If all non-calculated approved
  │                                │  │   │       → auto-advance to "importing"
  │                                │  │   └─ Return updated detail
  │                                │  └─ Publish ["ProductRequestValue", "update"]
  │  200 { ...updatedDetail,      │
  │        actionableSummary }     │
  │◄──────────────────────────────│
```

### 6.5 PubSub / SSE Event Flow

```
                Mutation in Repo
                      │
                      ▼
              repo publishes:
              PubSub.publish(["product", "update"], { identifiers: {...}, data: {...} })
                      │
                      ▼
              ┌─── PubSub Singleton ───┐
              │                        │
              ▼                        ▼
    AuditLog Subscriber        SSE Hub (subscribeAll)
    { or: [create, update,     │
           delete, grant,      │  For each session filter:
           revoke, disable,    │    expressions.some(expr =>
           enabled] }          │      expressionMatches(expr, tags))
       │                       │      │
       ▼                       │      ├─ Match → filter.enqueue(envelope)
    buffer entry              │      └─ No match → skip
       │                       │
       ▼ (every 60s or         │      GET /api/server_sent_events/stream
       500 entries)            │      async generator:
    flush to audit_log         │        while (true) {
       │                       │          event = await filter.next(signal, 25000)
       ▼                       │          if heartbeat → yield "keepalive"
    re-queue on failure         │          if event → yield "event" SSE frame
                               │          if null → break (disconnected/destroyed)
                               │        }
                               │              │
                               ▼              ▼
                         Browser EventSource receives:
                         event: pubsub
                         data: {"tags":["product","update"],"data":{...}}
                               │
                               ▼
                         Client PubSub.dispatch()
                         UI components react to events
```

### 6.6 Request Bundling Flow (Detailed)

```
Domain UI code:
  apiPut("/api/products/:pn", data)  ← developer calls normally
      │
      ▼
  _request_bundling.ts intercepts POST/PUT/PATCH/DELETE
      │
      ▼
  enqueueRequestBundledMutation(url, method, body, headers)
      │
      ├─ Create { url, method, body, headers, clientRequestId }
      ├─ Push to queue[]
      ├─ Create Promise (per-request)
      └─ Schedule flush (if not already scheduled)
           Flush triggers (whichever first):
           ├─ queue.length >= CLIENT_MAX_REQUESTS (10)
           ├─ queued bytes >= CLIENT_MAX_BYTES (1MB)
           └─ oldest item age >= CLIENT_MAX_AGE_MS (250ms)
      │
      ▼
  flushQueue()
      ├─ POST /api/request_bundling
      │   Body: NDJSON { requests: [...] }
      │   Headers: Authorization, X-API-Key, Cookie from original
      ├─ Read NDJSON response stream line by line
      │   For each line:
      │   ├─ Parse JSON
      │   ├─ Match by clientRequestId
      │   ├─ Resolve/reject the corresponding Promise
      │   └─ Remove from inflightMap
      └─ On stream end:
           └─ Any unresolved in inflightMap → reject with 502

  Server (RequestBundlingAPI.ts):
      POST /api/request_bundling
      ├─ Validate body (isRequestBundlingRequestItem for each)
      ├─ Reject nested bundling (URL ending in /api/request_bundling → 400)
      ├─ Forward auth headers to each sub-request
      ├─ Promise.allSettled: concurrent internal fetch for each sub-request
      │   ├─ computeServerTimeoutMs() for each
      │   └─ extractErrorMessage() on failure
      ├─ Buffer results → flush triggers:
      │   ├─ buffer.length >= FLUSH_COUNT (10)
      │   ├─ bufferedBytes >= FLUSH_BYTES (1MB)
      │   └─ flushTimer >= FLUSH_MS (250ms)
      └─ Stream: Content-Type: application/x-ndjson
```

### 6.7 Configuration Edit Flow

```
AdminConfigList page                     PMDM Server
  │                                        │
  │ User edits config value               │
  │ Sets knownValue to current DB value   │
  │                                        │
  │ PUT /api/config/:domain/:key           │
  │  { value: newValue,                    │
  │    knownValue: oldValue }              │
  │───────────────────────────────────────►│
  │                                        │ ConfigAPI handler
  │                                        │  ├─ authorize(FP_*)
  │                                        │  ├─ validateConfigInputFormat()
  │                                        │  ├─ Compare knownValue ↔ DB value
  │                                        │  │   (JSON canonicalization)
  │                                        │  ├─ Mismatch → 409 Conflict
  │                                        │  │   { error: "Conflict",
  │                                        │  │     currentValue: dbValue }
  │                                        │  ├─ Match → upsertConfigEntry()
  │                                        │  └─ Publish ["ConfigEntry", "update"]
  │                                        │
  │  200 OK / 409 Conflict                │
  │◄──────────────────────────────────────│
  │                                        │
  │ On 409:                                │
  │  Show conflict dialog                 │
  │  Offer to reload current value        │
```

### 6.8 EntraID Sync Flow

```
Startup / Cron schedule / Login event
  │
  ▼
startEntraIDSync()
  ├─ Read EntraID config from DB
  │   (ClientID, ClientSecret, TenantID, DeltaLinks)
  ├─ If SyncInterval ≠ "off":
  │   └─ Schedule cron job at configured interval
  ├─ Create MS Graph client (ClientSecretCredential)
  ├─ Delta-based sync:
  │   ├─ GET /users/delta (with stored delta link)
  │   │   └─ Upsert users in DB (upsertUsers)
  │   ├─ GET /groups/delta (with stored delta link)
  │   │   └─ Upsert groups in DB (upsertGroups)
  │   └─ Store new delta links in DB
  ├─ membershipSync(userId):
  │   └─ GET /users/:id/memberOf
  │       └─ setUserMemberships(db, userId, groupIds)
  │           └─ deleteObsoleteUserGroupAssignments()
  ├─ Publish ["user", "upsert"] / ["group", "upsert"]
  └─ Return { groupsReady: Promise<void> }

Login-triggered sync:
  On login → publish ["auth_session", "login"]
    └─ EntraIDSync subscriber triggers membershipSync()
```

### 6.9 Session Lifecycle

```
Session created                    Session refreshed                  Session expired
     │                                   │                                │
     ▼                                   ▼                                ▼
TTLMap.set(sessionId,             refreshSession()                 TTLMap entry
  { expiresAt: now+900s })         ├─ inFlightRefreshes              auto-purged on
     │                             │   dedup check                  next get/cleanup
     ▼                             ├─ refreshTokenGrant()               │
getSession() called               ├─ Update session                          ▼
  ├─ Read from TTLMap             │   tokens + expiry            getSession()
  ├─ Check expiry                 └─ Publish [auth_session,        returns undefined
  ├─ Near expiry (<15min)?        │             update]               │
  │   ├─ Yes → auto-refresh              │                       API returns 401
  │   └─ No  → return session          ┌─▼──────────┐           Browser redirects
  └─ Update last read timestamp       │ PubSub event│               to /login
    (sliding window)                   │ triggers:   │
                                       │ cache clear │
                                       └─────────────┘
```


## 07 — Deployment View

### 7.1 Infrastructure Overview

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

### 7.2 Runtime Requirements

| Requirement | Detail |
|-------------|--------|
| Runtime | Bun (latest stable) |
| Database | PostgreSQL (accessible via connection string) |
| Network | Outbound HTTPS to Microsoft EntraID (login, Graph API) |
| Port | `PORT` env var (default 8000) |
| Memory | No specific requirements; single process with in-memory session store |

### 7.3 Environment Variables

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://pmdm:****@10.0.1.2:5432/pmdm2` |
| `ADVISORY_LOCK` | Yes | Unique 64-bit integer for migration lock | `9158437265819472037` |
| `PORT` | No | HTTP listen port (default 8000) | `8000` |
| `DEV_MODE` | No | Enables dev mode (verbose logging, watch rebuilds) | `1` |
| `SQL_LOGGING` | No | Enables Drizzle SQL query logging | `1` |

The `.env` file is git-ignored and contains only `DATABASE_URL` and `ADVISORY_LOCK`. OIDC secrets (ClientID, ClientSecret, TenantID) are stored in the database `config` table, not in environment variables.

### 7.4 Build & Deployment Pipeline

#### 7.4.1 Development

```bash
## Generate database migrations
bun run drizzle

## Generate TypeBox types from Drizzle schemas
bun run typegen

## Start dev server with hot reload
DEV_MODE=1 bun run dev
## (runs: DEV_MODE=1 bun src/main.ts)

## Run tests
bun test --timeout 30000
```

In dev mode:
- `DEV_MODE=1` enables verbose console logging for startup and route loading.
- `ClientBuilder.ts` watches source files and rebuilds the client bundle on changes.
- `@elysia/server-timing` adds performance headers.
- `Cache-Control` for `client.js` is `no-cache` (vs. `max-age=31536000, immutable` in production).

#### 7.4.2 Production

```bash
## Build the application
bun run build
## (runs: bun build src/main.ts --target bun --outdir ./dist)

## Start the production server
NODE_ENV=production bun run start
## (runs: NODE_ENV=production bun dist/main.js)
```

The build step uses `bun build` with target `bun`, producing a single output directory (`./dist`). The production start runs the bundled output directly with Bun.

**No Docker image is built.** Deployment is expected to be a direct `bun dist/main.js` invocation on the host, possibly managed by a process supervisor (systemd, pm2, etc.).

#### 7.4.3 Type Generation

```bash
## One-time generation
bun run typegen

## Watch mode (for development)
bun run typegen:watch
```

The `scripts/generate_types.ts` script uses `ts-morph` to parse Drizzle schema files and auto-generate `src/types/_*.ts` files with TypeBox schemas.

### 7.5 Static Assets

#### 7.5.1 Asset Locations

| Path | Content | Auth Required |
|------|---------|---------------|
| `/public/*` | Public assets (CSS, images, fonts, icons) | No (before app mount, but caught by UI catch-all) |
| `/static/public/*` | Static public assets | No |
| `/ui/client.js` | Client React bundle (built by `ClientBuilder.ts`) | Yes (served via UI app) |
| `/login/client.js` | Login page bundle | No (served within login app) |
| `/setup/client.js` | Setup wizard bundle | No (served within setup app) |

#### 7.5.2 Client Bundle Caching

| Mode | Cache-Control | ETag |
|------|--------------|------|
| Development | `no-cache` | SHA-256 of bundle content |
| Production | `max-age=31536000, immutable` | SHA-256 of bundle content |

The ETag enables conditional requests (`If-None-Match` → `304 Not Modified`). The bundle filename (`client.js`) is intentionally static — content changes are detected via ETag mismatch, not filename rotation.

### 7.6 Database Deployment

#### 7.6.1 Connection Pool

The `postgres` npm package manages a connection pool with:
- **Max connections**: 10
- **Idle timeout**: 20 seconds
- **Connect timeout**: 10 seconds

The pool is created lazily on first `getDatabaseConnection()` call (a module-level singleton).

#### 7.6.2 Migrations

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

#### 7.6.3 Schema Overview

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

### 7.7 Startup Dependencies

The startup sequence has one external dependency that can fail gracefully:

| Dependency | Critical | Fallback |
|------------|----------|----------|
| PostgreSQL | **Yes** | Application cannot start. Migration and config checks fail. |
| Microsoft EntraID (sync) | No | Start continues; `console.warn` logged. Sync retries on cron schedule. |
| Microsoft EntraID (login) | No | Login will fail when attempted, but server starts. |

### 7.8 Logging & Monitoring

| Aspect | Implementation |
|--------|---------------|
| Application logs | `console.log` / `console.warn` / `console.error` to stdout/stderr |
| Dev mode logging | Verbose startup steps, route loading, bundle rebuilds |
| Health check | `GET /api/health` returns `{ status: "ok", ... }` |
| Audit log | All mutations recorded to `audit_log` table via PubSub subscription |
| Error handling | PubSub subscriber errors swallowed by default (`immediateExceptions: false`) and re-thrown via `setTimeout` |

### 7.9 Backup & Recovery

- **Database**: Standard PostgreSQL backup strategies apply (pg_dump, WAL archiving, replication).
- **Application state**: No state outside the database. Session store is in-memory — lost on restart.
- **Configuration**: All runtime configuration is in the database. The `.env` file only contains `DATABASE_URL` and `ADVISORY_LOCK`.
- **Migration rollback**: Umzug supports `down()` functions in migration files for manual rollback.


## 08 — Crosscutting Concepts

### 8.1 Authentication & Authorization

#### 8.1.1 Authentication Methods

Three authentication methods are supported, checked in priority order:

| Priority | Method | Header / Source | Validation |
|----------|--------|-----------------|------------|
| 1 (highest) | Session cookie | `Cookie: SessionID=...` | `getSession()` → TTLMap lookup with expiry/near-expiry refresh |
| 2 | API key | `X-API-Key: ...` | `validateApiKey()` → hash comparison against stored secret hash |
| 3 | Bearer token | `Authorization: Bearer ...` | `validateBearerToken()` → OIDC token introspection endpoint |

Auth context is derived once per request in `apps/api.ts` via a global `derive` and is available to all route handlers as `session`, `apiKeyAuth`, `isAuthenticated`, `authMethod`, and `tokenClaims`.

#### 8.1.2 Authorization Model

**Functional permissions** are named constants (e.g., `FP_CREATE_PRODUCT`, `FP_VIEW_PRODUCTS`) registered in the database at startup. Permissions are assigned to groups. Users inherit permissions from their group memberships.

**`authorize(db, tokens, requestedPermissions)`** returns the **intersection** of requested and held permissions (not a boolean). Callers check `result.length > 0` or filter by identifier.

**Root group bypass** (`cfgRootUserGroup`):
- Members of the configured root user group receive **all** requested permissions.
- This is the **only** permission bypass in the system.
- API keys **never** get root bypass, even if the key's owner is a root group member.

**Permission precedence for Product Requests**:
For each field in a product request, permissions are resolved by checking in order:
1. `ProductTypesDataTypePermission` (product-type-specific override)
2. `DataTypePermission` (global data type default)

Each aspect is checked independently: `role`, `showByDefault`, `mandatory`, `requestorCanEdit`, `config`, and `owner` (six aspects).

#### 8.1.3 Session Management

Sessions are stored in a `TTLMap<string, Session>` (in-memory, not persisted to DB). The configurable session timeout defaults to 900 seconds (15 minutes). A sliding-window TTL resets on every `getSession()` call. Near-expiry (15 minutes before timeout) triggers automatic OIDC refresh token grant. Concurrent refresh attempts are deduplicated via an `inFlightRefreshes` TTLMap.

| Event | PubSub Tags |
|-------|-------------|
| Login | `["auth_session", "login"]` |
| Logout | `["auth_session", "logout"]` |
| Session refresh | `["auth_session", "update"]` |

#### 8.1.4 API Key Lifecycle

API keys are long-lived authentication tokens:
- **Length**: Configurable, 32–256 characters (default 256)
- **Validity**: Configurable, 1–730 days (default 90)
- **Format**: `ak_<random_secret>` — the `ak_` prefix identifies API key secrets
- **Creation**: Secret is generated and shown once; only a hash is stored
- **States**: active → disabled → deleted (soft-delete)
- **Prolong**: Validity can be extended without rotation
- **No root bypass**: API keys always use explicit group-based permissions

### 8.2 Configuration Management

#### 8.2.1 Config Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ DECLARE  │───►│ DISCOVER │───►│ COLLECT  │───►│ VALIDATE │───►│ PERSIST  │
│ (service │    │ (setup   │    │ (wizard  │    │ (Config  │    │ (Config  │
│  modules)│    │  demand) │    │  UI)     │    │  .ts)    │    │  Repo)   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └────┬─────┘
                                                                     │
                                              ┌──────────┐    ┌──────▼──────┐
                                              │ PUBLISH  │◄───┤   EDIT      │
                                              │ (PubSub) │    │ (Admin UI)  │
                                              └──────────┘    └─────────────┘
```

#### 8.2.2 Config Value Types

| Type | Storage | Example |
|------|---------|---------|
| `string` | Text | `"https://login.microsoftonline.com/..."` |
| `number` | Text (parsed) | `900` |
| `boolean` | Text (`"true"` / `"false"` / `"1"`) | `true` |
| `object` | JSON string | `{"key": "value"}` |
| `string[]` | JSON array or comma-separated | `["a", "b"]` |
| `number[]` | JSON array | `[1, 2, 3]` |

#### 8.2.3 Seeding Patterns

**Pattern A — Seed at startup**: The service's `init()` function iterates its `config` object and upserts entries with defaults. Used by `Auth.ts` (root group, session expiry, API key config) and `AuditLog.ts` (flush interval, batch size).

**Pattern B — Lazy upsert on first read**: The service's config reader checks for the value, returns a hardcoded default if missing, and upserts the default to DB. Used by `RequestBundling.ts` (performance-tuning knobs) and `ui_config.ts` (page sizes).

#### 8.2.4 Optimistic Locking for Config

```
PUT /api/config/:domain/:key
  Body: { value: newValue, knownValue: "current_db_value" }
  
  Server:
    currentValue = DB.value ?? ""   // empty string for null DB values
    if (knownValue !== currentValue)
        return 409 { error: "Conflict", currentValue }
    upsertConfigEntry(domain, key, newValue)
    publish ["ConfigEntry", "update"] // note: TAG_CONFIGENTRY, not TAG_CONFIG
    return 200
```

### 8.3 PubSub Messaging

#### 8.3.1 Tag Model

PMDM uses a **tag-based PubSub system** with boolean expression matching (NOT hierarchical dot-separated topics).

**Tag**: A flat, lowercase `snake_case` string identifier with no hierarchy and no intrinsic order.

**TagExpression**: A recursive structure supporting boolean composition:
```typescript
type TagExpression =
  | "tag"                          // Single tag match
  | { and: TagExpression[] }      // ALL sub-expressions must match
  | { or: TagExpression[] }       // AT LEAST ONE sub-expression must match
  | { not: TagExpression }        // Sub-expression must NOT match
```

**Matching**: The `expressionMatches(expr, tags)` function evaluates recursively with short-circuit semantics:
- `or` stops at the first match (returns `true`)
- `and` stops at the first non-match (returns `false`)

#### 8.3.2 Tag Constants

| Category | Tags |
|----------|------|
| **Actions** | `create`, `update`, `delete`, `grant`, `revoke`, `disable`, `enabled`, `login`, `logout`, `clear`, `upsert` |
| **Resources** | `ConfigEntry`, `user`, `group`, `api_key`, `config`, `functional_permission`, `audit_entry`, `auth_session` |

#### 8.3.3 Publish Convention

Every `publish()` call should include an `identifiers` object mapping resource tags to their IDs:
```typescript
PubSub.publish(["product", "update"], {
  identifiers: { product: "5XXXXXX-01" },
  data: { /* changed fields */ }
})
```

#### 8.3.4 Subscription Patterns

| Subscriber | Expression | Purpose |
|------------|-----------|---------|
| Audit Log | `{ or: ["create", "update", "delete", "grant", "revoke", "disable", "enabled"] }` | Capture all mutations |
| SSE Bridge | `subscribeAll` (wildcard `"*"`) | Fan all events to per-session filters |
| Request-specific | `{ and: ["ConfigEntry", "update"] }` | React to specific resource changes |
| Permissions cache | `{ and: ["auth_session", "logout"] }` | Invalidate cache on logout |

#### 8.3.5 Delivery Model

- **`publish(tags, data)`**: Asynchronous delivery via `setTimeout(deliver, 0)`. Returns `false` if no subscribers exist.
- **`publishSync(tags, data)`**: Synchronous delivery for cases where callers need immediate side effects.
- **Error handling**: By default, subscriber errors are swallowed and re-thrown via `setTimeout`. Setting `immediateExceptions = true` makes them throw synchronously.

### 8.4 Server-Sent Events

#### 8.4.1 Architecture

```
Server PubSub ──subscribeAll──► SSE Hub
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              Session A      Session B      Session C
              Filter         Filter         Filter
           [expr1, expr2]  [expr3]        [expr4, expr5]
                    │             │             │
                    ▼             ▼             ▼
               EventSource   EventSource   EventSource
               (browser)     (browser)     (browser)
```

#### 8.4.2 Key Design Decisions

- **Server-side session key**: Derived from auth context (`api_key:<id>` or `session_user:<oid>`), opaque to the browser. No client-provided session ID in query params.
- **Expression sync via PATCH**: `PATCH /api/server_sent_events/expressions` (debounced at 50ms client-side) syncs tag expressions. Not embedded in the EventSource URL.
- **Persistent filters**: Filters survive browser disconnections. The event queue buffers up to 100 events. Reconnecting clients retrieve queued events first.
- **Stale cleanup**: Filters disconnected for > 30 minutes are destroyed (every 5-minute sweep).
- **Heartbeat**: Every 25 seconds of inactivity, a `keepalive` event is sent.
- **Multi-tab**: All tabs share a single filter/expression set. Events are split across tabs (not duplicated).

#### 8.4.3 Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_MAX_BUFFERED_EVENTS` | 100 | Max queued events per disconnected session |
| `HEARTBEAT_INTERVAL_MS` | 25000 | Keepalive interval (25 seconds) |
| `STALE_TTL_MS` | 1800000 | Disconnected session TTL (30 minutes) |
| Cleanup interval | 300000 | Stale filter sweep (5 minutes) |

### 8.5 Request Bundling

#### 8.5.1 Concept

Client-side mutations (POST, PUT, PATCH, DELETE) are transparently coalesced into NDJSON batch requests. Domain UI code calls `apiPost()`, `apiPut()`, etc. normally — the bundling is invisible above the `src/ui/api/` transport layer.

#### 8.5.2 Client-Side Queue

```
Mutation calls → queue[] → flush triggers (whichever first):
  ├─ queue.length >= maxRequests (10)
  ├─ bytes buffered >= maxBytes (1MB)
  └─ oldest item age >= maxAgeMs (250ms)
       │
       ▼
  POST /api/request_bundling
  NDJSON body: { requests: [...] }
  NDJSON response stream: resolve per-request Promises
```

#### 8.5.3 Server-Side Dispatch

```
POST /api/request_bundling
  ├─ Validate each request item
  ├─ Reject nested bundling (URL ending in /api/request_bundling → 400)
  ├─ Forward Authorization, X-API-Key, Cookie to sub-requests
  ├─ Concurrent internal fetch (Promise.allSettled)
  │   └─ Per-request timeout: max(default, clamped(client), clamped(expected*2))
  ├─ Buffer results → flush (count=10 / bytes=1MB / timer=250ms)
  └─ NDJSON response stream
```

#### 8.5.4 Configurable Parameters

All thresholds are configurable via the database `config` table under domain `request_bundling`. If config entries don't exist, hardcoded fallback defaults are used.

**Server-side** (6 entries): `Server.FlushMs` (250), `Server.FlushBytes` (1MB), `Server.FlushCount` (10), `Server.DefaultTimeoutMs` (30000), `Server.MinTimeoutMs` (5000), `Server.MaxTimeoutMs` (120000).

**Client-side** (5 entries): `Client.MaxAgeMs` (250), `Client.MaxBytes` (1MB), `Client.MaxRequests` (10), `Client.DefaultExpectedProcessingMs` (15000), `Client.DefaultTimeoutMs` (45000).

### 8.6 Optimistic Locking

#### 8.6.1 Pattern

All mutating operations use optimistic locking via the `updatedAt` timestamp:

```
1. READ:    GET /api/entity/:id → response includes updatedAt
2. MODIFY:  User edits in UI, keeps updatedAt
3. WRITE:   PUT /api/entity/:id { ..., knownUpdatedAt: <step 1 value> }
4. CHECK:   UPDATE ... SET ... WHERE identifier = :id AND updatedAt = :knownUpdatedAt
5. RESULT:  If 0 rows affected → 409 Conflict
            If 1 row affected   → 200 OK
```

#### 8.6.2 Implementation

In the CRUD factory (`_crud_Repo.ts`), the `update()` function:
1. Adds `where(eq(schema.updatedAt, knownUpdatedAt))` to the update
2. Returns the updated row (or empty array if conflict)
3. The API handler checks `result.length === 0` → `409 Conflict`

For configuration entries, the `knownUpdatedAt` is compared against the DB value explicitly:
```
if (knownUpdatedAt !== dbValue.updatedAt) return 409
```

#### 8.6.3 Scope

Optimistic locking applies to:
- All configuration entities (via CRUD factory)
- Product updates
- Product request value updates
- Configuration entry edits

It does **not** apply to:
- Product request creation (new entities have no concurrent writers)
- Product request status transitions (state machine transitions are atomic in transactions)
- Audit log insertion (append-only, no conflicts)
- EntraID sync upserts (idempotent, last-write-wins)

### 8.7 Audit Logging

#### 8.7.1 Approach

The audit log is an **append-only, batched subscriber** to the PubSub system.

- **Subscription**: `{ or: ["create", "update", "delete", "grant", "revoke", "disable", "enabled"] }`
- **Batching**: Entries accumulate in memory. Flushed to `audit_log` table on:
  - Batch size threshold (default 500 entries)
  - Time interval (default 60 seconds)
- **Failure recovery**: If `insertAuditEntries` fails, the failed batch is prepended to the in-memory queue for retry on the next flush.
- **Entry format**: `{ topic, payload, createdBy, createdAt }` with `topic` as comma-joined tags and `payload` as JSON.
- **Not audited**: `clear` operations (e.g., clearing the audit log itself). `upsert` operations are also not audited.

#### 8.7.2 Configurable Parameters

| Parameter | Domain | Key | Default |
|-----------|--------|-----|---------|
| Flush interval | `audit_log` | `FlushIntervalMs` | 60000 (60s) |
| Max batch size | `audit_log` | `FlushMaxBatchSize` | 500 |

### 8.8 EntraID Synchronization

#### 8.8.1 Sync Methods

- **Initial sync**: At startup (`startEntraIDSync()`), runs a delta-based sync of all users and groups via Microsoft Graph API.
- **Scheduled sync**: If `SyncInterval` config is not `"off"`, a cron job runs at the configured interval.
- **Login-triggered sync**: When a user logs in (`["auth_session", "login"]`), `membershipSync(userId)` fetches the user's current group memberships and updates the DB.
- **Delta links**: Stored in the config table under `EntraID` domain. Enables incremental sync (only changed users/groups since last sync).

#### 8.8.2 Sync Flow

```
Graph API delta query
  ├─ GET /users/delta?$deltatoken=...
  │   └─ upsertUsers() — insert/update user rows
  └─ GET /groups/delta?$deltatoken=...
      └─ upsertGroups() — insert/update group rows
          
membershipSync(userId)
  └─ GET /users/:id/memberOf
      └─ setUserMemberships()
          └─ deleteObsoleteUserGroupAssignments()

Publish: ["user", "upsert"] / ["group", "upsert"]
```

### 8.9 Type Generation

The `drizzle-typebox` package auto-generates TypeBox schemas from Drizzle ORM definitions. The `scripts/generate_types.ts` script (run via `bun run typegen`):

1. Parses all `src/schema/*.ts` files using `ts-morph`
2. Extracts Drizzle table definitions and column types
3. Generates `src/types/_<Name>.ts` files with TypeBox schemas for selects, inserts, and updates
4. Files are marked `DO NOT EDIT` — manual extensions go in `<Name>.ts` files

Generated schemas include:
- `XxxSelectSchema` — Full row select type
- `XxxInsertSchema` — Insert type (without auto-generated columns)
- `XxxUpdateSchema` — Partial update type

These schemas are used by Elysia route handlers for request/response validation via the OpenAPI integration.

### 8.10 Error Handling

#### 8.10.1 API Error Responses

| Status | Condition | Response |
|--------|-----------|----------|
| 401 | Not authenticated | `{ error: "Unauthorized", message: "Authentication required" }` |
| 403 | Insufficient permissions | `{ error: "Forbidden", message: "..." }` |
| 404 | Entity not found | `{ error: "Not Found", message: "..." }` |
| 409 | Optimistic lock conflict | `{ error: "Conflict", currentValue: "..." }` |
| 422 | Validation failure | `{ error: "Validation Error", details: [...] }` |
| 500 | Internal error | Standard Elysia error response |

#### 8.10.2 OIDC Error Handling

- If EntraID sync fails during login, the entire login fails — ensuring that new users are properly set up before they can use the application.
- If EntraID sync fails at startup, the application continues with a warning. Sync retries on the cron schedule.

#### 8.10.3 PubSub Error Handling

- By default, subscriber errors are caught and re-thrown asynchronously (`setTimeout(throw, 0)`) to prevent one subscriber from blocking others.
- `immediateExceptions = false` (default) swallows errors; set to `true` for testing.

### 8.11 Notification System

#### 8.11.1 Architecture

The notification system sends email digests for product request status changes via Microsoft Graph API. It uses a CRON-based scheduler and supports manual triggering and simulation.

#### 8.11.2 Email Delivery

Emails are sent via Microsoft Graph API's `sendMail` endpoint (`POST /users/{fromEmail}/sendMail`). The sender (`fromEmail`) is configurable. HTML email content is rendered from a configurable template supporting `{base_url}` and other placeholders.

#### 8.11.3 Digest Scheduling

A CRON schedule (configurable, default disabled) triggers digest emails. The digest compiles pending and transitioning product requests across all users and groups. Each digest email includes requests awaiting user action and requests in transition status, with links to the PMDM application.

#### 8.11.4 Manual and Simulation Modes

- **Manual send**: Administrators can trigger a digest email for a specific user, group, or all users.
- **Simulation mode**: Preview the digest email content without actually sending it.

#### 8.11.5 Configuration

12 configuration entries under the `notification` domain control:
- Toggle switches: `SendOnCronEnabled`, `DigestByIndividualUsersEnabled`, `DigestByGroupsEnabled`
- Schedule: `Cronschedule` (cron expression, "off" to disable)
- Content: `FromEmail`, `Subject`, `HtmlTemplate`, `BaseUrl`
- Timing: `InternalTimestamp` (last digest timestamp)
- Display: `ShowAwaitingTable`, `ShowTransitionTable`, `ShowSummaryTable`

#### 8.11.6 Client-Side

The `AdminNotifications` page (`../src/ui/pages/pmdm/AdminNotifications.tsx`) provides a full configuration UI with inline editing of all config entries with optimistic locking, manual send controls, and email simulation/preview.

### 8.12 Client-Side Architecture

#### 8.12.1 Bundle Strategy

The entire React SPA is built as a single ESM bundle by `ClientBuilder.ts` using `Bun.build()`. The bundle is served at `/ui/client.js` with:
- **SHA-256 ETag** for conditional requests
- **Long-lived Cache-Control** in production (`max-age=31536000, immutable`)
- **No chunking or code splitting** — single bundle simplifies caching and deployment

#### 8.12.2 API Communication

All API calls from the UI go through `src/ui/api/` wrappers. The transport layer (`_client.ts`) provides `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete` functions. Mutations are transparently intercepted by `_request_bundling.ts`.

Domain pages never call `fetch()` directly. This ensures:
- Consistent error handling
- Automatic request bundling for mutations
- Single point of change for transport concerns

#### 8.12.3 Real-Time Updates (Client)

The client-side SSE bridge (`src/ui/server_sent_events.ts`):
1. Opens an `EventSource` to `/api/server_sent_events/stream`
2. Handles reconnection with exponential backoff
3. Forwards received events to the browser-side PubSub
4. Syncs tag expressions via `PATCH /api/server_sent_events/expressions` (debounced 50ms)

UI components subscribe to the browser PubSub for reactive updates without polling.

#### 8.12.4 Page Registry & Permission-Aware Navigation

The `PageRegistry.ts` is the central registry for all pages. Each page declares required functional permissions. Navigation menus are built dynamically based on the user's granted permissions using `buildNavTree(getVisiblePages(userPermissions))`.

Pages without the required permissions are hidden from navigation and inaccessible by direct URL.


## 09 — Architectural Decisions

This section documents key architectural decisions (ADRs) with their rationale and trade-offs.

### ADR-001: Strict Layered Architecture with Import Bans

**Status**: Accepted  
**Date**: Project inception

#### Context

The application needed a maintainable codebase with clear separation of concerns, preventing business logic from leaking into HTTP handlers, database access from leaking out of repositories, and schema-level imports from creating tight coupling.

#### Decision

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

#### Consequences

- ✅ Clear boundaries make it easy to locate and modify code.
- ✅ New developers can quickly understand where code belongs.
- ✅ The CRUD factory pattern is possible because repository and API patterns are consistent.
- ❌ Strict import bans mean some seemingly reasonable imports are disallowed (e.g., API handlers cannot import `drizzle-orm` helpers directly; they must go through repos).
- ❌ Refactoring requires touching multiple layers.

### ADR-002: Generic CRUD Factories for Configuration Entities

**Status**: Accepted  
**Date**: Project inception

#### Context

Multiple domain entities (business domains, consumables, lookups, target systems) share an identical pattern: entity identified by UUID, name-based search, enable/disable, optimistic locking, and standard CRUD operations. Writing repetitive repo and API code for each would be maintenance-heavy.

#### Decision

Two factory functions were created:

- **`_crud_Repo.ts`**: `createConfigurationRepository()` generates `count`, `get`, `getByIdentifier`, `create`, `update`, `disable`, `enable` with built-in PubSub publication and optimistic locking.
- **`_crud_API.ts`**: `registerConfigurationEntityRoutes()` generates full REST routes with OpenAPI documentation, pagination, and permission checks.

#### Consequences

- ✅ Adding a new configuration entity requires minimal code (schema + type files + thin factory-wrapping files).
- ✅ Consistent behavior across all configuration entities (pagination, search, conflict handling).
- ❌ Entities that deviate from the standard pattern cannot use the factories. **Products** cannot use them because it uses `productNumber` (text) as PK instead of `identifier` (UUID). **DataTypes** cannot because of discriminated config typing. **ProductTypes** cannot because of nested sub-entities.
- ❌ Changes to the factory affect all consumers — must be tested carefully.

### ADR-003: Tag-Based PubSub Instead of Hierarchical Topics

**Status**: Accepted (implemented)  
**Date**: Migration from `design/pubsub.md`

#### Context

The initial PubSub design used hierarchical dot-separated topic strings (e.g., `"auth.session.login"`). Subscribers matched on topic prefixes. This approach had several limitations:
- Topic strings required convention and documentation.
- Prefix matching was coarse-grained (couldn't express "A OR B but NOT C").
- Adding new topic levels required updating all subscribers.

#### Decision

The PubSub system was migrated to **tag-based boolean expression matching** with `and`/`or`/`not` operators. Publishers emit flat `Tag[]` arrays. Subscribers use `TagExpression` structures.

#### Consequences

- ✅ Subscribers can express precise matching criteria (e.g., "all 'create' events on 'user' OR 'group' resources").
- ✅ Tags have no hierarchy — adding new resource types doesn't affect existing subscribers.
- ✅ The matching algorithm (`expressionMatches`) is simple, recursive, and short-circuits.
- ❌ No backward compatibility shim — all publishers and subscribers had to be updated simultaneously.
- ❌ The tag model requires translators at both ends to convert tags to/from meaningful events, adding complexity compared to hierarchical topics.

### ADR-004: Configuration-as-Code with Database Storage

**Status**: Accepted  
**Date**: Project inception

#### Context

Runtime parameters (OIDC credentials, feature flags, performance tuning knobs) needed to be:
- Declared alongside the code that uses them
- Editable at runtime without restart
- Validated with type-aware rules
- Enforced at startup for mandatory values

#### Decision

Services export `config` objects declaring their runtime parameters. The setup system discovers missing mandatory entries at startup and blocks the application until they're configured. All config is stored in a single `config` table with composite PK `(domain, key)`.

Two seeding patterns:
- **Pattern A** (startup): Seed all entries at once — for critical config that must exist.
- **Pattern B** (lazy): Upsert on first read — for optional tuning knobs with sensible defaults.

#### Consequences

- ✅ Configuration is co-located with the code that depends on it.
- ✅ The setup wizard provides a guided first-run experience.
- ✅ Runtime editing via the admin UI with optimistic locking prevents conflicts.
- ❌ Config caching in some services (e.g., `RequestBundling.ts`) means changes require a restart to take effect.
- ❌ The `value` column is `text` — all types are stored as strings, requiring `parseConfigValue()` on read.

### ADR-005: Products Module — Custom Repository and API (No Factories)

**Status**: Accepted  
**Date**: `design/product.md` decision #1

#### Context

The Products module has a fundamentally different data model from other domain entities:
- Primary key is `productNumber` (text, pattern `5XXXXXX-01`) instead of `identifier` (UUID).
- Products have associated `products_values` (many values per product) that are created/updated atomically.
- Product values support server-side viewer permission filtering.
- Products can be imported (XLSX) and copied.

#### Decision

The Products module has a **fully custom** repository and API — it does NOT use the `_crud_Repo` or `_crud_API` factories. All product operations are hand-written in `ProductRepo.ts` and `ProductAPI.ts`.

#### Consequences

- ✅ The data model is not forced into the factory's constraints.
- ✅ The `productNumber` text PK allows human-readable product identifiers.
- ✅ Atomic product + values mutations are possible.
- ❌ More code to maintain compared to factory-based entities.
- ❌ No shared behavior with other entities — bugs in product code may not be caught by factory tests.

### ADR-006: Request Bundling for Client Mutations

**Status**: Accepted  
**Date**: `design/request_bundling.md`

#### Context

The browser client frequently performs multiple independent mutations in quick succession (e.g., updating several data type values on a product request detail page). Each mutation would normally be a separate HTTP request, adding latency and server load.

#### Decision

Implement a **transparent request bundling** layer in `src/ui/api/_request_bundling.ts` that intercepts all mutating requests, queues them, and dispatches them as a single NDJSON batch to `POST /api/request_bundling`. Each individual request still returns its own Promise — the bundling is invisible to domain UI code.

#### Consequences

- ✅ Domain UI code is unchanged — `apiPost()` calls work the same with or without bundling.
- ✅ Benchmarks show 4.5–10x reduction in HTTP requests for bulk operations.
- ✅ Server-side dispatch uses concurrent `fetch()` for sub-requests with configurable timeouts.
- ✅ Nested bundling is explicitly rejected (400) to prevent infinite recursion.
- ❌ Added complexity in the transport layer — debugging requires understanding the NDJSON stream.
- ❌ Long-polling or streaming responses are not supported through bundling.

### ADR-007: Optimistic Locking via `updatedAt`

**Status**: Accepted  
**Date**: Project inception (documented in root `AGENTS.md`)

#### Context

Concurrent modifications to the same entity (e.g., two administrators editing the same configuration entry) could result in lost updates if last-write-wins is used without protection.

#### Decision

All mutating operations use **optimistic locking** via the `updatedAt` timestamp. The client reads `updatedAt`, includes it in the mutation request, and the server checks that the DB's `updatedAt` matches. If it doesn't match, a `409 Conflict` is returned with the current value.

#### Consequences

- ✅ Prevents lost updates without holding database locks.
- ✅ The `updatedAt` timestamp serves dual purpose: audit (when was it changed) and concurrency (has it changed since I read it).
- ✅ Standard pattern across all entity types.
- ❌ Clients must handle 409 Conflict responses (reload and retry).
- ❌ Does not prevent all race conditions — serializable transactions handle those.

### ADR-008: Serializable Transaction Isolation

**Status**: Accepted  
**Date**: Project inception

#### Context

Multi-step mutations (e.g., creating a product request with auto-generated product number, inserting request values, and creating export rows) require atomicity and must prevent anomalies like phantom reads or serialization conflicts.

#### Decision

`runInTransaction()` in `DatabaseDriver.ts` uses **`isolationLevel: "serializable"`** — PostgreSQL's strongest isolation level. This prevents all concurrency anomalies (dirty reads, non-repeatable reads, phantom reads, serialization anomalies).

#### Consequences

- ✅ Strongest possible data integrity guarantee.
- ✅ No need for explicit row locks in most cases (exception: `SELECT ... FOR UPDATE` for product number generation).
- ❌ Higher likelihood of serialization failures under concurrent load — clients must be prepared to retry.
- ❌ Not documented in `AGENTS.md` — developers may not be aware they're using serializable isolation.

### ADR-009: Permission Model with `ProductTypesDataTypePermission` Precedence

**Status**: Accepted  
**Date**: `design/product_request.md`

#### Context

Product requests need per-data-type permissions that can be overridden at the product type level. A simple global permission per data type is insufficient because different product types may have different access rules for the same data type.

#### Decision

Implement a **precedence chain** for permission resolution:
1. Check `ProductTypesDataTypePermission` (product-type-specific override)
2. Fall back to `DataTypePermission` (global data type default)

For each field individually, six aspects are checked: `role`, `showByDefault`, `mandatory`, `requestorCanEdit`, `config`, and `owner`. Tri-state booleans (`null` = inherit from the lower-precedence level) allow partial overrides.

#### Consequences

- ✅ Flexible permission model that can be fine-tuned per product type.
- ✅ Default permissions defined once on data types, overridden only where needed.
- ❌ Complex permission resolution logic — six aspects × two levels × tri-state inheritance.
- ❌ Debugging permission issues requires understanding the full resolution chain.

### ADR-010: 100% Client-Side Rendering (No SSR)

**Status**: Accepted  
**Date**: Project inception

#### Context

The application needed a modern, interactive UI. Server-side rendering (SSR) adds complexity (hydration, isomorphic code, separate build targets) without significant benefit for an authenticated business application where SEO is irrelevant.

#### Decision

The frontend is a pure React SPA with **zero server-side rendering**. The server serves an `index.html` shell with a `<script>` tag pointing to the client bundle. React takes over entirely in the browser.

#### Consequences

- ✅ Simplified build pipeline — single bundle target (browser ESM).
- ✅ No isomorphic code constraints — browser APIs can be used freely.
- ✅ ETag-based long-lived caching for the JS bundle.
- ❌ Initial page load requires JS execution — slightly slower time-to-interactive than SSR.
- ❌ No SEO — irrelevant for an authenticated business application.

### ADR-011: In-Memory Session Store

**Status**: Accepted  
**Date**: Project inception

#### Context

User sessions needed to be managed after OIDC authentication. The options were database-backed sessions (persistent across restarts) or in-memory sessions (simpler, faster).

#### Decision

Sessions are stored in an **in-memory `TTLMap`** with sliding-window expiry. No database persistence for sessions.

#### Consequences

- ✅ Simple implementation — no session table or cleanup jobs.
- ✅ Fast reads (no DB query for every request).
- ❌ Server restart loses all sessions — all users must re-authenticate.
- ❌ Cannot scale horizontally — sessions are not shared across processes.

### ADR-012: Pattern A vs. Pattern B Config Seeding

**Status**: Accepted  
**Date**: Documented in `design/configuration.md`

#### Context

Configuration entries needed to be seeded into the database. Two approaches were possible: seed all entries at startup, or seed them lazily on first read.

#### Decision

Both patterns are used, chosen per config entry:

- **Pattern A** (seed at startup): Used for critical config that must exist before any operation (e.g., `cfgRootUserGroup`, OIDC credentials, audit log settings).
- **Pattern B** (lazy upsert): Used for optional tuning knobs with sensible defaults (e.g., request bundling thresholds, page sizes). On first read, if the DB row is missing, the hardcoded default is returned and upserted.

#### Consequences

- ✅ Critical config is guaranteed to exist (or setup wizard blocks startup).
- ✅ Optional config doesn't pollute the DB until actually needed.
- ❌ Two different patterns for config seeding — developers must choose correctly per entry.

### ADR-013: Products Table Uses `productNumber` (Text) as Primary Key

**Status**: Accepted  
**Date**: `design/product.md` decision #1

#### Context

Products needed human-readable identifiers. UUIDs (`550e8400-e29b-41d4-a716-446655440000`) are not user-friendly for a product catalog where users expect identifiers like `5XXXXXX-01`.

#### Decision

The `products` table uses `productNumber` (text) as its primary key instead of the standard `identifier` (UUID). Product numbers follow the pattern `5XXXXXX-01` and are auto-generated via a `product_number_state` sentinel table with `SELECT ... FOR UPDATE`.

#### Consequences

- ✅ Human-readable product identifiers.
- ✅ Centralized number generation prevents duplicates.
- ❌ Cannot use the `_crud_Repo` or `_crud_API` factories — fully custom repository and API required.
- ❌ All FK references to products use a text column instead of UUID.

### ADR-014: EntraID as Sole Identity Provider

**Status**: Accepted  
**Date**: Project inception

#### Context

The application needed user authentication. Options included local username/password accounts, OIDC with various providers, or a combination.

#### Decision

Microsoft EntraID (Azure AD) is the **only** supported authentication method. No local accounts exist. User and group data is synchronized from EntraID via Microsoft Graph API at startup and on a configurable schedule.

#### Consequences

- ✅ No password storage or management in the application.
- ✅ Group membership stays aligned with the organization's directory.
- ✅ Single sign-on for users already authenticated with EntraID.
- ❌ Requires EntraID tenant — not suitable for organizations using other identity providers.
- ❌ No offline authentication — EntraID must be reachable for login.


## 10 — Quality Requirements

This chapter maps the quality goals from chapter 1 to specific architectural solutions and design patterns.

### 10.1 Security (Q1 — High)

#### Authentication

- All endpoints except `/api/health` and `/api/docs/*` require authentication.
- Three authentication methods: session cookie (OIDC), API key, Bearer token — checked in priority order.
- `onBeforeHandle` in `apps/api.ts` enforces authentication globally — individual route handlers don't need to check.
- OIDC flow uses PKCE (Proof Key for Code Exchange) to prevent authorization code interception.
- State and nonce parameters prevent CSRF and replay attacks.

#### Authorization

- Fine-grained functional permissions control access to every operation.
- `authorize()` returns the intersection of requested and held permissions — callers check what was granted.
- API keys do NOT inherit root group privileges — even if the key's owner is a root group member.
- The `cfgRootUserGroup` is the **only** permission bypass.
- Product request permissions use a two-level precedence chain with six independent aspects per field.

#### API Key Security

- API key secrets are hashed before storage — the plaintext is only shown once at creation.
- Configurable key length (32–256 characters) and validity period (1–730 days).
- Keys can be disabled or deleted. Disabled keys are retained but cannot authenticate.

#### Data Protection

- Database credentials in `.env` file (git-ignored).
- OIDC client secrets stored in the database (not in environment variables or source code).
- The `AuditLog` records the identity of the actor for every mutation.

#### Known Gaps

- **No rate limiting** — brute-force protection on API endpoints is not implemented.
- **No CORS configuration** — the API does not restrict cross-origin requests.
- **No CSP headers** — Content Security Policy is not configured.

### 10.2 Data Integrity (Q2 — High)

#### Transaction Isolation

- All multi-step mutations run inside `runInTransaction()` with **serializable** isolation level.
- Prevents dirty reads, non-repeatable reads, phantom reads, and serialization anomalies.
- Product number generation uses `SELECT ... FOR UPDATE` row-level locking to prevent duplicate numbers.

#### Optimistic Locking

- All entity mutations include `knownUpdatedAt` — server checks for concurrent modifications.
- Returns `409 Conflict` on mismatch, allowing the client to reload and retry.
- Prevents lost updates without holding pessimistic row locks.

#### PubSub Consistency

- PubSub events are published **after** successful persistence, never before.
- If a transaction fails, no events are published.
- If publishing fails after persistence, a partial inconsistency exists (row committed, event not sent) — this is an accepted risk.

#### Audit Trail

- Every mutation (create, update, delete, grant, revoke, disable, enable) is audited.
- Audit entries include actor identity, resource identifiers, and timestamps.
- Batched flush to database with failure retry.

#### Known Gaps

- **No event sourcing** — if audit log desynchronizes from actual state, there is no rebuild path.
- **Serializable isolation** can cause transaction failures under high concurrency — automatic retry logic is not implemented.
- **PubSub publishing failures** are not retried — events are fire-and-forget.

### 10.3 Auditability (Q3 — High)

#### Audit Log

- Immutable `audit_log` table — no update or delete of audit records (except `DELETE /api/audit_log` for clearing).
- Batched subscriber to PubSub — captures all mutation events.
- Configurable flush interval (default 60s) and batch size (default 500).
- Admin UI page for viewing and filtering audit entries.
- Failure recovery: if DB write fails, entries are re-queued for retry.

#### Operational Visibility

- `GET /api/health` for liveness/readiness checks.
- Console logging in dev mode for startup sequence, route loading, and rebuilds.
- `@elysia/server-timing` in dev mode for request performance metrics.
- OpenAPI documentation at `/api/docs` and `llms.txt` at `/api/docs/llms.txt`.

#### Known Gaps

- **No metrics export** — no Prometheus or StatsD integration.
- **No structured logging** — all logs are plain `console.log` / `console.warn` / `console.error`.
- **No health check depth** — `GET /api/health` doesn't verify database connectivity.

### 10.4 Maintainability (Q4 — High)

#### Layered Architecture

- Strict layer boundaries with explicit import bans — each `AGENTS.md` defines what is allowed.
- 1:1 file naming convention matches domain entities across layers.
- Clear separation: schema (data definition), repo (data access), services (business logic), api (HTTP handling), ui (presentation).

#### Code Generation

- `drizzle-typebox` auto-generates TypeBox schemas from Drizzle definitions — types stay in sync with schema.
- `_crud_Repo.ts` and `_crud_API.ts` factories eliminate boilerplate for standard configuration entities.
- `scripts/generate_types.ts` automates type generation; `typegen:watch` mode for development.

#### Extension Points

- `app_PageRegistry.ts` is the extension point for domain page registrations that survive template updates.
- `ApplicationDefinedFunctionalPermissions.ts` is the extension point for domain-specific permissions.
- `src/ui/api/` wrappers provide a consistent API communication pattern.

#### Documentation

- OpenAPI documentation auto-generated from Elysia route definitions.
- `AGENTS.md` files in every layer directory provide developer guidance.
- Design documents in `design/` capture architectural decisions.

#### Known Gaps

- **No code coverage measurement** configured in test scripts.
- **No linting** — `prettier` is a devDependency but no lint step exists in `package.json` scripts.
- **The services `AGENTS.md` documents hierarchical topics** — outdated since the PubSub tag-based migration.

### 10.5 Configurability (Q5 — High)

#### Database-Backed Configuration

- All runtime parameters stored in the `config` table, editable via admin UI.
- Setup wizard blocks startup until mandatory config is provided.
- Optimistic locking prevents concurrent editing conflicts.
- PubSub events published on config changes for real-time notification.

#### Config Value Validation

- `parseConfigValue()` handles type-aware deserialization for 6 value types.
- `validateConfigInputFormat()` enforces regex-based validation rules.
- Setup wizard and admin UI both use the same validation logic.

#### Known Gaps

- **Config caching without invalidation** — `RequestBundling.ts` caches config on first read; changes require restart.
- **No config versioning or audit** — config changes are audited as regular mutations but there's no config-specific history.
- **Config import/export** — no way to export/import configuration between environments.

### 10.6 Real-Time Updates (Q6 — Medium)

#### Server-Sent Events

- SSE bridges PubSub events to browser clients with per-session tag expression filtering.
- Persistent filters survive browser disconnections (event queue up to 100 events, 30-minute TTL).
- Heartbeat keepalive every 25 seconds.
- Multi-tab support — shared filter, events split across tabs.

#### PubSub Performance

- Tag-based expression matching with short-circuit evaluation (`or` stops at first match, `and` stops at first non-match).
- Subscriber counts are in the low tens — linear iteration is acceptable.
- No pre-filtering index needed at current scale.

#### Known Gaps

- **No WebSocket fallback** — SSE requires `EventSource` support in the browser.
- **No client-side debouncing of rapid events** — UI re-renders on every event.
- **No event replay** — disconnected clients miss events that exceed the 100-event buffer.

### 10.7 Performance (Q7 — Medium)

#### Request Bundling

- Coalesces multiple client mutations into a single HTTP request.
- NDJSON streaming enables progressive resolution.
- Benchmarks: 10 mutations go from 10 requests to 1 (4.5–5x reduction); 50 mutations go from 50 to ~5 (10x reduction).

#### Client-Side Rendering

- 100% CSR eliminates server rendering overhead.
- ETag-based long-lived caching for the JS bundle (`max-age=31536000, immutable` in production).
- Single bundle — no chunk loading waterfall.

#### Database

- Connection pool (max 10) with idle timeout.
- Serializable isolation — may cause retry overhead under high contention.
- No query result caching.

#### Known Gaps

- **No response compression** — gzip/brotli not configured.
- **No CDN** — static assets served directly by Bun.
- **No database query optimization** — no query analysis or indexing strategy documented.
- **No performance monitoring** — no APM or tracing instrumentation.

### 10.8 Testability (Q8 — Medium)

#### Unit Testing

- `bun test` with 30-second timeout.
- Tests are co-located or in `*.test.ts` files.

#### End-to-End Testing

- Playwright as a library within `bun test` (not Playwright's own test runner).
- Real EntraID authentication — no auth bypass for tests.
- Three-stage test pyramid: API contract tests (40–60) → Page tests (20–30) → Workflow tests (10–16).
- Tag-based selective execution: `@smoke`, `@p0`, `@p1`, `@p2`, `@slow`.
- Test data prefixed with `E2E_` or `TEST_` for cleanup identification.

#### Known Gaps

- **No CI/CD integration** — tests are run manually or via local scripts.
- **No coverage thresholds** — `bun test` doesn't enforce minimum coverage.
- **Playwright tests are planned but not yet implemented** — the design exists in `design/playwright_testing.md`.

### 10.9 Deployability (Q9 — Low)

#### Single Process

- Single Bun process serves API, UI, and static assets.
- Single PostgreSQL database for all data.
- No separate services, databases, or caches to deploy.

#### Startup Automation

- Umzug migrations run automatically at startup.
- Configuration setup wizard automates first-run setup.
- Graceful handling of external dependency failures (EntraID sync failure doesn't block startup).

#### Known Gaps

- **No health check probes** — `GET /api/health` exists but no readiness/liveness split.
- **No graceful shutdown** — no signal handling for SIGTERM.
- **No zero-downtime deployment strategy** — in-memory sessions are lost on restart.
- **No Docker image** — deployment requires manual Bun runtime installation.

### 10.10 Quality Goal Summary

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


## 11 — Risks and Technical Debt

### 11.1 Technical Risks

#### TR-1: Serializable Transaction Failures Under Load

**Risk**: `runInTransaction()` uses PostgreSQL `serializable` isolation for all multi-step mutations. Under high concurrent load, serialization failures increase, causing transactions to abort. There is **no automatic retry logic** — client requests will simply fail.

**Impact**: Medium — affects concurrent operations on the same entities (product request approval, configuration edits).

**Probability**: Low at current scale. Increases with user count and concurrent usage.

**Mitigation**: Implement automatic retry with exponential backoff in `runInTransaction()`. Document the need for idempotent transaction callbacks.

#### TR-2: In-Memory Session Loss on Restart

**Risk**: All user sessions are stored in a `TTLMap` (in-memory). A server restart or crash loses all sessions, requiring all users to re-authenticate.

**Impact**: Medium — user experience disruption on deployment or crash.

**Probability**: High on deployment; low for unplanned crashes.

**Mitigation**: Consider session persistence to database or Redis for production deployments. Accept as trade-off for simplicity in current scope.

#### TR-3: Single Point of Failure

**Risk**: The application is a single Bun process with a single PostgreSQL database. No clustering, replication, or failover is configured. A crash of either component takes the entire application offline.

**Impact**: High — complete service outage.

**Probability**: Low for Bun process crash (Bun is stable); medium for database issues.

**Mitigation**: Set up PostgreSQL replication/backup. Consider a process supervisor (systemd, pm2) for auto-restart. For higher availability, consider Bun clustering or a reverse proxy with health checks.

#### TR-4: EntraID Dependency for Login

**Risk**: Authentication requires Microsoft EntraID to be reachable. If EntraID is down, no users can log in (though existing sessions continue working until expiry).

**Impact**: Medium — no new logins during EntraID outage.

**Probability**: Low (EntraID SLA is high).

**Mitigation**: The session TTL of 15 minutes with auto-refresh means short EntraID outages are mostly invisible. For longer outages, a degraded mode or offline authentication would be needed.

#### TR-5: No Rate Limiting

**Risk**: No rate limiting on API endpoints. Malicious or buggy clients could overwhelm the server with requests.

**Impact**: Medium — degraded performance or denial of service.

**Probability**: Low for internal applications; medium for internet-facing deployments.

**Mitigation**: Implement rate limiting middleware in Elysia, at minimum for the login and API endpoints. Consider per-IP and per-API-key limits.

### 11.2 Known Technical Debt

#### TD-1: Outdated AGENTS.md Documentation

**Location**: `src/services/AGENTS.md` and potentially other layer-level AGENTS.md files

**Issue**: AGENTS.md files may document outdated conventions or patterns that no longer match the codebase. Regular audits are needed to keep them in sync.

**Impact**: New developers may write incorrect code following outdated AGENTS.md instructions.

**Fix**: Regular review of all AGENTS.md files against current codebase conventions. Ensure PubSub documentation matches tag-based model, not hierarchical topics.

#### TD-2: Config Caching Without Invalidation

**Location**: `src/services/RequestBundling.ts`

**Issue**: `getRequestBundlingServerConfig()` and `getRequestBundlingClientRuntimeConfig()` cache config values in module-level variables. Once loaded, config changes in the database do not take effect until the server restarts, even though the admin UI allows editing them.

**Impact**: Operators editing bundling thresholds in the admin UI would see no effect until restart.

**Fix**: Subscribe to PubSub `["config", "update"]` events to invalidate the cache, or read from DB on every request (with appropriate caching TTL).

#### TD-3: No Lint or Format Check in CI

**Location**: `package.json` scripts

**Issue**: `prettier` is a devDependency but no `lint` or `format:check` script exists. No CI pipeline enforces code style.

**Impact**: Inconsistent code formatting over time.

**Fix**: Add `"format": "prettier --write ."` and `"format:check": "prettier --check ."` scripts. Add TypeScript type checking (`tsc --noEmit`). Consider adding a CI configuration.

#### TD-4: Product Export `importing` → `done` Transition Deferred

**Location**: `design/product_export.md`, referenced in `design/product_request.md`

**Issue**: The `importing` → `done` status transition for product requests (which creates/updates the actual `Product` row and transitions the request to `done`) is documented as deferred. Only `open` → `importing` is implemented.

**Impact**: Product requests that reach `importing` status cannot be completed to `done`. The workflow is incomplete.

**Fix**: Implement the deferred transition per `design/product_export.md`. This includes `checkAndTransitionToDone()` logic, `Product` creation/update from request values, and handling of `editableOnUpdate: false` exclusions.

#### TD-5: Stub Endpoints

**Location**: `src/api/ProductAPI.ts`

**Issue**: The `request-update` and `copy` endpoints were originally stubs. Per `design/product_request.md`, they have been or need to be replaced with real implementations. Verify current status.

**Fix**: If still stubs, implement them. If implemented, remove the "stub" designation from design docs.

#### TD-6: Shared Component Extraction Deferred

**Location**: `design/components.md`

**Issue**: Three shared UI components were identified for extraction from `ConfigurationDataTypeDetail.tsx`:
- `PermissionChipManager` — partially extracted (part of product-types implementation)
- `SaveRestoreField` — deferred
- `MonacoField` — deferred

**Impact**: Code duplication in pages that use similar permission management, inline editing, or code editing patterns.

**Fix**: Extract `SaveRestoreField` and `MonacoField` to `src/ui/components/`. Ensure `PermissionChipManager` is fully extracted.

#### TD-7: No Graceful Shutdown

**Location**: `src/main.ts`

**Issue**: No signal handler for SIGTERM/SIGINT. The server does not drain connections, flush audit log batches, or close DB connections before exiting.

**Impact**: In-flight requests are terminated. Audit log entries in the in-memory batch are lost. Database connections are left open until they timeout.

**Fix**: Add signal handlers that gracefully close the HTTP server, call `stopAuditLog()`, and call `closeDatabaseConnection()`.

#### TD-8: No Database Indexing Strategy Documented

**Location**: Schema definitions

**Issue**: No explicit database indexes are defined in the schema files (besides primary keys and foreign keys auto-indexed by PostgreSQL). As the data grows, query performance on search fields (name, productNumber) may degrade.

**Impact**: Slow queries on large datasets.

**Fix**: Audit query patterns in repos. Add indexes for commonly searched/filtered columns (e.g., `name` on configuration entities, `productNumber` on products, `status` on product requests, `domain` + `key` on config entries — though that's already a composite PK).

#### TD-9: E2E Tests Not Yet Implemented

**Location**: `design/playwright_testing.md`

**Issue**: A comprehensive Playwright E2E testing plan exists but tests are not yet implemented.

**Impact**: No automated end-to-end test coverage. Regression risk during development.

**Fix**: Implement the three-stage test pyramid as designed: API contract tests → Page tests → Workflow tests.

#### TD-10: Page Default Path FIXME

**Location**: `src/ui/PageRegistry.ts:186`

**Issue**: A `FIXME` comment notes that the `getDefaultPath()` function should read the default path from a user profile rather than computing it from granted permissions. The fallback is `"/"` which may not have a registered page.

**Impact**: Users with no permissions could land on a blank page.

**Fix**: Implement user profile-based default path or ensure a fallback page exists at `/`.

### 11.3 Architectural Risks

#### AR-1: Factory Pattern Limitations

The `_crud_Repo` and `_crud_API` factories serve most entities well, but the exceptions are significant:
- **Products** (custom PK type)
- **DataTypes** (discriminated config union)
- **ProductTypes** (nested sub-entities)
- **ProductRequests** (workflow state machine)
- **Config** (composite PK, different semantics)

If more entities need custom behavior, the factory approach may need extension (e.g., making the factory more configurable) or replacement (e.g., composition over inheritance).

#### AR-2: Tag-Based PubSub Migration Completeness

The PubSub migration from hierarchical topics to tag-based expressions has been fully executed in code. However, the `src/services/AGENTS.md` still documents the old model, and there may be uncaught regressions where publishers use old-style topic strings.

#### AR-3: TypeBox Schema Drift

Auto-generated TypeBox schemas in `_*.ts` files can drift from the actual Drizzle schema if `typegen` is not run after every schema change. There is no CI check to verify that generated types match the current schema.

### 11.4 Risk Matrix

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


## 12 — Glossary

### A

**API Key**: A long-lived authentication token for programmatic access to the REST API. Format: `ak_<random_secret>`. Configurable length (32–256 chars) and validity (1–730 days). Hashed before storage; plaintext shown only once at creation.

**Audit Log / Audit Entries**: An immutable append-only log of all mutating operations in the system. Entries are batched in memory and flushed to the `audit_log` database table. Filterable via the Admin Audit Log page.

**Advisory Lock**: A PostgreSQL advisory lock acquired during database migrations to prevent concurrent migration runs by multiple application instances. Configured via the `ADVISORY_LOCK` environment variable (a 64-bit integer).

**Auth Context**: The per-request authentication state derived globally in `apps/api.ts`. Contains `session`, `apiKeyAuth`, `isAuthenticated`, `authMethod`, and `tokenClaims`. Available to all API route handlers.

**Authorization (`authorize()`)**: The central permission check function in `Auth.ts`. Returns the intersection of requested and held functional permissions (not a boolean). Root group members receive all requested permissions.

### B

**Base Columns (`baseColumns`, `baseColumnsNamed`, `baseColumnsNamedDescribed`)**: Reusable Drizzle column sets in `src/schema/_base.ts` that provide standard columns for all tables: `identifier` (UUID PK), `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, and optionally `name`, `disabled`, and `description`.

**Bearer Token**: An OAuth2.1 access token sent in the `Authorization: Bearer <token>` header. Validated via OIDC token introspection.

**Bun**: The JavaScript runtime that PMDM targets. Provides the HTTP server, bundler, test runner, and package manager.

**Business Domain**: An organizational category for grouping data types. Configuration entity with `name` and optional `description`.

**Bundling (Request Bundling)**: A transparent mechanism that coalesces multiple client-side mutating HTTP requests (POST/PUT/PATCH/DELETE) into a single NDJSON batch request to `POST /api/request_bundling`. Reduces HTTP round trips.

### C

**Client-Side Rendering (CSR)**: The frontend rendering strategy where React builds and updates the DOM entirely in the browser. No HTML is generated on the server. The server serves a minimal `index.html` shell with a `<script>` tag pointing to the client bundle.

**ClientBuilder**: A service (`src/services/ClientBuilder.ts`) that bundles the React SPA using `Bun.build()`, generates SHA-256 ETags, and watches for file changes in dev mode.

**Config Entry**: A single runtime configuration parameter stored in the `config` database table. Identified by composite key `(domain, key)`. Has a `type` (one of 6 value types), `value` (text), `inputFormat` (regex or JSON Schema for validation), and `mandatoryForStart` flag.

**Config Domain**: A namespace grouping related configuration entries (e.g., `Authentication and Authorization`, `EntraID`, `request_bundling`, `audit_log`).

**Configuration Entity**: A domain entity that follows the standard pattern: UUID `identifier`, `name`, `disabled` boolean, optimistic locking. Examples: Business Domains, Consumables, Lookups, Target Systems.

**Consumable**: A predefined selectable value for data fields of kind `consumable`. Configuration entity with optional linking to a Business Domain.

**CRUD Factory**: Two reusable factory functions (`_crud_Repo.ts` and `_crud_API.ts`) that generate repository and API code for standard configuration entities. Cannot be used for Products (text PK), DataTypes (discriminated config), or ProductTypes (nested sub-entities).

### D

**Data Type (DataTypeSchema)**: A typed data field definition used in product types. Has a `kind` (one of 7: `calculated`, `boolean`, `numeric`, `string`, `lookup`, `consumable`, `product`) and a discriminated `config` object specific to the kind. May include `defaultProvider` (JS function), `validate` (JS function), and permissions.

**DataTypePermission**: Global default permissions for a data type, specifying which groups have `viewer`, `writer`, or `approver` roles, plus `showByDefault` flag.

**DBClient**: A union type (`DrizzleType | TransactionType`) that allows repository functions to work with both the main database connection and transaction contexts.

**Drizzle ORM**: The TypeScript ORM used for schema definition and database queries. Version 0.45.x. Used with `drizzle-typebox` for auto-generating TypeBox schemas.

**Delta Sync**: The EntraID synchronization method that uses Microsoft Graph API delta tokens to fetch only changed users and groups since the last sync, avoiding full re-synchronization.

### E

**Elysia.js**: The TypeScript HTTP framework used for the REST API and application composition. Version 1.4.x. Provides derive, guard, and plugin patterns.

**EntraID**: Microsoft EntraID (formerly Azure Active Directory). The sole identity provider for user authentication (OIDC) and identity synchronization (Microsoft Graph API).

**ETag (Entity Tag)**: A SHA-256 hash of the client JS bundle content used for HTTP conditional requests (`If-None-Match` → `304 Not Modified`). Enables long-lived caching of the bundle.

**EventSource**: The browser API used for Server-Sent Events. PMDM uses a single EventSource connection per browser tab to receive real-time updates.

### F

**Functional Permission (FP)**: A named permission constant (e.g., `FP_CREATE_PRODUCT`, `FP_VIEW_PRODUCTS`) registered in the database at startup. Assigned to groups. Checked by `authorize()` in route handlers.

**FunctionalPermissionGrant**: The special `GRANT` permission that allows assigning permissions to groups. Automatically granted to the root user group.

### G

**Group**: An organizational unit imported from EntraID. Groups have members (users) and are assigned functional permissions. A user's effective permissions are the union of all their groups' permissions.

**Graph API**: Microsoft Graph REST API. Used by `EntraIDSync.ts` for delta-based user and group synchronization.

### H

**Health Endpoint**: `GET /api/health` — a public (unauthenticated) endpoint that returns server status. Used for liveness/readiness checks.

**Heartbeat (SSE)**: A keepalive event sent every 25 seconds on the SSE stream when no PubSub events are available. Prevents proxy timeouts and signals that the connection is alive.

### I

**Identifier**: A UUID primary key (using `uuidv7()`) used by all standard entities. Generated by PostgreSQL via `defaultRandom()`. Defined in `src/schema/helpers.ts`.

**Import/Export (Products)**: XLSX-based import (rows create products via `createProduct` in a transaction) and export (download product list with values). Uses `@office-kit/xlsx`.

**InputField**: A reusable UI component for inline editing with Save/Restore buttons, input formatting, and concurrency-aware dirty-flag tracking.

**InputFormat**: A regex (for scalar types) or JSON Schema (for objects) validation rule on a config entry. Enforced by `validateConfigInputFormat()` in `Config.ts`.

### L

**Label**: A passive, read-only text display UI component with an imperative API for PubSub-reactive text updates.

**Lookup**: A reference data table with key-value pairs. Used by data fields of kind `lookup`. Configuration entity. Has sub-entities: `LookupValue`.

### M

**Mandatory for Start (`mandatoryForStart`)**: A flag on config entries that requires the value to be present before the application can start. Triggers the setup wizard. Currently only `cfgRootUserGroup` has this flag.

**Migration**: Database schema changes managed by Umzug. Run automatically at application startup under an advisory lock. Support both `.ts` (JavaScript) and `.sql` (raw SQL) migration files.

**Monaco Editor**: The Microsoft Monaco code editor (VS Code engine) used for editing JavaScript fields in data types (`defaultProvider`, `validate`, `script`, `filter`).

### N

**NDJSON (Newline Delimited JSON)**: The streaming format used for request bundling. Each JSON object is on a single line terminated by `\n`. Enables progressive processing without buffering the entire response.

**Notification / Notification Digest**: The email notification system for product request status changes. Sends digest emails via Microsoft Graph API on a configurable CRON schedule. Supports manual send and simulation mode. Admin UI at `/admin/notifications`.

### O

**OIDC (OpenID Connect)**: The authentication protocol used for EntraID login. PMDM implements the authorization code flow with PKCE.

**Optimistic Locking**: A concurrency control strategy using the `updatedAt` timestamp. Clients read `updatedAt`, include it as `knownUpdatedAt` in mutations, and the server checks it hasn't changed. Returns `409 Conflict` on mismatch.

### P

**Page Registry**: The central registry (`src/ui/PageRegistry.ts`) of all UI pages with metadata (path, URN, section, permissions, menu config). Used for routing, navigation building, and permission-aware page visibility.

**Pattern A / Pattern B (Config Seeding)**: Two strategies for seeding configuration entries. Pattern A seeds all entries at startup (`init()`). Pattern B lazily upserts on first read with hardcoded defaults.

**Permission Precedence**: For product requests, `ProductTypesDataTypePermission` takes precedence over `DataTypePermission` for each field individually. Six aspects are checked: role, showByDefault, mandatory, requestorCanEdit, config, and owner.

**PKCE (Proof Key for Code Exchange)**: A security extension to OAuth 2.0 used in the OIDC authorization code flow to prevent code interception attacks.

**PMDM**: Product Master Data Management — the actual application name. (Note: `package.json` name is `bun-starter` due to template heritage.)

**PrimeReact**: The React UI component library (v10.9.x) used for the frontend. Provides DataTable, Dialog, Dropdown, InputSwitch, and other components.

**Product**: An instance of a product type with values for each assigned data type. Identified by `productNumber` (text, pattern `5XXXXXX-01`). Has a custom repository and API (no CRUD factory).

**Product Export**: A tracking row created when a product request enters `importing` status, one per target system. Tracks export/import status (`pending` → `exported` → `imported`).

**Product Number**: A human-readable text primary key for products. Format: `5XXXXXX-01`. Auto-generated using a `product_number_state` sentinel table with `SELECT ... FOR UPDATE` atomic increment.

**Product Request**: A workflow object for creating or updating a product through an approval process. Status lifecycle: `open` → `importing` → `done` / `cancelled`. Contains product request values, one per data type.

**Product Request Value**: A single data field value within a product request. Can be provided by writers and approved by approvers. Includes resolved effective permissions.

**Product Type (ProductType)**: A schema definition for a class of products (e.g., "Laptop"). Has assigned data types, target systems, and group-based permissions (`ProductTypesDataTypePermission`).

**ProductTypeDataTypePermission**: Product-type-specific permission overrides for individual data types. Takes precedence over `DataTypePermission`. Supports tri-state booleans (null = inherit).

**PubSub**: The application-wide publish/subscribe event system. Tag-based with boolean expression matching (`and`/`or`/`not`). Used for audit logging, SSE, and cross-service notifications. Singleton instance.

**PubSubMessage**: The envelope delivered to subscribers: `{ tags: Tag[], data?: any, timestamp: string }`.

### Q

**Query Builder**: A UI component on the Product List page that builds AND/OR filter expressions over data type values. Persisted to cookie `pmdm_product_filter`.

### R

**Repository (Repo)**: The data access layer (`src/repo/`). Full Drizzle ORM encapsulation. 1:1 mapping with schema files. Exports only clean async functions.

**Request Bundling**: See Bundling.

**Root User Group (`cfgRootUserGroup`)**: A configuration entry defining a group whose members receive full permissions (the only permission bypass). API keys never get root bypass.

**`runInTransaction()`**: A function in `DatabaseDriver.ts` that wraps Drizzle's `transaction()` with `serializable` isolation and `read write` access mode. The standard way to execute multi-step mutations.

### S

**Scalar**: The OpenAPI documentation UI (replaces Swagger UI). Available at `/api/docs` in dev mode.

**Schema (Database)**: Drizzle ORM table definitions in `src/schema/`. Strictly isolated — only `drizzle-orm` imports allowed. Base columns defined in `_base.ts`.

**Schema (TypeBox)**: Runtime type validation schemas used by Elysia route handlers. Auto-generated from Drizzle schemas via `drizzle-typebox` into `src/types/_*.ts` files. User extensions in `<Name>.ts` files.

**Serializable Isolation**: The strongest PostgreSQL transaction isolation level, preventing all concurrency anomalies. Used by `runInTransaction()`.

**Server-Sent Events (SSE)**: A unidirectional real-time communication channel from server to browser. PMDM uses SSE to bridge PubSub events to browser clients with per-session tag expression filtering.

**ServerSentEventFilter**: Per-authenticated-session object that holds tag expressions, an event queue, and a waiter-based async delivery mechanism for SSE streams.

**Session**: An in-memory user authentication state stored in a `TTLMap`. Contains OIDC token claims, expiry time, and refresh token. Sliding-window TTL (default 15 minutes). Lost on server restart.

**Setup Wizard**: A standalone React SPA served when mandatory configuration entries are missing. Collects values from the operator, validates them, and persists them to the database. Blocks the main application until complete.

**Setup Key**: A random 50-character alphanumeric token printed to the console at startup. Required to access the setup wizard.

**Sub-Application (App)**: An Elysia application module in `src/apps/`. Four exist: `login.ts`, `setup.ts`, `api.ts`, `ui.ts`. Mounted in order on the main Elysia app.

### T

**Tag (PubSub)**: A flat, lowercase `snake_case` string identifier (e.g., `"create"`, `"user"`, `"auth_session"`). No hierarchy or intrinsic order.

**TagExpression (PubSub)**: A recursive boolean structure used by subscribers to match events: `Tag | { and: TagExpression[] } | { or: TagExpression[] } | { not: TagExpression }`.

**Target System**: An external system that receives exported product data. Configuration entity. Products/requests are associated with target systems via product type assignments.

**Toggle**: A generic UI component with three visual variants (switch, checkbox, pill) supporting bi-state, tri-state, and multi-state behavior.

**TTLMap**: A generic Time-to-Live Map (`src/utils/TTLMap.ts`) with sliding-window expiry. Used for session storage, permission caching, and in-flight refresh deduplication.

**TypeBox**: A TypeScript library for runtime type validation (`@sinclair/typebox`). Version 0.34 (pinned). Used for API request/response validation and configuration value schemas.

**Type Generation (`typegen`)**: The `scripts/generate_types.ts` script that parses Drizzle schema files using `ts-morph` and generates `src/types/_*.ts` files with TypeBox schemas.

**Two-File Pattern**: The `_<Name>.ts` + `<Name>.ts` pattern in `src/types/`. Auto-generated `_` files are read-only; user-editable files re-export and extend.

### U

**Umzug**: The programmatic database migration library (v3.8.x). Migrations run at startup under an advisory lock. Supports `.ts` and `.sql` migration files.

**URN (Uniform Resource Name)**: A stable, unique identifier for UI pages (e.g., `page:product-requests`). Used for programmatic page lookups independent of path changes.

**User**: An identity imported from EntraID. Identified by `oid` (object ID from EntraID). Can be a member of groups. Disabled users are retained but cannot authenticate.

**User Profile Config**: Per-user overrides for configuration entries marked `userProfile: true`. Stored in the `user_profile_config` table with composite PK `(domain, key, userIdentifier)`. FK to `users`. Managed via `src/api/UserProfileConfigAPI.ts`.

**UUIDv7**: The UUID version used for entity identifiers. Time-ordered, generated by PostgreSQL via `uuidv7()` in the `pg_uuidv7` extension.

### V

**Validation (Config)**: `validateConfigInputFormat()` in `Config.ts` checks parsed config values against the entry's `inputFormat` regex (scalar types) or JSON Schema (object type). Returns `{ ok: false, error }` on mismatch.


