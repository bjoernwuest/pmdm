# Fix SPEC-003 - PubSub client API surface aligned between class and wrappers

## Source
- Finding: SPEC-003 (see /report/13-incomplete-specs-edge-cases.md)
- Fix definition: /report/SPEC-003-fix-definition.md

## Summary of Change
Aligned the exported function surface of `src/ui/pubsub.ts` with the class surface: `subscribeOnce` now returns the subscription `Token | false` on both levels (the class method previously returned `this`, the wrapper `void` — a widened, source-compatible return for existing callers). The dead class-only methods `countSubscriptions` and `getSubscriptions` had no callers in a usage sweep and were removed; `clearSubscriptions` stays as an internal helper (used by the expression-based `unsubscribe` branch) and `getServerExpressions` stays (backs `getActiveServerExpressions` and the sync internals). No new wrappers were exported, per the default resolution. NAME-003's rename (`getActiveServerExpressions`) and CPLX-008's canonical equality landed in the same file; the end state satisfies all three definitions.

## Files Changed
- `src/ui/pubsub.ts` — `subscribeOnce` returns the token on class and wrapper; dead `countSubscriptions`/`getSubscriptions` removed

## Breaking Changes for Downstream Consumers
Yes — module surface changes: `subscribeOnce`'s return widened from `void` to `Token | false` (source-compatible), and the class methods `countSubscriptions`/`getSubscriptions` were removed (breaking only for hypothetical external users of the unexported class; in-repo usage was swept and none found).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- NAME-003 (the rename) and CPLX-008 (equality helper) — separate fix definitions, implemented in the same change set.
- SPEC-007's dead-code items in other files — separate fix definition.

## Resolved Questions
None.
