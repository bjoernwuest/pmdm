# 05 — Building Block View

## 5.1 Level 1: System Decomposition

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

## 5.2 Level 2: Application Sub-Applications

### 5.2.1 login App (`src/apps/login.ts`)

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

### 5.2.2 setup App (`src/apps/setup.ts`)

**Purpose**: Setup wizard for mandatory configuration entries. Blocks the application until all `mandatoryForStart=true` config values are configured.

**Routes**:
| Route | Method | Purpose |
|-------|--------|---------|
| `GET /` | GET | Setup wizard HTML page |
| `GET /setup/client.js` | GET | Wizard JS bundle (ETag-cached) |
| `POST /setup/demand` | POST | Return list of missing mandatory config entries grouped by domain |
| `POST /setup` | POST | Submit config values (parsed and validated by `Config.ts`) |

**State**: A one-time setup key (50 random alphanumeric characters) is printed to the console. The wizard polls every 2 seconds for setup completion.

### 5.2.3 api App (`src/apps/api.ts`)

**Purpose**: Main REST API application with auto-loaded route modules, OpenAPI documentation, and global auth enforcement.

**Key features**:
- **Prefix**: `/api`
- **Auth context derivation**: Global `derive` that checks `SessionID` cookie, `X-API-Key` header, and `Authorization: Bearer` header in priority order. Sets `isAuthenticated`, `session`, `apiKeyAuth`, `authMethod`, and `tokenClaims`.
- **Auth enforcement**: `onBeforeHandle` blocks all routes except `/api/health` and `/api/docs/*` if not authenticated.
- **OpenAPI documentation**: Swagger UI at `/api/docs`, `llms.txt` generation from OpenAPI spec at `/api/docs/llms.txt`.
- **Route auto-loading**: `Bun.Glob("**/!(*.test).ts")` scans `src/api/` and calls each file's `default` export as `register(app)`.
- **Server timing**: `@elysia/server-timing` in dev mode.

### 5.2.4 ui App (`src/apps/ui.ts`)

**Purpose**: Serve the main React single-page application.

**Key features**:
- **Client bundle**: Built by `ClientBuilder.ts` with `Bun.build()`. Served at `/ui/client.js` with SHA-256 ETag and long-lived `Cache-Control` (dev: no-cache, prod: max-age=31536000 immutable).
- **Catch-all route**: `GET /*` — redirects unauthenticated users to `/login`, serves `index.html` shell for authenticated users.
- **SSE bridge**: Initializes the Server-Sent Events connection lazily when the UI app is mounted.

## 5.3 Level 2: Services Layer

The services layer (`src/services/`, 12 files + `auth/` subdirectory) contains all business logic and cross-cutting concerns. It is the **only** layer allowed to contain business logic.

### 5.3.1 Service Inventory

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

### 5.3.2 Auth Subdirectory (`src/services/auth/`)

| File | Responsibility |
|------|----------------|
| `FunctionalPermissions.ts` | Registers admin functional permissions (`FP_READ_USERS`, `FP_READ_GROUPS`, etc.) as top-level `await` constants executed at import time. Re-exports from `ApplicationDefinedFunctionalPermissions.ts`. |
| `ApplicationDefinedFunctionalPermissions.ts` | Registers domain-specific functional permissions (data types, target systems, product types, business domains, consumables, lookups, products, exports, imports). Extension point for template upgrades. |

## 5.4 Level 2: Repository Layer

The repository layer (`src/repo/`, 17 files) encapsulates all database access behind clean async functions. **1:1 mapping** with schema files.

### 5.4.1 Repository Inventory

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

### 5.4.2 CRUD Factory Pattern

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

## 5.5 Level 2: Schema Layer

The schema layer (`src/schema/`, 17 files) contains Drizzle ORM table definitions. It is **strictly isolated** — only imports from `drizzle-orm` and internal files.

### 5.5.1 Base Definitions

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

### 5.5.2 Domain Schemas

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

## 5.6 Level 2: Types Layer

The types layer (`src/types/`, 37 files) provides TypeScript type definitions and TypeBox schemas shared across all layers. All files must be 100% browser-compatible.

### 5.6.1 Two-File Pattern

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

## 5.7 Level 2: UI Layer

### 5.7.1 UI Architecture

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

### 5.7.2 Client API Wrappers

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

### 5.7.3 Page Components

34 page components organized by domain:

**Administration** (9 files): `AdministrationHome`, `AdminUserList`, `AdminUserDetail`, `AdminGroupList`, `AdminGroupDetail`, `AdminFunctionalPermissionList`, `AdminFunctionalPermissionDetail`, `AdminApiKeyList`, `AdminApiKeyDetail`, `AdminApiDocumentation`, `AdminConfigList`, `AdminAuditLog`

**Configuration** (12 files): `ConfigurationHome`, `ConfigurationEntitiesPage` (generic), `_configuration_entity_page_factory`, `ConfigurationBusinessDomains`, `ConfigurationConsumables` + `ConfigurationConsumableDetail`, `ConfigurationDataTypes` + `ConfigurationDataTypeDetail`, `ConfigurationLookups` + `ConfigurationLookupDetail`, `ConfigurationProductTypes`, `ConfigurationProductTypesDataTypes`, `ConfigurationProductTypesDataTypesTargetSystems`, `ConfigurationTargetSystems`

**Products** (6 files): `ProductPage`, `ProductDetailPage`, `ProductExportsPage`, `ProductRequestDetailPage`, `OpenProductRequestsPage`

**Notifications** (1 file): `AdminNotifications`

**General** (3 files): `Dashboard`, `Doc`, `PageTemplate`

**Factory** (1 file): `_configuration_entity_page_factory.tsx`

### 5.7.4 Page Registry & Navigation

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

## 5.8 Level 3: Key Domain Modules

### 5.8.1 Product Module

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

### 5.8.2 Product Request Module

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

### 5.8.3 Configuration Module

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

### 5.8.4 Administration Module

```
Administration Domain
├── Users              — Imported from EntraID. Assigned to groups.
├── Groups             — Imported from EntraID. Assigned functional permissions.
├── API Keys           — Long-lived tokens with configurable length (32-256) and validity (1-730 days).
├── Functional Permissions — FP_* constants registered at startup. Group assignments.
├── Configuration      — Runtime parameters. Editable with optimistic locking.
└── Audit Log          — Immutable log of all mutations. Batch-flushed from PubSub.
```

## 5.9 Level 3: Cross-Cutting Infrastructure

### 5.9.1 Database Connection & Migrations

**`DatabaseDriver.ts`** — Singleton Drizzle instance with lazy-init connection pool (max 10 `postgres` connections). Supports both main DB and transaction contexts via the `DBClient` union type.

**Migrations**: Umzug programmatic runner at `initDatabase()`. Supports `.ts` (JavaScript) and `.sql` migrations. Advisory lock prevents concurrent migration runs. Lock ID from `ADVISORY_LOCK` env var.

### 5.9.2 PubSub Infrastructure

**Tag constants** (from `PubSubType.ts`):
- Action tags: `create`, `update`, `delete`, `grant`, `revoke`, `disable`, `enabled`, `login`, `logout`, `clear`, `upsert`
- Resource tags: `ConfigEntry`, `user`, `group`, `api_key`, `config`, `functional_permission`, `audit_entry`, `auth_session`

**Envelope**: `{ tags: Tag[], data?: any, timestamp: string }`

**Matching**: Recursive `expressionMatches(expr, tags)` evaluator with short-circuit (`or` stops at first match, `and` stops at first non-match).

### 5.9.3 SSE Infrastructure

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

### 5.9.4 Request Bundling Infrastructure

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
