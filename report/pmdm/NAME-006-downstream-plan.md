# Downstream Plan: NAME-006 — camelCase function-parameter naming across the repo layer

## Upstream Change
Reference: `/report/Fix NAME-006 - camelCase function-parameter naming across the repo layer.md`. The exported repo function `GroupCount` was renamed to `getGroupCount` (its only importer, `src/api/GroupAPI.ts`, was updated); parameter renames are source-internal.

## Upstream's Own Assessment
"Yes — exported repo function renamed: `GroupCount` → `getGroupCount` (only importer was `src/api/GroupAPI.ts`, updated). Parameter renames are source-internal (this codebase does not use named-argument call patterns for these functions)."

## Applicability to This Project
Affected: No

Evidence:
- Project-wide search: the old `GroupCount` export appears nowhere; the new `getGroupCount` is used in the shared `src/repo/UserRepo.ts:411` and `src/api/GroupAPI.ts:28,45` (merged fixed versions).
- No pmdm-owned file imports or shadows the renamed function; pmdm's `UserRepo.ts` divergence is doc comments only.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
