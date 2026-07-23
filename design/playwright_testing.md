# Playwright E2E Testing Concept

> **Status:** Design Document  
> **Scope:** Conceptual plan only — no implementation code  
> **Last Updated:** 2026-07-04

---

## Table of Contents

1. [Test Structure](#1-test-structure)
2. [Test Reuse (Page Objects, Helpers, Authentication)](#2-test-reuse-page-objects-helpers-authentication)
3. [Test Staging / Pyramid](#3-test-staging--pyramid)
4. [Key Considerations](#4-key-considerations)
5. [CI/CD Integration](#5-cicd-integration)
6. [Appendices](#6-appendices)

---

## 1. Test Structure

### 1.1 Root Layout: `/tests/`

All E2E and integration tests live under a top-level `/tests/` directory at the project root. Tests are executed via **`bun test`**, not Playwright's own test runner. Playwright is used as a **library** (`import { chromium } from "playwright"`) within `bun test` test files.

```
tests/
├── playwright.config.ts          # Browser/device configuration only (no test runner config)
├── bootstrap.ts                  # API key provisioning (one-time, before API tests)
├── helpers/                      # Shared test utilities
│   ├── index.ts
│   ├── playwright-helpers.ts     # Browser launch, EntraID login helper, context creation
│   ├── api-helpers.ts            # fetch() wrappers with API key auth
│   ├── ui-helpers.ts             # Waiting strategies, PrimeReact selectors
│   └── assertion-helpers.ts      # Custom matchers, response validators
├── page-objects/                 # Page Object Models (POMs)
│   ├── index.ts                  # Re-exports
│   ├── base.page.ts              # Base page (sidebar, nav, loading waits)
│   ├── dashboard.page.ts
│   ├── login-entraid.page.ts     # Microsoft EntraID login page (username, password, prompts)
│   ├── admin/
│   │   ├── administration-home.page.ts
│   │   ├── users/
│   │   │   ├── user-list.page.ts
│   │   │   └── user-detail.page.ts
│   │   ├── groups/
│   │   │   ├── group-list.page.ts
│   │   │   └── group-detail.page.ts
│   │   ├── api-keys/
│   │   │   ├── api-key-list.page.ts
│   │   │   └── api-key-detail.page.ts
│   │   ├── functional-permissions/
│   │   │   ├── fp-list.page.ts
│   │   │   └── fp-detail.page.ts
│   │   ├── config-list.page.ts
│   │   └── audit-log.page.ts
│   └── doc.page.ts
├── api/                          # Stage 1: API contract tests
│   ├── health.spec.ts
│   ├── me.spec.ts
│   ├── users.spec.ts
│   ├── groups.spec.ts
│   ├── api-keys.spec.ts
│   ├── functional-permissions.spec.ts
│   ├── config.spec.ts
│   ├── audit-log.spec.ts
│   ├── request-bundling.spec.ts
│   └── server-sent-events.spec.ts
├── pages/                        # Stage 2: Full page tests
│   ├── dashboard.spec.ts
│   ├── admin/
│   │   ├── user-list.spec.ts
│   │   ├── user-detail.spec.ts
│   │   ├── group-list.spec.ts
│   │   ├── group-detail.spec.ts
│   │   ├── api-key-list.spec.ts
│   │   ├── api-key-detail.spec.ts
│   │   ├── fp-list.spec.ts
│   │   ├── fp-detail.spec.ts
│   │   ├── config-list.spec.ts
│   │   └── audit-log.spec.ts
│   └── doc.spec.ts
├── e2e/                          # Stage 3: Workflow / use-case tests
│   ├── admin-crud-user.spec.ts
│   ├── admin-manage-groups.spec.ts
│   ├── admin-manage-api-keys.spec.ts
│   ├── admin-manage-config.spec.ts
│   ├── audit-log-trail.spec.ts
│   └── permission-propagation.spec.ts
└── smoke/                        # Smoke / critical-path tests
    ├── health-check.spec.ts
    ├── login.spec.ts
    └── dashboard-visible.spec.ts
```

### 1.2 Rationale for Layout

| Decision | Rationale |
|----------|-----------|
| Flat `/tests/` root | Keeps all test artifacts isolated from `src/`. The existing `bun test` convention for unit tests in `src/` remains untouched. |
| `page-objects/` mirrors `src/ui/pages/` hierarchy | Page object files map 1:1 to UI page components, making discoverability trivial. |
| `e2e/` separate from `pages/` | Workflow tests (multi-page) have different lifecycle needs (longer timeouts, broader data setup) than single-page tests. |
| `api/` as Stage 1 | Contract tests are the cheapest and fastest to run; isolating them enables early CI feedback. |
| `smoke/` as cherry-picked subset | Enables a sub-90-second gate in CI without running the full suite. |
| No `data/` or `fixtures/` directories | Test data is created within each test case (via UI actions or API calls). No seed factories, no DB seeding helpers. |
| `bootstrap.ts` at root | Provisions the API key once before API tests run. |

### 1.3 `playwright.config.ts` — Browser Configuration Only

Since tests run via `bun test` (not `npx playwright test`), the [`playwright.config.ts`](tests/playwright.config.ts) serves only as a container for browser and device settings. It does **not** define `testDir`, `testMatch`, `projects`, `webServer`, or `globalSetup` — those concerns belong to `bun test` and the test helper modules.

```ts
// Conceptual structure — browser/device settings only
import { defineConfig, devices } from "playwright";

export default defineConfig({
  use: {
    baseURL: process.env.APP_BASE_URL ?? "http://localhost:8000",
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    // Timeouts
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  // Device profiles referenced by test helpers
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

### 1.4 `.env.test` — Test Credentials

Credentials are provided via a `.env.test` file at the project root. This file is **never** committed to version control (add to `.gitignore`).

```
# .env.test (git-ignored)
ENTRAID_USERNAME=test-user@tenant.onmicrosoft.com
ENTRAID_PASSWORD=SuperSecret123!
APP_BASE_URL=http://localhost:8000
DATABASE_URL=postgres://user:pass@localhost:5432/bun_starter_test
```

```
# .env (git-ignored)
APP_BASE_URL=http://localhost:8000
DATABASE_URL=postgres://user:pass@localhost:5432/bun_starter_test
```

**Loading at test runtime:** A helper in [`playwright-helpers.ts`](tests/helpers/playwright-helpers.ts) reads these values. Since Bun natively supports `.env` files, the helper uses `Bun.env` or a simple file reader to parse `.env.test`. In CI, these values are injected as environment secrets (see [Section 5](#5-cicd-integration)).

---

## 2. Test Reuse (Page Objects, Helpers, Authentication)

### 2.1 Real EntraID Authentication (UI Tests)

There is **no auth bypass**. Every UI test file performs a real EntraID login through the browser.

#### Login Flow

1. The test launches a browser via `chromium.launch()`.
2. Navigates to the app's `/login` page.
3. Clicks "Sign in with EntraID" — the browser is redirected to `login.microsoftonline.com`.
4. The [`LoginEntraIDPage`](tests/page-objects/login-entraid.page.ts) POM handles the Microsoft login form:
   - Enters `ENTRAID_USERNAME` (from `.env.test`)
   - Clicks "Next"
   - Enters `ENTRAID_PASSWORD` (from `.env.test`)
   - Clicks "Sign in"
   - Optionally handles the "Stay signed in?" prompt (clicks "No" or "Yes")
5. After successful authentication, the browser is redirected back to the app with a valid `SessionID` cookie.
6. The test proceeds with the authenticated browser context.

#### Login Helper

A reusable function in [`playwright-helpers.ts`](tests/helpers/playwright-helpers.ts) encapsulates this flow:

```ts
// Conceptual API
import { Browser, BrowserContext, Page } from "playwright";
import { LoginEntraIDPage } from "../page-objects/login-entraid.page";

export interface TestCredentials {
  username: string;
  password: string;
  baseUrl: string;
}

export function loadTestCredentials(): TestCredentials {
  // Reads ENTRAID_USERNAME, ENTRAID_PASSWORD, APP_BASE_URL
  // from .env or process.env (CI)
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function createAuthenticatedContext(
  browser: Browser,
  credentials: TestCredentials
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: credentials.baseUrl,
  });
  const page = await context.newPage();

  // Perform real EntraID login
  await page.goto("/login");
  const loginPage = new LoginEntraIDPage(page);
  await loginPage.login(credentials.username, credentials.password);

  // Wait for redirect back to app (dashboard)
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  return { context, page };
}
```

#### Per-File Login (No Storage State Reuse)

Each UI test file performs a fresh login in its `beforeAll` block. There is no `storageState` caching across files — this ensures each test file is fully independent and exercises the complete authentication path.

```ts
// tests/pages/admin/user-list.spec.ts (conceptual)
import { describe, test, beforeAll, afterAll, expect } from "bun:test";
import {
  launchBrowser,
  createAuthenticatedContext,
  loadTestCredentials,
} from "../helpers/playwright-helpers";
import { UserListPage } from "../page-objects/admin/users/user-list.page";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  const creds = loadTestCredentials();
  browser = await launchBrowser();
  const ctx = await createAuthenticatedContext(browser, creds);
  page = ctx.page;
});

afterAll(async () => {
  await page?.context().close();
  await browser?.close();
});

test("displays paginated user list", async () => {
  const userList = new UserListPage(page);
  await userList.navigateTo();
  await userList.waitForReady();
  expect(await userList.getRowCount()).toBeGreaterThan(0);
});
```

#### Prerequisites for Test EntraID Account

The test EntraID user account must:
- **Not have MFA enabled.** MFA would block automated login.
- **Be excluded from restrictive Conditional Access policies** that require managed devices, IP ranges, or other signals a CI runner cannot satisfy.
- **Be a member of the `cfgRootUserGroup`** so it has full permissions after first login. The bootstrapping of this group membership is a one-time manual or infrastructure step (not part of test automation).

### 2.2 API Key Bootstrap for API Tests

API-level tests do **not** use session cookies. Instead, a **bootstrap step** logs in via EntraID through the browser, creates an API key through the Admin UI, and stores the key for all API test suites.

#### Bootstrap Flow (`bootstrap.ts`)

[`bootstrap.ts`](tests/bootstrap.ts) is a standalone script that runs once before any API tests:

1. Launches a browser and performs EntraID login (same flow as 2.1).
2. Navigates to Admin → API Keys → "Create API Key" ([`AdminApiKeyList.tsx`](src/ui/pages/AdminApiKeyList.tsx)).
3. Fills the creation form:
   - Name: `E2E Test API Key — {timestamp}`
   - Assigns **all functional permissions** (the test user is in `cfgRootUserGroup`, so all permissions are available).
4. Submits the form.
5. Captures the displayed API key secret (shown only once after creation — the POM reads it from the UI).
6. Writes the secret to a module-level variable in [`api-key-store.ts`](tests/helpers/api-key-store.ts) (or exports it for consumption).

```ts
// tests/bootstrap.ts (conceptual)
import { launchBrowser, createAuthenticatedContext, loadTestCredentials } from "./helpers/playwright-helpers";
import { ApiKeyListPage } from "./page-objects/admin/api-keys/api-key-list.page";

export async function provisionApiKey(): Promise<string> {
  const creds = loadTestCredentials();
  const browser = await launchBrowser();
  try {
    const { page } = await createAuthenticatedContext(browser, creds);

    const apiKeyList = new ApiKeyListPage(page);
    await apiKeyList.navigateTo();
    await apiKeyList.waitForReady();

    // Open create dialog
    await apiKeyList.openCreateDialog();
    // Fill form
    await apiKeyList.fillCreateForm({
      name: `E2E Test API Key — ${Date.now()}`,
      permissions: ["ALL"], // Select all available permissions
    });
    // Submit and capture the displayed secret
    const secret = await apiKeyList.submitCreateAndCaptureSecret();

    await page.context().close();
    return secret;
  } finally {
    await browser.close();
  }
}
```

#### API Key Store

```ts
// tests/helpers/api-key-store.ts (conceptual)
let _apiKey: string | null = null;

export function setApiKey(key: string): void {
  _apiKey = key;
}

export function getApiKey(): string {
  if (!_apiKey) {
    throw new Error(
      "API key not provisioned. Run tests/bootstrap.ts first, " +
      "or call provisionApiKey() in your test suite's beforeAll."
    );
  }
  return _apiKey;
}
```

#### Usage in API Tests

API test files read the key from the store and attach it as the `X-API-Key` header on every `fetch()` call:

```ts
// tests/api/users.spec.ts (conceptual)
import { describe, test, beforeAll, expect } from "bun:test";
import { getApiKey } from "../helpers/api-key-store";
import { provisionApiKey } from "../bootstrap";

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8000";
let apiKey: string;

beforeAll(async () => {
  // Provision API key if not already done (idempotent via store)
  apiKey = getApiKey();
});

test("GET /api/users returns paginated list", async () => {
  const resp = await fetch(`${baseUrl}/api/users?page=1&pageSize=10`, {
    headers: { "X-API-Key": apiKey },
  });
  expect(resp.status).toBe(200);
  const body = await resp.json();
  expect(body.items).toBeArray();
  expect(body.totalCount).toBeNumber();
});
```

**Cleanup:** The bootstrap API key can be disabled or deleted in an `afterAll` in the last API test suite, or left to expire naturally (based on `cfgApiKeyValidityDays`). The bootstrap process should also handle the case where a previous bootstrap key already exists (e.g., delete old test keys before creating a new one).

### 2.3 Test Data Creation (No Seeding)

There is **no separate seed data infrastructure**. If a test needs data, it creates that data as part of the test itself:

- **UI tests** create data through the UI: navigate to a list page, click "Create", fill the form, submit.
- **API tests** create data through direct `fetch()` calls with the `X-API-Key` header.
- **Workflow tests** may combine both approaches.

Each test is responsible for cleaning up its own data (in `afterAll` or at the end of the test). Convention: prefix test-created resources with `E2E_` or `TEST_` so they are identifiable.

```ts
// Example: API test creates and cleans up its own data
test("POST /api/api_keys creates and returns a key", async () => {
  // Create
  const createResp = await fetch(`${baseUrl}/api/api_keys`, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "TEST_key_create", permissions: [] }),
  });
  expect(createResp.status).toBe(201);
  const created = await createResp.json();

  // Cleanup (in afterAll or inline)
  await fetch(`${baseUrl}/api/api_keys/${created.identifier}`, {
    method: "DELETE",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ knownUpdatedAt: created.updatedAt }),
  });
});
```

### 2.4 Page Object Models (POMs)

Every UI page gets a corresponding POM class that encapsulates selectors and common interactions. POMs extend a [`BasePage`](tests/page-objects/base.page.ts) that handles:

- **CSR hydration waits** — waiting for the React app to mount (the `.app-loading-screen` disappears)
- **Sidebar navigation** — `navigateTo(path)` clicks the sidebar link
- **Toast/notification dismissal** — `dismissToasts()`
- **Page-level loading spinners** — `waitForPageReady()`

#### Base Page Pattern

```
BasePage
├── constructor(page: Page)
├── waitForAppReady()           // Wait for React hydration
├── waitForPageReady()          // Wait for page-specific content
├── navigateTo(path: string)    // Use sidebar nav
├── expectVisible(selector)
├── expectToast(text: string)
└── screenshot(label: string)
```

#### LoginEntraIDPage (Microsoft Login)

A special POM for the external Microsoft login page, used by the login helper:

```
LoginEntraIDPage extends BasePage
├── enterUsername(username: string)
├── clickNext()
├── enterPassword(password: string)
├── clickSignIn()
├── handleStaySignedIn(accept: boolean)
└── login(username: string, password: string)   // Orchestrates full flow
```

#### Example POM Structure (`UserListPage`)

```
UserListPage extends BasePage
├── selector: 'table[data-testid="user-table"]'
├── getRowCount(): Promise<number>
├── getRowByName(name: string): Locator
├── clickRow(name: string): Promise<void>      // navigates to detail
├── toggleShowDisabled(): Promise<void>
├── goToPage(n: number): Promise<void>
├── setPageSize(n: number): Promise<void>
├── expectUserInList(name: string): Promise<void>
└── expectEmptyState(): Promise<void>
```

#### Naming Convention for POMs

| File | Class | Matches UI Page |
|------|-------|-----------------|
| `user-list.page.ts` | `UserListPage` | [`AdminUserList.tsx`](src/ui/pages/AdminUserList.tsx) |
| `user-detail.page.ts` | `UserDetailPage` | [`AdminUserDetail.tsx`](src/ui/pages/AdminUserDetail.tsx) |
| `group-list.page.ts` | `GroupListPage` | [`AdminGroupList.tsx`](src/ui/pages/AdminGroupList.tsx) |
| `api-key-list.page.ts` | `ApiKeyListPage` | [`AdminApiKeyList.tsx`](src/ui/pages/AdminApiKeyList.tsx) |
| `api-key-detail.page.ts` | `ApiKeyDetailPage` | [`AdminApiKeyDetail.tsx`](src/ui/pages/AdminApiKeyDetail.tsx) |
| `login-entraid.page.ts` | `LoginEntraIDPage` | Microsoft `login.microsoftonline.com` |

#### PrimeReact-Specific Selector Strategy

PrimeReact components use CSS classes like `.p-datatable`, `.p-dialog`, `.p-dropdown`, `.p-inputswitch`. POMs should use **`data-testid` attributes** where feasible (requires adding them to the React components) and fall back to **PrimeReact structural selectors**:

```ts
// Preferred: data-testid
page.locator('[data-testid="user-table"]')
// Fallback: PrimeReact class + accessible role
page.locator('.p-datatable').locator('table')
// PrimeReact dropdown
page.locator('.p-dropdown').click()
page.locator('.p-dropdown-panel .p-dropdown-item').filter({ hasText: '50' }).click()
```

Recommendation: Add `data-testid` attributes to key interactive elements in the UI components as part of the testing implementation phase. At minimum:
- Tables: `data-testid="user-table"`, `data-testid="group-table"`, etc.
- Form fields: `data-testid="config-value-input"`
- Buttons: `data-testid="save-btn"`, `data-testid="delete-btn"`
- Dialogs: `data-testid="confirm-dialog"`

### 2.5 API Helpers

[`api-helpers.ts`](tests/helpers/api-helpers.ts) provides convenience wrappers around `fetch()` for API test setup and verification. Unlike the old design, these do **not** use synthetic sessions — they use the API key from [`api-key-store.ts`](tests/helpers/api-key-store.ts).

```ts
// Conceptual API
import { getApiKey } from "./api-key-store";

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8000";

