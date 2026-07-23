# Server-Sent Events Architecture

## Overview

This application uses Server-Sent Events (SSE) to push server-side PubSub
notifications into the browser in near real time.

The server [`PubSub`](src/services/PubSub.ts) remains the authoritative
source of truth. A thin bridge fans those events out to connected SSE streams
while applying a per-session tag-expression filter so only relevant events are
written to each stream.

The PubSub system uses a **tag-based topic model** with boolean expression
matching instead of hierarchical dot-separated topics. See
[`design/pubsub.md`](design/pubsub.md) for the full PubSub specification.

---

## End-to-End Pipeline

```
Publisher
  → server PubSub                          (src/services/PubSub.ts)
  → SSE hub / filter                       (src/services/ServerSentEvents.ts)
  → SSE HTTP stream                        (GET /api/server_sent_events/stream)
  → browser EventSource                    (src/ui/server_sent_events.ts)
  → browser PubSub                         (src/ui/pubsub.ts)
  → subscriber callbacks
```

---

## Initialization

The SSE hub module is imported inside [`src/apps/ui.ts`](src/apps/ui.ts) via a
dynamic `await import("@/services/ServerSentEvents.ts")`. This triggers the
module-level `ensurePubSubBridge()` call which subscribes to all server PubSub
messages. It only runs when the UI sub-application is actually mounted, not
during setup-only runs.

---

## Server-Side Components

### `src/services/PubSub.ts`

The existing server-side PubSub (singleton, exported as both default and named
`{ PubSub }`). Application services publish events here; other server-side
subscribers (e.g. EntraID sync) listen here. Supports **tag-based publishing**
via `publish(tags: string[], data?)`, boolean tag-expression subscriptions
(`subscribe(expression: TagExpression, callback)`), synchronous
(`publishSync`) and asynchronous (`publish`) delivery, `subscribeAll`, and
`subscribeOnce`. See [`design/pubsub.md`](design/pubsub.md) for the full
tag-expression API.

### `src/services/ServerSentEvents.ts` – SSE Hub

Responsibilities:

- Subscribes to **all** server PubSub messages via `PubSub.subscribeAll`.
- Processes each notification **asynchronously** (via `Promise.resolve().then`)
  so the publisher's call stack is never blocked.
- Maintains one `ServerSentEventFilter` per authenticated session, keyed by a
  session key derived from the auth context.
- Evaluates per-session tag-expression filters and enqueues matching events.
- Drops non-matching events immediately.
- Tracks every tag seen since startup via `knownTags` (`getKnownTags()`).
- Runs a background cleanup interval (every 5 minutes) that destroys filters
  that have been disconnected for longer than 30 minutes (`STALE_TTL_MS`).
- Logs diagnostic messages when `devMode` is enabled (bridge subscription,
  stale filter removal).

#### Per-Session Filter Lifecycle

| State | Description |
|-------|-------------|
| **Created** | First SSE stream or first expression sync for a session. Initial `disconnectedAt` is set to `Date.now()` (treated as disconnected until `next()` is called). |
| **Streaming** | `next()` is being awaited by the SSE generator; `disconnectedAt` is `null`. |
| **Disconnected** | Stream ended; `disconnect()` sets `disconnectedAt` to `Date.now()` and drains waiters. Filter and buffered events are retained for up to 30 minutes. |
| **Destroyed** | Cleaned up by the 5-minute TTL sweep; `close()` sets `destroyed = true`, clears queue, drains waiters. |

The `disconnect()` method ends the current stream without touching the filter.
The `close()` method permanently destroys filter and queue.

#### Session Key Derivation

The session key is derived server-side inside the API layer via `deriveSseKey()`
and is **opaque to the browser**:

| Auth context | Key format |
|-------------|------------|
| API key with `apiKeyIdentifier` claim | `api_key:<apiKeyIdentifier>` |
| Session user with `oid` claim (fallback) | `session_user:<oid>` |

If neither claim is available, `deriveSseKey()` returns `null` and the SSE
stream emits an `error` event.

Using the `apiKeyIdentifier` (or the `oid`) as the key guarantees that a browser
reconnecting with the same credentials will reuse the same expression filter.

#### Tag Expression Matching

Filter matching uses **tag expressions** — boolean compositions over tag sets —
instead of hierarchical prefix matching. Each `ServerSentEventFilter` holds an
array of `TagExpression` objects representing the session's subscription
expressions.

A published message carries a `tags: string[]` array (e.g. `["config", "update"]`).
A filter matches if **any** of its stored expressions evaluates to `true` against
the published tag set.

