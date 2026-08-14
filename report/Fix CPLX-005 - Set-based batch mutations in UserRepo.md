# Fix CPLX-005 - Set-based batch mutations in UserRepo

## Source
- Finding: CPLX-005 (see /report/04-complexity-maintainability.md)
- Fix definition: /report/CPLX-005-fix-definition.md

## Summary of Change
Batch operations in `src/repo/UserRepo.ts` now execute as set-based statements: `disableUsers`/`disableGroups` perform the membership cleanup as a single `DELETE ... WHERE identifier IN (...)` over the affected set (the `distabledUser` loop typo disappeared with the loop); `upsertUsers` and `upsertGroups` use single multi-values `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statements, with the inserted/updated discrimination derived from the returned rows' `xmax` system column (`xmax = 0` ⇒ inserted, replacing the fragile `createdAt !== updatedAt` string comparison — that part is DATA-006's; see its doc). Return shapes `{inserted, updated}` and the per-entity CREATE/UPDATE PubSub events are preserved. Empty-input behavior is unchanged.

## Files Changed
- `src/repo/UserRepo.ts` — `disableUsers`, `disableGroups` set-based deletes; `upsertUsers`, `upsertGroups` multi-values upserts with per-row event loops over the returned rows

## Breaking Changes for Downstream Consumers
None — internal implementation of existing repo functions; signatures and event payloads unchanged. (Note: `upsertUsers`'s internal upsert set now uses `excluded.*` values; the input values were already coalesced at insert time, so behavior is identical.)

## Required Manual Follow-Up
None.

## Out of Scope Notes
- DATA-004 (N+1 query patterns elsewhere) — separate fix definition.
- The insert/update discrimination redesign (xmax-based) — DATA-006's scope; implemented together as one coherent rewrite of these functions (this doc covers the set-based aspect).
- NAME-006 (parameter casing in the same functions) — separate fix definition, landed in the same rewrite.

## Resolved Questions
None.
