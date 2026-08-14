# Fix DOC-004 - Folder AGENTS.md filename citations corrected to real files

## Source
- Finding: DOC-004 (see /report/12-docs-style.md)
- Fix definition: /report/DOC-004-fix-definition.md

## Summary of Change
Corrected every stale filename citation in `src/api/AGENTS.md` to the live tree: `@/services/AuthType.ts` → `@/services/Auth.ts`, `@/services/ConfigSchema.ts` → `@/services/Config.ts`, `@/types/ConfigSchema.ts` → `@/types/PubSubType.ts` + `@/types/ConfigType.ts` (per the two contexts), `@/types/ApiKeySchema.ts` → `@/types/ApiKeyType.ts`, `@/types/Database.ts` → `@/services/DatabaseDriver.ts`, `@/services/ServerSentEventsType.ts` → `@/services/ServerSentEvents.ts`; the inline "business logic belongs in services" example was corrected the same way. `src/ui/AGENTS.md`'s `api/` file list was already corrected under NAME-002/PATT-008 (`AuditLog.ts`, `Config.ts`, `UserProfileConfig.ts`, `sse_api.ts`). No rule/contract wording changed beyond filename accuracy.

## Files Changed
- `src/api/AGENTS.md` — import-table and example citations corrected
- `src/ui/AGENTS.md` — (already corrected via NAME-002/PATT-008; verified here)

## Breaking Changes for Downstream Consumers
None — documentation only.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- VB-AI-003 (canonical-file-example defect class) — separate fix definition owning the existence sweep; see its implementation doc.
- ARCH-001 (FunctionalPermissionAPI layering) — separate fix definition, implemented earlier.
- DOC-007 (comment rot) — separate fix definition.

## Resolved Questions
None.
