# 02 — Naming & Terminology Consistency

## Rubric
Per folder AGENTS.md files: service/repo/schema/api files are PascalCase; functions are camelCase; parameters lowercase. Generated types carry a `_` prefix with a single documented meaning. Test files, page objects, env vars, and helper modules follow the names mandated by `design/playwright_testing.md`. Design docs and code use one terminology set (the post-migration "expressions/tags" SSE vocabulary). Public URL paths are correctly spelled.

### [NAME-001] Casing drift in service and UI files
- **Location(s):** `src/services/ui_config.ts` (snake_case) vs. `Config.ts`, `Auth.ts`, `PubSub.ts` etc.; `src/ui/server_sent_events.ts`, `src/ui/api/server_sent_events.ts`, `src/ui/api/session.ts`, `src/ui/api/errors.ts` (snake/lowercase) vs. `src/ui/api/ApiKeys.ts`, `AuditLog.ts`, `Config.ts`, `UserProfileConfig.ts` (PascalCase); `src/ui/app_PageRegistry.ts` (`app_` prefix, unique in repo)
- **Description:** snake_case and PascalCase files coexist within the same folders; `src/services/AGENTS.md` mandates PascalCase.
- **Why it matters:** Inconsistent convention within folders; import paths become unpredictable for both humans and AI.
- **Related findings:** NAME-002, NAME-005

### [NAME-002] Two modules named `server_sent_events.ts` with different responsibilities; three SSE-related UI modules
- **Location(s):** `src/ui/server_sent_events.ts` (EventSource bridge), `src/ui/api/server_sent_events.ts` (URL builder + PATCH), `src/ui/pubsub.ts` (client PubSub class + expression sync)
- **Description:** The same filename exists twice with different content, and the concept "SSE/pubsub client" is spread across three modules with overlapping naming.
- **Why it matters:** Grep-ability and import clarity suffer; an AI asked to "fix server_sent_events" has two candidate files.
- **Related findings:** PATT-003, NAME-001

### [NAME-003] Misleading export name `getActiveServerTopics` after topics→expressions migration
- **Location(s):** `src/ui/pubsub.ts:219-221` exports `getActiveServerTopics()` wrapping `getActiveServerExpressions`; `design/pubsub.md:429-477` uses "expressions" throughout
- **Description:** A stale name survives the terminology migration the design doc itself describes.
- **Why it matters:** API surface contradicts the spec vocabulary; callers cannot tell if "topics" is a distinct concept.
- **Related findings:** DOC-005, NAME-004

### [NAME-004] SSE endpoint names differ between code and docs
- **Location(s):** Code: `PATCH /api/server_sent_events/expressions`, `GET /api/server_sent_events/tags` (`src/api/ServerSentEventAPI.ts:101,136`); docs: `src/api/AGENTS.md` (SSE notes) and `design/pubsub.md:430,436,458` document `PATCH /api/server_sent_events/topics`
- **Description:** Internal docs use the pre-migration `topics` endpoint; code uses `expressions`.
- **Why it matters:** A future change driven by the docs targets a nonexistent route.
- **Related findings:** DOC-005

### [NAME-005] `_`-prefixed files encode two different meanings
- **Location(s):** `src/types/_ConfigType.ts` etc. (`_` = auto-generated, per `src/types/AGENTS.md`); `src/ui/api/_client.ts`, `src/ui/api/_request_bundling.ts` (`_` = internal); `src/ui/_pageRegistry.generated.ts` (both conventions combined)
- **Description:** The `_` prefix means "generated" in `src/types/` but "internal helper" in `src/ui/api/`; one file combines both.
- **Why it matters:** Same signal, different semantics — an AI may edit a `_client.ts` believing it is regenerated, or avoid editing a generated type believing it is hand-written.
- **Related findings:** NAME-001

### [NAME-006] Function/parameter casing drift inside repo layer
- **Location(s):** `src/repo/UserRepo.ts:334` `GroupCount` (PascalCase function) vs. `:298` `getUserCount`; capitalized parameters `UserIds`, `GroupIds`, `DBClient` at `UserRepo.ts:65,85,204,276`, `FunctionalPermissionRepo.ts:38,62` and elsewhere
- **Description:** Sibling functions and parameters use inconsistent casing within the same files.
- **Why it matters:** Convention drift within a single layer; call sites inherit the inconsistency.
- **Related findings:** —

