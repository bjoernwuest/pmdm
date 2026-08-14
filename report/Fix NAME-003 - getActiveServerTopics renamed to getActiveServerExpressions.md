# Fix NAME-003 - getActiveServerTopics renamed to getActiveServerExpressions

## Source
- Finding: NAME-003 (see /report/02-naming-consistency.md)
- Fix definition: /report/NAME-003-fix-definition.md

## Summary of Change
Renamed the exported wrapper `getActiveServerTopics` to `getActiveServerExpressions` in `src/ui/pubsub.ts`, matching the underlying `ClientPubSub.getActiveServerExpressions()` method and the post-migration vocabulary. The name `getActiveServerTopics` no longer exists in the codebase; no compatibility alias was kept. The single importer site was in `src/ui/sse_bridge.ts` (renamed from `server_sent_events.ts` under NAME-002): that import was verified to be an unused dead import (the bridge's reconnect path relies on server-side filter preservation, not a client re-sync), so it was removed rather than updated — the definition's constraint ("no leftover alias or deprecated re-export under the old name") is fully satisfied.

## Files Changed
- `src/ui/pubsub.ts` — `getActiveServerTopics` → `getActiveServerExpressions`
- `src/ui/sse_bridge.ts` — stale unused import of the renamed symbol removed

## Breaking Changes for Downstream Consumers
Yes — one exported symbol renamed in `src/ui/pubsub.ts`; the only consumer was the unused import in the SSE bridge (removed).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- NAME-004 (endpoint names code-vs-docs) and DOC-005 (SSE terminology in docs) — separate fix definitions.
- NAME-002 (module filename collision) — separate fix definition, implemented in the same change set (the consumer's import path changed accordingly).

## Resolved Questions
None.
