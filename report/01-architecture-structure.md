# 01 — Architecture & Directory Structure

## Rubric
Per root and folder-level AGENTS.md: layering is `ui → api → services → repo → schema`, with all DB access encapsulated in `src/repo/`, services free of direct `getDatabaseConnection()` calls, and startup tasks handled by the `src/autostart/` convention. The frontend is 100% CSR with per-app bundles. Good means: route handlers contain no Drizzle queries, services depend only on passed `db` handles, no server→UI imports except documented shared constants, one bootstrap mechanism, and directory structure matching the documented layout.

### [ARCH-001] Route handler performs direct Drizzle query bypassing repo layer
- **Location(s):** `src/api/FunctionalPermissionAPI.ts:16` (schema import), `:35` (`context.dbClient.select().from(FunctionalPermissionTable)...offset(...).limit(...)`)
- **Description:** The list route executes a raw Drizzle select with pagination instead of a repo function. `FunctionalPermissionRepo.getFunctionalPermissions()` exists but without paging, so the route duplicates paging logic. Violates root AGENTS.md ("Database mutations must stay inside `src/repo/`") and `src/api/AGENTS.md` ("Direct Drizzle ORM queries — use repo functions only").
- **Why it matters:** The documented layering boundary is breached in the exact layer whose AGENTS.md forbids it; future AI changes may copy this precedent.
- **Related findings:** CPLX-001, DOC-004

### [ARCH-002] Environment-variable reading duplicated across entry points, no central env module
- **Location(s):** `src/main.ts:83`, `src/apps/setup.ts:228` (`Number(process.env.PORT) || 8000` duplicated verbatim), `src/api/RequestBundlingAPI.ts:142-144`, `src/services/DatabaseDriver.ts:30,114`, `src/devmode.ts:2,4`
- **Description:** Env vars (`PORT`, `DATABASE_URL`, `ADVISORY_LOCK`, `INTERNAL_API_BASE_URL`, `BUNDLING_DEBUG`, `DEV_MODE`, `NODE_ENV`) are parsed ad hoc at each use site; no shared env/config module exists, while DB-backed config has an elaborate `Config` structure.
- **Why it matters:** Divergence risk (e.g. bundling origin port vs. listen port); adding an env var requires hunting all parse sites.
- **Related findings:** CFG-001, TS-004

### [ARCH-003] Services call `getDatabaseConnection()` despite explicit prohibition
- **Location(s):** `src/services/EntraIDSync.ts:225,232,252,261,262,289`; `src/services/AuditLog.ts:70`; `src/services/Auth.ts:707`; `src/services/Setup.ts:95`; `src/services/auth/FunctionalPermissions.ts:9-45` (every export); `src/services/auth/ApplicationDefinedFunctionalPermissions.ts:6`
- **Description:** `src/services/AGENTS.md` states "Don't call `getDatabaseConnection()` in services (except DatabaseDriver.ts itself)". Six service files do so, binding to the process-wide connection instead of the passed `db`.
- **Why it matters:** Hidden global-singleton coupling; breaks testability and transaction scoping; services cannot run inside a caller's transaction.
- **Related findings:** CPLX-004

### [ARCH-004] Server and repo layers import from `src/ui/*`
- **Location(s):** `src/services/Auth.ts:24` (`@/ui/auth/functional_permissions.ts`), `src/repo/FunctionalPermissionRepo.ts:8`, `src/services/auth/FunctionalPermissions.ts:4`
- **Description:** Server-side service and repo files import constants from the UI tree. Repo is documented as the bottom-most layer; importing UI constants inverts that layering.
- **Why it matters:** Layer inversion makes the repo depend on the frontend tree; bundling or restructuring UI can break the server.
- **Related findings:** NAME-005

### [ARCH-005] Two bootstrap mechanisms coexist; EntraID sync not migrated to autostart
- **Location(s):** `src/main.ts:4,25-29` (explicit `startEntraIDSync` import/call) vs. `src/main.ts:54-72` (autostart directory scan); acknowledged in `design/autostart.md:29,170`
- **Description:** A documented half-finished migration: EntraID sync starts via explicit call (failure only warns, `main.ts:29`), while other startup tasks use the convention-based autostart scan (failures warn, `main.ts:67`).
- **Why it matters:** Startup ordering and error semantics differ between two paths; a future task may "migrate" without knowing the explicit path exists.
- **Related findings:** DOC-001