**Matching algorithm** (from [`design/pubsub.md`](design/pubsub.md)):

Given a set of published tags `T` (converted to a `Set`) and a `TagExpression` `E`:

| Expression form | Match condition |
|---|---|
| `tag: string` | `tag ∈ T` |
| `{ and: [E₁, E₂, ...] }` | `∀ Eᵢ : match(T, Eᵢ)` |
| `{ or: [E₁, E₂, ...] }` | `∃ Eᵢ : match(T, Eᵢ)` |
| `{ not: E₁ }` | `¬ match(T, E₁)` |

A `"*"` wildcard filter becomes a `subscribeAll`-equivalent: a filter with an
empty expression list that matches everything.

```ts
type TagExpression =
    | string                    // single tag
    | { and: TagExpression[] }
    | { or: TagExpression[] }
    | { not: TagExpression };

function expressionMatches(expr: TagExpression, tags: Set<string>): boolean {
    if (typeof expr === "string") return tags.has(expr);
    if ("and" in expr) return expr.and.every(e => expressionMatches(e, tags));
    if ("or" in expr) return expr.or.some(e => expressionMatches(e, tags));
    if ("not" in expr) return !expressionMatches(expr.not, tags);
    return false;
}
```

**Important:** Because tag expressions can be complex nested objects, they
cannot be passed as a simple comma-separated query string. The `?topics=`
parameter on the SSE stream URL is removed. Initial expression seeding happens
via `PATCH /api/server_sent_events/expressions`, and the `connected` event
carries the full filter state.

---

## Public API (module-level functions)

Exported from [`src/services/ServerSentEvents.ts`](src/services/ServerSentEvents.ts):

| Function | Signature | Description |
|----------|-----------|-------------|
| `upsertServerSentEventFilter` | `(sessionKey: string, config: ServerSentEventClientConfig) => ServerSentEventFilter` | Creates or retrieves a filter. If `config.expressions` is provided and non-empty, updates the expression set. |
| `updateServerSentEventClientExpressions` | `(sessionKey: string, expressions: readonly TagExpression[]) => ServerSentEventClientSnapshot` | Replaces the expression filter for the session and returns the snapshot. |
| `getServerSentEventClientSnapshot` | `(sessionKey: string) => ServerSentEventClientSnapshot \| undefined` | Returns the current filter snapshot, or `undefined` if no filter exists for the key. |
| `disconnectServerSentEventFilter` | `(sessionKey: string) => void` | Gracefully ends the stream while preserving the expression filter and queued events. |
| `removeServerSentEventClient` | `(sessionKey: string) => void` | Permanently destroys the filter (e.g. on logout). |
| `nextServerSentEvent` | `(sessionKey: string, signal?: AbortSignal, timeoutMs?: number) => Promise<ServerSentEventEnvelope \| { kind: "heartbeat" } \| null>` | Awaits the next event or heartbeat from the session filter. Returns `null` if the filter is destroyed or the abort signal fires. |
| `getKnownTags` | `() => string[]` | Returns all tag names seen by the PubSub bridge since process start, sorted alphabetically. |

---

## API Endpoints

All endpoints are registered on the API sub-application by
[`src/api/ServerSentEventAPI.ts`](src/api/ServerSentEventAPI.ts). Authentication is
via the API key infrastructure (`tokenClaims`), typically from an `X-API-Key`
header.

### `GET /api/server_sent_events/stream`

Opens the SSE stream for the authenticated session.

- Session key is derived server-side via `deriveSseKey()` from the `tokenClaims`
  context; **no `clientId` query parameter needed**.
- No query parameters are used for pre-seeding expressions — complex nested
  `TagExpression` objects cannot be serialized as a CSV query string. Initial
  expression seeding happens via `PATCH /api/server_sent_events/expressions`.
  On reconnects the server reuses the existing filter.
- Emits the following SSE event types:
  - `connected` – snapshot of the current filter state:
    `{ sessionKey, expressions, createdAt, lastSeenAt, streaming }`
  - `pubsub` – matching server event envelope:
    `{ tags, data, receivedAt }`
  - `keepalive` – heartbeat every 25 s: `{ ts: "<ISO-8601 timestamp>" }`
  - `error` – emitted when the session key cannot be derived:
    `{ message: "Could not derive session key" }`
- If session key derivation fails, the stream yields the `error` event and
  closes immediately.
- On stream close (abort or client disconnect), the `finally` block calls
  `disconnectServerSentEventFilter()` to preserve the expression filter for
  reconnects.

