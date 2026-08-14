# Fix Definition: TS-006 — Mismatched `satisfies` in repo pagination branch

## Source Finding
05-typescript-bun.md — `src/repo/UserRepo.ts:290` returns `satisfies UserInsertType[]` in a paged branch while the function signature (`:276`) declares `Promise<UserSelectType[]>`

## Human Directive
None — default interpretation applies.

## Target End State
The paged, active-only branch of `getUsers` (`UserRepo.ts:290`) asserts `satisfies UserSelectType[]`, matching both the function's declared return type and the sibling branches. A wrong `satisfies` of this kind can no longer compile silently: the branch's stated type and the function signature agree. No query or behavior change.

## Approach
One-word-class fix: change the branch's `satisfies UserInsertType[]` to `satisfies UserSelectType[]`. At implementation, sweep the repo layer for any other `satisfies` expression whose named type disagrees with the enclosing function's declared return type and correct the same way.

## Affected Scope
- `src/repo/UserRepo.ts:290` (plus any sweep findings of the identical defect class)

## Explicit Constraints
- No behavior change; type-level correction only.
- If the sweep finds a case where the *signature* (not the `satisfies`) is the wrong side, stop and report rather than silently widening a public return type.

## Out of Scope
- CPLX-005 (per-row mutations in the same file) — separate fix definition.
- NAME-006 (parameter casing in the same function signature) — separate fix definition; either may land first.

## Downstream Impact
No — the declared public type already said `UserSelectType[]`; the correction aligns the internal assertion with reality.
