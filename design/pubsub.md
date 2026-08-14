# PubSub – Tag-Based Topic System

## Overview

This document describes the migration of the server-side PubSub service from
**hierarchical dot-separated topic strings** to a **tag-based topic system** with
boolean expression matching. The change affects every publisher, every subscriber,
the SSE bridge, and the browser-side PubSub mirror.

### Motivation

The current system uses dot-separated hierarchical topics (e.g. `auth.login`,
`api_keys.permissions.changed`, `create.api_keys`). Topic matching relies on
**prefix walking**: publishing to `"a.b.c"` delivers to subscribers of `"a.b.c"`,
`"a.b"`, `"a"`, and `"*"`.

While simple, this approach has several drawbacks:

1. **Naming convention confusion.** Is it `create.api_keys` or
   `api_keys.create`? Both patterns exist in the codebase today, and the prefix
   system treats them differently despite their semantic equivalence.

2. **No boolean composition.** Subscribers cannot express "I want events about
   users *and* updates, but *not* config changes". The only composition
   mechanism is topic prefix overlap.

3. **Implicit hierarchy leakage.** Publishing to `"api_keys"` also delivers to
   `"api_keys"` subscribers; `"api_keys.permissions"` and
   `"api_keys.permissions.changed"` both reach the same broad subscriber. This
   makes it difficult to scope subscriptions precisely without introducing
   artificial intermediate topics.

4. **Fragile refactoring.** Renaming or regrouping topics requires updating
   every subscriber that relied on prefix matching. A subscriber listening on
   `"api_keys"` implicitly receives everything under that namespace; changing
   the namespace breaks the subscriber silently.

The tag-based system addresses these by making **topic composition explicit**
through boolean expressions (`and`/`or`/`not`) over unordered tag sets.

---

## Core Concepts

### Tags

A **tag** is a simple, lowercase `snake_case` string identifier. Tags have **no
hierarchy** and **no intrinsic order**. A set of tags describes *what happened*
and *to which resource*.

```ts
type Tag = string;
```

Examples: `"create"`, `"user"`, `"api_key"`, `"permissions_changed"`

### Publishing

Publishing always uses an **array of tags**:

```ts
PubSub.publish(["api_key", "create"], { identifiers: { api_key: "uuid-123" } });
```

The order of tags in the array does not matter. A published message with tags
`["create", "api_key"]` is semantically identical to `["api_key", "create"]`.

### Subscribing with Expressions

Subscribers use a **tag expression** – a recursive boolean structure – to
declare interest:

```ts
type TagExpression =
  | Tag                          // single tag: matches if present in published set
  | { and: TagExpression[] }     // all sub-expressions must match
  | { or: TagExpression[] }      // at least one sub-expression must match
  | { not: TagExpression };      // sub-expression must NOT match
```

A shorthand: passing a plain `string` as the subscription expression is
equivalent to `{ or: [tag] }` – i.e. it matches any message that includes that
tag.

### Matching Algorithm

Given a set of published tags `T` (a `Set<Tag>` derived from the publish call's
tag array) and a `TagExpression` `E`, evaluation is recursive:

| Expression form | Match condition |
|---|---|
| `tag: string` | `tag ∈ T` |
| `{ and: [E₁, E₂, ...] }` | `∀ Eᵢ : match(T, Eᵢ)` |
| `{ or: [E₁, E₂, ...] }` | `∃ Eᵢ : match(T, Eᵢ)` |
| `{ not: E₁ }` | `¬ match(T, E₁)` |

### PubSubMessage Envelope

Every event delivered to subscribers carries a structured envelope:

```ts
interface PubSubMessage {
    tags: Tag[];
    data?: any;
    timestamp: string; // ISO 8601
}
```

---

## Tag Naming Conventions

All tags use **lowercase `snake_case`**. This is enforced by convention; the
PubSub implementation does not validate tag format, but deviation will cause
matching failures.

### Tag Categories

#### Action Tags (what happened)

