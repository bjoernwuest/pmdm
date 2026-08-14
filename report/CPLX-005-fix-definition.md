# Fix Definition: CPLX-005 — Per-row mutations in batch operations

## Source Finding
04-complexity-maintainability.md — `src/repo/UserRepo.ts:69-73` (`disableUsers`: update + one DELETE per user, loop variable typo `distabledUser` at `:70`); `:90-113` (`upsertUsers`: per-row insert loop); `:188` (`disableGroups`: same pattern)

## Human Directive
None — default interpretation applies.

## Target End State
Batch operations in `src/repo/UserRepo.ts` execute as set-based statements:

- `disableUsers` / `disableGroups`: the membership cleanup is a single `DELETE ... WHERE userIdentifier IN (...)` (resp. `groupIdentifier IN (...)`) statement over the affected id set, replacing the per-row delete loops. The `distabledUser` typo disappears with the loop.
- `upsertUsers`: the per-row `INSERT ... ON CONFLICT` loop is replaced by a single multi-values `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement (Drizzle supports multi-row values with `onConflictDoUpdate`), with the inserted/updated discrimination and per-row PubSub events derived from the returned rows — preserving the current return shape `{inserted, updated}` and the current per-entity CREATE/UPDATE events. (If the created/updated discrimination cannot survive set-based execution exactly — it currently compares `createdAt !== updatedAt` per row — the discrimination rule is applied to the returned rows the same way, keeping semantics.)

Empty-input behavior is preserved (update-all semantics when no identifiers are given for disable*; empty array returns empty results for upsert).

## Approach
Rewrite the three functions' data access to set-based Drizzle statements; keep validation, publish payloads, and return types as they are. The per-entity PubSub publishes remain per-entity loops over the `.returning()` result (publishing is not a DB round-trip concern; PATT-003/PATT-004 govern their form and timing).

## Affected Scope
- `src/repo/UserRepo.ts` — `disableUsers`, `upsertUsers`, `disableGroups`
- Tests covering these functions (update only if behavior observably changes, which it must not)

## Explicit Constraints
- No signature or return-shape changes.
- Transactional context respected: functions keep accepting `DBClient` and work inside `runInTransaction`.
- Publish convention from PATT-003 (one instance-form event per affected entity) applies to the retained publishes.
- Coordinate with NAME-006 (parameter casing in the same functions): either may land first; the survivor keeps both fixes.

## Out of Scope
- DATA-004 (N+1 query patterns elsewhere) — separate fix definition covering its own sites.
- The insert/update discrimination fragility noted in DATA-006 — separate fix definition; here the discrimination is only preserved, not redesigned.

## Downstream Impact
No — internal implementation of existing repo functions; signatures and event payloads unchanged.
