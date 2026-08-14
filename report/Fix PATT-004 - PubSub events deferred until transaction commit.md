# Fix PATT-004 - PubSub events deferred until transaction commit

## Source
- Finding: PATT-004 (see /report/03-patterns-concepts.md)
- Fix definition: /report/PATT-004-fix-definition.md

## Summary of Change
Made publication transaction-aware: `src/services/PubSub.ts` gained a nested publish-scope mechanism (`beginPublishScope`/`commitPublishScope`/`rollbackPublishScope`) — while a scope is active, `publish`/`publishSync` collect messages instead of dispatching; `src/services/DatabaseDriver.ts`'s `runInTransaction` installs a scope around the callback, drains the collected events in order on successful commit (async, matching the non-transactional delivery contract), and discards them on rollback. Nested transactions (savepoints) merge inner scopes into the enclosing one, and a failed inner savepoint discards only its own events. Repo call sites kept their shape. The `ApiKeyRepo` delete path now publishes only when a row was actually deleted (`rows.length > 0`). Non-transactional publish latency is unchanged (immediate dispatch).

## Files Changed
- `src/services/PubSub.ts` — publish scope stack; `publish`/`publishSync` defer while a scope is active; `deliverDeferred` delivery method
- `src/services/DatabaseDriver.ts` — `runInTransaction` installs/drains/discards the publish scope
- `src/repo/ApiKeyRepo.ts` — delete path publishes only on actual deletion
- `src/services/AGENTS.md` — publish-timing statement updated

## Breaking Changes for Downstream Consumers
Yes — `runInTransaction`/`PubSub` interaction gained new internal behavior: events from a transaction become visible only after commit, and events from rolled-back transactions are never delivered. No export renames; new internal exports `beginPublishScope`/`commitPublishScope`/`rollbackPublishScope` exist for the driver's use (and potential testing).

## Required Manual Follow-Up
None. (The regression test the definition mentions — no event delivery on rollback — could not be added/executed here because the test suite may not be run in this session.)

## Out of Scope Notes
- PATT-003 (what is published per mutation) — separate fix definition, implemented in the same change set against the same call sites.
- CPLX-010 (overlapping UI subscriptions) — subscriber-side, separate fix definition.
- ARCH-010's PubSub paradigm note — unchecked.

## Resolved Questions
None.
