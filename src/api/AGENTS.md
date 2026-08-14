# AI Agent Guidelines: API Route Layer

This folder contains **ElysiaJS route handlers** that define the REST API surface. Each file exports a default function that registers one or more endpoints on the `ApiInstance`.

**Precedence:** this file is the authoritative layer doc for `src/api/` and takes precedence over parent `AGENTS.md` files (including the root file).

---

## Base Route & Registration

**Base prefix**: `/api` — set via `{ prefix: "/api" }` in `src/apps/api.ts` (line 13).

**Route convention**: A route defined as `app.get("/users", ...)` in this folder becomes `GET /api/users`.

**Auto-loading**: The API app (`src/apps/api.ts`) dynamically imports all `*.ts` files in this folder (excluding `*.test.ts`). Each file must export a **default function** that takes the `ApiInstance` and calls route methods on it:

```typescript
import type { ApiInstance } from "@/apps/api.ts";

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/<path>", handler, { detail: { /* OpenAPI docs */ } });
}
```

The `// noinspection JSUnusedGlobalSymbols` comment is **required** on every exported function — auto-loading via dynamic `import()` means static analysis won't see the usage.

---

## Context Extension (`.decorate` + `.derive`)

The API app in `src/apps/api.ts` is created by a factory — `createApiApp(dbClient: DBClient)` — that decorates the **real** database client on the instance and derives the auth context. `src/main.ts` calls the factory with its `DBClient` and mounts the result. **Route files must never re-derive or re-decorate these properties** — they are already present on the context object.

### `.decorate("dbClient", dbClient)`
Injects `dbClient: DBClient` — the real Drizzle database client supplied by the factory. Use for all database access. **Never** call `getDatabaseConnection()` directly in a route; always use the injected `dbClient`. The `dbClient` is meant to forward to services and repos. There is no `{} as DBClient` placeholder anywhere — the factory parameter guarantees the client exists.

### `.derive({ as: 'global' }, …)`
Derives authentication context **once per request** and adds these properties to every handler:

| Property | Type | Description                                        |
|---|---|----------------------------------------------------|
| `session` | `Session \| undefined` | User session resolved from the `SessionID` cookie  |
| `apiKeyAuth` | `ApiKeyAuthContext \| undefined` | Resolved API key context from `X-API-Key` header   |
| `isAuthenticated` | `boolean` | Whether the request passed any auth mechanism      |
| `authMethod` | `"session" \| "apiKey" \| "bearer" \| undefined` | Which auth mechanism succeeded                     |
| `tokenClaims` | `Record<string, any> \| undefined` | Token/ID claims from the successful auth mechanism |

**Auth priority**: Session (cookie) → API Key (header) → Bearer token (Authorization header).

### `.onBeforeHandle`
Enforces authentication on **every** endpoint except:
- `GET /api/health` — liveness/readiness probe
- `GET /api/docs/*` — Swagger/Scalar OpenAPI docs

Returns `401 Unauthorized` before the handler runs if not authenticated. **Do not duplicate this check in route handlers** — it has already been enforced.

---

## Authentication & Authorization in Routes

### Extracting token claims for permission checks
Always resolve claims from the injected context:

```typescript
const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
```

### Authorization check pattern
Every protected route must check functional permissions via the shared `requirePermissions()` helper (in `@/services/Auth.ts`) — do not open-code the claims/authorize/403 sequence:

```typescript
import { requirePermissions } from "@/services/Auth.ts";
import { FP_READ_USERS } from "@/services/auth/FunctionalPermissions.ts";

const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_READ_USERS]);
if (!permissionCheck.ok) return permissionCheck.denial;
```

**Always** import functional permission constants from `@/services/auth/FunctionalPermissions.ts`. **Never** hardcode permission identifiers or names in route files.

### Multi-permission checks
When an endpoint requires multiple permissions, pass all of them as `requiredPermissions` (all must be granted):

```typescript
const requiredPermissions = [FP_READ_USERS, FP_READ_GROUPS, FP_READ_FUNCTIONAL_PERMISSIONS];
const permissionCheck = await requirePermissions(context.dbClient, claims, requiredPermissions);
if (!permissionCheck.ok) return permissionCheck.denial;
```

