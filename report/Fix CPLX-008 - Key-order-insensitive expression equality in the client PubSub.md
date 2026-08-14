# Fix CPLX-008 - Key-order-insensitive expression equality in the client PubSub

## Source
- Finding: CPLX-008 (see /report/04-complexity-maintainability.md)
- Fix definition: /report/CPLX-008-fix-definition.md

## Summary of Change
Added a `canonicalizeExpression` helper to `src/ui/pubsub.ts` that sorts object keys before stringification, and replaced the four `JSON.stringify`-based comparisons/keys with it: `clearSubscriptions`, `countSubscriptions`, `getSubscriptions` (the latter two were removed entirely under SPEC-003 in the same change set), and the subscription-map key derivation in `getServerExpressions`. Two `TagExpression` objects with identical semantics now compare equal regardless of property order. Subscription lifecycle behavior, the matching algorithm, and the server-sync protocol are unchanged; no cross-layer sharing with the server's `canonicalizeJson` was attempted (server code must not enter the browser bundle). The server side was verified to have no analogous `JSON.stringify`-equality pattern.

## Files Changed
- `src/ui/pubsub.ts` — `canonicalizeExpression` helper; equality sites converted

## Breaking Changes for Downstream Consumers
None — internal equality primitive; the module's exported API is unchanged.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- Expression simplification/normalization beyond key ordering — not in scope.
- Server-side expression handling (`ServerSentEvents.ts`, `ServerSentEventAPI.ts`) — not cited; verified at implementation and reported here as having no matching pattern.

## Resolved Questions
None.
