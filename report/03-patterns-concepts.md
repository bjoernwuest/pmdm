# 03 — Design Patterns & Cross-Cutting Concepts

## Rubric
Root AGENTS.md defines the cross-cutting contracts: request bundling via `src/ui/api/` helpers is the normal path for mutations, PubSub/SSE updates are narrowly scoped to affected resources and published only after the mutation succeeds, optimistic locking round-trips `updatedAt` everywhere, database mutations live in `src/repo/` inside `runInTransaction()`, and errors are handled consistently. Good means: one error-propagation strategy, one caching idiom, one subscription/unsubscription pattern, and shared abstractions instead of per-site copies.

### [PATT-001] Four coexisting error-handling strategies
- **Location(s):** `status(403, "...")` plain strings in routes (e.g. `src/api/ApiKeyAPI.ts:48`); raw `new Response(JSON.stringify({error:...}), {status:401})` in `src/apps/api.ts:79-86`; `{ok:false,error}` Result objects in `src/services/Config.ts:5` and `src/apps/setup.ts:56-92`; thrown `Error` in repo (`src/repo/UserRepo.ts:67,186`); `src/api/GroupAPI.ts:189,192` passes the caught Error object itself as JSON `message` (allowed by `ErrorSchema` at `src/types/ApiType.ts:56` with `Type.Any()`)
- **Description:** Throws, Results, status strings, hand-built Responses, and leaked Error objects all propagate failures depending on the layer.
- **Why it matters:** Callers cannot handle errors uniformly; serialized Error objects leak internals into API responses; each new AI-written handler picks a strategy by imitation of whichever file it reads.
- **Related findings:** API-001

### [PATT-002] `authorize()` + 403 re-check boilerplate duplicated ~15 times
- **Location(s):** `src/api/ApiKeyAPI.ts:46-49,130-133,213-216,276-279,322-326,379-382,430-434,481-485`; `UserAPI.ts:29-30,93-94`; `GroupAPI.ts:34-35,98-99`; `ConfigAPI.ts:61-64,104-107`; `AuditLogAPI.ts:14-17,90-93`; `FunctionalPermissionAPI.ts:25-26,83-84,127-128,179-180`
- **Description:** The permission-check-then-403 pattern is copy-pasted verbatim in every route handler.
- **Why it matters:** Any change to the denial response shape must be edited in ~15 places; the repeated pattern invites divergence.
- **Related findings:** API-001

### [PATT-003] PubSub publish granularity inconsistent across repos
- **Location(s):** double-publish per mutation (tag-only + instance form): `src/repo/ApiKeyRepo.ts:188-189,222-223,255-256`; single instance form: `src/repo/UserRepo.ts:108,111,164,167`; tag-only on delete: `ApiKeyRepo.ts:279`; instance-only on another path: `ApiKeyRepo.ts:320`
- **Description:** Subscribers receive 0, 1, or 2 events per mutation depending on which repo performed it.
- **Why it matters:** The audit-log subscriber (`src/services/AuditLog.ts:115`) double-counts ApiKey updates; UI merge logic written for one repo's semantics misbehaves for another's.
- **Related findings:** SEC-009, PATT-004

### [PATT-004] PubSub events published before transaction commit
- **Location(s):** `src/repo/ApiKeyRepo.ts:158,188-189,222-223,255-256,320` publish inside `runInTransaction` callbacks (invoked from `ApiKeyAPI.ts:226-235,438-445`); `ApiKeyRepo.ts:279` publishes even when `rows.length === 0` (returns `false` after publishing)
- **Description:** Events escape before commit; the delete path publishes a DELETE event for a deletion that did not happen. Root AGENTS.md requires publishing "only after the mutation succeeds"; `src/services/AGENTS.md:169` says "after transaction commit".
- **Why it matters:** On serializable retry/rollback, subscribers observe phantom events; UI shows changes that never persisted.
- **Related findings:** PATT-003

### [PATT-005] OIDC `discovery()` invoked per operation with no caching
- **Location(s):** `src/services/Auth.ts:304` (refresh), `:335` (bearer validation — per request), `:392` (startAuth), `:466` (finishAuth), `:611` (logout); `loadOIDCConfig` (`:259-269`) caches config but not the discovery document
- **Description:** Every bearer-token API request performs a network round-trip to the EntraID discovery endpoint.
- **Why it matters:** Latency and availability of every API request depend on an external endpoint.
- **Related findings:** SEC-003

### [PATT-006] Five distinct caching idioms
- **Location(s):** lazy singleton via `let x: undefined|T` + async getter (`Auth.ts:156-160,243-269,272-276`; `Setup.ts:13-29,84-96`); `TTLMap` (`src/utils/TTLMap.ts`); module-level `Map` (`ServerSentEvents.ts:154`); module-level plain caches (`Auth.ts:660-662`, `RequestBundling.ts:37-38`); DB-backed config cache
- **Description:** Five mechanisms coexist; `RequestBundling.ts:37-38` caches config forever with no invalidation despite config-update PubSub events existing.
- **Why it matters:** No shared policy for cache invalidation; runtime config edits silently do not apply to some subsystems.
- **Related findings:** CFG-002