| Tag | Meaning |
|---|---|
| `create` | A new entity was created |
| `update` | An existing entity was modified |
| `delete` | An entity was deleted |
| `grant` | A permission or access was granted |
| `revoke` | A permission or access was revoked |
| `disable` | An entity was disabled (soft-delete) |
| `enabled` | An entity was re-enabled (re-activated after being disabled) |
| `login` | A user authenticated |
| `logout` | A user session ended |
| `permissions_changed` | Permissions on an entity were modified |
| `clear` | A cache or transient state was cleared |

#### Resource Tags (which entity)

| Tag | Meaning |
|---|---|
| `user` | A user account |
| `group` | A group |
| `api_key` | An API key |
| `config` | A configuration entry |
| `functional_permission` | A functional permission assignment |
| `audit_entry` | An audit log entry |
| `auth_session` | An authentication session |

#### Special / Meta Tags

| Tag | Meaning |
|---|---|
| `settings` | Configuration or settings-related changes |
| `permissions_changed` | Permissions changed (bridges action + resource) |

### Publishing Data Convention

Every `publish()` call **should** include an `identifiers` object in the data
payload, mapping each resource tag to its identifier value. This enables
subscribers to filter by specific entity instances without inspecting opaque
payloads.

```ts
// Canonical form:
PubSub.publish(["api_key", "create"], {
    identifiers: { api_key: "ak_abc123" }
});

// Multi-resource events:
PubSub.publish(["functional_permission", "grant"], {
    identifiers: {
        functional_permission: "fp_xyz",
        user: "u_456",
        group: "g_789"
    }
});
```

The `identifiers` object is optional but strongly recommended. Subscribers that
only care about *which* entity was affected can inspect `data.identifiers`
without understanding the full payload shape.

---

## API Specification

### Type Definitions

```ts
type Tag = string;

type TagExpression =
    | Tag
    | { and: TagExpression[] }
    | { or: TagExpression[] }
    | { not: TagExpression };

interface PubSubMessage {
    tags: Tag[];
    data?: any;
    timestamp: string; // ISO 8601
}

type Subscriber = (message: PubSubMessage) => void;
type Token = string;
```

### Methods

#### `publish(tags: Tag[], data?: any): boolean`

Publishes a message asynchronously. Subscribers whose tag expressions match the
published tag set receive the message via their callback. Returns `true` if at
least one subscriber matched; `false` otherwise.

```ts
PubSub.publish(["api_key", "create"], {
    identifiers: { api_key: "ak_abc123" }
});
```

#### `publishSync(tags: Tag[], data?: any): boolean`

Same as `publish()` but delivers synchronously (no `setTimeout` deferral).

#### `subscribe(expression: TagExpression, callback: (message: PubSubMessage) => void): Token | false`

Registers a callback for messages whose tag set satisfies the given expression.
Returns a unique `Token` for unsubscription, or `false` if `callback` is not a
function.

```ts
// Match any message containing the "api_key" tag
const t1 = PubSub.subscribe("api_key", (msg) => { ... });

// Match messages with BOTH "auth_session" AND "logout"
const t2 = PubSub.subscribe(
    { and: ["auth_session", "logout"] },
    (msg) => { ... }
);

// Match messages with "user" AND ("group" OR "update")
const t3 = PubSub.subscribe(
    { and: ["user", { or: ["group", "update"] }] },
    (msg) => { ... }
);

// Match messages with "update" AND NOT "group"
const t4 = PubSub.subscribe(
    { and: ["update", { not: "group" }] },
    (msg) => { ... }
);
```

#### `subscribeAll(callback: (message: PubSubMessage) => void): Token | false`

Subscribes to **every** published message regardless of tags. Equivalent to
subscribing with an expression that always evaluates to `true` (e.g. a wildcard).

```ts
const token = PubSub.subscribeAll((msg) => {
    console.log("All messages:", msg.tags);
});
```

#### `subscribeOnce(expression: TagExpression, callback: (message: PubSubMessage) => void): this`

Like `subscribe()`, but the callback is automatically unsubscribed after the
first matching message.

#### `unsubscribe(value: Token | Subscriber | TagExpression): boolean | void`

Removes subscriptions. If a `Token` string is passed, removes that specific
subscription. If a function reference is passed, removes all subscriptions with
that callback. If a tag expression is passed, removes all subscriptions
registered for that exact expression.

#### `clearAllSubscriptions(): void`

Removes every subscription. Useful for teardown in tests or process shutdown.