function apiHeaders(): HeadersInit {
  return {
    "X-API-Key": getApiKey(),
    "Content-Type": "application/json",
  };
}

export async function apiGet<T>(path: string): Promise<T> {
  const resp = await fetch(`${baseUrl}${path}`, { headers: apiHeaders() });
  if (!resp.ok) throw new Error(`GET ${path} failed: ${resp.status}`);
  return resp.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`POST ${path} failed: ${resp.status}`);
  return resp.json();
}

// ... apiPut, apiDelete
```

### 2.6 Shared Assertions

[`assertion-helpers.ts`](tests/helpers/assertion-helpers.ts) provides reusable validation patterns:

| Helper | Purpose |
|--------|---------|
| `expectSuccessResponse(response)` | Validates 2xx status + standard response shape |
| `expectConflictResponse(response)` | Validates 409 with `currentValue` |
| `expectForbiddenResponse(response)` | Validates 403 with permission error message |
| `expectUnauthorizedResponse(response)` | Validates 401 |
| `expectPaginatedResponse(response, expected)` | Validates pagination metadata |
| `expectToast(page, text)` | Validates PrimeReact toast message |

---

## 3. Test Staging / Pyramid

### 3.1 Stage Overview

```
                    ┌─────────────┐
                    │  Stage 3    │  ~10-16 tests
                    │  Workflows  │  Multi-page E2E flows
                    │  (e2e/)     │
                    ├─────────────┤
                    │  Stage 2    │  ~20-30 tests
                    │  Pages      │  Full page behavior
                    │  (pages/)   │
                    ├─────────────┤
                    │  Stage 1    │  ~40-60 tests
                    │  API        │  Contract tests
                    │  (api/)     │
                    └─────────────┘
         Total: ~70-106 tests across all stages
