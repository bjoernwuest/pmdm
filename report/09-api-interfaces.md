# 09 — API & Interface Contracts

## Rubric
`src/api/AGENTS.md` requires TypeBox `params`/`query` schemas on routes, OpenAPI documentation, and consistent error responses; root AGENTS.md requires 409 Conflict on optimistic-lock mismatch and client/server types that stay in sync via generated types. Good means: one error shape, validated inputs at the boundary, no control flow smuggled through transaction boundaries, and client wrappers that mirror server schemas.

### [API-001] Error response shape inconsistency
- **Location(s):** JSON `{error, message}` for 401 from the global hook (`src/apps/api.ts:79-84`); plain strings for 403/404/409 via `status()` (e.g. `ApiKeyAPI.ts:48`); object `{error, currentValue}` for 409 (`ConfigAPI.ts:113-116`); `{error, message: _err}` leaking an Error object (`GroupAPI.ts:189`); two competing schemas `ErrorSchema` vs `ErrorResponseSchema` (`src/types/ApiType.ts:56,67`) both in use (`GroupAPI.ts:199` vs `ConfigAPI.ts:167`); the 401 schema documented as `Type.String()` in routes does not match the actual JSON payload
- **Description:** Clients cannot parse errors uniformly; OpenAPI documents a shape the hook does not produce.
- **Why it matters:** Every consumer needs per-endpoint error handling; the documented contract is wrong.
- **Related findings:** PATT-001

### [API-002] Missing `params`/`query` TypeBox schemas despite AGENTS.md requirement
- **Location(s):** `ApiKeyAPI.ts:52-54`, `UserAPI.ts:33-35`, `GroupAPI.ts:38-40`, `AuditLogAPI.ts:19-22`, `FunctionalPermissionAPI.ts:29-33` read `context.query.page` etc. with no `query:` schema; `params:` schemas only in `ConfigAPI.ts:136` and `UserProfileConfigAPI.ts:145`; `src/api/AGENTS.md` marks both as "required"
- **Description:** Pagination parameters and path UUIDs are unvalidated at the boundary.
- **Why it matters:** `Number(undefined)` produces NaN pagination; invalid UUIDs reach the DB as query errors — 500s instead of 400s.
- **Related findings:** —

### [API-003] `status()` responses smuggled through transaction callbacks with result sniffing
- **Location(s):** `FunctionalPermissionAPI.ts:136-143,188-195` return `status(404, ...)` from inside `runInTransaction` callbacks and detect it via `"status" in result`; `UserAPI.ts:99` same
- **Description:** HTTP response objects cross the transaction abstraction and are identified by duck-typing.
- **Why it matters:** Under a serializable retry the response is re-created and re-executed; the abstraction leaks HTTP concerns into the data layer path.
- **Related findings:** DATA-005

### [API-004] Client/server contract drift on config optimistic locking
- **Location(s):** `ConfigEntryUI` lacks `updatedAt` (`src/types/ConfigType.ts:27`) although the server stores it; config pages cast `(entry as any).updatedAt` (`AdminConfigList.tsx:386,451`) but send `knownValue` instead (`:626-629`, `Config.ts:12-21`, `ConfigUpdateRequest` at `ConfigType.ts:57-60`); query strings built manually in `ui/api/ApiKeys.ts:9-10` vs `URLSearchParams` in `ui/api/AuditLog.ts:28-34`
- **Description:** The stored `updatedAt` context is written but never sent; two optimistic-lock semantics (`knownValue` vs `knownUpdatedAt`) are in use across pages; URL building has two idioms.
- **Why it matters:** Dead optimistic-lock bookkeeping on config; the client cannot follow the root AGENTS.md updatedAt rule for these endpoints.
- **Related findings:** DATA-002, TS-001, TS-005, VB-AI-001

### [API-005] Request bundling semantics contradict its own description
- **Location(s):** `src/api/RequestBundlingAPI.ts:327` says sub-requests are "executed sequentially" but `:293` uses `Promise.allSettled` (concurrent); sub-response headers including `Set-Cookie` are discarded (`:251-263`)
- **Description:** The documented execution model differs from the implementation; response headers are dropped.
- **Why it matters:** Bundling any endpoint that sets cookies silently loses them; concurrent execution invalidates ordering assumptions.
- **Related findings:** SEC-007

### [API-006] OpenAPI security scheme misnamed and incomplete
- **Location(s):** `src/apps/api.ts:117-123` defines security scheme id `sessionId` of type `apiKey` for the `X-API-Key` header, applied globally at `:126`; cookie and bearer alternatives are undocumented
- **Description:** The scheme name does not match the mechanism; the three real auth methods are not all documented.
- **Why it matters:** API consumers are misled about how to authenticate.
- **Related findings:** —
