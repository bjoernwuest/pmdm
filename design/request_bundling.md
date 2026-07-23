# Request Bundling Implementation

## Overview

Request bundling is a client-server communication optimization technique that automatically coalesces multiple mutating requests (POST, PUT, PATCH, DELETE) into a single HTTP request to reduce network overhead and improve performance.

This document describes the complete implementation architecture as it exists in this codebase, including the runtime-configurable thresholds, the dual-endpoint design, and the client-side config bootstrapping flow.

---

## Architecture Summary

### File Map

| Layer | File | Purpose |
|-------|------|---------|
| Types | [`src/types/RequestBundlingType.ts`](src/types/RequestBundling.ts) | All request/response interfaces, runtime config types, TypeBox schemas, and fallback constants |
| Server API | [`src/api/RequestBundlingType.ts`](src/api/RequestBundling.ts) | Both endpoints: `GET /api/request_bundling/config` and `POST /api/request_bundling` |
| Server Service | [`src/services/RequestBundlingType.ts`](src/services/RequestBundling.ts) | Configuration loading from database, fallback logic, config entry definitions |
| Client Bundling | [`src/ui/api/_request_bundling.ts`](src/ui/api/_request_bundling.ts) | Queue, flush scheduler, ndjson parser, inflight promise tracking |
| Client Primitives | [`src/ui/api/_client.ts`](src/ui/api/_client.ts) | `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete`, `apiQuery` |
| Client Public API | [`src/ui/api/index.ts`](src/ui/api/index.ts) | Re-exports client primitives and `RequestBundlingOptions` type |

### Client-Side (Frontend)

The client-side consists of two modules:

1. **[`_request_bundling.ts`](src/ui/api/_request_bundling.ts)** – Request bundling collector (mutating requests only)
   - On first call, fetches runtime config from `GET /api/request_bundling/config`
   - Queues POST/PUT/PATCH/DELETE requests with per-request client-side timeouts
   - Dispatches request bundling batches based on config-driven time, size, or count thresholds
   - Handles ndjson (newline-delimited JSON) response streaming
   - Matches responses to requests using `clientRequestId`
   - Returns a Promise per request that resolves/rejects independently
   - Tracks `respondedIds` to detect missing responses

2. **[`_client.ts`](src/ui/api/_client.ts)** – API client primitives
   - `apiGet()` – Direct fetch, no request bundling
   - `apiPost()`, `apiPut()`, `apiPatch()`, `apiDelete()` – Routed through the request bundling collector, accept optional `RequestBundlingOptions`
   - `apiQuery()` – QUERY HTTP method for read-heavy queries, not request-bundled
   - Unified error handling via `ApiError` class
   - The bundling layer resolves/rejects with the response body directly; no unwrapping needed in `_client.ts`

### Server-Side (Backend)

Two endpoints on the `/api` prefix:

1. **`GET /api/request_bundling/config`** – Returns runtime configuration for browser clients
   - Returns `RequestBundlingClientRuntimeConfig` (maxAgeMs, maxBytes, maxRequests, defaultExpectedProcessingMs, defaultTimeoutMs)
   - Values come from the database Config table (domain `request_bundling`) or hardcoded fallbacks

2. **`POST /api/request_bundling`** – Executes a batch of mutating sub-requests
   - Receives a POST request with `{ requests: RequestBundlingRequestItem[] }`
   - Validates every request item with runtime type checking (`isRequestBundlingRequestItem`)
   - Rejects nested bundling requests (URL ending in `/api/request_bundling`)
   - Dispatches each sub-request concurrently via `fetch()` to the same origin
   - Applies per-request server-side timeouts using `computeServerTimeoutMs()`
   - Streams responses as ndjson with config-driven flush heuristics
   - Forwards `Authorization`, `X-API-Key`, and `Cookie` headers to sub-requests

---

## Core Concepts

### Request Bundling Process