```

### 3.2 Stage 1: API Contract Tests (`tests/api/`)

**Goal:** Validate every REST endpoint's request/response contract, error handling, and permission enforcement — without a browser.

**Characteristics:**
- No browser launched; uses `fetch()` with `X-API-Key` header
- Each test file maps to one API route file (`users.spec.ts` ↔ `UserAPI.ts`)
- Tests run in parallel (no shared state)
- Fastest stage — should complete in under 30 seconds

**Auth:** All requests use the API key provisioned by [`bootstrap.ts`](tests/bootstrap.ts). The `beforeAll` in each API test suite reads the key from [`api-key-store.ts`](tests/helpers/api-key-store.ts).

**What each spec covers:**

| Spec | Endpoints | Key Scenarios |
|------|-----------|---------------|
| `health.spec.ts` | `GET /api/health` | Returns 200, no auth required |
| `me.spec.ts` | `GET /api/me` | Returns current user, permissions; 401 without auth |
| `users.spec.ts` | `GET /api/users`, `GET /api/users/:oid` | Pagination, includeInactive filter, 403 without FP_READ_USERS, 404 for nonexistent |
| `groups.spec.ts` | `GET /api/groups`, `GET /api/groups/:oid` | List groups, nested functional permissions |
| `api-keys.spec.ts` | `GET /api/api-keys`, `POST /api/api-keys`, `DELETE /api/api-keys/:id`, `PUT /api/api-keys/:id` | CRUD, expiration, API key auth vs session auth |
| `functional-permissions.spec.ts` | `GET /api/functional-permissions`, `PUT /api/functional-permissions/assign`, various | Permission list, group assignment, 409 on conflict |
| `config.spec.ts` | `GET /api/config`, `PUT /api/config/:domain/:key` | List config, update with optimistic lock, 409 conflict |
| `audit-log.spec.ts` | `GET /api/audit-log`, `DELETE /api/audit-log` | Pagination, search, clear, 403 without permission |
| `request-bundling.spec.ts` | `POST /api/bundle` | Bundle multiple mutations, partial failure handling |
| `server-sent-events.spec.ts` | `GET /api/sse` | SSE connection, event stream, reconnection |

### 3.3 Stage 2: Page Tests (`tests/pages/`)

**Goal:** Validate a full page's behavior — all its components working together, API interactions, navigation, and state management.

**Characteristics:**
- Full browser environment (Playwright as library)
- Each test file logs in fresh via EntraID in `beforeAll`
- Each spec corresponds to one registered page in [`PageRegistry.ts`](src/ui/PageRegistry.ts)
- Tests verify: initial render, data loading, user interactions, navigation away/back
- Uses POMs for all interactions

**What each spec covers:**

| Page Spec | Key Scenarios |
|-----------|---------------|
| `dashboard.spec.ts` | KPI cards render, navigation links work, no permission errors |
| `user-list.spec.ts` | Table renders users, pagination, showDisabled toggle, click navigates to detail |
| `user-detail.spec.ts` | User info displayed, group memberships listed, back navigation |
| `group-list.spec.ts` | Groups rendered, click navigates to detail |
| `group-detail.spec.ts` | Group info, functional permission assignments visible |
| `api-key-list.spec.ts` | ApiKey table, create dialog, delete confirmation, expiration display |
| `api-key-detail.spec.ts` | ApiKey details, prolong/edit, permission assignments |
| `fp-list.spec.ts` | Functional permissions list, click to detail |
| `fp-detail.spec.ts` | Permission info, assigned groups |
| `config-list.spec.ts` | Config entries grouped by domain, inline editing, object/array editor, optimistic lock conflict handling |
| `audit-log.spec.ts` | Entries displayed, pagination, search filter |
| `doc.spec.ts` | Documentation page renders, content visible |

### 3.4 Stage 3: Use Case / Workflow Tests (`tests/e2e/`)

**Goal:** Validate complete business workflows that span multiple pages and API calls.

**Characteristics:**
- Longest-running tests
- Full browser environment, fresh EntraID login per file
- Complex test data created as part of the workflow
- Tests should be independent (no reliance on ordering)

**Workflow Scenarios:**

| Workflow | Steps |
|----------|-------|
| `admin-crud-user.spec.ts` | Navigate to user list → verify user count → click user → view detail → verify groups → return to list |
| `admin-manage-groups.spec.ts` | Navigate to groups → select group → view assigned permissions → navigate to permission detail → verify group appears in permission's group list |
| `admin-manage-api-keys.spec.ts` | Create API key → verify in list → view detail → edit permissions → delete key → verify removed from list |
| `admin-manage-config.spec.ts` | View config list → edit a string config → verify value saved → edit again with stale knownValue → verify 409 conflict → reload → verify current value |
| `audit-log-trail.spec.ts` | Perform several mutations → navigate to audit log → verify all actions recorded → search filter |
| `permission-propagation.spec.ts` | Assign permission to group → verify group detail shows it → verify permission detail shows group → remove assignment → verify both views updated |

### 3.5 Tagging and Selective Execution

Since `bun test` is the runner, tags are implemented as **conventional prefixes in test names** grep-able via `bun test --test-name-pattern`.

#### Tag Strategy

| Tag | Purpose | Used On |
|-----|---------|---------|
| `@smoke` | Critical path only | Smoke tests + selected page tests |
| `@p0` | Must pass for release | All API tests + smoke tests + key workflows |
| `@p1` | Should pass | Page tests |
| `@p2` | Nice to have | Edge cases |
| `@slow` | Long-running | Workflow tests |

#### Running Selectively

```bash
# Smoke tests only (CI gate)
bun test --test-name-pattern "@smoke"

