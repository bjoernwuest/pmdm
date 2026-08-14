# Fix DOC-005 - SSE terminology split between docs resolved

## Source
- Finding: DOC-005 (see /report/12-docs-style.md)
- Fix definition: /report/DOC-005-fix-definition.md

## Summary of Change
Resolved the remaining pre-migration vocabulary in the SSE docs: `design/pubsub.md`'s "Client Topic Sync (PATCH)" section is now "Client Expression Sync (PATCH)" with the pre-migration "topic strings" wording marked as such, and its endpoint references use the post-migration names (owned jointly with NAME-004, which fixed the endpoint strings). `design/server-sent-events.md` was verified to already use the post-migration vocabulary (its remaining "topics" occurrences are historical/previously phrasings or the removed-parameter notes) — only its stale `src/ui/server_sent_events.ts` header was updated to the renamed `src/ui/sse_bridge.ts`. The two AGENTS.md files' remaining SSE vocabulary was verified consistent. The intentional migration-narrative structure of `design/pubsub.md` was not restructured (DOC-002 is unchecked).

## Files Changed
- `design/pubsub.md` — section header and terminology passages aligned to expressions
- `design/server-sent-events.md` — stale bridge filename header updated
- `src/api/AGENTS.md`, `src/ui/AGENTS.md` — verified consistent (no edits needed beyond NAME-004/NAME-002)

## Breaking Changes for Downstream Consumers
None — documentation only.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- NAME-004 (endpoint names in docs) — separate fix definition, implemented in the same change set.
- NAME-003 (symbol rename) — separate fix definition, implemented in the same change set.
- DOC-002 (pubsub.md pending-framing) — unchecked.
- DOC-006 (UI design docs) — unchecked.

## Resolved Questions
None.