### Expression Evaluation Performance

Tag expressions are evaluated eagerly: when a message is published, every
active subscriber's expression is checked against the published tag set. The
evaluation short-circuits:

- `or` stops at the first matching sub-expression.
- `and` stops at the first non-matching sub-expression.
- `not` evaluates its child and negates.

Since tag sets are typically small (2–4 tags) and subscriber counts are in the
low tens, this is not a performance concern. If the subscriber count grows
significantly, an indexing strategy (e.g. pre-filtering by a single "primary"
tag extracted from each expression) can be added transparently.

---

## Migration Mapping

### Publishing: Old → New

Each current hierarchical topic is replaced by a tag array. Topic constants
currently defined in `src/types/ApiKeyType.ts`, `src/types/ConfigType.ts`,
`src/services/Auth.ts`, and `src/repo/FunctionalPermissionRepo.ts` will be
replaced with tag arrays.

| Old Topic | New Tags | Published From | Data |
|---|---|---|---|
| `auth.login` | `["auth_session", "login"]` | [`src/services/Auth.ts:579`](src/services/Auth.ts:579) | session object |
| `auth.logout` | `["auth_session", "logout"]` | [`src/services/Auth.ts:623`](src/services/Auth.ts:623) | session object |
| `create.api_keys` | `["api_key", "create"]` | [`src/repo/ApiKeyRepo.ts:115`](src/repo/ApiKeyRepo.ts:115) | `{ identifiers: { api_key }, ... }` |
| `api_keys.permissions.changed` | `["api_key", "permissions_changed"]` | [`src/repo/ApiKeyRepo.ts:116,240`](src/repo/ApiKeyRepo.ts:116) | `{ identifiers: { api_key }, ... }` |
| `update.api_keys` | `["api_key", "update"]` | [`src/repo/ApiKeyRepo.ts:138,164`](src/repo/ApiKeyRepo.ts:138) | `{ identifiers: { api_key }, ... }` |
| `disable.api_keys` | `["api_key", "disable"]` | [`src/repo/ApiKeyRepo.ts:189`](src/repo/ApiKeyRepo.ts:189) | `{ identifiers: { api_key }, ... }` |
| `enable.api_keys` | `["api_key", "enabled"]` | [`src/repo/ApiKeyRepo.ts`](src/repo/ApiKeyRepo.ts) (future) | `{ identifiers: { api_key }, ... }` |
| `delete.api_keys` | `["api_key", "delete"]` | [`src/repo/ApiKeyRepo.ts:206`](src/repo/ApiKeyRepo.ts:206) | `{ identifiers: { api_key }, ... }` |
| `grant.functional_permissions` | `["functional_permission", "grant"]` | [`src/repo/FunctionalPermissionRepo.ts:50`](src/repo/FunctionalPermissionRepo.ts:50) | `{ identifiers: { functional_permission, user?, group? }, userGranting, grantTo, permissions }` |
| `revoke.functional_permissions` | `["functional_permission", "revoke"]` | [`src/repo/FunctionalPermissionRepo.ts:138`](src/repo/FunctionalPermissionRepo.ts:138) | `{ identifiers: { functional_permission, user?, group? }, userRevoking, revokeFrom, permissions }` |
| `config.updated` | `["config", "update"]` | [`src/api/ConfigAPI.ts:132`](src/api/ConfigAPI.ts:132) | `{ identifiers: { config: { domain, key } }, domain, key, value, updatedAt }` |

### Subscriptions: Old → New