# API contract tests only
bun test --test-match "tests/api/**/*.spec.ts"

# All tests except slow
bun test --test-name-pattern "^(?!.*@slow)"

# Specific domain
bun test --test-name-pattern "users"
```

#### `bun test` File Filtering

```bash
# All E2E tests
bun test --test-match "tests/**/*.spec.ts"

# Pages only
bun test --test-match "tests/pages/**/*.spec.ts"

# Workflows only
bun test --test-match "tests/e2e/**/*.spec.ts"
```

### 3.6 CI Pipeline Integration

```
┌─────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Build  │───▶│  Stage 1     │───▶│  Stage 2     │───▶│  Stage 3     │───▶│  Report      │
│  & Lint  │    │  API tests   │    │  Page tests  │    │  Workflows   │    │  & Deploy    │
└─────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
     │               │                    │                   │
     ▼               ▼                    ▼                   ▼
  Fail fast     Fastest feedback     UI validation       Full E2E confidence
```

**Failure handling:**
- Stage 1 failure → stop pipeline (contract broken)
- Stage 2 failure → continue to Stage 3 (gather maximum signal)
- Stage 3 failure → report, don't block deploy if Stage 1 passes (workflows are most brittle)

#### GitHub Actions Example (conceptual)

```yaml
jobs:
  api-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: testdb
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bunx playwright install chromium
      # Inject secrets into .env.test
      - run: |
          echo "ENTRAID_USERNAME=${{ secrets.ENTRAID_TEST_USERNAME }}" >> .env.test
          echo "ENTRAID_PASSWORD=${{ secrets.ENTRAID_TEST_PASSWORD }}" >> .env.test
          echo "APP_BASE_URL=http://localhost:8000" >> .env
          echo "DATABASE_URL=postgres://postgres:test@localhost:5432/testdb" >> .env
      # Start server, run migrations, run tests
      - run: bun run src/main.ts &
      - run: bun test --test-match "tests/api/**/*.spec.ts"

  ui-tests:
    needs: api-tests
    # ... similar setup, runs pages tests

  e2e-tests:
    needs: ui-tests
    # ... runs e2e tests
