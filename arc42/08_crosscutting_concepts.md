# 08 — Crosscutting Concepts

## 8.1 Authentication & Authorization

### 8.1.1 Authentication Methods

Three authentication methods are supported, checked in priority order:

| Priority | Method | Header / Source | Validation |
|----------|--------|-----------------|------------|
| 1 (highest) | Session cookie | `Cookie: SessionID=...` | `getSession()` → TTLMap lookup with expiry/near-expiry refresh |
| 2 | API key | `X-API-Key: ...` | `validateApiKey()` → hash comparison against stored secret hash |
| 3 | Bearer token | `Authorization: Bearer ...` | `validateBearerToken()` → OIDC token introspection endpoint |

Auth context is derived once per request in `apps/api.ts` via a global `derive` and is available to all route handlers as `session`, `apiKeyAuth`, `isAuthenticated`, `authMethod`, and `tokenClaims`.

### 8.1.2 Authorization Model

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

### 8.1.3 Session Management

Sessions are stored in a `TTLMap<string, Session>` (in-memory, not persisted to DB). The configurable session timeout defaults to 900 seconds (15 minutes). A sliding-window TTL resets on every `getSession()` call. Near-expiry (15 minutes before timeout) triggers automatic OIDC refresh token grant. Concurrent refresh attempts are deduplicated via an `inFlightRefreshes` TTLMap.

| Event | PubSub Tags |
|-------|-------------|
| Login | `["auth_session", "login"]` |
| Logout | `["auth_session", "logout"]` |
| Session refresh | `["auth_session", "update"]` |

### 8.1.4 API Key Lifecycle

API keys are long-lived authentication tokens:
- **Length**: Configurable, 32–256 characters (default 256)
- **Validity**: Configurable, 1–730 days (default 90)
- **Format**: `ak_<random_secret>` — the `ak_` prefix identifies API key secrets
- **Creation**: Secret is generated and shown once; only a hash is stored
- **States**: active → disabled → deleted (soft-delete)
- **Prolong**: Validity can be extended without rotation
- **No root bypass**: API keys always use explicit group-based permissions

## 8.2 Configuration Management

### 8.2.1 Config Lifecycle

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

### 8.2.2 Config Value Types

| Type | Storage | Example |
|------|---------|---------|
| `string` | Text | `"https://login.microsoftonline.com/..."` |
| `number` | Text (parsed) | `900` |
| `boolean` | Text (`"true"` / `"false"` / `"1"`) | `true` |
| `object` | JSON string | `{"key": "value"}` |
| `string[]` | JSON array or comma-separated | `["a", "b"]` |
| `number[]` | JSON array | `[1, 2, 3]` |

### 8.2.3 Seeding Patterns

**Pattern A — Seed at startup**: The service's `init()` function iterates its `config` object and upserts entries with defaults. Used by `Auth.ts` (root group, session expiry, API key config) and `AuditLog.ts` (flush interval, batch size).

**Pattern B — Lazy upsert on first read**: The service's config reader checks for the value, returns a hardcoded default if missing, and upserts the default to DB. Used by `RequestBundling.ts` (performance-tuning knobs) and `ui_config.ts` (page sizes).

### 8.2.4 Optimistic Locking for Config

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

## 8.3 PubSub Messaging

### 8.3.1 Tag Model

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

### 8.3.2 Tag Constants

| Category | Tags |
|----------|------|
| **Actions** | `create`, `update`, `delete`, `grant`, `revoke`, `disable`, `enabled`, `login`, `logout`, `clear`, `upsert` |
| **Resources** | `ConfigEntry`, `user`, `group`, `api_key`, `config`, `functional_permission`, `audit_entry`, `auth_session` |

### 8.3.3 Publish Convention

Every `publish()` call should include an `identifiers` object mapping resource tags to their IDs:
```typescript
PubSub.publish(["product", "update"], {
  identifiers: { product: "5XXXXXX-01" },
  data: { /* changed fields */ }
})
```

### 8.3.4 Subscription Patterns

| Subscriber | Expression | Purpose |
|------------|-----------|---------|
| Audit Log | `{ or: ["create", "update", "delete", "grant", "revoke", "disable", "enabled"] }` | Capture all mutations |
| SSE Bridge | `subscribeAll` (wildcard `"*"`) | Fan all events to per-session filters |
| Request-specific | `{ and: ["ConfigEntry", "update"] }` | React to specific resource changes |
| Permissions cache | `{ and: ["auth_session", "logout"] }` | Invalidate cache on logout |

### 8.3.5 Delivery Model

- **`publish(tags, data)`**: Asynchronous delivery via `setTimeout(deliver, 0)`. Returns `false` if no subscribers exist.
- **`publishSync(tags, data)`**: Synchronous delivery for cases where callers need immediate side effects.
- **Error handling**: By default, subscriber errors are swallowed and re-thrown via `setTimeout`. Setting `immediateExceptions = true` makes them throw synchronously.

