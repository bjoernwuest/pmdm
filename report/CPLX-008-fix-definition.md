# Fix Definition: CPLX-008 — JSON-stringify identity comparisons for expressions

## Source Finding
04-complexity-maintainability.md — `src/ui/pubsub.ts:85-95` — `clearSubscriptions`/`countSubscriptions`/`getSubscriptions` compare subscription expressions via `JSON.stringify`

## Human Directive
None — default interpretation applies.

## Target End State
Expression equality in `src/ui/pubsub.ts` is key-order-insensitive: two `TagExpression` objects with identical semantics compare equal regardless of property order (also at `:114`, the subscription-map key derivation). Subscription lifecycle behavior is otherwise unchanged — same subscribe/unsubscribe/matching semantics, same server sync scheduling; only the equality primitive is fixed. Expression equivalence that is semantic but not structural (e.g. `{and:[A]}` vs `A`) is explicitly *not* in scope — the fix is structural canonicalization, not expression simplification.

## Approach
Introduce a single canonicalization helper for expressions (stable key ordering before stringification, or a structural deep-equal), in `src/ui/pubsub.ts` or a shared UI util if reuse exists. Replace all four `JSON.stringify`-based comparisons/keys with it. Note the parallel with CPLX-003's `canonicalizeJson` in the API layer: same idea, different layer — the UI gets its own helper since server code must not be imported into the browser bundle; no cross-layer sharing is attempted.

## Affected Scope
- `src/ui/pubsub.ts` — canonicalization helper + four call sites (`clearSubscriptions`, `countSubscriptions`, `getSubscriptions`, subscription-map key at `:114`)

## Explicit Constraints
- Browser-compatible code only (no Node imports), per `src/ui/AGENTS.md`.
- No change to the subscription matching algorithm or the server-sync protocol.
- Deterministic output for identical input (canonicalization must be total and stable).

## Out of Scope
- Expression simplification/normalization beyond key ordering.
- Server-side expression handling (`src/services/ServerSentEvents.ts`, `src/api/ServerSentEventAPI.ts`) — not cited; verify at implementation whether the server has the same pattern and, if found, report it rather than expanding scope silently.

## Downstream Impact
No — internal equality primitive; the module's exported API is unchanged.
