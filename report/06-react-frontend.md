# 06 — React & Frontend Practices

## Rubric
React 19 with a 100% CSR frontend, PrimeReact components, custom Toggle/InputField/Label primitives (per `design/ui/*`), one PubSub/SSE client mechanism, and consistent page composition. Good means: hooks follow the rules of hooks and dependency arrays are correct, state-management approach is consistent across pages, loading/error/empty states are handled uniformly, mutations surface failures to the user, and no render-phase side effects.

### [RCT-001] useEffect dependency problems across pages
- **Location(s):** `AdminApiKeyDetail.tsx:119-121` (effect depends on both `searchParams.toString()` and derived `permissionsPage`/`permissionsPageSize`, and calls an outer `load` re-created each render but not in deps); `AdminApiKeyList.tsx:198-200` (same outer-`load` pattern); `AdminConfigList.tsx:436,472` (effects re-subscribe and re-seed InputField on every `groups` change, including the passive PubSub update at `:475-494` — an incoming SSE for a different key re-runs the inline-edit effect); `AdminUserList.tsx:65-76`, `AdminApiKeyList.tsx:104-113` (seeding effects re-run `setText` on all refs on every data change)
- **Description:** Dependency arrays mix derived values, omit recreated closures, and over-subscribe to data that changes on every SSE event.
- **Why it matters:** Stale-closure bugs, redundant subscription churn, and wasted renders; the "correct" pattern is not established anywhere.
- **Related findings:** PATT-009, CPLX-009, CPLX-010

### [RCT-002] Error handling inconsistent across pages
- **Location(s):** no catch at all: `AdminUserList.tsx:110-138`, `AdminGroupList.tsx` (load), `AdminFunctionalPermissionList.tsx`, `AdminUserDetail.tsx:44-69`, `AdminGroupDetail.tsx:82-116`, `AdminFunctionalPermissionDetail.tsx:63-90` (failure leaves perpetual "Loading..."); catch into `error` state: `AdminApiKeyList.tsx:190-195`, `AdminAuditLog.tsx:80-84`, `AdminConfigList.tsx:304-306`; bare `await` mutations with no try/catch (unhandled rejections): `AdminApiKeyDetail.tsx:434-447`, `AdminApiKeyList.tsx:307-310`, `AdminGroupDetail.tsx:210-229`, `AdminFunctionalPermissionDetail.tsx:160-179`
- **Description:** Some pages show errors, some swallow them, some can crash the tree on 4xx responses.
- **Why it matters:** A user cannot rely on any consistent failure feedback; new pages copy whichever nearby page they resemble.
- **Related findings:** ARCH-010

### [RCT-003] Empty-state handling inconsistent
- **Location(s):** present: `AdminConfigList.tsx:731-735`, `UserProfileConfigList.tsx:319-323`, `AdminAuditLog.tsx:185-190`, `AdministrationHome.tsx:81`; missing: `AdminUserList.tsx`, `AdminGroupList.tsx`, `AdminFunctionalPermissionList.tsx`, `AdminApiKeyList.tsx` render an empty table body with no message when `total = 0`
- **Description:** Half the list pages have no empty state.
- **Why it matters:** Users see a blank table and cannot distinguish "no data" from "failed load" (compounded by RCT-002's swallowed errors).
- **Related findings:** RCT-002

### [RCT-004] Two toggle primitives used side by side; half-completed migration
- **Location(s):** `AdminUserDetail.tsx:133` and `AdminFunctionalPermissionDetail.tsx:128-135` use PrimeReact `InputSwitch` directly, although `design/ui/Toggle.md:774-785` explicitly lists exactly these usages as replacement targets (the list pages' filter toggles were migrated)
- **Description:** The custom Toggle and raw InputSwitch coexist for the same visual role.
- **Why it matters:** The design doc's replacement map is partially unimplemented; behavior (e.g. disabled state handling) differs between the two.
- **Related findings:** SPEC-002, DOC-006

### [RCT-005] Render-phase ref mutation and fake loading bar
- **Location(s):** render-phase ref assignment: `Toggle.tsx:205-217`, `InputField.tsx:178-192`, `Label.tsx:89-96` (cross-ref TS-007); `src/ui/app.tsx:20-47` animates an asymptotic progress interval unconnected to actual loading, ending with a "press F5 to retry" hint (`:43`)
- **Description:** Components mutate refs during render; the shell shows a simulated loading indicator.
- **Why it matters:** Render purity violations behave differently under StrictMode/concurrent rendering; the progress bar misleads users about real state.
- **Related findings:** TS-007

### [RCT-006] Save handlers capture stale `groups` closures
- **Location(s):** `AdminConfigList.tsx:496-511` (`handleChange`) and `:513+` (`handleSave`) read `groups` from closure while effects keyed on `groups` reseed at `:436`
- **Description:** Closure values and effect-reseeded state can disagree depending on execution order.
- **Why it matters:** Order-of-execution-dependent behavior in the save path.
- **Related findings:** RCT-001
