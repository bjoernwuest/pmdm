# Fix NAME-006 - camelCase function/parameter naming across the repo layer

## Source
- Finding: NAME-006 (see /report/02-naming-consistency.md)
- Fix definition: /report/NAME-006-fix-definition.md

## Summary of Change
Normalized the repo layer's identifier casing: `GroupCount` was renamed to `getGroupCount` (importer `src/api/GroupAPI.ts` updated); capitalized parameters were renamed to camelCase across `src/repo/UserRepo.ts` (`UserIds`→`userIds`, `Users`→`users`, `GroupIds`→`groupIds`, `Groups`→`groups`, `UserId`→`userId`, `GroupId`→`groupId` in `disableUsers`, `upsertUsers`, `upsertGroups`, `disableGroups`, `setUserMemberships`, `setGroupMemberships`, `getUsers`, `getGroup`, `getGroups`, `getGroupIdsAssignedTo`, `getUserIdsAssignedTo`) and `src/repo/FunctionalPermissionRepo.ts` (`DBClient`→`db` parameters, `FPIdentifier`/`FPIndentifier`→`fpIdentifier`), with JSDoc `@param` tags updated; `src/repo/ConfigRepo.ts`'s `regExFriendly(In)` parameter became `input`. The imported type `DBClient` keeps its name. No behavior, types, PubSub payloads, or SQL changed.

## Files Changed
- `src/repo/UserRepo.ts` — function/parameter renames (co-rewritten with CPLX-005/DATA-006)
- `src/repo/FunctionalPermissionRepo.ts` — `DBClient`/`FPIdentifier`/`FPIndentifier` parameter renames
- `src/repo/ConfigRepo.ts` — `regExFriendly` parameter rename
- `src/api/GroupAPI.ts` — `GroupCount` → `getGroupCount` import/call

## Breaking Changes for Downstream Consumers
Yes — exported repo function renamed: `GroupCount` → `getGroupCount` (only importer was `src/api/GroupAPI.ts`, updated). Parameter renames are source-internal (this codebase does not use named-argument call patterns for these functions).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- NAME-001 (file-level casing drift across services/UI) — unchecked; this fix is limited to function/parameter identifiers inside `src/repo/` plus call sites.
- The `FPIndentifier` typo was fixed only as part of parameter casing normalization in this file.

## Resolved Questions
None.