```

---

## 4. Key Considerations

### 4.1 Real EntraID Login

This is the most critical design constraint: **no auth bypass is permitted**.

#### Challenges

| Challenge | Mitigation |
|-----------|------------|
| **MFA** | The test EntraID user must NOT have MFA enabled. This is an infrastructure prerequisite. |
| **Conditional Access** | The test user must be excluded from restrictive CA policies (managed device, IP range, etc.). |
| **Rate limiting** | Microsoft login endpoints have rate limits. If many test files log in concurrently, implement exponential backoff in the login helper. |
| **"Stay signed in?" prompt** | The `LoginEntraIDPage` POM must detect and handle this optional screen (click "No" to keep tests deterministic). |
| **Network dependency** | Tests require network access to `login.microsoftonline.com`. They cannot run fully offline. |
| **Tenant-specific branding** | Some tenants customize the login page. The POM should be parameterized for different expected URL patterns. |
| **Session expiry** | Between the login and the test assertions, the session could expire. Use `cfgSessionExpirationInSeconds` set high enough for test runs, or configure the test server with a generous session timeout. |

#### Login Flow Diagram

```mermaid
graph TD
    A["Test file beforeAll"] --> B["launchBrowser()"]
    B --> C["Navigate to /login"]
    C --> D["Click 'Sign in with EntraID'"]
    D --> E["Redirected to login.microsoftonline.com"]
    E --> F["Enter ENTRAID_USERNAME"]
    F --> G["Click Next"]
    G --> H["Enter ENTRAID_PASSWORD"]
    H --> I["Click Sign in"]
    I --> J{"Stay signed in?"}
    J -->|Yes| K["Click No"]
    J -->|No| L["Redirect back to app"]
    K --> L
    L --> M["SessionID cookie set"]
    M --> N["Test proceeds"]