```
Client Application
    ↓
apiPost() / apiPut() / apiPatch() / apiDelete()
    ↓
enqueueRequestBundledMutation() [_request_bundling.ts]
    ├─ ensureClientConfigLoaded() → GET /api/request_bundling/config (first call only)
    ├─ Build RequestBundlingRequestItem with clientExpectedProcessingMs, clientTimeoutMs, clientMayTakeUntil
    ├─ Add to in-memory queue with per-request client-side timeout
    ├─ Track Promise resolve/reject in global inflightMap
    └─ Check flush thresholds (from runtime config):
        ├ If ≥ maxRequests queued → flush now
        ├ Else if ≥ maxBytes estimated → flush now
        └─ Else schedule flush in maxAgeMs
    ↓
fetch('/api/request_bundling', { method: 'POST', body: { requests: [...] } })
    ↓
Server: POST /api/request_bundling
    ├─ Load RequestBundlingServerConfig from Config table
    ├─ Validate { requests: [...] } with runtime type checks
    ├─ Guard against nested /api/request_bundling URLs
    ├─ Forward Authorization, X-API-Key, Cookie headers
    ├─ Dispatch each request concurrently via internal fetch()
    │   └─ Apply per-request server timeout via withTimeout() + computeServerTimeoutMs()
    └─ Stream results as ndjson with config-driven flush heuristics:
        ├ Flush after flushMs ms
        ├ Flush when ≥ flushBytes accumulated
        ├ Flush when ≥ flushCount responses buffered
        └─ Final flush + controller.close() after all requests complete
    ↓
Client: Consume ndjson line by line
    ├─ Parse each line as RequestBundlingResponseItem
    ├─ Track respondedIds
    ├─ Look up clientRequestId in global inflightMap → clearTimeout
    └─ Resolve/reject the corresponding Promise
        ├─ 401 → triggerLoginRedirect + reject with ApiError
        ├─ signal === 'timeout' → reject with ApiError (mayHaveExecuted: true)
        ├─ error or status >= 400 → reject with ApiError
        └─ Success → resolve with item.body
    ↓
    After stream ends:
    └─ Any requestIds without a response → reject with ApiError 502
```

### Key Design Decisions

1. **Automatic Coalescing**: Mutations automatically queue without application code changes. GET requests bypass the queue entirely.

2. **Per-Request Promises**: Despite bundling multiple requests, each `apiPost()` call returns its own Promise. The request bundling group is transparent to the caller.

3. **Cross-Group Delivery**: The server may return responses from request-bundling-group-1 together with responses from request-bundling-group-2. Responses are matched by `clientRequestId` at the module level, not per request bundling group.

4. **Fault Isolation**: If one sub-request fails, it doesn't block others. Each sub-request has its own error handler.

5. **Ndjson Streaming**: Responses stream as newline-delimited JSON to allow progressive resolution and reduce memory usage for large replies. The client tracks `respondedIds` and rejects any missing entries after the stream ends.

6. **Auth Propagation**: The server forwards `Authorization`, `X-API-Key`, and `Cookie` headers from the original request bundling request to each internal sub-request.

7. **Newline-Safe Framing**: JSON fields can contain logical newlines, but NDJSON remains safe because `JSON.stringify(...)` escapes them as `\\n` inside a single JSON line.

8. **Runtime Configurability**: Both server flush heuristics and client queue thresholds are configurable via the database Config table (domain `request_bundling`). The client fetches its config from `GET /api/request_bundling/config` on first use.

9. **Nested Bundling Rejection**: Sub-requests targeting `/api/request_bundling` are rejected with HTTP 400 to prevent recursive bundling.

10. **Per-Request Timeouts**: Both client and server apply independent timeouts per sub-request. The client emits `signal: 'timeout'` with `mayHaveExecuted: true` on client timeout. The server emits `signal: 'timeout'` with `serverMayTakeUntil` on server timeout (HTTP 504).

---

## Type Definitions

All types are defined in [`src/types/RequestBundlingType.ts`](src/types/RequestBundling.ts).

### Core Interfaces