For conditional response shaping, request additional permissions without requiring them — their granted subset is available via `permissionCheck.authz`:

```typescript
const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_READ_USERS], [FP_READ_GROUPS]);
if (!permissionCheck.ok) return permissionCheck.denial;
if (permissionCheck.authz.some(p => p.identifier === FP_READ_GROUPS.identifier)) {
    // Include group data in response
}
```

### Root user group
Members of `cfgRootUserGroup` have **all permissions** automatically — this is the only bypass mechanism. Do not implement any other permission bypasses.

---

## Strict Responsibility Boundaries

### ✅ Allowed in route handlers
- **Data retrieval** from repo functions (e.g., `getUsers()`, `getConfigEntriesByKey()`)
- **Data filtering** (e.g., `includeInactive` boolean filters)
- **Data merging and transformation** (e.g., merging groups into user details, canonicalizing JSON)
- **Response shaping** (assembling the JSON structure clients expect)
- **Input parsing** (query parameters, path parameters, request body)
- **Pagination logic** (page/pageSize calculations)
- **Network-level concerns**: timeouts, retry coordination, streaming (e.g., NDJSON in request bundling)
- **PubSub notifications** after successful mutations (e.g., `PubSub.publish(...)`)
- **Calling service functions** for business logic (e.g., `parseConfigValue()`, `validateConfigInputFormat()`)

