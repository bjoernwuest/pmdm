# 12 — Glossary

## A

**API Key**: A long-lived authentication token for programmatic access to the REST API. Format: `ak_<random_secret>`. Configurable length (32–256 chars) and validity (1–730 days). Hashed before storage; plaintext shown only once at creation.

**Audit Log / Audit Entries**: An immutable append-only log of all mutating operations in the system. Entries are batched in memory and flushed to the `audit_log` database table. Filterable via the Admin Audit Log page.

**Advisory Lock**: A PostgreSQL advisory lock acquired during database migrations to prevent concurrent migration runs by multiple application instances. Configured via the `ADVISORY_LOCK` environment variable (a 64-bit integer).

**Auth Context**: The per-request authentication state derived globally in `apps/api.ts`. Contains `session`, `apiKeyAuth`, `isAuthenticated`, `authMethod`, and `tokenClaims`. Available to all API route handlers.

**Authorization (`authorize()`)**: The central permission check function in `Auth.ts`. Returns the intersection of requested and held functional permissions (not a boolean). Root group members receive all requested permissions.

## B

**Base Columns (`baseColumns`, `baseColumnsNamed`, `baseColumnsNamedDescribed`)**: Reusable Drizzle column sets in `src/schema/_base.ts` that provide standard columns for all tables: `identifier` (UUID PK), `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, and optionally `name`, `disabled`, and `description`.

**Bearer Token**: An OAuth2.1 access token sent in the `Authorization: Bearer <token>` header. Validated via OIDC token introspection.

**Bun**: The JavaScript runtime that PMDM targets. Provides the HTTP server, bundler, test runner, and package manager.

**Business Domain**: An organizational category for grouping data types. Configuration entity with `name` and optional `description`.

**Bundling (Request Bundling)**: A transparent mechanism that coalesces multiple client-side mutating HTTP requests (POST/PUT/PATCH/DELETE) into a single NDJSON batch request to `POST /api/request_bundling`. Reduces HTTP round trips.

## C

**Client-Side Rendering (CSR)**: The frontend rendering strategy where React builds and updates the DOM entirely in the browser. No HTML is generated on the server. The server serves a minimal `index.html` shell with a `<script>` tag pointing to the client bundle.

**ClientBuilder**: A service (`src/services/ClientBuilder.ts`) that bundles the React SPA using `Bun.build()`, generates SHA-256 ETags, and watches for file changes in dev mode.

**Config Entry**: A single runtime configuration parameter stored in the `config` database table. Identified by composite key `(domain, key)`. Has a `type` (one of 6 value types), `value` (text), `inputFormat` (regex or JSON Schema for validation), and `mandatoryForStart` flag.

**Config Domain**: A namespace grouping related configuration entries (e.g., `Authentication and Authorization`, `EntraID`, `request_bundling`, `audit_log`).

**Configuration Entity**: A domain entity that follows the standard pattern: UUID `identifier`, `name`, `disabled` boolean, optimistic locking. Examples: Business Domains, Consumables, Lookups, Target Systems.

**Consumable**: A predefined selectable value for data fields of kind `consumable`. Configuration entity with optional linking to a Business Domain.

**CRUD Factory**: Two reusable factory functions (`_crud_Repo.ts` and `_crud_API.ts`) that generate repository and API code for standard configuration entities. Cannot be used for Products (text PK), DataTypes (discriminated config), or ProductTypes (nested sub-entities).

## D

**Data Type (DataTypeSchema)**: A typed data field definition used in product types. Has a `kind` (one of 7: `calculated`, `boolean`, `numeric`, `string`, `lookup`, `consumable`, `product`) and a discriminated `config` object specific to the kind. May include `defaultProvider` (JS function), `validate` (JS function), and permissions.

**DataTypePermission**: Global default permissions for a data type, specifying which groups have `viewer`, `writer`, or `approver` roles, plus `showByDefault` flag.

**DBClient**: A union type (`DrizzleType | TransactionType`) that allows repository functions to work with both the main database connection and transaction contexts.

**Drizzle ORM**: The TypeScript ORM used for schema definition and database queries. Version 0.45.x. Used with `drizzle-typebox` for auto-generating TypeBox schemas.

**Delta Sync**: The EntraID synchronization method that uses Microsoft Graph API delta tokens to fetch only changed users and groups since the last sync, avoiding full re-synchronization.

## E

**Elysia.js**: The TypeScript HTTP framework used for the REST API and application composition. Version 1.4.x. Provides derive, guard, and plugin patterns.

**EntraID**: Microsoft EntraID (formerly Azure Active Directory). The sole identity provider for user authentication (OIDC) and identity synchronization (Microsoft Graph API).

**ETag (Entity Tag)**: A SHA-256 hash of the client JS bundle content used for HTTP conditional requests (`If-None-Match` → `304 Not Modified`). Enables long-lived caching of the bundle.

**EventSource**: The browser API used for Server-Sent Events. PMDM uses a single EventSource connection per browser tab to receive real-time updates.

## F

**Functional Permission (FP)**: A named permission constant (e.g., `FP_CREATE_PRODUCT`, `FP_VIEW_PRODUCTS`) registered in the database at startup. Assigned to groups. Checked by `authorize()` in route handlers.

**FunctionalPermissionGrant**: The special `GRANT` permission that allows assigning permissions to groups. Automatically granted to the root user group.

## G

**Group**: An organizational unit imported from EntraID. Groups have members (users) and are assigned functional permissions. A user's effective permissions are the union of all their groups' permissions.

**Graph API**: Microsoft Graph REST API. Used by `EntraIDSync.ts` for delta-based user and group synchronization.

## H

**Health Endpoint**: `GET /api/health` — a public (unauthenticated) endpoint that returns server status. Used for liveness/readiness checks.

**Heartbeat (SSE)**: A keepalive event sent every 25 seconds on the SSE stream when no PubSub events are available. Prevents proxy timeouts and signals that the connection is alive.

## I

**Identifier**: A UUID primary key (using `uuidv7()`) used by all standard entities. Generated by PostgreSQL via `defaultRandom()`. Defined in `src/schema/helpers.ts`.

**Import/Export (Products)**: XLSX-based import (rows create products via `createProduct` in a transaction) and export (download product list with values). Uses `@office-kit/xlsx`.

**InputField**: A reusable UI component for inline editing with Save/Restore buttons, input formatting, and concurrency-aware dirty-flag tracking.

**InputFormat**: A regex (for scalar types) or JSON Schema (for objects) validation rule on a config entry. Enforced by `validateConfigInputFormat()` in `Config.ts`.

## L

**Label**: A passive, read-only text display UI component with an imperative API for PubSub-reactive text updates.

**Lookup**: A reference data table with key-value pairs. Used by data fields of kind `lookup`. Configuration entity. Has sub-entities: `LookupValue`.

## M

**Mandatory for Start (`mandatoryForStart`)**: A flag on config entries that requires the value to be present before the application can start. Triggers the setup wizard. Currently only `cfgRootUserGroup` has this flag.

**Migration**: Database schema changes managed by Umzug. Run automatically at application startup under an advisory lock. Support both `.ts` (JavaScript) and `.sql` (raw SQL) migration files.

**Monaco Editor**: The Microsoft Monaco code editor (VS Code engine) used for editing JavaScript fields in data types (`defaultProvider`, `validate`, `script`, `filter`).

## N

**NDJSON (Newline Delimited JSON)**: The streaming format used for request bundling. Each JSON object is on a single line terminated by `\n`. Enables progressive processing without buffering the entire response.

**Notification / Notification Digest**: The email notification system for product request status changes. Sends digest emails via Microsoft Graph API on a configurable CRON schedule. Supports manual send and simulation mode. Admin UI at `/admin/notifications`.

## O

**OIDC (OpenID Connect)**: The authentication protocol used for EntraID login. PMDM implements the authorization code flow with PKCE.

**Optimistic Locking**: A concurrency control strategy using the `updatedAt` timestamp. Clients read `updatedAt`, include it as `knownUpdatedAt` in mutations, and the server checks it hasn't changed. Returns `409 Conflict` on mismatch.

## P

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

## Q

**Query Builder**: A UI component on the Product List page that builds AND/OR filter expressions over data type values. Persisted to cookie `pmdm_product_filter`.

## R

**Repository (Repo)**: The data access layer (`src/repo/`). Full Drizzle ORM encapsulation. 1:1 mapping with schema files. Exports only clean async functions.

**Request Bundling**: See Bundling.

**Root User Group (`cfgRootUserGroup`)**: A configuration entry defining a group whose members receive full permissions (the only permission bypass). API keys never get root bypass.

**`runInTransaction()`**: A function in `DatabaseDriver.ts` that wraps Drizzle's `transaction()` with `serializable` isolation and `read write` access mode. The standard way to execute multi-step mutations.

## S

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

## T

**Tag (PubSub)**: A flat, lowercase `snake_case` string identifier (e.g., `"create"`, `"user"`, `"auth_session"`). No hierarchy or intrinsic order.

**TagExpression (PubSub)**: A recursive boolean structure used by subscribers to match events: `Tag | { and: TagExpression[] } | { or: TagExpression[] } | { not: TagExpression }`.

**Target System**: An external system that receives exported product data. Configuration entity. Products/requests are associated with target systems via product type assignments.

**Toggle**: A generic UI component with three visual variants (switch, checkbox, pill) supporting bi-state, tri-state, and multi-state behavior.

**TTLMap**: A generic Time-to-Live Map (`src/utils/TTLMap.ts`) with sliding-window expiry. Used for session storage, permission caching, and in-flight refresh deduplication.

**TypeBox**: A TypeScript library for runtime type validation (`@sinclair/typebox`). Version 0.34 (pinned). Used for API request/response validation and configuration value schemas.

**Type Generation (`typegen`)**: The `scripts/generate_types.ts` script that parses Drizzle schema files using `ts-morph` and generates `src/types/_*.ts` files with TypeBox schemas.

**Two-File Pattern**: The `_<Name>.ts` + `<Name>.ts` pattern in `src/types/`. Auto-generated `_` files are read-only; user-editable files re-export and extend.

## U

**Umzug**: The programmatic database migration library (v3.8.x). Migrations run at startup under an advisory lock. Supports `.ts` and `.sql` migration files.

**URN (Uniform Resource Name)**: A stable, unique identifier for UI pages (e.g., `page:product-requests`). Used for programmatic page lookups independent of path changes.

**User**: An identity imported from EntraID. Identified by `oid` (object ID from EntraID). Can be a member of groups. Disabled users are retained but cannot authenticate.

**UUIDv7**: The UUID version used for entity identifiers. Time-ordered, generated by PostgreSQL via `uuidv7()` in the `pg_uuidv7` extension.

**User Profile Config**: Per-user overrides for configuration entries marked `userProfile: true`. Stored in the `user_profile_config` table with composite PK `(domain, key, userIdentifier)`. FK to `users`. Managed via `src/api/UserProfileConfigAPI.ts`.

## V

**Validation (Config)**: `validateConfigInputFormat()` in `Config.ts` checks parsed config values against the entry's `inputFormat` regex (scalar types) or JSON Schema (object type). Returns `{ ok: false, error }` on mismatch.
