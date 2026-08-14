# 04 — Complexity & Maintainability Drivers

## Rubric
Files and functions are sized for comprehension (the project's own guidance describes focused, single-purpose modules); duplicated logic is factored into shared helpers; singletons and global state are deliberate and visible; no "clever" code obscures intent. Good means: no copy-pasted blocks across pages/repos, no 1000-line components, no hidden module-level mutable state, and mutations performed as set-based batch operations.

### [CPLX-001] Oversized files
- **Location(s):** `src/ui/pages/AdminConfigList.tsx` 1091 lines (component spans `:273-1090` with 7 hooks, 3 subscription effects, 3 modal/inline state machines); `src/services/Auth.ts` 799 lines (cookies + OIDC + sessions + API keys + permissions + caches + config); `AdminApiKeyDetail.tsx` 630; `UserProfileConfigList.tsx` 609; `src/api/ApiKeyAPI.ts` 523 (~60% repetitive OpenAPI boilerplate); `src/ui/components/Toggle.tsx` 506; `InputField.tsx` 440; `src/api/RequestBundlingAPI.ts` 339
- **Description:** Multiple modules exceed the size where a single concern is discernible; `Auth.ts` mixes at least five domains.
- **Why it matters:** Each AI-driven edit must load and reason about a large surface; the probability of unintended interactions grows with file size.
- **Related findings:** ARCH-001, CPLX-006

### [CPLX-002] Duplicated admin list-page scaffolding (~4 copies)
- **Location(s):** `AdminUserList.tsx:35-52,110-138,210-233` vs. `AdminGroupList.tsx:35-52,103-131,196-219` vs. `AdminFunctionalPermissionList.tsx:35-76,123-146` vs. `AdminApiKeyList.tsx:153-200,323-340` — near-identical `updateQuery`, pagination parsing, page-size clamping, loading-state selection, and pager JSX
- **Description:** Four copies of the same pagination/query scaffolding.
- **Why it matters:** Any fix must be made four times; consistent behavior relies on manual synchronization.
- **Related findings:** ARCH-010, PATT-010, PATT-011

### [CPLX-003] Duplicated server-side logic across files
- **Location(s):** `apps/setup.ts:36-94` vs. `services/Config.ts:7-46` (near-identical parse logic — `design/configuration.md:107-113` claims they share it, which is false); `ConfigAPI.ts:20-34` vs. `UserProfileConfigAPI.ts:17-31` (identical `canonicalizeJson`/`equalsJson`); `ApiKeyAPI.ts:38-40`, `UserAPI.ts:21-23`, `GroupAPI.ts:26-28` (identical `parseBooleanQuery`); `src/ui/api/_client.ts:21-30` vs. `src/ui/api/server_sent_events.ts:8-17` (identical `extractErrorMessage`)
- **Description:** The same functions are redefined in multiple server and client files.
- **Why it matters:** Divergent fixes to "the same" function; the design doc's sharing claim misleads future edits.
- **Related findings:** DOC-001, API-001

### [CPLX-004] Hidden global singletons across 8+ modules
- **Location(s):** `DatabaseDriver.ts:49-50`; `PubSub.ts:201`; `ServerSentEvents.ts:154-157,188-197` (import-time `setInterval`); `Auth.ts:108,156,243,272,660,662,664,694`; `RequestBundling.ts:37-38`; `AuditLog.ts:42-43,80,98`; `Setup.ts:13,84`; `UserRepo.ts:28` (`_systemUser`); `EntraIDSync.ts:213` (`syncRunning`)
- **Description:** Process-wide mutable state is scattered across modules, initialized by import order, and not injected.
- **Why it matters:** Testability and reasoning suffer; `Auth.ts:108` caches the session timeout forever so config changes never take effect without restart.
- **Related findings:** ARCH-003, ARCH-007, CFG-002

### [CPLX-005] Per-row mutations in batch operations
- **Location(s):** `src/repo/UserRepo.ts:69-73` (`disableUsers`: update + one DELETE per user, loop variable typo `distabledUser` at `:70`); `:90-113` (`upsertUsers`: per-row insert loop); `:188` (`disableGroups`: same pattern)
- **Description:** Batch operations issue one statement per row instead of set-based updates/deletes.
- **Why it matters:** N round-trips serialized inside transactions; the typo'd variable name indicates copy-paste of an already non-generic block.
- **Related findings:** —

### [CPLX-006] Toggle and InputField internal duplication
- **Location(s):** `Toggle.tsx:244-252` (`cycleValue` defined but never called — dead code; `handlePillClick` at `:385-397` re-implements the same advance logic); three near-identical change handlers `:335-397` differing only in index mapping; `InputField.tsx:236-254` duplicated disable/enable pairs, `:173-193` ref-mirror boilerplate
- **Description:** Within-file copy-paste of state-advance and event-handling logic.
- **Why it matters:** A behavior change in one variant silently misses the others.
- **Related findings:** CPLX-001

### [CPLX-007] `formatterRegistry` rebuilt per render and partially duplicated
- **Location(s):** `AdminConfigList.tsx:326-328` constructs a new `Map` and registers two formatters on every render, shadowing the exported `formatterRegistry` from `src/ui/components/InputField.tsx:19-24` (which registers five, including uuid)
- **Description:** The page maintains its own partial copy of a shared registry, rebuilt each render.
- **Why it matters:** Two registries can disagree about which formatters exist; the page's copy lacks entries the shared one has.
- **Related findings:** —

### [CPLX-008] JSON-stringify identity comparisons for expressions
- **Location(s):** `src/ui/pubsub.ts:85-95` — `clearSubscriptions`/`countSubscriptions`/`getSubscriptions` compare subscription expressions via `JSON.stringify`
- **Description:** Object identity is approximated by string equality, which is key-order fragile.
- **Why it matters:** Equivalent expressions with different key order compare unequal; subtle subscription leaks or duplicate handling.
- **Related findings:** —

### [CPLX-009] Label/InputField double-seeding (prop + imperative effect)
- **Location(s):** `AdminUserList.tsx:65-76` (effect calling `ref.setText` on every data change) + `:197-203` (same value passed as `text` prop); `AdminApiKeyDetail.tsx:140-147` + `:467-490`; `AdminGroupDetail.tsx:104-108` + `:177-181`
- **Description:** Display text has two sources of truth: the prop (first render) and an imperative effect (subsequent renders).
- **Why it matters:** Divergence risk when one path changes; redundant re-seeding work on every data refresh.
- **Related findings:** RCT-001

### [CPLX-010] Overlapping PubSub subscriptions double-apply updates in one page
- **Location(s):** `AdminConfigList.tsx:317` subscribes `{and:[TAG_CONFIG,TAG_UPDATE]}` (full `loadEntries`), `:477` subscribes `{and:[TAG_CONFIG]}` (targeted state merge) — both fire for every config update
- **Description:** Each config change triggers both a full reload and a value merge into state.
- **Why it matters:** Redundant overlapping subscriptions cause double work and non-obvious ordering interactions.
- **Related findings:** RCT-001
