# Fix Definition: NAME-006 — Function/parameter casing drift inside repo layer

## Source Finding
02-naming-consistency.md — `src/repo/UserRepo.ts:334` `GroupCount` (PascalCase function) vs. `:298` `getUserCount`; capitalized parameters `UserIds`, `GroupIds`, `DBClient` at `UserRepo.ts:65,85,204,276`, `FunctionalPermissionRepo.ts:38,62` and elsewhere

## Human Directive
None — default interpretation applies.

## Target End State
Within the repo layer, exported functions are uniformly camelCase (`getGroupCount`, not `GroupCount`) and parameters are uniformly camelCase (`userIds`, `groupIds`, `db`), matching the sibling convention (`getUserCount`, `db: DBClient` in other signatures) and the folder AGENTS.md convention (functions camelCase, parameters lowercase). JSDoc `@param` names match the renamed parameters. All call sites are updated. No signature shapes, types, or behavior change — identifiers only.

## Approach
Mechanical rename sweep across `src/repo/`:

- `UserRepo.ts`: `GroupCount` → `getGroupCount`; parameters `UserIds` → `userIds`, `GroupIds` → `groupIds`, `UserId` → `userId`, `GroupId` → `groupId` at all cited and discovered sites (e.g. `disableUsers`, `disableGroups`, `setUserMemberships`, `setGroupMemberships`); update their JSDoc `@param` tags.
- `FunctionalPermissionRepo.ts`: the parameter literally named `DBClient` (shadowing the imported type) → `db`; `FPIdentifier` → `fpIdentifier` and `FPIndentifier` → `fpIdentifier` (same drift class, same file); all functions in the file use one parameter convention.
- Sweep the remaining `src/repo/*.ts` files for the same pattern (capitalized parameters, PascalCase function exports) and normalize to the same convention.
- Update call sites: `GroupCount` is imported in `src/api/GroupAPI.ts:21`; parameter renames are internal to each function body except where named/destructured at call sites (verify via type-check).

## Affected Scope
- `src/repo/UserRepo.ts`
- `src/repo/FunctionalPermissionRepo.ts`
- Other `src/repo/*.ts` files found by the sweep
- `src/api/GroupAPI.ts` and any other importers of renamed function exports

## Explicit Constraints
- No behavior, types, PubSub payloads, or SQL change — identifier casing only.
- The imported *type* `DBClient` keeps its name; only value parameters shadowing it are renamed.
- Convention target: camelCase functions, camelCase parameters; do not introduce a new convention.

## Out of Scope
- NAME-001 (file-level casing drift across services/UI) — unchecked; this fix is limited to function/parameter identifiers inside `src/repo/` plus their call sites.
- The `FPIndentifier` typo as a domain-level term — it is fixed here only as part of parameter casing normalization in this file.

## Downstream Impact
Yes — exported repo function renamed (`GroupCount` → `getGroupCount`); importers (currently `src/api/GroupAPI.ts`) must follow. Parameter renames are source-internal unless callers use named arguments patterns (not present in this codebase's call style).
