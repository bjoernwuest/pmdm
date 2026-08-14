# Fix Definition: PATT-004 — PubSub events published before transaction commit

## Source Finding
03-patterns-concepts.md — `src/repo/ApiKeyRepo.ts:158,188-189,222-223,255-256,320` publish inside `runInTransaction` callbacks (invoked from `ApiKeyAPI.ts:226-235,438-445`); `ApiKeyRepo.ts:279` publishes even when `rows.length === 0` (returns `false` after publishing)

## Human Directive
None — default interpretation applies.

## Target End State
No PubSub event becomes visible to any subscriber before the database transaction that produced it has committed. Events from a rolled-back transaction are never delivered. The delete path in `ApiKeyRepo.ts:279` publishes only when a row was actually deleted (`rows.length > 0`). The rule already stated in root AGENTS.md ("published only after the mutation succeeds") and `src/services/AGENTS.md` ("after transaction commit") is enforced by the mechanism, not by per-site discipline.

## Approach
Make publication transaction-aware rather than moving publishes out of the repo layer:

- Introduce a deferred-publish mechanism tied to `runInTransaction` in `src/services/DatabaseDriver.ts`: while a transaction callback runs, repo-level `PubSub.publish` calls are collected instead of dispatched; when the transaction commits successfully, the collected events are dispatched in order; on rollback/throw they are discarded. Publishes that occur outside any transaction dispatch immediately, preserving current behavior for non-transactional repos.
- The mechanism is implemented at the PubSub/DatabaseDriver seam (e.g. a transaction-scoped queue that `runInTransaction` installs and drains), so repo call sites keep their current shape — this deliberately avoids relocating 22 publish calls into route handlers.
- Serializability note: `runInTransaction` uses serializable isolation; on retry-by-caller the queue must not leak events from a failed attempt. The drain-on-commit design covers this because failed attempts never drain.
- Fix the `ApiKeyRepo.ts:279` delete path to publish only on actual deletion (`rows.length > 0`), independent of the queue mechanism.
- The phantom-event window for non-transactional contexts (publish after a single auto-committed statement) is unaffected by definition — the statement has already succeeded at publish time.

## Affected Scope
- `src/services/DatabaseDriver.ts` — `runInTransaction` gains the deferred-dispatch behavior
- `src/services/PubSub.ts` — publish path becomes queue-aware when a transaction scope is active
- `src/repo/ApiKeyRepo.ts` — delete path publishes only on success; no other repo call-site changes expected
- Tests: add/adjust a regression test demonstrating no event delivery on rollback (test infrastructure permitting)

## Explicit Constraints
- No repo function's signature changes; repos keep calling `PubSub.publish` where they do today (modulo PATT-003's granularity normalization).
- Event ordering within one transaction must be preserved on dispatch.
- Non-transactional publish latency is unchanged (immediate dispatch).
- The audit-log subscriber and SSE bridge must observe events only for committed data.

## Out of Scope
- PATT-003 (what is published per mutation) — separate fix definition; ordering: the two are implemented against the same call sites and must not conflict.
- CPLX-010 (overlapping UI subscriptions double-applying updates) — subscriber-side, separate fix definition.
- ARCH-010's note of PubSub paradigm inconsistency (unchecked).

## Downstream Impact
Yes — `runInTransaction`/`PubSub` interaction gains new internal behavior; any code relying on mid-transaction event visibility (none is expected — that is the bug) changes. No export renames anticipated, but new internal helpers may be exported for testing.
