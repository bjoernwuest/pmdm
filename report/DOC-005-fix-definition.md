# Fix Definition: DOC-005 — SSE terminology split between docs

## Source Finding
12-docs-style.md — `design/pubsub.md:429,437,458` and `src/api/AGENTS.md` document `PATCH /api/server_sent_events/topics`; code uses `.../expressions` (`src/api/ServerSentEventAPI.ts:101`) and `.../tags` (`:136`)

## Human Directive
None — default interpretation applies.

## Target End State
All documentation uses the post-migration vocabulary — **tags** for the message labels and **expressions** for subscription filters — and names the live endpoints (`PATCH /api/server_sent_events/expressions`, `GET /api/server_sent_events/tags`). The endpoint-name corrections at `design/pubsub.md:429,437,458` and `src/api/AGENTS.md` are owned by NAME-004 (same lines); DOC-005 owns the remaining terminology split: any other doc passage using "topics" to mean the current system (not the migration history) is rewritten to "tags"/"expressions" as context requires, including `design/server-sent-events.md` if it carries pre-migration terms (verify at implementation). Where `design/pubsub.md` intentionally documents the old→new mapping for historical context, the wording must be unmistakably past-tense ("was", "pre-migration") rather than present-tense.

## Approach
Terminology sweep across `design/*.md` and the two AGENTS.md files that mention SSE: classify each "topic(s)" occurrence as (a) migration-history reference — make past tense explicit, or (b) current-state description — rewrite to tags/expressions. NAME-004 owns the endpoint strings at the specific cited lines; this fix covers vocabulary everywhere else and accepts NAME-004's edits as part of the final state (no double edits to the same sentences — the implementer of whichever lands second works on the post-edit text).

## Affected Scope
- `design/pubsub.md` — terminology passages beyond the endpoint names
- `design/server-sent-events.md` — verification and possible terminology alignment
- `src/api/AGENTS.md`, `src/ui/AGENTS.md` — any remaining pre-migration vocabulary

## Explicit Constraints
- Documentation-only, no behavior change.
- Must not conflict with NAME-004's edits to the same files/lines; the endpoint names themselves are NAME-004's scope.
- Must not rewrite the doc's intentional migration-narrative structure (DOC-002 is unchecked — the "frames migration as pending" framing stays as is).

## Out of Scope
- NAME-004 (endpoint names in docs) — separate fix definition owning the cited lines.
- NAME-003 (symbol rename) — separate fix definition.
- DOC-002 (pubsub.md pending-framing) — unchecked.
- DOC-006 (UI design docs) — unchecked.

## Downstream Impact
No — documentation only.
