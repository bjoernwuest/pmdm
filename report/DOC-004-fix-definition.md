# Fix Definition: DOC-004 — Folder AGENTS.md files reference wrong filenames

## Source Finding
12-docs-style.md — `src/api/AGENTS.md` cites `@/services/AuthType.ts`, `@/services/ConfigSchema.ts`, `@/types/ApiKeySchema.ts`, `@/types/Database.ts`, `@/services/ServerSentEventsType.ts` (none exist); `src/ui/AGENTS.md` api/ section lists `AuditLogAPI.ts` and `ConfigSchema.ts` as the canonical helper examples (actual: `AuditLog.ts`, `Config.ts`)

## Human Directive
None — default interpretation applies.

## Target End State
Every filename cited in `src/api/AGENTS.md` and `src/ui/AGENTS.md` resolves to a file that exists after the fix set lands. The stale citations become:

- `@/services/AuthType.ts` → `@/services/Auth.ts` (or the post-CPLX-001 module layout — see constraint below).
- `@/services/ConfigSchema.ts` → the actual home of `parseConfigValue`/`validateConfigInputFormat` (`@/services/Config.ts`) and config types in `@/types/ConfigType.ts`, as the context of each citation requires.
- `@/types/ApiKeySchema.ts` → `@/types/ApiKeyType.ts` (verify actual filename at implementation).
- `@/types/Database.ts` → the actual home of the `DBClient` type (`@/services/DatabaseDriver.ts`).
- `@/services/ServerSentEventsType.ts` → `@/services/ServerSentEvents.ts`.
- `src/ui/AGENTS.md` api/ list: `AuditLogAPI.ts` → `AuditLog.ts`, `ConfigSchema.ts` → `Config.ts` (the file list was already partially corrected — the api/ section currently reads "AuditLogAPI.ts, ConfigSchema.ts" in the finding; the live file says `AuditLogAPI.ts, ConfigSchema.ts` at line 26 — verify exact current text at implementation and correct to the real names).

A link/filename verification pass over *all* folder AGENTS.md files accompanies the edit (grep every `@/...` citation and `*.ts` mention against the tree), so the fix closes the defect class in these two files, not just the enumerated instances.

## Approach
Edit the two AGENTS.md files in place, replacing wrong paths with the real ones. Dependency: if CPLX-001 (Auth.ts split) and PATT-007 (new UI api modules) have landed, cite the post-fix locations; if not, cite current locations and let those fixes' authors update references (their definitions already require keeping AGENTS.md accurate).

## Affected Scope
- `src/api/AGENTS.md` — import-table and example corrections
- `src/ui/AGENTS.md` — api/ file-list correction

## Explicit Constraints
- Documentation-only, no behavior change.
- Corrected references must be verified against the live tree at implementation time (not against this file's snapshot).
- No rule/contract wording changes beyond filename accuracy (guidance content stays; only pointers are fixed).

## Out of Scope
- VB-AI-003 (canonical file examples that do not exist, as an AI-guidance problem class) — separate fix definition; overlap: VB-AI-003 may cover other folders' examples.
- ARCH-001 (the FunctionalPermissionAPI layering violation the docs context mentions) — separate fix definition.
- DOC-007 (comment rot) — separate fix definition.

## Downstream Impact
No — documentation only.