```

### 4.2 Playwright as Library in `bun test`

**Key difference from standard Playwright:** There is no `@playwright/test` dependency. Tests use the `playwright` package as a library.

```ts
// Import pattern
import { chromium, Browser, BrowserContext, Page } from "playwright";
```

**What `bun test` provides:**
- `describe`, `test`, `beforeAll`, `afterAll`, `beforeEach`, `afterEach` from `"bun:test"`
- `expect` from `"bun:test"` (compatible with Playwright's locator assertions via `@playwright/test`'s expect — but since we don't use `@playwright/test`, we use `bun:test`'s `expect` for value assertions and Playwright locator methods like `.isVisible()` for UI assertions)
- Test file discovery via glob patterns

**What Playwright provides as library:**
- Browser automation (`chromium.launch()`, `firefox.launch()`, `webkit.launch()`)
- [`BrowserContext`](https://playwright.dev/docs/api/class-browsercontext) and [`Page`](https://playwright.dev/docs/api/class-page)
- Locators, auto-waiting, screenshots, traces
- `playwright.config.ts` for shared browser/devices settings (loaded via `playwright` library helpers or manually)

**Browser lifecycle management:**
```ts
// Per test file pattern
let browser: Browser;
let context: BrowserContext;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();           // from 'playwright'
  context = await browser.newContext();
  // Perform EntraID login
  page = await context.newPage();
});

afterAll(async () => {
  await context?.close();
  await browser?.close();
});
```

### 4.3 CSR Nature (React Hydration)

**Problem:** The frontend is 100% client-side rendered. Tests must wait for:
1. The HTML shell to load
2. `client.js` to download and execute
3. React to hydrate and render the component tree
4. API calls to complete and state to settle

**Solution:**

1. **Loading screen detection:** The app shows a loading screen with `role="status"` and class `.app-loading-screen`. Tests wait for it to disappear:
   ```ts
   await page.waitForSelector(".app-loading-screen", { state: "detached", timeout: 15000 });
   ```

2. **Page-level ready signals:** Each page POM has a `waitForReady()` method that waits for a stable DOM element unique to that page:
   ```ts
   // UserListPage.waitForReady()
   await page.waitForSelector('[data-testid="user-table"]', { state: "visible" });
   ```

3. **Network idle:** For pages that make multiple API calls:
   ```ts
   await page.waitForLoadState("networkidle");
   ```

4. **PrimeReact async rendering:** Some PrimeReact components (DataTable, Dropdown) render asynchronously. Tests use `waitFor()` with retryable assertions:
   ```ts
   await page.waitForSelector(".p-datatable", { state: "visible", timeout: 10000 });
   ```

### 4.4 Request Bundling

**Problem:** The app uses a request bundling layer ([`src/services/RequestBundling.ts`](src/services/RequestBundling.ts)) for mutating requests. Tests could be affected by batching delays.

**Solution:**

1. **API tests bypass bundling entirely:** Stage 1 tests call REST endpoints directly using `fetch()`, which sends plain HTTP requests. The bundling layer is only relevant on the client side (in [`src/ui/api/_request_bundling.ts`](src/ui/api/_request_bundling.ts)).

2. **Browser tests interact through the UI:** Stage 2-3 tests click buttons and submit forms. The React app's bundling logic is part of the system under test. The test just waits for the expected outcome (e.g., a toast, a table update).

3. **Flush configuration for tests:** The request bundling has a `cfgServerFlushMs` config entry. The test environment can set this to a low value (e.g., 50ms) to minimize bundling delay during tests while still exercising the bundling code path. This can be set via the API key bootstrap step or via a direct config API call.

### 4.5 Database Isolation

**Problem:** Tests running in parallel could interfere with each other through shared database state.

**Solution:**

1. **Dedicated test database:** Use a separate PostgreSQL database (e.g., `bun_starter_test`) specified via `DATABASE_URL` in `.env`.

2. **Schema migration before tests:** A setup script or CI step runs the Umzug migrations to ensure the test DB schema matches.

3. **Test-created data, test-cleaned data:** Each test creates only the data it needs (via UI or API) and cleans up in `afterAll`. Convention: prefix test resources with `E2E_` or `TEST_` for easy identification and bulk cleanup if needed.

4. **Table truncation between test files (fallback):** If tests leak data, a cleanup helper can `TRUNCATE` known test-prefixed rows between test suites. This is done via API calls (not direct DB access), using the API key.

5. **Parallelism constraints:**
   - API tests (Stage 1) can run fully in parallel since each test manages its own data via API calls.
   - Browser tests (Stages 2-3) should be run sequentially (single worker) because the server is shared and the EntraID login is an external dependency. `bun test` runs tests in a single process by default; parallelism is controlled by the test file organization.

### 4.6 PrimeReact Component Handling

**Problem:** PrimeReact components have dynamic DOM structures, async rendering (dropdown panels, overlays), and class-based selectors that can change between versions.

**Solution:**

1. **`data-testid` attributes (preferred):** Add `data-testid` to key elements in the React components. This is the most stable targeting strategy.

2. **PrimeReact-specific selectors (fallback):** Document the selectors in [`ui-helpers.ts`](tests/helpers/ui-helpers.ts):
   ```ts
   // Dropdown selection helper
   async function selectPrimeDropdown(page: Page, dropdownSelector: string, optionLabel: string) {
     await page.locator(dropdownSelector).click();
     await page.locator(".p-dropdown-panel .p-dropdown-item").filter({ hasText: optionLabel }).click();
   }

   // Dialog helper
   async function confirmDialog(page: Page) {
     await page.locator(".p-dialog .p-confirm-dialog-accept").click();
   }

   // Toast helper
   async function waitForToast(page: Page, text: string) {
     await page.locator(".p-toast-message-content").filter({ hasText: text }).waitFor({ state: "visible" });
   }
   ```

3. **Locator strategy hierarchy:**
   1. `data-testid` attributes (best)
   2. `role` attributes + accessible name (good)
   3. PrimeReact structural classes (fragile, last resort)
   4. Never use CSS module hashes

4. **Async overlay waiting:** PrimeReact renders dropdown panels, dialogs, and tooltips in a portal (attached to `document.body`). Tests must use `page.locator()` (not locator chaining from the trigger element) for overlay elements.

---

## 5. CI/CD Integration

### 5.1 NPM Scripts

```json
{
  "scripts": {
    "test": "bun test",
    "test:e2e": "bun test --test-match 'tests/**/*.spec.ts'",
    "test:e2e:smoke": "bun test --test-name-pattern '@smoke'",
    "test:e2e:api": "bun test --test-match 'tests/api/**/*.spec.ts'",
    "test:e2e:pages": "bun test --test-match 'tests/pages/**/*.spec.ts'",
    "test:e2e:workflows": "bun test --test-match 'tests/e2e/**/*.spec.ts'",
    "test:all": "bun test && bun test --test-match 'tests/**/*.spec.ts'"
  }
}
```

### 5.2 `.env.test` and `.env` Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `ENTRAID_USERNAME` | Test user for real EntraID login | `test-user@tenant.onmicrosoft.com` |
| `ENTRAID_PASSWORD` | Test user password | (secret) |
| `APP_BASE_URL` | Base URL for tests | `http://localhost:8000` |
| `DATABASE_URL` | Test database connection | `postgres://user:pass@localhost:5432/bun_starter_test` |

