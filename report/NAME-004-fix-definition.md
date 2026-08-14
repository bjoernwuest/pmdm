# Fix Definition: NAME-004 — SSE endpoint names differ between code and docs

## Source Finding
02-naming-consistency.md — Code: `PATCH /api/server_sent_events/expressions`, `GET /api/server_sent_events/tags` (`src/api/ServerSentEventAPI.ts:101,136`); docs: `src/api/AGENTS.md` (SSE notes) and `design/pubsub.md:430,436,458` document `PATCH /api/server_sent_events/topics`

## Human Directive
None — default interpretation applies.

## Target End State
The documentation names the endpoints exactly as the code implements them: `PATCH /api/server_sent_events/expressions` and `GET /api/server_sent_events/tags`. The "Server-Sent Events Endpoint Notes" section of `src/api/AGENTS.md` lists the three actual routes (stream, expressions PATCH, tags GET) and no longer lists `PATCH /api/server_sent_events/topics` or `GET /api/server_sent_events/topics`. In `design/pubsub.md`, the passages at/around lines 430, 436, and 458 that present `PATCH .../topics` as the live endpoint are rewritten to the `expressions` endpoint; where the doc intentionally describes the migration history ("replaced by"), that framing is kept but worded so the *current* endpoint name is unambiguous. Code is unchanged — the code is the source of truth here.

## Approach
Docs-only edits, converging on the code:

- `src/api/AGENTS.md`: rewrite the SSE endpoint notes bullet list to name `/stream`, `/expressions` (PATCH), and `/tags` (GET).
- `design/pubsub.md`: in the "Client Topic Sync (PATCH)" and "Browser-Side Changes" passages, replace the present-tense references to `PATCH /api/server_sent_events/topics` with `PATCH /api/server_sent_events/expressions`; adjust the sentence that says the `?topics=` parameter "is replaced by the `PATCH .../topics` endpoint" so it names the expressions endpoint as the replacement.

Note: `design/pubsub.md` is partially written as a migration plan; DOC-002 (frames a completed migration as pending) is unchecked, so this fix changes only the endpoint *names* in the cited passages, not the doc's overall pending/completed framing.

## Affected Scope
- `src/api/AGENTS.md` — SSE endpoint notes
- `design/pubsub.md` — passages around lines 430, 436, 458

## Explicit Constraints
- Documentation-only, no behavior change.
- Endpoint names in code are not touched.
- Do not restructure `design/pubsub.md` beyond fixing the endpoint-name references (broader framing issues are DOC-002, unchecked).

## Out of Scope
- DOC-005 (SSE terminology split between docs) — separate fix definition; terminology unification beyond the endpoint names belongs there.
- DOC-002 (pubsub.md frames completed migration as pending) — unchecked; explicitly not addressed here.
- NAME-003 (`getActiveServerTopics` symbol rename) — separate fix definition.

## Downstream Impact
No — documentation only.
