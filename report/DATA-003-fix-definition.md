# Fix Definition: DATA-003 — Optimistic-lock timestamp comparison mixes `timestamp` cast with `timestamptz` columns

## Source Finding
07-data-drizzle.md — `src/repo/ApiKeyRepo.ts:184,218,251,277,304` compare `updatedAt = ${knownUpdatedAt}::timestamp` while the columns are `timestamptz` (`src/schema/helpers.ts:23,35`); `$onUpdate` writes driver-generated ISO strings while SQL paths write `now()`; compensated only by `timezone: 'UTC'` (`DatabaseDriver.ts:66`)

## Human Directive
Domain-level (applies to every DATA-* item): "[Never run the drizzle-migration - it will be run by the human after code change]"

## Target End State
Optimistic-lock timestamp comparisons are timezone- and precision-safe by construction:

- The lock comparisons in `ApiKeyRepo.ts` compare `timestamptz` against `timestamptz` (the `::timestamp` cast is removed; the parameter is bound/compared as a timestamptz value), so the result no longer depends on the session timezone setting.
- Timestamp *producers* are unified for `updatedAt`: either the database (`now()` via SQL/default) or the driver ISO string is authoritative for all write paths of these columns — one producer, documented in `src/schema/helpers.ts` where `timestamps` is defined. The `$onUpdate` driver-side ISO-string generation and the SQL `now()` paths no longer coexist for the same column family. (Decision: prefer database `now()` as the single producer, since comparisons happen in SQL and the DB clock is the lock's source of truth; `$onUpdate` is replaced accordingly — e.g. by writing `sql\`now()\`` explicitly in update paths or a default-based trigger-free approach consistent with Drizzle capabilities.)
- The `timezone: 'UTC'` connection pinning in `DatabaseDriver.ts` may remain as defense-in-depth but is no longer load-bearing for correctness; a comment states that.

False 409s caused by timestamp representation mismatch are eliminated.

## Approach
Sweep the five cited comparisons plus any other `::timestamp` casts in `src/repo/`, and normalize: bind `knownUpdatedAt` as the column's own type (the Drizzle column is `mode: "string"` with `withTimezone: true`, so the ISO string round-trips as timestamptz without a cast). Unify the producer: update paths that set `updatedAt` use the same source the schema default uses. Verify with the existing optimistic-lock tests (or add one) that a round-tripped `updatedAt` passes the lock check.

## Affected Scope
- `src/repo/ApiKeyRepo.ts` — five comparison sites
- `src/schema/helpers.ts` — `timestamps` helper producer unification + documentation
- Sweep: other repos with `::timestamp` or `$onUpdate` usage
- Possibly `src/services/DatabaseDriver.ts` — comment on the UTC pinning
- No migration expected (column types unchanged; producer/comparison only) — but if the producer unification requires a schema-level change (e.g. dropping `$onUpdate` in favor of DB defaults only), the migration is generated, not run

## Explicit Constraints
- Never run the drizzle-migration - it will be run by the human after code change (applies if any migration is generated).
- The wire format of `updatedAt` in API responses (ISO string) must not change — clients are unaffected.
- Lock semantics unchanged: mismatched token ⇒ no rows ⇒ 409.

## Out of Scope
- DATA-002 (config optimistic locking) — separate fix definition; its new guarded update must follow this fix's comparison convention.
- CPLX-005 — separate fix definition.

## Downstream Impact
No client-facing change; internal comparison correctness only. If `$onUpdate` is removed from the schema helper, generated types do not change shape.
