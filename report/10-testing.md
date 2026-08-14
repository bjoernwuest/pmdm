# 10 — Testing & Coverage Gaps

## Rubric
`tests/AGENTS.md` and `design/playwright_testing.md` define the intended test architecture: API tests per endpoint suite, page tests per page, workflow tests, shared helpers (`api-client`, assertions), page objects matching the real DOM, and behavior-asserting (not smoke) tests. Good means: documented specs exist and pass, helpers are used instead of hand-rolled fetch, assertions verify behavior, and the documented structure matches the actual files.

### [TEST-001] API coverage gaps
- **Location(s):** no tests for `/api/me`, `/api/me/context`, `/api/me/config`, `/api/request_bundling`, `/api/server_sent_events` (all listed in `design/playwright_testing.md` spec tables but absent); group↔permission assignment POST/DELETE endpoints untested; API-key prolong/disable/permissions PUT endpoints untested (`tests/api/api-keys.test.ts` covers only list/create/detail/update-metadata/delete); `DELETE /api/audit-log` explicitly untested (`tests/api/audit-log.test.ts:5`)
- **Description:** Significant endpoint surface has no API tests.
- **Why it matters:** Regressions in auth, bundling, and SSE — the project's defining infrastructure — are invisible to CI.
- **Related findings:** TEST-002

### [TEST-002] Page/workflow coverage gaps
- **Location(s):** no page tests for `UserProfileConfigList` (`/profile`), `Doc` (`/doc`), `AdminApiDocumentation`, or the login page; only 2 of 6 workflows documented in `design/playwright_testing.md:619-626` exist in `tests/workflows/`; config-editing scenarios listed at `:603` (inline editing, object/array editor, optimistic-lock conflict) are unimplemented — `tests/pages/admin-config.test.ts` only reads values
- **Description:** Several shipped pages and documented scenarios have no automated coverage.
- **Why it matters:** The config-editing flow — the most complex UI — is exactly the uncovered one.
- **Related findings:** TEST-001

### [TEST-003] Assertions that assert nothing meaningful
- **Location(s):** `tests/pages/admin-config.test.ts:67-70` (asserts the key is defined, never asserts the fetched value); `admin-users.test.ts:106-110` (`expect(groups).toBeDefined()` on a function that always returns an array); `tests/workflows/api-key-lifecycle.test.ts:120-122,170-173` (`toBeGreaterThanOrEqual(0)` vacuous, one with a comment admitting it is meaningless); `tests/pages/admin-api-keys.test.ts:63` (`keyCount >= 0`); `tests/api/functional-permissions.test.ts:102-103`, `groups.test.ts:96-97`, `users.test.ts:96-97` (accept any 4xx in 400-499 range without pinning behavior); `tests/api/audit-log.test.ts:47-68` (search/jsonPathFilter tests only assert 200 + `entries` property; the filter effect is never verified)
- **Description:** Tests pass without verifying the behavior under test.
- **Why it matters:** Green CI provides false confidence; failures in real behavior are undetectable.
- **Related findings:** —

### [TEST-004] `assertPaginatedResponse` helper contradicts the actual API shape
- **Location(s):** `tests/helpers/assertions.ts:51-58` expects `{items, total, count}`; actual responses are `{users|groups|apiKeys|functionalPermissions, page, pageSize, total, availablePageSizes}`; the helper is unused by any test but referenced in `tests/AGENTS.md:175-182`
- **Description:** A documented helper encodes a response contract that no endpoint implements.
- **Why it matters:** Following AGENTS.md to use this helper would produce failing tests.
- **Related findings:** VB-AI-002

### [TEST-005] `assertStatus` consumes the body and is called without `await`
- **Location(s):** `tests/helpers/assertions.ts:14-21` reads `response.text()` (into an unused `body` variable); called without `await` at `tests/api/config.test.ts:25`, `api-keys.test.ts:48`, and elsewhere
- **Description:** The helper is destructive (consumes the body) and its promise is dropped, so it races with the test's own `response.json()` — some orderings leave the body consumed and `.json()` throws.
- **Why it matters:** The assertion helper is both broken and unsafe to use; tests pass only by timing luck.
- **Related findings:** TEST-006