### ❌ Forbidden in route handlers
- **Direct Drizzle ORM queries** — use repo functions only
- **Business logic** that belongs in services (e.g., config validation logic lives in `src/services/Config.ts`, auth logic in `src/services/Auth.ts`)
- **Raw database access** via `getDatabaseConnection()`
- **Direct Drizzle schema imports** for mutation — queries via `context.dbClient.select()` should be limited and only when no repo function exists; prefer adding the repo function instead
- **Optimistic locking checks** (comparing `knownUpdatedAt` with the stored row — the repo's guarded update performs the compare-and-swap)

---

## OpenAPI Documentation (Required)

Every route registration MUST include a `detail` object with full OpenAPI documentation. This is used for:
1. The Scalar OpenAPI UI at `/api/docs`
2. The LLM-compatible `llms.txt` at `/api/docs/llms.txt`

### Required fields in `detail`

| Field | Description                                                                                                                                       |
|---|---------------------------------------------------------------------------------------------------------------------------------------------------|
| `tags` | Array of tag names. Usually the tag name correlates with the file name |
| `summary` | Short one-line description (shown in sidebar)                                                                                                     |
| `description` | Full description including permission requirements, authentication notes, and behavioral details                                                  |
| `parameters` | Document all path, query, and header parameters. Always include `X-API-Key` header parameter description                   |

### Route-specific schema decorations

| Decoration | Where | Required                                                                                                                                                                                                                                            |
|---|---|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `response` | 3rd arg to `app.get/post/put/patch/delete` | **Yes** — document all possible status codes with TypeBox schemas                                                                                                                                                                                   |
| `body` | 3rd arg (POST/PUT/PATCH) | **Yes** for mutating endpoints — use TypeBox `t.Object()` for request body validation. Use / define schema in corresponding type-definition file in `/src/types` for non-trivial schema (e.g. t.string() is trivial, t.Object(...) is non-trivial). |
| `params` | 3rd arg | **Yes** when using path parameters (`:param` syntax) — e.g., `t.Object({ domain: t.String(), key: t.String() })`. Use / define schema in corresponding type-definition file in `/src/types` for non-trivial schema (e.g. t.string() is trivial, t.Object(...) is non-trivial).                                                        |
| `query` | 3rd arg | **Yes** when using query parameters — use `t.Object()` with `t.Optional()` for optional params. Use / define schema in corresponding type-definition file in `/src/types` for non-trivial schema (e.g. t.string() is trivial, t.Object(...) is non-trivial).                                                                          |

### Response schema pattern
Always document error status codes. Error responses are **JSON objects**, never plain strings: the minimal form is `{ error: string }`, optionally extended with `message: string` or (for 409 optimistic-lock conflicts) `currentValue`. Use the canonical error schemas defined once in `src/types/ApiType.ts`:

```typescript
import {
    ConflictErrorResponseSchema,
    ForbiddenErrorResponseSchema,
    NotFoundErrorResponseSchema,
    OptimisticLockConflictResponseSchema,
    UnauthenticatedErrorResponseSchema,
} from "@/types/ApiType.ts";

response: {
    200: SuccessSchema,
    401: UnauthenticatedErrorResponseSchema,      // { error, message? }
    403: ForbiddenErrorResponseSchema,            // { error }
    404: NotFoundErrorResponseSchema,             // { error }
    409: ConflictErrorResponseSchema,             // { error } or OptimisticLockConflictResponseSchema for { error, currentValue? }
}
```

Every response schema entry **must** set a TypeBox `description` option — it becomes the OpenAPI response description (payload-specific for `200`, canonical text for error codes). The canonical schemas in `src/types/ApiType.ts` already carry the canonical descriptions. Authenticated endpoints **must** document `401` (the global `onBeforeHandle` hook can reject before the handler runs):

```typescript
response: {
    200: UsersResponseSchema,  // schema itself carries the description option
    401: UnauthenticatedErrorResponseSchema,
    403: ForbiddenErrorResponseSchema,
}
```

Error bodies in handlers use the same JSON shape: `status(403, { error: "Permission denied. Required: …" })` — plain-string bodies are not used.

Canonical error descriptions:

| Code | Description |
|---|---|
| `400` | `Bad request. The request body or parameters failed validation.` |
| `401` | `Unauthenticated. No valid session, API key, or bearer token was provided.` |
| `403` | `Forbidden. The authenticated principal lacks the required functional permission.` (append ` Must be executed by a human user via browser session.` when the endpoint also enforces human-user) |
| `404` | `Not found. The requested resource does not exist.` |
| `409` | `Conflict. The resource was modified concurrently; retry with the current value (optimistic locking).` |
| `500` | `Internal server error.` |

Every property of `body`/`params`/`query` TypeBox schemas **must** also carry a per-property `description` (e.g. `Type.String({ description: "…" })`).

### Trivial types versus complex types

Directly use trivial types (i.e. scalar types like `t.String()`, `t.Number()`, `t.Boolean()`) inline. Wherever a complex type (e.g. `t.Object(...)`, `t.Array(...)`) is used, define it in the corresponding `/src/types` file and import it into the route file.

---

## File Naming & Structure

- **PascalCase** matching the domain entity: `UserAPI.ts`, `GroupAPI.ts`, `ApiKeyAPI.ts`, `ConfigAPI.ts`
- **One file per domain** — group related endpoints (e.g., all `/groups/*` routes in `GroupAPI.ts`)
- Each file exports a **single default function** named `register`

---

## Import Rules

### ✅ Import from
- `@/apps/api.ts` — `ApiInstance` type
- `@/services/Auth.ts` — `authorize`, `getLoggedinUserObject`, `requirePermissions`
- `@/services/auth/FunctionalPermissions.ts` — permission constants (`FP_*`)
- `@/repo/*` — repository functions for data access
- `@/services/DatabaseDriver.ts` — `runInTransaction`
- `@/types/ApiType.ts` — response schemas and types
- `@/types/PubSubType.ts` — PubSub topic constants
- `@/types/ConfigType.ts` — config types
- `@/types/ApiKeyType.ts` — API key schemas
- `@/services/DatabaseDriver.ts` — `DBClient` type
- `@/types/*` — other domain types
- `@/services/Config.ts` — config value parsing/validation
- `@/services/PubSub.ts` — `PubSub`
- `@/services/ServerSentEvents.ts` — SSE service functions
- `elysia` — `t`, `status`
- Other route files in this folder — for shared helpers (e.g., `parsePageSizes` from `UserAPI.ts`)

### ❌ Do not import from
- `@/schema/*` — use repo functions instead
- `@/services/DatabaseDriver.ts` `getDatabaseConnection` — use injected `dbClient` instead
- `@/ui/*` — no frontend imports
- Any package not already in `package.json`

---

## Transactions

For operations involving multiple database mutations, or where mutation depends on SELECT before/after the mutation, use `runInTransaction`: 

```typescript
import { runInTransaction } from "@/services/DatabaseDriver.ts";

await runInTransaction(context.dbClient, async (tx) => {
    // Multiple repo calls within a single transaction
    await grantFunctionalPermissionToGroup(tx, user, group, [{ identifier: permId }]);
});
```

**Rule: transactions return domain outcomes, routes map outcomes to HTTP.** A `runInTransaction` callback must never construct or return Elysia `status()`/Response objects, and route code must never duck-type the result (`"status" in result`). Instead, the callback returns a typed outcome (e.g. `{ ok: true } | { ok: false, reason: string }`), and the handler maps it to the HTTP response after the transaction resolves:

```typescript
const outcome = await runInTransaction(context.dbClient, async (tx) => {
    try {
        await grantFunctionalPermissionToGroup(tx, user, group, permissionIds);
        return { ok: true } as const;
    } catch (err) {
        return { ok: false, reason: String(err) } as const;
    }
});
if (!outcome.ok) return status(404, { error: "Could not grant", message: outcome.reason });
return { success: true };
```

---

## Request Bundling Endpoint Notes

`RequestBundlingType.ts` is special — it implements the server-side dispatch of bundled mutating requests:

- **`GET /api/request_bundling/config`** — returns client-side configuration parameters
- **`POST /api/request_bundling`** — accepts an array of sub-requests, dispatches each as an internal `fetch()`, streams results as NDJSON
- **Execution is strictly sequential** — sub-requests run in request order (each awaited before the next starts); per-request results are still streamed as they complete
- This endpoint uses **internal fetch** (network loopback) to re-invoke other API endpoints — it does not call repo functions directly
- **Nested bundling is rejected** (sub-requests to `/api/request_bundling` return 400)
- Auth headers (`Authorization`, `X-API-Key`, `Cookie`) are forwarded to sub-requests so they run with the same credentials
- **Sub-response headers (including `Set-Cookie`) are not forwarded** to the bundling client; endpoints that rely on cookie-setting must not be bundled
- Timeout ≠ rollback: sub-requests that time out report `mayHaveExecuted: true`

---

## Server-Sent Events Endpoint Notes

`ServerSentEventAPI.ts` provides real-time PubSub event delivery:

- **`GET /api/server_sent_events/stream`** — opens an SSE stream; session key derived from auth context (not client-supplied); expression filter preserved across reconnections
- **`PATCH /api/server_sent_events/expressions`** — replaces the expression filter for the current session
- **`GET /api/server_sent_events/tags`** — lists all known PubSub tags seen since process start
- Authentication is enforced via `deriveSseKey()` — no token claims → no session key → 401

---

## Common Patterns Quick-Reference

### Pagination pattern
```typescript
const page = Math.max(0, Number(context.query.page ?? 0));
const pageSize = Math.max(1, Number(context.query.pageSize ?? availablePageSizes[0] ?? 10));
const total = await getXxxCount(context.dbClient);
const rows = await getXxxs(context.dbClient, { page, pageSize });
return { rows, page, pageSize, total, availablePageSizes };
```

### Boolean query parameter parsing
```typescript
function parseBooleanQuery(value: unknown): boolean {
    return value === true || value === "true" || value === "1";
}
const includeInactive = parseBooleanQuery(context.query.includeInactive);
```

### Error handling for repo operations
Failures signal via thrown `Error` (the repo idiom). At the route boundary, caught errors are converted to strings before entering a response body — never pass the raw `Error` object into `message`:

```typescript
try {
    await someRepoFunction(context.dbClient, ...);
} catch (_err) {
    return status(404, { error: "Operation failed", message: String(_err) });
}
```

---

## Anti-Patterns to Avoid

1. **Don't re-check `isAuthenticated`** — the `onBeforeHandle` hook already enforces it
2. **Don't call `getSession(dbClient, sessionId)`** — `context.session` is already resolved
3. **Don't manually parse cookies** — `context.session` and `context.tokenClaims` are already populated
4. **Don't hardcode permission identifiers** — always import `FP_*` constants
5. **Don't skip the `response` schema** — mandatory for OpenAPI docs and `llms.txt`
6. **Don't use `any` in response schemas** except for truly polymorphic payloads — prefer specific TypeBox types
7. **Don't call `PubSub.publish` before the mutation succeeds** — publish only after the `runInTransaction` is successful