**Loading `.env.test`:** A helper function in [`playwright-helpers.ts`](tests/helpers/playwright-helpers.ts) reads `.env.test`. Bun natively loads `.env`, but since we use a custom filename, the helper reads and parses it explicitly, or a `--env-file` flag may be used with `bun test` if Bun supports it. In CI, values come from GitHub Actions secrets, not a file.

### 5.3 GitHub Actions Secrets

In CI, the following secrets must be configured:

| Secret | Maps to |
|--------|---------|
| `ENTRAID_TEST_USERNAME` | `ENTRAID_USERNAME` in `.env.test` |
| `ENTRAID_TEST_PASSWORD` | `ENTRAID_PASSWORD` in `.env.test` |

These are injected into `.env.test` at runtime during the CI job (see the GitHub Actions example in [Section 3.6](#36-ci-pipeline-integration)).

### 5.4 Docker Compose for Local Testing

A `docker-compose.test.yml` provides an ephemeral PostgreSQL instance:

```yaml
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: bun_starter_test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"
    tmpfs: /var/lib/postgresql/data  # Ephemeral storage
```

### 5.5 Playwright Reporters

- **Default:** `html` reporter (local development review)
- **CI:** `github` reporter (annotations on PRs) + `json` for archiving

Reporters are configured in [`playwright.config.ts`](tests/playwright.config.ts). Since `bun test` is the runner, test results are also available through `bun test`'s own output. For Playwright-specific artifacts (traces, screenshots), the Playwright config's `trace` and `screenshot` settings apply.

---

## 6. Appendices

### 6.1 Naming Conventions Summary

| Artifact | Convention | Example |
|----------|-----------|---------|
| Test files | `feature.spec.ts` | `user-list.spec.ts` |
| Page object files | `feature-name.page.ts` | `user-list.page.ts` |
| Page object classes | `PascalCasePage` | `UserListPage` |
| Helper files | `name-helpers.ts` | `api-helpers.ts` |
| Test descriptions | Present-tense sentence | `"displays paginated user list"` |
| `describe` blocks | Feature name | `describe("User List Page", ...)` |
| Tagged test names | `@tag description` | `@smoke dashboard loads` |

### 6.2 Example Test Skeleton

```ts
// tests/pages/admin/user-list.spec.ts (conceptual structure)
import { describe, test, beforeAll, afterAll, expect } from "bun:test";
import { Browser, BrowserContext, Page } from "playwright";
import {
  launchBrowser,
  createAuthenticatedContext,
  loadTestCredentials,
} from "../../helpers/playwright-helpers";
import { getApiKey } from "../../helpers/api-key-store";
import { provisionApiKey } from "../../bootstrap";
import { UserListPage } from "../../page-objects/admin/users/user-list.page";
import { apiPost, apiDelete } from "../../helpers/api-helpers";

let browser: Browser;
let context: BrowserContext;
let page: Page;

beforeAll(async () => {
  const creds = loadTestCredentials();
  browser = await launchBrowser();
  const ctx = await createAuthenticatedContext(browser, creds);
  context = ctx.context;
  page = ctx.page;
});

afterAll(async () => {
  await context?.close();
  await browser?.close();
});

test("@p0 displays paginated user list with correct columns", async () => {
  // Create test data via API
  const createdUser = await apiPost("/api/users", {
    displayName: "E2E_Test_User",
    oid: crypto.randomUUID(),
  });

  const userList = new UserListPage(page);
  await userList.navigateTo();
  await userList.waitForReady();

  await userList.table.waitFor({ state: "visible" });
  expect(await userList.getRowCount()).toBeGreaterThan(0);
  await userList.expectUserInList("E2E_Test_User");

  // Cleanup
  await apiDelete(`/api/users/${createdUser.oid}`, {
    knownUpdatedAt: createdUser.updatedAt,
  });
});

test("@p0 click user row navigates to detail page", async () => {
  const createdUser = await apiPost("/api/users", {
    displayName: "E2E_Detail_User",
    oid: crypto.randomUUID(),
  });

  const userList = new UserListPage(page);
  await userList.navigateTo();
  await userList.waitForReady();

  await userList.clickRow("E2E_Detail_User");
  await page.waitForURL(`**/admin/users/${createdUser.oid}`);

  // Cleanup
  await apiDelete(`/api/users/${createdUser.oid}`, {
    knownUpdatedAt: createdUser.updatedAt,
  });
});
```

### 6.3 Dependency Graph of Test Infrastructure

```mermaid
graph TD
    subgraph Configuration
        ENV[".env.test"] --> HELPERS["playwright-helpers.ts"]
    end

    subgraph Bootstrap
        HELPERS --> BOOT["bootstrap.ts"]
        BOOT --> ENTRAID["Real EntraID Login"]
        ENTRAID --> UI_CREATE["Create API Key via UI"]
        UI_CREATE --> STORE["api-key-store.ts"]
    end

    subgraph "API Tests Stage 1"
        STORE --> API_HELPERS["api-helpers.ts"]
        API_HELPERS --> API["tests/api/*.spec.ts"]
        API --> FETCH["fetch + X-API-Key"]
        FETCH --> SERVER["Elysia Server"]
    end

    subgraph "UI Tests Stage 2-3"
        HELPERS --> UI["tests/pages/*.spec.ts"]
        HELPERS --> E2E["tests/e2e/*.spec.ts"]
        UI --> LOGIN["Fresh EntraID Login per file"]
        E2E --> LOGIN
        LOGIN --> CONTEXT["Authenticated BrowserContext"]
        CONTEXT --> POM["Page Object Models"]
        POM --> SERVER
    end

    subgraph Database
        SERVER --> DB["PostgreSQL test DB"]
        API --> DB
    end
```

### 6.4 Test Environment Setup Requirements

To enable the testing strategy, the following must be in place:

| Requirement | Owner | Purpose |
|-------------|-------|---------|
| Test EntraID user (no MFA) | Infrastructure / Azure AD admin | Real authentication for all browser tests |
| Test user in `cfgRootUserGroup` | One-time DB config | Full permissions for test user after login |
| `.env.test` file (local) or CI secrets | Developer / CI config | Credentials supplied to test runner |
| `data-testid` attributes | UI components (`src/ui/pages/*.tsx`) | Stable selectors for Playwright |
| Fast bundling config | Test bootstrap sets `cfgServerFlushMs` | Minimize request bundling delay |
| Test database + migrations | CI setup / local docker-compose | Isolated DB for test runs |

**Notably absent (by design):**
- No `POST /api/__test__/session` endpoint (no synthetic sessions)
- No `DELETE /api/__test__/data` endpoint (test data created and cleaned by tests themselves)
- No `TEST_MODE` or `DEV_MODE` guards (the server runs in normal mode)
- No seed data factories or DB seeding helpers

### 6.5 Migration Path

Since the project currently has zero E2E tests, the implementation should follow this order:

1. **Infrastructure first:** `.env.test` convention, `playwright.config.ts` (browser config only), `playwright-helpers.ts` (browser launch + EntraID login helper), EntraID test account provisioning.
2. **API key bootstrap:** `bootstrap.ts` + `api-key-store.ts` — verify the API key creation flow works end-to-end.
3. **API contract tests:** Fastest ROI, most stable, catches backend regressions. Start with `health.spec.ts` and `me.spec.ts`.
4. **Smoke tests:** Critical path UI tests for CI gating — login + dashboard visibility.
5. **Page objects for admin pages:** Build POMs as needed, starting with the simplest pages (Dashboard, UserList) and `LoginEntraIDPage`.
6. **Page tests:** One spec per page, incremental.
7. **Workflow tests:** Last, as they depend on all POMs being available.

### 6.6 Open Questions / Future Decisions

The following items are noted for consideration during implementation but do not block the overall design:

1. **EntraID test account management:** How is the test user provisioned and maintained? Should there be a dedicated "break-glass" test account, or should the CI pipeline provision one dynamically via Microsoft Graph?
2. **Visual regression testing:** Should Playwright's `toHaveScreenshot()` be used for visual snapshots? This adds maintenance burden but catches CSS regressions.
3. **Performance budgets:** Should workflow tests include timeout checks for page load times?
4. **Parallel API test execution:** Can `bun test` run API tests in parallel (they use independent `fetch()` calls with a shared API key, so they should be parallel-safe)?
5. **Login rate limiting:** How does Microsoft's rate limiting behave with multiple sequential logins in a CI pipeline? Should a delay be added between test files?
6. **API key lifecycle in CI:** Should the bootstrap API key be disabled/deleted at the end of a CI run, or should it be left to expire naturally?

---

> **End of Design Document.** This document describes the *what* and *why* of the Playwright testing concept. Implementation details (actual code, selectors, configuration values) are to be determined during the implementation phase.
