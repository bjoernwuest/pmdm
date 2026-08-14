# 14 — AI-Guidance Instructions (AGENTS.md and equivalents)

## Rubric
Root AGENTS.md states repo-wide rules; folder AGENTS.md files take precedence with layer-specific detail; both are written so an AI coding session can follow them without contradicting the existing code. Good means: instructions are consistent with actual code, non-redundant across nesting levels, current (file names and commands resolve), and internally non-contradictory.

### [VB-AI-001] Root AGENTS.md rules contradicted by the codebase they govern
- **Location(s):** "use the helpers in `src/ui/api/` instead of `fetch()`" — the helper layer covers 4 of ~10 APIs and the SSE PATCH uses raw `fetch` (`src/ui/api/server_sent_events.ts:34-39`); "Optimistic locking uses the `updatedAt` field… round-trip it" — config uses `knownValue`, and the `config` table has no `updatedAt` (`src/schema/ConfigSchema.ts:55-69`); "PubSub… narrowly scoped… published only after the mutation succeeds" — pages subscribe unscoped with UUID-regex disambiguation and `ApiKeyRepo` publishes inside uncommitted transactions; "Database mutations must stay inside `src/repo/`" — `FunctionalPermissionAPI.ts:35` queries directly; "services" prohibition on `getDatabaseConnection()` violated by six service files
- **Description:** Five of the root rules are contradicted by existing code.
- **Why it matters:** A future AI session trained on AGENTS.md will either "correct" conforming code or imitate the violating precedent — without the rule-vs-reality divergence being resolvable from the docs alone.
- **Related findings:** PATT-007, PATT-008, DATA-002, PATT-010, PATT-004, ARCH-001, ARCH-003

### [VB-AI-002] `tests/AGENTS.md` internally contradictory and factually wrong
- **Location(s):** §9 step 6 references `tests/e2e/**` while §3 step 4 references `tests/workflows/**` (self-contradictory; `tests/e2e/` does not exist); references nonexistent `tests/smoke/` (`:156`); claims "Screenshots are collected automatically on failure via Playwright config" (`:330-335`) — the config fields are inert under `bun test`; documents `.env.test` at `tests/.env.test` (`:24`) while `env.ts:37` reads the project root; references `assertPaginatedResponse` (`:175-182`) whose contract mismatches the actual API
- **Description:** The test-layer guidance contradicts itself and describes infrastructure that does not work as stated.
- **Why it matters:** An AI executing the documented commands or creating the documented directories fails deterministically.
- **Related findings:** TEST-008, TEST-009, TEST-004, NAME-010

### [VB-AI-003] Folder AGENTS.md canonical file examples do not exist
- **Location(s):** `src/api/AGENTS.md` cites `@/services/AuthType.ts`, `@/services/ConfigSchema.ts`, `@/types/ApiKeySchema.ts`, `@/types/Database.ts`, `@/services/ServerSentEventsType.ts`; `src/ui/AGENTS.md` lists `AuditLogAPI.ts` and `ConfigSchema.ts` as the api/ folder's canonical files (actual: `AuditLog.ts`, `Config.ts`)
- **Description:** The authoritative examples an AI is told to imitate point at pre-rename files.
- **Why it matters:** Imitation is the core of vibe-coded workflows; the templates being imitated do not resolve.
- **Related findings:** DOC-004

### [VB-AI-004] Rule redundancy and dilution across nested AGENTS.md files without precedence resolution
- **Location(s):** the mutation-location rule appears in root AGENTS.md, `src/api/AGENTS.md`, and `src/repo/AGENTS.md` with different phrasing; PubSub rules appear in root, `src/services/AGENTS.md`, and design docs with slight wording differences; `src/repo/AGENTS.md`'s "Full Encapsulation" header is contradicted by the ARCH-001 precedent in `src/api/FunctionalPermissionAPI.ts`; root AGENTS.md gives only a one-line precedence note
- **Description:** The same rules are restated at multiple levels with drifting wording; no file resolves contradictions between levels or between docs and code.
- **Why it matters:** When instructions conflict, a future AI must guess precedence; each restatement is an opportunity for silent drift.
- **Related findings:** ARCH-001, DOC-004
