# Fix Definition: NAME-003 — Misleading export name `getActiveServerTopics` after topics→expressions migration

## Source Finding
02-naming-consistency.md — `src/ui/pubsub.ts:219-221` exports `getActiveServerTopics()` wrapping `getActiveServerExpressions`; `design/pubsub.md:429-477` uses "expressions" throughout

## Human Directive
None — default interpretation applies.

## Target End State
The client PubSub module's public surface uses the post-migration "expressions" vocabulary: the wrapper export in `src/ui/pubsub.ts` is named `getActiveServerExpressions`, matching the underlying `ClientPubSub.getActiveServerExpressions()` method and the `design/pubsub.md` terminology. The name `getActiveServerTopics` no longer exists anywhere in the codebase. Behavior is unchanged.

## Approach
Rename the exported wrapper function `getActiveServerTopics` → `getActiveServerExpressions` in `src/ui/pubsub.ts` and update its single consumer (`src/ui/server_sent_events.ts:2`, which imports it for the reconnect re-sync path). No compatibility alias is kept — the rename is safe because the function has exactly one importer, and keeping the stale name would defeat the fix.

## Affected Scope
- `src/ui/pubsub.ts` — rename export
- `src/ui/server_sent_events.ts` — update import/call site

## Explicit Constraints
- Pure rename; no signature, return-type, or behavior change.
- No leftover alias or deprecated re-export under the old name.

## Out of Scope
- NAME-004 (endpoint names code-vs-docs) and DOC-005 (SSE terminology split between docs) — separate fix definitions covering their own locations.
- NAME-002 (module filename collision) — separate fix definition; if both are implemented, the import path of the consumer may additionally change per NAME-002.

## Downstream Impact
Yes — one exported symbol renamed in `src/ui/pubsub.ts`; the only consumer is `src/ui/server_sent_events.ts`.
