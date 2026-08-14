# Downstream Plan: SPEC-003 — PubSub client API surface aligned between class and wrappers

## Upstream Change
Reference: `/report/Fix SPEC-003 - PubSub client API surface aligned between class and wrappers.md`. The client-side PubSub class surface was aligned with its wrappers: `subscribeOnce`'s return widened from `void` to `Token | false` (source-compatible), and the unexported client class's `countSubscriptions`/`getSubscriptions` methods were removed.

## Upstream's Own Assessment
"Yes — module surface changes: `subscribeOnce`'s return widened from `void` to `Token | false` (source-compatible), and the class methods `countSubscriptions`/`getSubscriptions` were removed (breaking only for hypothetical external users of the unexported class; in-repo usage was swept and none found)."

## Applicability to This Project
Affected: No

Evidence:
- `src/ui/pubsub.ts` in this tree carries the fixed surface: `subscribeOnce(...): Token | false` (lines 65/215) and no `countSubscriptions`/`getSubscriptions` on the client class. Project-wide search confirms no pmdm-owned code calls the removed methods.
- The server-side `countSubscriptions`/`getSubscriptions` in `src/services/PubSub.ts` remain in upstream's fixed file too (the removal applied to the client class only); pmdm does not touch them.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
