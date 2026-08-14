# Fix NAME-002 - Unique responsibility-describing filenames for SSE UI modules

## Source
- Finding: NAME-002 (see /report/02-naming-consistency.md)
- Fix definition: /report/NAME-002-fix-definition.md

## Summary of Change
Renamed the two UI modules that shared the `server_sent_events.ts` filename so each filename names its responsibility: `src/ui/server_sent_events.ts` (EventSource bridge) is now `src/ui/sse_bridge.ts`, and `src/ui/api/server_sent_events.ts` (SSE endpoint URL builder + PATCH expression sync) is now `src/ui/api/sse_api.ts`. `src/ui/pubsub.ts` keeps its name (it already matches its responsibility). The import in `src/ui/index.tsx`, the re-export in `src/ui/api/index.ts`, and the file lists in `src/ui/AGENTS.md` were updated to the new names. Exported symbol names (`startServerSentEventsBridge`, `buildServerSentEventsStreamUrl`, `syncServerSentEventExpressions`) are unchanged; no module was merged.

## Files Changed
- `src/ui/server_sent_events.ts` → `src/ui/sse_bridge.ts` (renamed)
- `src/ui/api/server_sent_events.ts` → `src/ui/api/sse_api.ts` (renamed)
- `src/ui/index.tsx` — import updated to `./sse_bridge.ts`
- `src/ui/api/index.ts` — re-export updated to `./sse_api.ts`
- `src/ui/AGENTS.md` — file lists updated to the new names

## Breaking Changes for Downstream Consumers
Yes — file renames change import paths for `src/ui/index.tsx` and `src/ui/api/index.ts` and the documented file lists; no public HTTP or symbol-surface change.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- NAME-001 (casing drift across more files) — unchecked; no casing-policy renames performed.
- NAME-003 (stale `getActiveServerTopics` export) — separate fix definition, implemented in the same change set.
- PATT-008 (bundling bypass in the renamed `sse_api.ts`) — separate fix definition, documented in the same change set.

## Resolved Questions
None.