```typescript
/** HTTP methods supported by request bundling for mutating operations. */
export type RequestBundlingMethod = "POST" | "PUT" | "PATCH" | "DELETE";

/** Non-HTTP signals that annotate bundled response outcomes. */
export type RequestBundlingSignal = "timeout";

export interface RequestBundlingRequestItem {
    clientRequestId: string;           // Client-side correlation id
    method: RequestBundlingMethod;     // HTTP method
    url: string;                       // Absolute URL or API-relative path
    body: string | null;               // JSON-serialized body or null
    headers: Record<string, string>;   // Headers forwarded to target endpoint
    clientExpectedProcessingMs: number; // Client estimate for expected server processing time
    clientTimeoutMs: number;           // Client timeout budget for this sub-request
    clientMayTakeUntil: string;        // ISO timestamp representing the client timeout deadline
}

export interface RequestBundlingResponseItem {
    clientRequestId: string;            // Correlation id copied from request
    status: number;                     // HTTP-like status code
    body: unknown;                      // Parsed response payload
    error?: string;                     // Optional error message on failure
    signal?: RequestBundlingSignal;     // Optional non-HTTP signal (e.g., "timeout")
    mayHaveExecuted?: boolean;          // True when mutation may have executed despite error/timeout
    serverMayTakeUntil?: string;        // Server timeout deadline for retry safety decisions
}
```

### Runtime Configuration Types

```typescript
/** Runtime configuration consumed by the UI request-bundling client. */
export interface RequestBundlingClientRuntimeConfig {
    maxAgeMs: number;                    // Max queue age before flushing (ms)
    maxBytes: number;                    // Max estimated queued bytes before flushing
    maxRequests: number;                 // Max queued requests before flushing
    defaultExpectedProcessingMs: number; // Default client processing-time estimate (ms)
    defaultTimeoutMs: number;            // Default client timeout budget (ms)
}

/** Server-side configuration used by the request bundling endpoint. */
export interface RequestBundlingServerConfig {
    flushMs: number;               // Max buffer age before flushing (ms)
    flushBytes: number;            // Max buffered response bytes before flushing
    flushCount: number;            // Max buffered response count before flushing
    defaultServerTimeoutMs: number; // Fallback server timeout per sub-request (ms)
    minServerTimeoutMs: number;    // Minimum allowed server timeout (ms)
    maxServerTimeoutMs: number;    // Maximum allowed server timeout (ms)
}
```

### Fallback Constants

```typescript
export const FALLBACK_SERVER_FLUSH_MS = 250;
export const FALLBACK_SERVER_FLUSH_BYTES = 1_024 * 1_024;
export const FALLBACK_SERVER_FLUSH_COUNT = 10;
export const FALLBACK_DEFAULT_SERVER_TIMEOUT_MS = 30_000;
export const FALLBACK_MIN_SERVER_TIMEOUT_MS = 5_000;
export const FALLBACK_MAX_SERVER_TIMEOUT_MS = 120_000;
export const FALLBACK_CLIENT_MAX_AGE_MS = 250;
export const FALLBACK_CLIENT_MAX_BYTES = 1_024 * 1_024;
export const FALLBACK_CLIENT_MAX_REQUESTS = 10;
export const FALLBACK_CLIENT_DEFAULT_EXPECTED_PROCESSING_MS = 15_000;
export const FALLBACK_CLIENT_DEFAULT_TIMEOUT_MS = 45_000;
```

### TypeBox Schema

```typescript
export const RequestBundlingClientConfigSchema = t.Object({
    maxAgeMs: t.Number(),
    maxBytes: t.Number(),
    maxRequests: t.Number(),
    defaultExpectedProcessingMs: t.Number(),
    defaultTimeoutMs: t.Number(),
});
```

---

## Source File Details

### Server: [`src/services/RequestBundlingType.ts`](src/services/RequestBundling.ts)

The service layer defines config entries for the database Config table under domain `request_bundling`:

| Config Key | Fallback | Description |
|------------|----------|-------------|
| `Server.FlushMs` | 250 | NDJSON buffer flush interval (ms) |
| `Server.FlushBytes` | 1,048,576 | Max buffered response bytes before flush |
| `Server.FlushCount` | 10 | Max buffered response count before flush |
| `Server.DefaultTimeoutMs` | 30,000 | Fallback server timeout per sub-request (ms) |
| `Server.MinTimeoutMs` | 5,000 | Minimum allowed server timeout (ms) |
| `Server.MaxTimeoutMs` | 120,000 | Maximum allowed server timeout (ms) |
| `Client.MaxAgeMs` | 250 | Client queue max age before flush (ms) |
| `Client.MaxBytes` | 1,048,576 | Client max estimated queued bytes |
| `Client.MaxRequests` | 10 | Client max queued requests |
| `Client.DefaultExpectedProcessingMs` | 15,000 | Client default processing-time estimate (ms) |
| `Client.DefaultTimeoutMs` | 45,000 | Client default timeout budget (ms) |