| Subscriber | Old Expression | New Expression | Behavior |
|---|---|---|---|
| SSE Bridge ([`src/services/ServerSentEvents.ts:169`](src/services/ServerSentEvents.ts:169)) | `subscribeAll` (`"*"`) | `subscribeAll(cb)` | Forwards all events to SSE clients (unchanged semantics) |
| Audit Log ([`src/services/AuditLog.ts:124`](src/services/AuditLog.ts:124)) | `subscribeAll` + prefix filter | `subscribeAll(cb)` + tag filter or `subscribe({ or: actionTags }, cb)` | Filters by action tag set instead of prefix. See [Audit Log Migration](#audit-log-migration) below. |
| Auth – logout cache clear ([`src/services/Auth.ts:715`](src/services/Auth.ts:715)) | `subscribe("auth.logout", cb)` | `subscribe({ and: ["auth_session", "logout"] }, cb)` | Clear user FP cache on logout |
| Auth – API key permissions cache clear ([`src/services/Auth.ts:716`](src/services/Auth.ts:716)) | `subscribe("api_keys.permissions.changed", cb)` | `subscribe({ and: ["api_key", "permissions_changed"] }, cb)` | Clear API key FP cache |
| EntraID Sync ([`src/services/EntraIDSync.ts:272`](src/services/EntraIDSync.ts:272)) | `subscribe("auth.login", cb)` | `subscribe({ and: ["auth_session", "login"] }, cb)` | Sync Graph API memberships on login |
| AdminConfigList UI ([`src/ui/pages/AdminConfigList.tsx:300`](src/ui/pages/AdminConfigList.tsx:300)) | `subscribe("config.updated", cb)` | `subscribe({ and: ["config", "update"] }, cb)` | Refresh config list |

### Audit Log Migration

The audit log currently uses [`PubSub.subscribeAll`](src/services/AuditLog.ts:124)
and filters by topic prefix in its callback (`onPubSubEvent` at
[`src/services/AuditLog.ts:87`](src/services/AuditLog.ts:87)). It checks whether
the topic starts with one of `AUDIT_TOPIC_PREFIXES`:

```ts
const AUDIT_TOPIC_PREFIXES = ["grant", "revoke", "create", "update", "disable", "enabled", "delete"];
```

There are two migration options:

**Option A: Keep `subscribeAll` + tag filter in callback.**

The callback checks `message.tags` against the action tag set. This requires no
PubSub expression change but the callback logic changes from prefix matching to
set intersection.

```ts
const AUDIT_ACTION_TAGS = new Set(["grant", "revoke", "create", "update", "disable", "enabled", "delete"]);

function onPubSubEvent(message: PubSubMessage): void {
    const hasAuditAction = message.tags.some(t => AUDIT_ACTION_TAGS.has(t));
    if (!hasAuditAction) return;
    // ... same batch logic
}
```

**Option B: Use a tag expression.**

Subscribe with `{ or: ["grant", "revoke", "create", "update", "disable", "enabled", "delete"] }`.
This pushes the filter into the PubSub layer. The callback can then skip the
prefix check entirely.

**Recommendation: Option B** – it is cleaner and leverages the new expression
system directly. However, note that a message like `["api_key", "create"]` would
match because `"create"` is in the `or` list. This is the desired behavior: all
mutations should be audited regardless of resource type.

---

## SSE Integration

### Envelope Change

The current [`ServerSentEventEnvelope`](src/types/ServerSentEventsType.ts:3) has
a single `topic: string` field. This changes to match the new PubSubMessage:

```ts
interface ServerSentEventEnvelope {
    tags: string[];
    data: unknown;
    receivedAt: string;  // ISO-8601 timestamp
}
```

The SSE bridge at [`src/services/ServerSentEvents.ts:169`](src/services/ServerSentEvents.ts:169)
currently wraps PubSub messages into envelopes. It will adapt the new
`PubSubMessage` shape directly.

### Bridge Implementation

The SSE bridge subscribes via `PubSub.subscribeAll()` (unchanged). For each
incoming `PubSubMessage`, it:

1. Adds the tag set to `knownTags` (replacing `knownTopics`).
2. Wraps into a `ServerSentEventEnvelope` with `tags` instead of `topic`.
3. Evaluates each per-session filter to decide whether to enqueue.

### Per-Session Filter Change

Currently, each [`ServerSentEventFilter`](src/services/ServerSentEvents.ts:35)
holds a `Set<string>` of topic filters and matches via `topicMatches()`:

```ts
function topicMatches(filter: string, topic: string): boolean {
    return filter === "*" || topic === filter || topic.startsWith(`${filter}.`);
}
```

In the new system, each filter holds an array of `TagExpression` objects
(instead of string topics). Matching becomes:

```ts
function expressionMatches(expression: TagExpression, tags: Set<string>): boolean {
    // Recursive evaluation of the TagExpression against the tag set
}
```

The `matches()` method on `ServerSentEventFilter` iterates over the session's
expressions and returns `true` if any expression matches the published tag set.

A `"*"` wildcard filter becomes a `subscribeAll`-equivalent: a filter with an
empty expression list (or a sentinel) that matches everything.

**Important:** Because tag expressions can be complex nested objects, they
cannot be passed as a simple comma-separated query string. The SSE stream URL's
`?topics=` parameter is replaced by the `PATCH /api/server_sent_events/expressions`
endpoint for initial seeding, and the `connected` event carries the full filter
state.

### Client Expression Sync (PATCH)

The browser [`ClientPubSub`](src/ui/pubsub.ts) currently syncs its active
subscription expressions (pre-migration: topic strings) to the server via
[`PATCH /api/server_sent_events/expressions`](src/api/ServerSentEventAPI.ts). In the
new system:

- The client collects its active `TagExpression` objects.
- These are serialized and sent via PATCH.
- The server deserializes and stores them in the session filter.

The `SseTopicsUpdateBodySchema` changes from `{ topics: string[] }` to
`{ expressions: TagExpression[] }`.

### Browser-Side Changes

The browser [`ClientPubSub`](src/ui/pubsub.ts) mirrors the server PubSub API:

- `subscribe(expression: TagExpression, callback)` replaces
  `subscribe(topic: string, callback)`
- `subscribeAll(callback)` semantics remain unchanged.
- `publish(tags: string[], data?)` replaces `publish(topic: string, data?)`
- `publishSync(tags: string[], data?)` replaces `publishSync(topic: string, data?)`
- `getServerTopics()` becomes `getServerExpressions()` – returns the set of
  active tag expressions (or `["*"]` if only wildcard subscribers exist).
- The debounced sync to `PATCH /api/server_sent_events/expressions` now sends
  expressions instead of topic strings.

The browser's [`handlePubSubEvent`](src/ui/sse_bridge.ts:17) in the
EventSource bridge parses the new `{ tags, data, receivedAt }` envelope and
calls `publishSync(tags, data)` into the local ClientPubSub.

---

## TypeBox Schema Changes

### `src/types/ServerSentEventsType.ts`

| Old | New |
|---|---|
| `ServerSentEventEnvelope.topic: string` | `ServerSentEventEnvelope.tags: string[]` |
| `ServerSentEventClientConfig.topics?: readonly string[]` | `ServerSentEventClientConfig.expressions?: readonly TagExpression[]` |
| `ServerSentEventClientSnapshot.topics: string[]` | `ServerSentEventClientSnapshot.expressions: TagExpression[]` |
| `SseTopicsUpdateBodySchema = { topics: string[] }` | `SseExpressionsUpdateBodySchema = { expressions: TagExpression[] }` |
| `SseKnownTopicsResponseSchema = { topics: string[] }` | `SseKnownTagsResponseSchema = { tags: string[] }` |

### New Shared Types (potentially in `src/types/PubSubType.ts`)

```ts
import { Type, type Static } from "@sinclair/typebox";

// Recursive TagExpression – TypeBox supports $ref for recursion
const TagExpressionSchema = Type.Union([
    Type.String(),                                          // Tag
    Type.Object({ and: Type.Array(Type.Ref("TagExpression")) }),
    Type.Object({ or: Type.Array(Type.Ref("TagExpression")) }),
    Type.Object({ not: Type.Ref("TagExpression") }),
]);
```

---

## New Expression Capabilities (Examples)

The tag expression system enables subscription patterns that were impossible
with hierarchical topics:

### Cross-resource subscriptions

```ts
// Any update to a user or group
PubSub.subscribe(
    { and: [{ or: ["user", "group"] }, "update"] },
    (msg) => { /* user OR group, AND update */ }
);
```

### Exclusion filters

```ts
// All updates except config changes
PubSub.subscribe(
    { and: ["update", { not: "config" }] },
    (msg) => { /* update AND NOT config */ }
);
```

### Action-only subscriptions

```ts
// Any deletion, regardless of resource type
PubSub.subscribe("delete", (msg) => { ... });

// Equivalent to old subscribe("delete", cb) which matched
// delete.* via prefix walking
```

### Resource-only subscriptions

```ts
// Anything happening to API keys
PubSub.subscribe("api_key", (msg) => { ... });

// Equivalent to old subscribe("api_keys", cb) which matched
// api_keys.* and api_keys via prefix walking
```

### Precise event targeting

```ts
// Only API key permission changes (not creates, updates, or deletes of API keys)
PubSub.subscribe(
    { and: ["api_key", "permissions_changed"] },
    (msg) => { ... }
);

// Previously required the full path "api_keys.permissions.changed"
// and was fragile if the topic naming changed
```

---

## Backward Compatibility

This is a **breaking change**. All publishers and subscribers must be updated
simultaneously. No backward-compatibility shim is provided because:

1. The data shapes are fundamentally different (tags array vs. topic string).
2. The matching semantics are different (boolean expression vs. prefix walking).
3. A shim would add complexity and risk silent mismatches during the transition.

### Migration Strategy

1. Update [`src/services/PubSub.ts`](src/services/PubSub.ts) to the new API.
2. Update all publishing call sites (see mapping table above).
3. Update all server-side subscribers.
4. Update [`src/services/ServerSentEvents.ts`](src/services/ServerSentEvents.ts)
   (bridge + filter).
5. Update [`src/types/ServerSentEventsType.ts`](src/types/ServerSentEventsType.ts)
   (types and schemas).
6. Update [`src/api/ServerSentEventAPI.ts`](src/api/ServerSentEventAPI.ts)
   (API routes).
7. Update [`src/ui/pubsub.ts`](src/ui/pubsub.ts) (browser PubSub).
8. Update [`src/ui/server_sent_events.ts`](src/ui/server_sent_events.ts)
   (browser EventSource bridge).
9. Remove old topic constants from
   [`src/types/ApiKeyType.ts`](src/types/ApiKeyType.ts),
   [`src/types/ConfigType.ts`](src/types/ConfigType.ts),
   [`src/services/Auth.ts`](src/services/Auth.ts),
   [`src/repo/FunctionalPermissionRepo.ts`](src/repo/FunctionalPermissionRepo.ts).
10. Define new tag constants (tag arrays) in a central location.
11. Update tests that reference topic strings.

---

## Files Affected

| File | Change |
|---|---|
| [`src/services/PubSub.ts`](src/services/PubSub.ts) | Complete rewrite of matching engine |
| [`src/services/ServerSentEvents.ts`](src/services/ServerSentEvents.ts) | Envelope, filter matching, known-tags |
| [`src/types/ServerSentEventsType.ts`](src/types/ServerSentEventsType.ts) | Type and schema changes |
| [`src/api/ServerSentEventAPI.ts`](src/api/ServerSentEventAPI.ts) | Route updates (PATCH body, GET response) |
| [`src/types/ApiKeyType.ts`](src/types/ApiKeyType.ts) | Remove topic constants; add tag arrays |
| [`src/types/ConfigType.ts`](src/types/ConfigType.ts) | Remove topic constant; add tag array |
| [`src/services/Auth.ts`](src/services/Auth.ts) | Publish calls + subscribe calls |
| [`src/services/AuditLog.ts`](src/services/AuditLog.ts) | Subscription + filtering logic |
| [`src/services/EntraIDSync.ts`](src/services/EntraIDSync.ts) | Subscription |
| [`src/repo/ApiKeyRepo.ts`](src/repo/ApiKeyRepo.ts) | Publish calls |
| [`src/repo/FunctionalPermissionRepo.ts`](src/repo/FunctionalPermissionRepo.ts) | Remove topic constants; publish calls |
| [`src/api/ConfigAPI.ts`](src/api/ConfigAPI.ts) | Publish call |
| [`src/ui/pubsub.ts`](src/ui/pubsub.ts) | Complete rewrite to tag-expression API |
| [`src/ui/server_sent_events.ts`](src/ui/server_sent_events.ts) | Envelope parsing, publishSync call |
| [`src/ui/pages/AdminConfigList.tsx`](src/ui/pages/AdminConfigList.tsx) | subscribe call |
| [`tests/api/`](tests/api/) | Update any topic references in tests |
| `design/server-sent-events.md` | Update to reflect new envelope + filter model |