### [NAME-007] Public endpoint typo `/setup/clienType.js`
- **Location(s):** `src/apps/setup.ts:115,124`
- **Description:** Route and HTML script src both use `clienType.js` (consistent typo, so functional), unlike `/login/client.js` and `/ui/client.js`.
- **Why it matters:** A typo becomes public URL surface; "fixing" it later is a breaking change.
- **Related findings:** —

### [NAME-008] Config domain strings inconsistent between code and docs
- **Location(s):** Code: `"audit_log"` (`src/services/AuditLog.ts:10`), `"request_bundling"` (`src/services/RequestBundling.ts:21`), `"EntraID"` (`src/services/EntraIDSync.ts:17`), `"Authentication and Authorization"` (`src/services/Auth.ts:102`), `"User Interface"` (`src/services/ui_config.ts:10`); docs: `design/configuration.md:54-55` lists `"Request Bundling"` and `"Audit Logging"` which do not match the code values
- **Description:** Domain naming mixes snake_case and human-readable strings; the design doc documents values that exist nowhere in code.
- **Why it matters:** Config domains are lookup keys; docs that name them wrongly cause failed lookups.
- **Related findings:** DOC-002

### [NAME-009] Test file naming contradicts the design doc
- **Location(s):** `design/playwright_testing.md:58-93,973` mandates `feature.spec.ts`; all actual tests are `*.test.ts` (`tests/api/`, `tests/pages/`, `tests/workflows/`)
- **Description:** The doc's `--test-match "tests/**/*.spec.ts"` commands match nothing.
- **Why it matters:** Documented commands silently run zero tests.
- **Related findings:** TEST-008, DOC-006

### [NAME-010] Test directory naming contradicts docs (`workflows/` vs documented `e2e/`, missing `smoke/`)
- **Location(s):** `tests/workflows/` exists; `tests/AGENTS.md:155,163` and `design/playwright_testing.md:83-89` describe `tests/e2e/`; AGENTS.md §9 step 6 references `tests/e2e/**` while §3 step 4 references `tests/workflows/**` (self-contradictory); `tests/AGENTS.md:156` references a nonexistent `tests/smoke/`
- **Description:** Two documented directories do not exist; AGENTS.md contradicts itself.
- **Why it matters:** Documented commands fail; an AI following AGENTS.md creates files in the wrong directory.
- **Related findings:** TEST-008, VB-AI-002

### [NAME-011] Page-object naming/structure contradicts the design doc
- **Location(s):** `design/playwright_testing.md:37-57,449-458` prescribes kebab-case `user-list.page.ts` in nested folders (`page-objects/admin/users/`); actual POMs are flat PascalCase (`tests/page-objects/AdminUserListPage.ts`)
- **Description:** Full deviation from the documented POM structure.
- **Why it matters:** Spec/code mismatch; the doc's examples cannot be followed.
- **Related findings:** TEST-008

### [NAME-012] Env variable names and defaults contradict the design doc
- **Location(s):** `design/playwright_testing.md:138-144,924-927` specifies `ENTRAID_USERNAME`/`ENTRAID_PASSWORD`; code uses `ENTRAID_ADMIN_USERNAME`/`ENTRAID_ADMIN_PASSWORD` (`tests/helpers/env.ts:49-56`); `APP_BASE_URL` default: design says `http://localhost:8000` (`:119,346`), code uses `http://localhost:3000` (`env.ts:60`)
- **Description:** Following the design doc produces a non-working `.env.test` and connections to the wrong port.
- **Why it matters:** Onboarding via docs fails at the first step.
- **Related findings:** TEST-009, CFG-003

### [NAME-013] Test helper file names contradict the design doc
- **Location(s):** `design/playwright_testing.md:152,178,284` references `playwright-helpers.ts`, `api-helpers.ts`, `ui-helpers.ts`, `assertion-helpers.ts`; actual files: `tests/helpers/browser.ts`, `api-client.ts`, `assertions.ts`, `env.ts`; `ui-helpers.ts` does not exist
- **Description:** The design doc references non-existent modules throughout its examples.
- **Why it matters:** Doc-driven implementation produces imports of missing files.
- **Related findings:** TEST-008