### [ARCH-006] Setup app binds the same port as the main app without a release wait
- **Location(s):** `src/apps/setup.ts:228,235,245`; `src/main.ts:83-84`
- **Description:** Setup server listens on the app port, calls `server.stop()` when setup completes, and `main.ts` immediately re-binds the same port with no wait for socket release. Also `setup.ts:107` emits `<html lang="de">` contradicting root AGENTS.md "All UI text must be in English".
- **Why it matters:** Latent `EADDRINUSE` race on the setup-completion path; language rule violated in a user-facing document.
- **Related findings:** SPEC-004

### [ARCH-007] Side-effect import ordering is load-bearing
- **Location(s):** `src/main.ts:14` (`await import("@/services/auth/FunctionalPermissions.ts")` — runs DB mutations at import time via `getDatabaseConnection()`), `src/apps/ui.ts:14` (`await import("@/services/ServerSentEvents.ts")` triggers `ensurePubSubBridge()` at `ServerSentEvents.ts:185` and a module-level `setInterval` at `:188-197`), `src/main.ts:56-69` (readdirSync autostart scan)
- **Description:** Module import order initializes global singletons and performs DB writes; importing these modules in a test or bundling context has side effects.
- **Why it matters:** Hidden coupling to import order; tests importing these modules will hit the database or start intervals.
- **Related findings:** CPLX-004, ARCH-003

### [ARCH-008] `dbClient` injected via placeholder decorate + global derive ordering
- **Location(s):** `src/main.ts:44-46,75` (Elysia `derive` returning real `dbClient`); `src/apps/api.ts:15`, `src/apps/ui.ts:17`, `src/apps/login.ts:11` each `.decorate("dbClient", {} as DBClient)`
- **Description:** Three apps decorate a fake `{}` placeholder cast to `DBClient`; the real value depends on the global `derive` being mounted in the correct order in `main.ts`.
- **Why it matters:** If mounting order changes, handlers silently receive `{}`; the DI mechanism is fragile, uses an unsafe cast, and is undocumented.
- **Related findings:** TS-001

### [ARCH-009] Undocumented unauthenticated `./public/*` mount in addition to `static/public/`
- **Location(s):** `src/main.ts:37` (`Bun.file(\`./public/${params["*"]}\`)`), `:39` (`./static/public/...`); root AGENTS.md documents only `static/public/` as unauthenticated
- **Description:** A second public mount point `./public/*` exists that is not listed in the root AGENTS.md static-asset section.
- **Why it matters:** Undocumented unauthenticated surface; reviewers cannot tell what is intentionally public.
- **Related findings:** SEC-008, DOC-003

### [ARCH-010] Mixed page-architecture paradigms across admin UI pages
- **Location(s):** imperative ref-map + PubSub: `src/ui/pages/AdminUserList.tsx:54-108`, `AdminGroupList.tsx:54-101`, `AdminApiKeyList.tsx:95-142`, `AdminUserDetail.tsx:37-110`, `AdminGroupDetail.tsx:57-158`; plain `useState` + three PubSub subscriptions: `AdminConfigList.tsx:274-494`; plain `useState`, no SSE at all: `AdminAuditLog.tsx:44-109`, `AdminFunctionalPermissionList.tsx:28-78`, `AdminFunctionalPermissionDetail.tsx:34-107`, `AdministrationHome.tsx:55-71`
- **Description:** Four mutually inconsistent patterns implement the same concerns (loading, live updates, permissions); no shared hook exists.
- **Why it matters:** A pattern used four ways is the core compounding-complexity risk for AI-driven change; any cross-page behavior fix must be understood and applied four ways.
- **Related findings:** CPLX-002, PATT-004

### [ARCH-011] Breadcrumb data fetching hard-coded per route in the app shell
- **Location(s):** `src/ui/app.tsx:174-208`
- **Description:** Three hard-coded `matchPath` + `apiGet` blocks for `/admin/users/:userid`, `/admin/groups/:groupid`, `/admin/functional-permissions/:functionalpermissionid`; API-key detail breadcrumb is missing.
- **Why it matters:** The shell knows about concrete pages; adding a page requires editing the shell, and the existing set is already incomplete.
- **Related findings:** SPEC-005
