# 12 — Documentation & Coding Style

## Rubric
Design docs are the pre-change reference ("read these before changing behavior that has a dedicated design note" — root AGENTS.md); AGENTS.md files are layer-authoritative; comments describe what the code does. Good means: docs reference existing files, line numbers and terminology match the current code, TODO/FIXME items are tracked in TODO.md, dead code does not accumulate, and formatting is applied consistently.

### [DOC-001] `design/configuration.md` extensively stale
- **Location(s):** references nonexistent paths: `src/schema/Config.ts`, `src/types/Config.ts`, `src/types/_Config.ts`, `src/services/AuthType.ts`, `src/services/RequestBundlingType.ts`, `src/services/AuditLogAPI.ts`, `src/api/ConfigSchema.ts`, `src/ui/api/ConfigSchema.ts`; claims `pubsub_ConfigUpdated` on channel `"config.updated"` published from `src/api/ConfigAPI.ts:132` (`:134,164`) — actual publish is a tag array from `ConfigRepo.ts:89-101`; claims setup wizard and admin API share parsing logic (`:107-113`) — false (`apps/setup.ts` has its own copy); omits `formatRegex`/`userProfile` fields (`:73`); domain names listed at `:54-55` do not match code values
- **Description:** The central configuration design doc describes a pre-migration state with wrong filenames throughout.
- **Why it matters:** Anyone (or any AI) changing config behavior per this doc will target files that do not exist and a pubsub channel that no longer exists.
- **Related findings:** CPLX-003, NAME-008

### [DOC-002] `design/pubsub.md` frames a completed migration as pending
- **Location(s):** `:5-8` ("describes the migration…" framed as future); `:306-318` mapping table lists old topics that no longer exist; `:311` stale line references; `:579-583` instructs to "remove old topic constants" — already done; `TAG_UPSERT`/`TAG_CONFIGENTRY` exist in code but not in the doc's tag tables; `:608` flags `server-sent-events.md` as needing update
- **Description:** The migration doc reads as a TODO although the code is migrated.
- **Why it matters:** A future task may "perform the migration" again, or trust tag tables that are incomplete.
- **Related findings:** DOC-005, NAME-004

### [DOC-003] Root AGENTS.md inaccuracies
- **Location(s):** `.env` section lists only `DATABASE_URL`/`ADVISORY_LOCK` (actual also `APP_BASE_URL`, `PORT`, `DEV_MODE`, `SQL_LOGGING`, `INTERNAL_API_BASE_URL`, `BUNDLING_DEBUG`, `NODE_ENV`); `./public/*` mount undocumented (only `static/public/` listed); `TODO.md` described as a project file while `.gitignore:9` ignores it and its content is only "NEVER READ THIS FILE"
- **Description:** The root guidance file describes an env surface and file set that differ from reality.
- **Why it matters:** Onboarding and AI orientation start from this file; missing env vars and mounts are invisible.
- **Related findings:** CFG-001, ARCH-009, SPEC-005

### [DOC-004] Folder AGENTS.md files reference wrong filenames
- **Location(s):** `src/api/AGENTS.md` cites `@/services/AuthType.ts`, `@/services/ConfigSchema.ts`, `@/types/ApiKeySchema.ts`, `@/types/Database.ts`, `@/services/ServerSentEventsType.ts` (none exist); `src/ui/AGENTS.md` api/ section lists `AuditLogAPI.ts` and `ConfigSchema.ts` as the canonical helper examples (actual: `AuditLog.ts`, `Config.ts`)
- **Description:** Layer-authoritative guides point at a pre-rename file layout.
- **Why it matters:** The examples an AI is told to imitate do not exist; imports written per the docs fail.
- **Related findings:** VB-AI-003, ARCH-001

### [DOC-005] SSE terminology split between docs
- **Location(s):** `design/pubsub.md:429,437,458` and `src/api/AGENTS.md` document `PATCH /api/server_sent_events/topics`; code uses `.../expressions` (`src/api/ServerSentEventAPI.ts:101`) and `.../tags` (`:136`)
- **Description:** The topics→expressions/tags migration is only half-reflected in docs.
- **Why it matters:** Doc-driven changes target a nonexistent route.
- **Related findings:** NAME-003, NAME-004, DOC-002

### [DOC-006] UI design docs contain stale line references and structural contradictions
- **Location(s):** `design/ui-page-registry.md:137` claims the generated file is git-ignored with a committed stub exporting `[]` — the working-tree `src/ui/_pageRegistry.generated.ts` contains 15 real imports and is ignored by `.gitignore:11`; example urn `page:dashboard` (`:55`) vs real `urn:bun-starter:ui:page:...`; `design/ui/Toggle.md` cites `AdminConfigList.tsx` "lines 714–737" (actual boolean toggle at 769-801) and `AdminUserList.tsx:92` `InputSwitch` (now `Toggle` at 147); its replacement mapping (`:763-807`) is partially done (lists migrated, detail pages and status chips not); it references a `StatusChip` (`:800-804`) that does not exist — status renders via `Label`
- **Description:** UI design docs disagree with the committed code on structure and progress state.
- **Why it matters:** Tasks derived from these docs chase nonexistent components and wrong line numbers.
- **Related findings:** RCT-004, SPEC-002

### [DOC-007] Comment rot, typos, and TODO/FIXME inventory
- **Location(s):** `src/repo/UserRepo.ts:21-27` (`_systemUser` docstring describes a "user interacting with the system" — it is a DB seed constant), `:34` ("objecType" typo), `:83` (references `UserInsert`/`UserType` type names that do not exist), `:70` (`distabledUser` typo); `src/services/Auth.ts:294` ("sessin"), `:149-155` (hardcodes "900 seconds" though configurable), `:416` (FIXME cookie maxAge), `:768` (FIXME: bearer-token users get zero permissions); `src/schema/UserSchema.ts:9,35` (comments reference an `isActive` column/index; actual column is `disabled`); `src/schema/FunctionalPermissionSchema.ts:32-62` (doc block duplicated verbatim twice); `src/main.ts:42` (comment "not transaction" contradicts `DatabaseDriver.ts:200-201`); `src/ui/PageRegistry.ts:162` (FIXME default path), `src/ui/app.tsx:242` (FIXME hard-coded product name)
- **Description:** Comments document columns that were renamed, types that no longer exist, and values that are configurable.
- **Why it matters:** Systematically misleading generated comments reduce trust in all comments; the FIXMEs are not tracked in TODO.md (which is itself unusable).
- **Related findings:** DOC-003, SPEC-001, SEC-005