Exports:
- `getRequestBundlingServerConfig(db)` – returns `RequestBundlingServerConfig` (cached)
- `getRequestBundlingClientRuntimeConfig(db)` – returns `RequestBundlingClientRuntimeConfig` (cached)

Both functions read numbers from the Config table via `ConfigRepo`, falling back to the hardcoded constants. The server config enforces `minServerTimeoutMs <= maxServerTimeoutMs`.

### Server: [`src/api/RequestBundlingType.ts`](src/api/RequestBundling.ts)

Exports a default function `register(app: ApiInstance)` that registers two routes.

#### `GET /api/request_bundling/config`

Returns `RequestBundlingClientRuntimeConfig` as JSON. Uses Elysia response validation with `RequestBundlingClientConfigSchema` (200) and string error for 401.

No authentication required (public endpoint per the route's OpenAPI detail).

#### `POST /api/request_bundling`

**Request body:** `{ requests: RequestBundlingRequestItem[] }`

**Validation:** Runtime type checking via `isRequestBundlingRequestItem()` which validates:
- `clientRequestId` is a string
- `method` is one of POST/PUT/PATCH/DELETE
- `url` is a string
- `body` is string, null, or undefined
- `headers` is a non-null object
- `clientExpectedProcessingMs` is a finite non-negative number
- `clientTimeoutMs` is a finite positive number
- `clientMayTakeUntil` is a string

**Nested bundling guard:** Sub-requests where the URL ends with `/api/request_bundling` are immediately rejected with status 400 and error `"Nested /api/request_bundling requests are not allowed"`.

**Header forwarding:** The endpoint extracts `Authorization`, `X-API-Key`, and `Cookie` from the incoming request and forwards them to each sub-request. Per-request headers from `req.headers` are merged first, then auth headers are applied on top.

**Timeout computation (`computeServerTimeoutMs`):**
1. Clamp `clientTimeoutMs` to `[minServerTimeoutMs, maxServerTimeoutMs]`
2. Compute expected = `max(minServerTimeoutMs, clientExpectedProcessingMs * 2)`, clamped
3. Return `max(defaultServerTimeoutMs, clientBudget, expected)`

**Sub-request dispatch:**
- Each sub-request is dispatched via `fetch()` to the same origin (or absolute URL if provided)
- The fetch is wrapped with `withTimeout(promise, serverTimeoutMs)` which races the fetch against a timeout symbol
- On timeout (symbol returned): enqueue `{ status: 504, signal: "timeout", mayHaveExecuted: true, serverMayTakeUntil }`
- On non-204 response: parse body as JSON (if content-type includes `application/json`) or text
- On error response: extract error message via `extractErrorMessage()` (checks `body.message`, `body.error`, or uses fallback)
- On catch: enqueue `{ status: 500, error: err.message }` with `serverMayTakeUntil`

**Error message extraction (`extractErrorMessage`):**
1. If body is an object, check `body.message` then `body.error`
2. If body is a non-empty string, return it
3. Otherwise return the fallback string

**Streaming:**
- Creates a `ReadableStream` that is returned as the HTTP response
- Responses are buffered and flushed according to `config.flushMs`, `config.flushBytes`, `config.flushCount`
- Each frame is `JSON.stringify(item) + '\n'`
- After all sub-requests settle (`Promise.allSettled`), a final flush occurs and the controller is closed
- Unexpected stream errors are caught and logged (in devMode), then the controller is closed

**Response headers:**
- `Content-Type: application/x-ndjson`
- `Cache-Control: no-store`
- `X-Accel-Buffering: no`

**Elysia response schemas:**
- 200: `t.Any()` (ndjson stream)
- 400: `ErrorResponseSchema`
- 401: `t.String()`

### Client: [`src/ui/api/_request_bundling.ts`](src/ui/api/_request_bundling.ts)

#### Module-Level State

- `clientConfig: RequestBundlingClientRuntimeConfig` – current runtime config (initially fallback, updated after config fetch)
- `clientConfigLoadPromise: Promise<void> | null` – ensures config is fetched only once
- `inflightMap: Map<string, PendingEntry>` – global map of pending promises, keyed by `clientRequestId`
- `queue: RequestBundlingRequestItem[]` – current batch being accumulated
- `queueBytes: number` – estimated byte count of current queue
- `flushTimer: ReturnType<typeof setTimeout> | null` – scheduled flush timer
- `isFlushing: boolean` – re-entrancy guard
- `requestSequence: number` – monotonic counter for ID generation

#### PendingEntry Structure

```typescript
interface PendingEntry {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timeoutId: ReturnType<typeof setTimeout>;
    clientMayTakeUntil: string;
}
```

Note: Unlike some earlier designs, `PendingEntry` does **not** store the full `RequestBundlingRequestItem`; it stores the `timeoutId` for cleanup and `clientMayTakeUntil` for error context.

#### Config Bootstrapping (`ensureClientConfigLoaded`)

On first call, fetches `GET /api/request_bundling/config` with `credentials: 'same-origin'`:
- On 401: triggers login redirect
- On non-ok: keeps fallback values
- On success: parses JSON, normalizes with `normalizeClientConfig()` (validates positive integers)
- On network error: keeps fallback values

`normalizeClientConfig()` applies `positive()` helper to each field, clamping to fallback values for invalid/missing/zero/negative inputs.

#### Exported Function

```typescript
export function enqueueRequestBundledMutation<T>(
    method: RequestBundlingMethod,
    url: string,
    body: unknown,
    options: RequestBundlingOptions = {},
): Promise<T>
```

**RequestBundlingOptions:**
```typescript
export interface RequestBundlingOptions {
    extraHeaders?: Record<string, string>;
    expectedProcessingMs?: number;
    timeoutMs?: number;
}
```

**Enqueue flow:**
1. Calls `ensureClientConfigLoaded()` and waits for config
2. Serializes body to JSON string (or null if undefined/null)
3. Computes `clientExpectedProcessingMs = max(1, round(options.expectedProcessingMs ?? clientConfig.defaultExpectedProcessingMs))`
4. Computes `clientTimeoutMs = max(1, round(options.timeoutMs ?? clientConfig.defaultTimeoutMs))`
5. Computes `clientMayTakeUntil = new Date(Date.now() + clientTimeoutMs).toISOString()`
6. Builds `RequestBundlingRequestItem` with headers `{ "Content-Type": "application/json", ...extraHeaders }`
7. Creates a Promise, sets up a client-side timeout via `setTimeout(clientTimeoutMs)` that rejects with `ApiError(504, "Request timed out on the client after ...", { signal: "timeout", mayHaveExecuted: true, clientMayTakeUntil })`
8. Adds entry to `inflightMap` with resolve, reject, timeoutId, and clientMayTakeUntil
9. Pushes item to queue, updates queueBytes, calls `scheduleFlush()`

#### Flush Scheduling

`scheduleFlush()` checks thresholds against `clientConfig`:
- If `queue.length >= clientConfig.maxRequests` or `queueBytes >= clientConfig.maxBytes` → flush immediately
- Otherwise, if no timer is set → `setTimeout(flushQueue, clientConfig.maxAgeMs)`

`flushQueue()` is guarded by `isFlushing` to prevent re-entrancy. It drains the entire queue in a loop (in case new items arrive during a flush, the while loop handles them).

#### Sending a Batch (`sendRequestBundling`)

1. Sends `POST /api/request_bundling` with `{ requests }` as JSON body, `credentials: 'same-origin'`
2. If response is not ok or has no body: rejects all pending entries with `ApiError` including `mayHaveExecuted: response.status >= 500`
3. Reads the response body as a stream using `ReadableStream.getReader()`
4. Parses ndjson line by line:
   - Accumulates chunks in a buffer via `TextDecoder.decode(value, { stream: true })`
   - Splits on `\n`, strips trailing `\r` (CRLF-compatible)
   - Parses each non-empty line as `RequestBundlingResponseItem`
   - Tracks `respondedIds` in a Set
   - Calls `resolveResponse(item)` for each parsed item
5. After stream ends, calls `decoder.decode()` once more (flush) and processes any trailing frame
6. For any `requestIds` not in `respondedIds`: rejects with `ApiError(502, "Missing request bundling response for request ...")`
7. On network error during fetch: rejects all pending entries with the caught error

#### Response Resolution (`resolveResponse`)

1. Looks up `PendingEntry` from `inflightMap`, clears its timeout, deletes from map
2. If status === 401: calls `triggerLoginRedirect()`, rejects with `ApiError(401, ...)` including signal, mayHaveExecuted, clientMayTakeUntil, serverMayTakeUntil
3. If signal === "timeout": rejects with `ApiError(status, ...)` with `mayHaveExecuted: item.mayHaveExecuted ?? true`
4. If error or status >= 400: rejects with `ApiError(status, ...)` including all metadata
5. Otherwise: resolves with `item.body`

#### Missing Entry Cleanup (`rejectPendingByIds`)

Iterates request items, clears each pending entry (including its timeout), and rejects with a caller-provided error factory.

### Client: [`src/ui/api/_client.ts`](src/ui/api/_client.ts)

```typescript
export async function apiGet<T>(url: string): Promise<T>
export async function apiPost<T>(url: string, body: unknown, options?: RequestBundlingOptions): Promise<T>
export async function apiPut<T>(url: string, body: unknown, options?: RequestBundlingOptions): Promise<T>
export async function apiPatch<T>(url: string, body: unknown, options?: RequestBundlingOptions): Promise<T>
export async function apiDelete<T>(url: string, body?: unknown, options?: RequestBundlingOptions): Promise<T>
export async function apiQuery<T>(url: string, body: unknown): Promise<T>
```

- `apiGet` and `apiQuery` use `requestDirect()` which calls `fetch()` directly with `credentials: 'same-origin'` and throws `ApiError` on failure
- `apiPost`, `apiPut`, `apiPatch`, `apiDelete` all delegate to `enqueueRequestBundledMutation<T>()` with the appropriate method
- `apiDelete` passes `body ?? null` when body is undefined
- All mutation helpers accept optional `RequestBundlingOptions` for per-call timeout/header overrides
- On 401, `requestDirect()` calls `triggerLoginRedirect()` before throwing
- `parseResponseBody()` handles 204 (returns null), JSON content-type, and text fallback
- `extractErrorMessage()` mirrors the server-side logic

### Client Public API: [`src/ui/api/index.ts`](src/ui/api/index.ts)

Re-exports all six client primitives from `_client.ts`, the `RequestBundlingOptions` type from `_request_bundling.ts`, SSE helpers, and `ApiError`.

---

## Route Registration

The API app in [`src/apps/api.ts`](src/apps/api.ts) auto-loads all route files from [`src/api/`](src/api/) using Bun.Glob:

```typescript
const apiRoutesPath = new URL("../api", import.meta.url).pathname;
const routeFiles = await Array.fromAsync(new Bun.Glob("**/!(*.test).ts").scan({ cwd: apiRoutesPath }));
for (const file of routeFiles) {
    const routeModule = await import(routePath);
    if (routeModule.default && typeof routeModule.default === "function") {
        routeModule.default(app);
    }
}
```

Each route file (including [`RequestBundlingType.ts`](src/api/RequestBundling.ts)) exports a default function that receives the Elysia `ApiInstance` and registers its routes directly via `app.get()` / `app.post()`.

---

## NDJSON and Newline Resilience

Short answer: **yes, with the current framing approach NDJSON is resilient to JSON fields containing newlines**.

Why this works:
- A response frame is always produced using `JSON.stringify(item) + '\n'`.
- Inside JSON strings, newline characters are encoded as escaped sequences (`\\n`), not raw line breaks.
- Therefore raw LF (`\n`) is only used as the frame delimiter between objects.

Edge cases explicitly handled in the parser:
- **CRLF transports**: when delimiter appears as `\r\n`, strip one trailing `\r` before `JSON.parse(...)`.
- **Chunk boundaries in UTF-8**: call `decoder.decode()` once after `done === true` to flush pending bytes (handles split multi-byte characters).
- **Trailing partial frame**: after stream end, parse the remaining buffer once.
- **Malformed frames**: any parse failure is isolated to that single frame and does not abort the whole stream.

What would break framing:
- Manually concatenating JSON text without `JSON.stringify(...)`.
- Emitting non-JSON payload lines in the same stream.

Recommended invariant for both server and client:
- Server emits only `JSON.stringify(frame) + '\n'`.
- Client treats unescaped LF as the only record separator.
- Any parse failure is isolated to that single frame and must not abort the whole stream.

---

## Best Practices

### 1. Always Use the Client Primitives
Never call `fetch()` directly in domain API files. Always use `apiGet`, `apiPost`, etc. This ensures consistent error handling and automatic request bundling.

### 2. Keep Error Handling Lean
The request bundling collector and API primitives handle the complex error logic:
- HTTP errors (400–599)
- Network failures
- Stream parsing failures
- Session timeout (401)
- Client-side timeouts (504 with `signal: 'timeout'`)

Domain API files can assume successful responses.

### 3. Design for Idempotency
Because request bundling groups may span multiple server round-trips, design APIs to be idempotent where possible. Use `clientRequestId` to detect duplicate processing if needed.

### 3a. Timeouts Do Not Mean "Definitely Not Executed"
If the client or server emits `signal: 'timeout'`, treat the mutation as **possibly executed**.

Why:
- The client may time out after the request was sent but before the ndjson frame arrived.
- The server may time out while waiting for a sub-request even though the downstream handler continues and commits later.

Required retry guidance:
- Prefer idempotent mutation design.
- Persist or otherwise honor `clientRequestId` on the server for duplicate detection where correctness matters.
- On retry, assume the original operation may already have been committed.
- Log and surface both `clientMayTakeUntil` and `serverMayTakeUntil` for reconciliation of unusually long executions.

### 4. Monitor Request Bundling Group Size
In development, monitor the request bundling group size to understand grouping behavior:
- Too few requests per request bundling group (< 5) may indicate misconfiguration
- Too many requests per request bundling group (> 50) may indicate unexpected coalescence

### 5. Session Management
Ensure auth context (cookies, API keys, bearer tokens) is properly propagated:
- Client sends `credentials: 'same-origin'` with the request bundling request
- Server forwards `Authorization`, `X-API-Key`, and `Cookie` headers to internal sub-requests
- 401 responses trigger `triggerLoginRedirect()` to refresh session

### 6. Handle Stream Compression
If using gzip/brotli compression, ensure:
- `Content-Type: application/x-ndjson` is set (may affect middleware)
- Disable nginx buffering with `X-Accel-Buffering: no`
- Test with real data sizes to validate stream behavior

### 7. Config Tuning
All thresholds are configurable via the Config table under domain `request_bundling`. Adjust them through the admin UI or database:
- Increase `Client.MaxAgeMs` to batch more requests at the cost of latency
- Increase `Server.DefaultTimeoutMs` for slower sub-request handlers
- Adjust `Server.MinTimeoutMs` / `Server.MaxTimeoutMs` to bound timeout windows

---

## Performance Implications

### Benefits
- **Reduced HTTP Overhead**: ~50–70% fewer requests for typical CRUD workflows
- **Lower Latency**: Multiple mutations feel atomic; server processes concurrently
- **Bandwidth**: Single request header, single TLS handshake
- **Throughput**: Small operations request-bundle naturally; large operations dispatch immediately

### Trade-offs
- **Buffer Overhead**: Up to `maxAgeMs` ms max wait time per mutation (default 250 ms)
- **Memory**: Module-level `inflightMap` holds all pending promises (typically < 10 at once)
- **Complexity**: Ndjson parsing, cross-group ID matching, stream handling, dual timeouts

### Benchmarks (Typical)
| Scenario | Without Request Bundling | With Request Bundling | Improvement |
|----------|------------------|---------------|-------------|
| 10 small mutations | 10 requests, ~50 ms | 1 request, ~300 ms | 4.5–5× fewer requests |
| 50 small mutations | 50 requests, ~200 ms | 5 requests, ~350 ms | 10× fewer requests |
| 1 large mutation | 1 request, ~100 ms | 1 request, ~100 ms | No change |

---

## Troubleshooting

### Request Bundling Not Firing
**Symptom**: Requests queue indefinitely.

**Causes**:
- Flush timer not set
- `enqueueRequestBundledMutation()` not called
- Config fetch failing silently (check browser console for `/api/request_bundling/config` 401)

**Fix**: Verify `apiPost`, `apiPut`, `apiPatch`, `apiDelete` are used; not direct `fetch()`.

### Config Endpoint Returns 401
**Symptom**: Client falls back to hardcoded defaults, but requests work otherwise.

**Cause**: The `GET /api/request_bundling/config` endpoint requires authentication (like all non-health/non-docs endpoints).

**Fix**: Ensure the user is authenticated before the first bundling call, or make the config endpoint public if desired.

### Requests Resolved Out of Order
**Symptom**: Promise 1 resolves before Promise 2 (though 2 was enqueued first).

**Expected Behavior**: This is correct! The server may process and return responses in any order. The `inflightMap` global matching ensures each Promise resolves to the correct response.

### Stream Corruption (Malformed ndjson)
**Symptom**: "Invalid JSON" errors during request bundling response parsing.

**Causes**:
- Raw newlines in JSON values (shouldn't happen; `JSON.stringify` escapes `\n`)
- CRLF (`\r\n`) delimiters not normalized before parsing
- Decoder state not flushed at stream end for split multi-byte characters
- Partial line at stream end

**Fix**: Keep server framing as `JSON.stringify(...) + '\n'`, strip one trailing `\r` per frame, flush `TextDecoder` on EOF, and parse trailing buffer once.

### High Memory Usage
**Symptom**: `inflightMap` grows without bound.

**Causes**:
- Request bundling endpoint hangs (requests never return)
- Client disconnects without cleanup

**Fix**: Client-side per-request timeouts clean up entries after `timeoutMs` and reject them with `signal: 'timeout'`, `mayHaveExecuted: true`. The server also enforces per-request timeouts.

### Timeout Followed by Late Server Execution
**Symptom**: The client receives a timeout, then later discovers the mutation actually completed on the server.

**Expected Behavior**: This is possible and must be treated as normal distributed-system behavior.

**Fix**:
- Use idempotency / duplicate detection via `clientRequestId`
- Never assume timeout means rollback
- Treat retries as reconciliation, not blind re-execution

### 401 Loop
**Symptom**: Request bundling requests trigger login redirect repeatedly.

**Causes**:
- Session expired mid-request bundling execution
- Auth refresh failed

**Fix**: Ensure `triggerLoginRedirect()` is idempotent and doesn't retry infinitely. Check auth middleware on the request bundling endpoint.

### Missing Response for a Request
**Symptom**: Client rejects with `ApiError(502, "Missing request bundling response for request ...")`.

**Cause**: The server completed the stream but didn't include a response frame for one of the queued requestIds.

**Fix**: Check server logs for errors during sub-request dispatch. The `respondedIds` tracking ensures this case is detected and surfaced.

---

## Summary

Request bundling is a transparent optimization that requires:

1. **Types** ([`src/types/RequestBundlingType.ts`](src/types/RequestBundling.ts)): Shared interfaces for request/response items, runtime config types, TypeBox schemas, and fallback constants.
2. **Server Service** ([`src/services/RequestBundlingType.ts`](src/services/RequestBundling.ts)): Database-backed config loading with caching and fallback values.
3. **Server API** ([`src/api/RequestBundlingType.ts`](src/api/RequestBundling.ts)): Two endpoints – `GET /api/request_bundling/config` for client config and `POST /api/request_bundling` for dispatching bundled sub-requests with ndjson streaming, dynamic timeouts, auth forwarding, and nested bundling prevention.
4. **Client Bundling** ([`src/ui/api/_request_bundling.ts`](src/ui/api/_request_bundling.ts)): Queue management with config-driven flush thresholds, per-request client timeouts, ndjson stream parsing, inflight promise tracking, and missing response detection.
5. **Client Primitives** ([`src/ui/api/_client.ts`](src/ui/api/_client.ts)): `apiGet`/`apiQuery` for direct requests, `apiPost`/`apiPut`/`apiPatch`/`apiDelete` for bundled mutations, all with unified `ApiError` handling.
6. **Integration**: Replace direct `fetch()` calls with `apiPost`, `apiPut`, etc. – no application-level changes needed. Route files are auto-loaded by `apps/api.ts` via `Bun.Glob`.

The implementation uses Elysia.js on the server with TypeBox schema validation, and vanilla fetch + ReadableStream on the client. All thresholds are runtime-configurable via the database Config table.