## 8.4 Server-Sent Events

### 8.4.1 Architecture

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

### 8.4.2 Key Design Decisions

- **Server-side session key**: Derived from auth context (`api_key:<id>` or `session_user:<oid>`), opaque to the browser. No client-provided session ID in query params.
- **Expression sync via PATCH**: `PATCH /api/server_sent_events/expressions` (debounced at 50ms client-side) syncs tag expressions. Not embedded in the EventSource URL.
- **Persistent filters**: Filters survive browser disconnections. The event queue buffers up to 100 events. Reconnecting clients retrieve queued events first.
- **Stale cleanup**: Filters disconnected for > 30 minutes are destroyed (every 5-minute sweep).
- **Heartbeat**: Every 25 seconds of inactivity, a `keepalive` event is sent.
- **Multi-tab**: All tabs share a single filter/expression set. Events are split across tabs (not duplicated).

### 8.4.3 Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_MAX_BUFFERED_EVENTS` | 100 | Max queued events per disconnected session |
| `HEARTBEAT_INTERVAL_MS` | 25000 | Keepalive interval (25 seconds) |
| `STALE_TTL_MS` | 1800000 | Disconnected session TTL (30 minutes) |
| Cleanup interval | 300000 | Stale filter sweep (5 minutes) |

## 8.5 Request Bundling

### 8.5.1 Concept

Client-side mutations (POST, PUT, PATCH, DELETE) are transparently coalesced into NDJSON batch requests. Domain UI code calls `apiPost()`, `apiPut()`, etc. normally — the bundling is invisible above the `src/ui/api/` transport layer.

### 8.5.2 Client-Side Queue

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

### 8.5.3 Server-Side Dispatch

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

### 8.5.4 Configurable Parameters

All thresholds are configurable via the database `config` table under domain `request_bundling`. If config entries don't exist, hardcoded fallback defaults are used.

**Server-side** (6 entries): `Server.FlushMs` (250), `Server.FlushBytes` (1MB), `Server.FlushCount` (10), `Server.DefaultTimeoutMs` (30000), `Server.MinTimeoutMs` (5000), `Server.MaxTimeoutMs` (120000).

**Client-side** (5 entries): `Client.MaxAgeMs` (250), `Client.MaxBytes` (1MB), `Client.MaxRequests` (10), `Client.DefaultExpectedProcessingMs` (15000), `Client.DefaultTimeoutMs` (45000).

## 8.6 Optimistic Locking

### 8.6.1 Pattern

All mutating operations use optimistic locking via the `updatedAt` timestamp:

```
1. READ:    GET /api/entity/:id → response includes updatedAt
2. MODIFY:  User edits in UI, keeps updatedAt
3. WRITE:   PUT /api/entity/:id { ..., knownUpdatedAt: <step 1 value> }
4. CHECK:   UPDATE ... SET ... WHERE identifier = :id AND updatedAt = :knownUpdatedAt
5. RESULT:  If 0 rows affected → 409 Conflict
            If 1 row affected   → 200 OK
```

### 8.6.2 Implementation

In the CRUD factory (`_crud_Repo.ts`), the `update()` function:
1. Adds `where(eq(schema.updatedAt, knownUpdatedAt))` to the update
2. Returns the updated row (or empty array if conflict)
3. The API handler checks `result.length === 0` → `409 Conflict`

For configuration entries, the `knownUpdatedAt` is compared against the DB value explicitly:
```
if (knownUpdatedAt !== dbValue.updatedAt) return 409
```

### 8.6.3 Scope

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

## 8.7 Audit Logging

### 8.7.1 Approach

The audit log is an **append-only, batched subscriber** to the PubSub system.

- **Subscription**: `{ or: ["create", "update", "delete", "grant", "revoke", "disable", "enabled"] }`
- **Batching**: Entries accumulate in memory. Flushed to `audit_log` table on:
  - Batch size threshold (default 500 entries)
  - Time interval (default 60 seconds)
- **Failure recovery**: If `insertAuditEntries` fails, the failed batch is prepended to the in-memory queue for retry on the next flush.
- **Entry format**: `{ topic, payload, createdBy, createdAt }` with `topic` as comma-joined tags and `payload` as JSON.
- **Not audited**: `clear` operations (e.g., clearing the audit log itself). `upsert` operations are also not audited.

### 8.7.2 Configurable Parameters

| Parameter | Domain | Key | Default |
|-----------|--------|-----|---------|
| Flush interval | `audit_log` | `FlushIntervalMs` | 60000 (60s) |
| Max batch size | `audit_log` | `FlushMaxBatchSize` | 500 |

## 8.8 EntraID Synchronization

### 8.8.1 Sync Methods