### [TEST-006] Hand-rolled `fetch` with `X-API-Key` headers instead of the api-client helper
- **Location(s):** `tests/api/api-keys.test.ts:32-39,156-180,188-196,218-226`, `config.test.ts:68-81,96-109,138-151`, `functional-permissions.test.ts:80-99`, `groups.test.ts:74-93`, `users.test.ts:73-92`; the delete-with-body workaround exists because the test helper's `apiDelete` takes no body parameter (`tests/helpers/api-client.ts:88-97`)
- **Description:** Most API tests bypass the shared client helper, duplicating header/URL construction.
- **Why it matters:** Auth setup drift between tests; the helper gap is worked around per-test instead of once.
- **Related findings:** TEST-005

### [TEST-007] Cleanup records the wrong `updatedAt`
- **Location(s):** `tests/api/api-keys.test.ts:78,92` push `{identifier, updatedAt: body.expiresAt}` / `created.expiresAt` into the cleanup list (comment: "initial updatedAt ≈ createdAt")
- **Description:** The stored cleanup `updatedAt` is actually `expiresAt`; the `afterAll` DELETE sends a `knownUpdatedAt` that will not match, the server returns 409, and the catch swallows it.
- **Why it matters:** Test fixtures are silently not cleaned up, contaminating later runs.
- **Related findings:** —

### [TEST-008] Test structure contradicts the design doc
- **Location(s):** `*.test.ts` files vs mandated `*.spec.ts` (`design/playwright_testing.md:58-93,973`); `tests/workflows/` vs documented `tests/e2e/` (`tests/AGENTS.md:155,163`; §9 step 6 references `e2e/**` while §3 step 4 references `workflows/**`); missing `tests/smoke/` (`:156`); flat PascalCase POMs vs prescribed kebab-case nested (`playwright_testing.md:37-57,449-458`); helper names differ from doc (`:152,178,284`)
- **Description:** Five structural deviations between documented and actual test layout.
- **Why it matters:** Documented commands match nothing; doc-following agents create files in nonexistent directories.
- **Related findings:** NAME-009, NAME-010, NAME-011, NAME-013, VB-AI-002

### [TEST-009] Test bootstrap/config inert or mismatched
- **Location(s):** `tests/setup.ts` imported by zero test files (its `BUN_TEST_TIMEOUT` never consumed); `tests/bootstrap.ts:64-78` creates the API key with no permissions although `design/playwright_testing.md:274-305` says "assigns all functional permissions" and the UI create dialog (`AdminApiKeyList.tsx:380-430`) has no permission picker; `tests/playwright.config.ts` `screenshot`/`trace`/`projects`/`expect.timeout` are inert under `bun test` although `tests/AGENTS.md:330-335` claims screenshots on failure; `.env.test` path mismatch (`tests/AGENTS.md:24` and `.gitignore:5` say `tests/.env.test`, but `tests/helpers/env.ts:37` reads the project-root `.env.test` — the documented location is never loaded, the code location is not ignored); `.gitignore:18` ignores the entire `/tests/` directory ("Remove once tests are working")
- **Description:** Test infrastructure pieces do not work as documented or as intended.
- **Why it matters:** Onboarding and CI behavior diverge from the docs; a permission-requiring API test would fail against the bootstrap key.
- **Related findings:** NAME-012, CFG-003, VB-AI-002

### [TEST-010] Page-object selectors do not match the actual DOM
- **Location(s):** `AdminUserDetailPage.getStatus()` (`tests/page-objects/AdminUserDetailPage.ts:54-58`) and `AdminGroupDetailPage.getStatus()` (`:53-57`) select `.admin-detail-grid .mui-pill` — status is rendered via `Label` (`AdminUserDetail.tsx:125`), selector matches nothing; `AdminApiKeyDetailPage.togglePermission`/`isPermissionAssigned` (`:96-109`) and `AdminGroupDetailPage.togglePermission`/`AdminFunctionalPermissionDetailPage.toggleGroupAssignment` target `input[type="checkbox"]`, which PrimeReact hides inside `.p-hidden-accessible`; `AdminConfigListPage.getConfigValue` (`:52-58`) reads `td:nth(2)` though object/array cells contain a Monaco editor/button; `editConfig` (`:64-67`) clicks the row though inline edit starts on the value button (`AdminConfigList.tsx:817-823`)
- **Description:** Several POM methods cannot work against the rendered DOM.
- **Why it matters:** These methods fail or no-op when used; tests using them are misleading by construction.
- **Related findings:** —