### [PATT-007] UI API wrapper layer exists for only 4 of ~10 APIs; pages build URLs inline
- **Location(s):** wrappers exist: `src/ui/api/ApiKeys.ts`, `AuditLog.ts`, `Config.ts`, `UserProfileConfig.ts`; inline `apiGet` URL strings: `AdminUserList.tsx:117` (`/api/users`), `AdminUserDetail.tsx:49,87`, `AdminGroupList.tsx:110` (`/api/groups`), `AdminGroupDetail.tsx:76-91`, `AdminFunctionalPermissionList.tsx:55`, `AdminFunctionalPermissionDetail.tsx:69-71,102`, `AdminApiKeyDetail.tsx:97-99`, `AdminAuditLog.tsx:71`, `AdministrationHome.tsx:60`, `src/ui/app.tsx:180-200,314`; no `Users.ts`/`Groups.ts`/`FunctionalPermissions.ts` wrappers exist
- **Description:** Root AGENTS.md mandates "use the helpers in `src/ui/api/`"; the helper layer covers a minority of the API and the rest hand-rolls URLs and pagination strings (`page=${page-1}`) at every call site.
- **Why it matters:** The documented pattern is applied inconsistently; adding a page today has no single convention to follow.
- **Related findings:** VB-AI-001, API-004

### [PATT-008] Request bundling bypassed for one mutation class
- **Location(s):** `src/ui/api/server_sent_events.ts:34-39` issues a PATCH via raw `fetch`, while `src/ui/api/_client.ts` routes POST/PUT/PATCH/DELETE through `_request_bundling.ts`
- **Description:** The SSE expression PATCH is the sole mutation not bundled; whether deliberate is undocumented.
- **Why it matters:** Inconsistent with "request bundling is the normal path for mutating client requests" (root AGENTS.md).
- **Related findings:** PATT-007, VB-AI-001

### [PATT-009] Two unsubscribe patterns, one deferring cleanup asynchronously
- **Location(s):** static `unsubscribe(token)`: `AdminConfigList.tsx:322,470,493`; dynamic `import("@/ui/pubsub").then((m) => m.unsubscribe(token))`: `AdminUserList.tsx:103-107`, `AdminApiKeyList.tsx:137-141`, `AdminGroupList.tsx:96-100`, `AdminUserDetail.tsx:105-109`, `AdminGroupDetail.tsx:137-141,153-157`, `AdminApiKeyDetail.tsx:203-207` — files that already statically import `subscribe` from the same module
- **Description:** Cleanup via dynamic import is redundant and asynchronous; a message can arrive between cleanup scheduling and execution.
- **Why it matters:** Two idioms for the same lifecycle concern; the async variant has a race the static one does not.
- **Related findings:** RCT-001

### [PATT-010] PubSub subscriptions not narrowly scoped; entity derived via UUID-regex over tags
- **Location(s):** `AdminUserList.tsx:81,85` subscribes `{or:[TAG_UPDATE,TAG_DISABLE]}` and derives the entity by regexing a UUID out of tags; same in `AdminApiKeyList.tsx:118,121` and `AdminGroupList.tsx:77`; unused domain-tag imports `TAG_USER` (`AdminUserList.tsx:11`), `TAG_API_KEY` (`AdminApiKeyList.tsx:24`)
- **Description:** Subscriptions ignore domain tags and use `/^[0-9a-f-]{36}$/i` to find the affected ID — any UUID tag from any domain matches; the ref-map key decides whether it applies.
- **Why it matters:** Contradicts the "narrowly scoped to the affected resources" rule (root AGENTS.md); an API-key update can hit the user-list handler whenever IDs coincide; the imported domain tags are dead.
- **Related findings:** CPLX-002, VB-AI-001

### [PATT-011] Duplicated "three-stream race" save logic
- **Location(s):** `AdminConfigList.tsx:554-653` (`handleSave`), `AdminApiKeyDetail.tsx:222-326` (`handleSaveName`), `:328-432` (`handleSaveDescription`); comment "=== THREE-STREAM RACE ==="
- **Description:** The PubSub/timer/server race handling with a `resolved` flag, 1000 ms timeout, and identical 409 handling is copy-pasted three times.
- **Why it matters:** Critical concurrency logic duplicated; timeout and cleanup rules can drift between copies.
- **Related findings:** CPLX-002

### [PATT-012] Duplicated array-editor modal and helper functions (~180 lines)
- **Location(s):** `AdminConfigList.tsx:908-1087` + helpers `:78-225` vs. `UserProfileConfigList.tsx:427-606` + helpers `:47-124` — `isInlineType`, `isArrayType`, `normalizeArrayValues`, `validateArrayItem`, `formatArraySummary` near-verbatim
- **Description:** The entire array Dialog state machine (`ArrayModalState`, add/edit/remove/Revert) is duplicated across two pages.
- **Why it matters:** Any behavioral fix must be applied twice; drift is guaranteed by independent edits.
- **Related findings:** CPLX-002
