# Fix NAME-004 - SSE endpoint names in docs corrected to the code's names

## Source
- Finding: NAME-004 (see /report/02-naming-consistency.md)
- Fix definition: /report/NAME-004-fix-definition.md

## Summary of Change
The documentation now names the SSE endpoints exactly as the code implements them. `src/api/AGENTS.md`'s "Server-Sent Events Endpoint Notes" lists the three actual routes (`GET .../stream`, `PATCH .../expressions`, `GET .../tags`) and no longer mentions `.../topics` endpoints. In `design/pubsub.md`, the passages around the former lines 430/436/458 that presented `PATCH .../topics` as the live endpoint were rewritten to the `expressions` endpoint, including the "`?topics=` parameter is replaced by …" sentence. Code was not changed (it is the source of truth); the doc's pending/completed framing was left intact (DOC-002 is unchecked).

## Files Changed
- `src/api/AGENTS.md` — SSE endpoint notes bullet list corrected
- `design/pubsub.md` — endpoint-name references corrected (expressions), migration-history phrasing kept

## Breaking Changes for Downstream Consumers
None — documentation only.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- DOC-005 (SSE terminology beyond endpoint names) — separate fix definition, implemented in the same change set.
- DOC-002 (pubsub.md frames completed migration as pending) — unchecked; explicitly not addressed.

## Resolved Questions
None.
