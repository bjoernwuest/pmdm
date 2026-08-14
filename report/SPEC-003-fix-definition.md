# Fix Definition: SPEC-003 — PubSub client API asymmetry and dead surface

## Source Finding
13-incomplete-specs-edge-cases.md — `src/ui/pubsub.ts:45-51,207-209` (`subscribeOnce` returns `this` on the class but `void` from the exported wrapper); `clearSubscriptions`/`countSubscriptions`/`getSubscriptions`/`getServerExpressions` exist only on the class, never exported; `getActiveServerTopics` stale name (`:219-221`)

## Human Directive
None — default interpretation applies.

## Target End State
The exported function surface of `src/ui/pubsub.ts` is the deliberate, complete client API, and the class surface matches it:

- `subscribeOnce`'s return-type asymmetry is resolved: the class method returns the subscription `Token` (useful for manual early unsubscribe) and the exported wrapper returns the same — one signature semantics on both levels.
- The class-only methods (`clearSubscriptions`, `countSubscriptions`, `getSubscriptions`, `getServerExpressions`) are either exported as wrappers (if a real caller exists or the API is meant to be public) or removed from the class (if dead). Default resolution: **export nothing new; remove the dead class methods** that no caller uses (a usage sweep at implementation decides each one — used ones stay and get exported wrappers for consistency). `getServerExpressions` stays (it backs `getActiveServerExpressions`/sync internals).
- The stale `getActiveServerTopics` name is handled by NAME-003 (rename to `getActiveServerExpressions`); this fix consumes that rename and ensures the remaining surface is coherent after it.

End state test: every public class method is reachable through a same-semantics exported wrapper or is an explicitly internal helper (marked private or documented); every exported wrapper's signature mirrors its class method.

## Approach
Sweep callers of each asymmetric/class-only method; delete unused class methods; align `subscribeOnce` signatures (both return the token); verify NAME-003's rename is reflected. Update any module docstring that enumerates the API.

## Affected Scope
- `src/ui/pubsub.ts` — signature alignment, dead-method removal, possible wrapper additions

## Explicit Constraints
- No behavior change for existing callers (`subscribe`, `unsubscribe`, `subscribeAll`, `clearAllSubscriptions`, `subscribeOnce` usage sites keep working; a widened return type from `void` to `Token` is source-compatible).
- Coordinate with NAME-003 (rename) and CPLX-008 (equality helper) — same file; the end state must satisfy all three definitions.
- Browser-compatible only (UI layer rules).

## Out of Scope
- NAME-003 (the rename itself) — separate fix definition.
- CPLX-008 (JSON.stringify comparisons) — separate fix definition.
- SPEC-007's dead-code items in other files — separate fix definition.

## Downstream Impact
Yes — module surface changes (method removals are breaking only for hypothetical external users of the class; in-repo usage is swept and confirmed).