### `PATCH /api/server_sent_events/expressions`

Replaces the expression filter for the calling session.

**Request body** (TypeBox-validated via `SseExpressionsUpdateBodySchema`):
```json
{ "expressions": [{ "and": ["api_key", "create"] }, { "and": ["config", "update"] }] }
```

**Response** (200): `ServerSentEventClientSnapshot` (schema: `SseExpressionFilterStateSchema`):
```json
{
  "sessionKey": "api_key:abc123",
  "expressions": [{ "and": ["api_key", "create"] }, { "and": ["config", "update"] }],
  "createdAt": "2026-07-01T12:00:00.000Z",
  "lastSeenAt": "2026-07-01T12:05:00.000Z",
  "streaming": false
}
```

Returns 401 if the session key cannot be derived from the auth context.

Called automatically by the browser PubSub whenever local subscriptions change
(debounced at 50 ms).

### `GET /api/server_sent_events/tags`

Returns all tag names that have passed through the server PubSub bridge since
process start.

**Response** (200, schema: `SseKnownTagsResponseSchema`):
```json
{ "tags": ["api_key", "auth_session", "config", "create", "delete", "login", "update"] }
```

Useful for a browser to discover available tags before constructing subscription
expressions. The list grows monotonically and is reset on process restart.

---

## Browser-Side Components

### `src/ui/pubsub.ts` – Browser PubSub

A standalone event bus (`ClientPubSub`, a singleton `ClientPubSubImpl`)
completely separate from `src/services/PubSub.ts`.

Responsibilities:

- `subscribe(expression: TagExpression, fn)` / `unsubscribe(token)` /
  `publish(tags: string[], data?)` / `publishSync(tags: string[], data?)`.
- Tag-expression matching identical to the server PubSub semantics (boolean
  `and`/`or`/`not` evaluation over tag sets).
- `subscribeAll(fn)` – subscribes to every published message regardless of tags.
- `subscribeOnce(expression: TagExpression, fn)` – auto-unsubscribes after
  the first match.
- `getServerExpressions()` – returns the set of all active subscription
  expressions (or `["*"]` if only wildcard subscribers are present).
- `getActiveServerExpressions()` – exported wrapper around
  `getServerExpressions()`, used by the SSE bridge to determine what to sync
  to the server.
- Debounces expression changes (50 ms via `setTimeout`) and calls
  `syncServerSentEventExpressions(expressions)` (i.e.
  `PATCH /api/server_sent_events/expressions`) when the set stabilises,
  handling in-flight overlaps safely via `syncInFlight` / `syncPending` flags.

### `src/ui/server_sent_events.ts` – Browser EventSource Bridge

- Builds the SSE stream URL via `buildServerSentEventsStreamUrl()` (no
  `clientId` or `?topics=` parameter; server infers session key from auth
  context and expressions are synced via PATCH).
- Opens a single `EventSource` per browser page (`startServerSentEventsBridge()`).
- Registers listeners for `pubsub`, `connected`, and `keepalive` event types.
- On each `pubsub` event: parses the JSON envelope (`parseEnvelope()`) — which
  now contains `{ tags, data, receivedAt }` — and calls
  `publishSync(tags, data)` into the browser PubSub so local subscribers receive
  it synchronously.
- Registers a `beforeunload` listener (once) to clean up the EventSource on
  page unload via `stopServerSentEventsBridge()`.

### `src/ui/api/server_sent_events.ts` – API Helpers

- `buildServerSentEventsStreamUrl()` – builds the stream URL with no query
  parameters (complex `TagExpression` objects cannot be serialized as a CSV
  query string; expressions are seeded via PATCH).
- `syncServerSentEventExpressions(expressions: readonly TagExpression[])` –
  calls `PATCH /api/server_sent_events/expressions` with
  `credentials: "same-origin"`. On 401, triggers login redirect; on other
  errors, throws `ApiError`.

Both are re-exported through [`src/ui/api/index.ts`](src/ui/api/index.ts).

---

## Reconnect Behaviour (Mobile Networks)

1. Browser SSE connection drops (e.g. mobile handoff).
2. The server stream generator catches the abort signal; `finally` calls
   `disconnectServerSentEventFilter(sessionKey)`.
   - `disconnect()` drains pending waiters (ending the generator loop) but
     **does not** clear the expression filter or queued events.
3. Browser `EventSource` reconnects automatically (browser built-in retry).
4. The same credentials are sent; the server derives the same session key.
5. `upsertServerSentEventFilter` finds the existing filter, leaves expressions
   intact (no query parameter on reconnect → `config.expressions` is
   `undefined` → filter unchanged).
