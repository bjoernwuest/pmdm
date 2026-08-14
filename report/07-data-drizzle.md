# 07 — Drizzle ORM & Data Layer

## Rubric
Per `src/schema/AGENTS.md` and `src/repo/AGENTS.md`: one schema file per entity with the repo layer fully encapsulating all queries, multi-step mutations inside `runInTransaction()`, optimistic locking round-tripping `updatedAt` on every update/delete, and indexes backing the actual query patterns (permission resolution, audit sorting, API-key lookup). Good means: type-safe query builders without casts, no N+1, no needless transactions on reads, and set-based batch operations.

### [DATA-001] Missing indexes on hot paths
- **Location(s):** `src/schema/ApiKeySchema.ts:7-19` — no index on `key_hash`/`expires_at`/`disabled` although `validateApiKeySecret` (`src/repo/ApiKeyRepo.ts:331-343`) scans per request; `src/schema/AuditEntrySchema.ts:13-18` — no index on `created_at` although every query does `desc(createdAt)` with offset pagination (`AuditRepo.ts:59-65`), and no index on `topic` although it is ILIKE-searched; `FunctionalPermissionsOfGroup` has PK `(functionalPermissionIdentifier, grantedTo)` but no index on `grantedTo` although `getFunctionalPermissionsOfUser` filters `grantedTo in (...)` (`FunctionalPermissionRepo.ts:72`)
- **Description:** Tables lack indexes for the queries executed on every authenticated request.
- **Why it matters:** Permission resolution and API-key validation degrade linearly with row count.
- **Related findings:** SEC-003

### [DATA-002] Optimistic locking on config is a non-atomic TOCTOU check
- **Location(s):** `src/api/ConfigAPI.ts:112` compares `knownValue` via JSON canonicalization, then writes via `upsertConfigEntry` (`:128-131`) with no transaction and no `updatedAt` guard (`ConfigRepo.ts:80-85`); `src/api/UserProfileConfigAPI.ts:96-131` same pattern; the `config` table has no `updatedAt` at all (`src/schema/ConfigSchema.ts:55-69`) and neither does `UserProfileConfig`
- **Description:** The read-check-write is not atomic; root AGENTS.md mandates `updatedAt` round-trip for update/delete checks, which is structurally impossible for these tables.
- **Why it matters:** Two concurrent updates both pass the check and the second silently wins; the documented optimistic-locking rule does not apply to config despite the UI sending a `knownValue`.
- **Related findings:** API-004, TS-001, VB-AI-001

### [DATA-003] Optimistic-lock timestamp comparison mixes `timestamp` cast with `timestamptz` columns
- **Location(s):** `src/repo/ApiKeyRepo.ts:184,218,251,277,304` compare `updatedAt = ${knownUpdatedAt}::timestamp` while the columns are `timestamptz` (`src/schema/helpers.ts:23,35`); `$onUpdate` writes driver-generated ISO strings while SQL paths write `now()`; compensated only by `timezone: 'UTC'` (`DatabaseDriver.ts:66`)
- **Description:** The lock comparison relies on a session-timezone-correct cast and mixed timestamp producers.
- **Why it matters:** Precision/timezone mismatch can produce false 409s depending on session timezone; the UTC pinning is an implicit coupling spread across three files.
- **Related findings:** —

### [DATA-004] N+1 query patterns
- **Location(s):** `src/api/ApiKeyAPI.ts:58-75` (per-key `getApiKeyFunctionalPermissions` over page rows); `src/api/UserAPI.ts:107-112` (per-group `getFunctionalPermissionsOfGroup`, then per-permission `getGroupsAssignedToFunctionalPermission` — up to 2N queries inside a serializable transaction opened at `:96`); `src/services/EntraIDSync.ts:142-157` (per-id Graph API calls)
- **Description:** Detail/list endpoints issue one query per row/child.
- **Why it matters:** Query count grows with page size; inside the serializable transaction this multiplies lock contention.
- **Related findings:** DATA-005

### [DATA-005] Read-only serializable read-write transactions; outer client used inside the callback
- **Location(s):** `src/api/UserAPI.ts:96-122` wraps pure reads in `runInTransaction` (which forces serializable + `accessMode: "read write"` per `DatabaseDriver.ts:201`) and uses `context.dbClient` (`:97`) instead of the transaction handle inside the callback — defeating the transaction entirely; `GroupAPI.ts:101-113` same pattern
- **Description:** Reads run in needless serializable read-write transactions, and one path queries outside the transaction it opened.
- **Why it matters:** Serialization failures on pure reads; the outer-client usage is a latent correctness bug.
- **Related findings:** DATA-004

### [DATA-006] Multi-step mutations without transactions; fragile insert/update discrimination
- **Location(s):** `src/repo/UserRepo.ts:69-73` (`disableUsers`: update + N deletes, no tx); `:208-210` and `:226-231` (`setUserMemberships`/`setGroupMemberships`: delete + insert, no tx); `src/api/AuditLogAPI.ts:98-110` (`clearAuditEntries` + `insertAuditEntries` not in one transaction — the audit "cleared by" entry is lost if the insert fails after the delete); insert-vs-update decided by `createdAt !== returningUser.updatedAt` string comparison (`UserRepo.ts:106,162`)
- **Description:** Repo-level multi-statement mutations are atomic only when callers happen to wrap them; update detection compares two DB-default timestamps as strings.
- **Why it matters:** Partial failures leave half-applied state; the string-comparison heuristic is fragile against same-statement defaults.
- **Related findings:** CPLX-005