- **Initial sync**: At startup (`startEntraIDSync()`), runs a delta-based sync of all users and groups via Microsoft Graph API.
- **Scheduled sync**: If `SyncInterval` config is not `"off"`, a cron job runs at the configured interval.
- **Login-triggered sync**: When a user logs in (`["auth_session", "login"]`), `membershipSync(userId)` fetches the user's current group memberships and updates the DB.
- **Delta links**: Stored in the config table under `EntraID` domain. Enables incremental sync (only changed users/groups since last sync).

### 8.8.2 Sync Flow

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

## 8.9 Type Generation

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

## 8.10 Error Handling

### 8.10.1 API Error Responses

| Status | Condition | Response |
|--------|-----------|----------|
| 401 | Not authenticated | `{ error: "Unauthorized", message: "Authentication required" }` |
| 403 | Insufficient permissions | `{ error: "Forbidden", message: "..." }` |
| 404 | Entity not found | `{ error: "Not Found", message: "..." }` |
| 409 | Optimistic lock conflict | `{ error: "Conflict", currentValue: "..." }` |
| 422 | Validation failure | `{ error: "Validation Error", details: [...] }` |
| 500 | Internal error | Standard Elysia error response |

### 8.10.2 OIDC Error Handling

- If EntraID sync fails during login, the entire login fails — ensuring that new users are properly set up before they can use the application.
- If EntraID sync fails at startup, the application continues with a warning. Sync retries on the cron schedule.

### 8.10.3 PubSub Error Handling

- By default, subscriber errors are caught and re-thrown asynchronously (`setTimeout(throw, 0)`) to prevent one subscriber from blocking others.
- `immediateExceptions = false` (default) swallows errors; set to `true` for testing.

## 8.11 Notification System

### 8.11.1 Architecture

The notification system sends email digests for product request status changes via Microsoft Graph API. It uses a CRON-based scheduler and supports manual triggering and simulation.

### 8.11.2 Email Delivery

Emails are sent via Microsoft Graph API's `sendMail` endpoint (`POST /users/{fromEmail}/sendMail`). The sender (`fromEmail`) is configurable. HTML email content is rendered from a configurable template supporting `{base_url}` and other placeholders.

### 8.11.3 Digest Scheduling

A CRON schedule (configurable, default disabled) triggers digest emails. The digest compiles pending and transitioning product requests across all users and groups. Each digest email includes:
- Requests awaiting user action (needs value, needs approval)
- Requests in transition status
- Links to the PMDM application for direct access

### 8.11.4 Manual and Simulation Modes

- **Manual send**: Administrators can trigger a digest email for a specific user, group, or all users.
- **Simulation mode**: Preview the digest email content without actually sending it. Useful for testing template changes.

### 8.11.5 Configuration

12 configuration entries under the `notification` domain control:
- Toggle switches: `SendOnCronEnabled`, `DigestByIndividualUsersEnabled`, `DigestByGroupsEnabled`
- Schedule: `Cronschedule` (cron expression, "off" to disable)
- Content: `FromEmail`, `Subject`, `HtmlTemplate`, `BaseUrl`
- Timing: `InternalTimestamp` (last digest timestamp)
- Display: `ShowAwaitingTable`, `ShowTransitionTable`, `ShowSummaryTable`

### 8.11.6 Client-Side

The `AdminNotifications` page (`src/ui/pages/AdminNotifications.tsx`) provides a full configuration UI with:
- Inline editing of all config entries with optimistic locking
- Manual send controls (per user, per group, all)
- Email simulation/preview
- User and group listing for target selection

## 8.12 Client-Side Architecture

### 8.12.1 Bundle Strategy

The entire React SPA is built as a single ESM bundle by `ClientBuilder.ts` using `Bun.build()`. The bundle is served at `/ui/client.js` with:
- **SHA-256 ETag** for conditional requests
- **Long-lived Cache-Control** in production (`max-age=31536000, immutable`)
- **No chunking or code splitting** — single bundle simplifies caching and deployment

### 8.12.2 API Communication

All API calls from the UI go through `src/ui/api/` wrappers. The transport layer (`_client.ts`) provides `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete` functions. Mutations are transparently intercepted by `_request_bundling.ts`.

Domain pages never call `fetch()` directly. This ensures:
- Consistent error handling
- Automatic request bundling for mutations
- Single point of change for transport concerns

### 8.12.3 Real-Time Updates (Client)

The client-side SSE bridge (`src/ui/server_sent_events.ts`):
1. Opens an `EventSource` to `/api/server_sent_events/stream`
2. Handles reconnection with exponential backoff
3. Forwards received events to the browser-side PubSub
4. Syncs tag expressions via `PATCH /api/server_sent_events/expressions` (debounced 50ms)

UI components subscribe to the browser PubSub for reactive updates without polling.

### 8.12.4 Page Registry & Permission-Aware Navigation

The `PageRegistry.ts` is the central registry for all pages. Each page declares required functional permissions. Navigation menus are built dynamically based on the user's granted permissions using `buildNavTree(getVisiblePages(userPermissions))`.

Pages without the required permissions are hidden from navigation and inaccessible by direct URL.