6. Queued events from the gap are delivered immediately on the new stream.
7. The filter's `disconnectedAt` is reset to `null` (streaming again) when
   `next()` is called.

---

## Multi-Tab Behaviour

Multiple browser tabs with the same session share one filter. The last tab to
sync its expressions wins. Events are delivered to all currently connected
streams (each tab has its own EventSource, and each EventSource call to
`next()` drains independently from the same queue).

> **Note**: because the queue is shared, a burst of events is split across tabs
> rather than duplicated. For use cases that require per-tab delivery, add a
> `tabId` as a sub-key within the session.

---

## Stale Filter Cleanup

A background `setInterval` runs every 5 minutes (unref'd) and removes filters
that have been disconnected for more than 30 minutes (`STALE_TTL_MS =
30 * 60 * 1000`). This is the only cleanup path in normal operation; no explicit
delete is needed on logout (though `removeServerSentEventClient` is available
for explicit cleanup).

---

## Constants

Defined in [`src/types/ServerSentEventsType.ts`](src/types/ServerSentEventsType.ts):

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_MAX_BUFFERED_EVENTS` | `100` | Maximum events buffered per session filter |
| `HEARTBEAT_INTERVAL_MS` | `25_000` | Keepalive interval (also default timeout for `next()`) |
| `STALE_TTL_MS` | `30 * 60 * 1_000` | Time after which disconnected filters are removed |

---

## Type Definitions

Defined in [`src/types/ServerSentEventsType.ts`](src/types/ServerSentEventsType.ts) and
[`src/types/PubSubType.ts`](src/types/PubSubType.ts):

### `TagExpression` (from [`design/pubsub.md`](design/pubsub.md))

```ts
type TagExpression =
    | string                    // single tag
    | { and: TagExpression[] }
    | { or: TagExpression[] }
    | { not: TagExpression };
```

### `ServerSentEventEnvelope`

```ts
interface ServerSentEventEnvelope {
    tags: string[];
    data: unknown;
    receivedAt: string;  // ISO-8601 timestamp
}
```

### `ServerSentEventClientConfig`

```ts
interface ServerSentEventClientConfig {
    expressions?: readonly TagExpression[];
}
```

### `ServerSentEventClientSnapshot`

```ts
interface ServerSentEventClientSnapshot {
    sessionKey: string;       // opaque to the browser
    expressions: TagExpression[];
    createdAt: string;        // ISO-8601 timestamp
    lastSeenAt: string;       // ISO-8601 timestamp
    streaming: boolean;       // true when disconnectedAt === null
}
```

### TypeBox Schemas (for route validation and OpenAPI)

- `SseExpressionsUpdateBodySchema` – `{ expressions: TagExpression[] }`
- `SseExpressionFilterStateSchema` – `{ sessionKey, expressions, createdAt, lastSeenAt, streaming }`
- `SseKnownTagsResponseSchema` – `{ tags: string[] }`

> **Note:** The `SseStreamQuerySchema` (previously `{ topics?: string }`) is
> removed. Complex `TagExpression` objects cannot be serialized as a query
> string; expression seeding is done via the PATCH endpoint only.

---

## Files

| Path | Role |
|------|------|
| [`src/services/PubSub.ts`](src/services/PubSub.ts) | Server PubSub (source of truth) |
| [`src/services/ServerSentEvents.ts`](src/services/ServerSentEvents.ts) | SSE hub, per-session filter, known-tags registry |
| [`src/api/ServerSentEventAPI.ts`](src/api/ServerSentEventAPI.ts) | API routes (stream, expressions PATCH, tags GET) |
| [`src/apps/ui.ts`](src/apps/ui.ts) | SSE bridge initialization (dynamic import) |
| [`src/types/ServerSentEventsType.ts`](src/types/ServerSentEventsType.ts) | Type definitions, TypeBox schemas, constants |
| [`src/types/PubSubType.ts`](src/types/PubSubType.ts) | TagExpression type, PubSub message envelope |
| [`src/ui/pubsub.ts`](src/ui/pubsub.ts) | Browser PubSub (ClientPubSub) |
| [`src/ui/server_sent_events.ts`](src/ui/server_sent_events.ts) | Browser EventSource bridge |
| [`src/ui/api/server_sent_events.ts`](src/ui/api/server_sent_events.ts) | Browser API helpers (build URL, sync expressions) |
| [`design/pubsub.md`](design/pubsub.md) | Tag-based PubSub specification |
| `design/server-sent-events.md` | This document |
