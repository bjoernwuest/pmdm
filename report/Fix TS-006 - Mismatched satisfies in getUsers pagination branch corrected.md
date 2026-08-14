# Fix TS-006 - Mismatched satisfies in getUsers pagination branch corrected

## Source
- Finding: TS-006 (see /report/05-typescript-bun.md)
- Fix definition: /report/TS-006-fix-definition.md

## Summary of Change
Corrected the `satisfies` expression in the paged, active-only branch of `getUsers` (`src/repo/UserRepo.ts`): `satisfies UserInsertType[]` is now `satisfies UserSelectType[]`, matching the function's declared `Promise<UserSelectType[]>` return type and the sibling branches. The repo-layer sweep for the same defect class found no further mismatches (the other `satisfies` expressions in `UserRepo.ts`/`FunctionalPermissionRepo.ts` agree with their enclosing return types).

## Files Changed
- `src/repo/UserRepo.ts` — `satisfies UserInsertType[]` → `satisfies UserSelectType[]` in `getUsers`

## Breaking Changes for Downstream Consumers
None — the declared public type already said `UserSelectType[]`; the correction aligns the internal assertion with reality.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- CPLX-005 (per-row mutations in the same file) and NAME-006 (parameter casing in the same signature) — separate fix definitions, landed in the same rewrite.

## Resolved Questions
None.
