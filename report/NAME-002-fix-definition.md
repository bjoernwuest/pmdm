# Fix Definition: NAME-002 — Two modules named `server_sent_events.ts` with different responsibilities; three SSE-related UI modules

## Source Finding
02-naming-consistency.md — `src/ui/server_sent_events.ts` (EventSource bridge), `src/ui/api/server_sent_events.ts` (URL builder + PATCH), `src/ui/pubsub.ts` (client PubSub class + expression sync)

## Human Directive
None — default interpretation applies.

## Target End State
No two modules in the UI tree share the filename `server_sent_events.ts`. Each of the three current modules has a unique filename that names its actual responsibility: the API wrapper for the SSE endpoints (under `src/ui/api/`), the browser EventSource bridge (under `src/ui/`), and the client-side PubSub subscription manager (`src/ui/pubsub.ts`, name unchanged — its filename already matches its responsibility and it is the most-imported of the three). All import sites and all references in `src/ui/AGENTS.md` point to the new names. No behavioral change in any module.

## Approach
Rename rather than merge — the three modules have genuinely different layers/responsibilities (API transport, browser event bridge, subscription state), so consolidation is not the goal; unambiguous naming is:

- `src/ui/server_sent_events.ts` (EventSource bridge, imported only by `src/ui/index.tsx`) is renamed to a bridge-specific name, e.g. `sse_bridge.ts`.
- `src/ui/api/server_sent_events.ts` (URL builder + PATCH expression sync, re-exported via `src/ui/api/index.ts`) is renamed to a name distinct within its folder, e.g. `sse_api.ts`.
- `src/ui/pubsub.ts` keeps its name.
- Update the two import sites (`src/ui/index.tsx`, `src/ui/api/index.ts` re-export) and the file lists in `src/ui/AGENTS.md` (lines 13-14 and 26) to the new names.
- Exact new filenames are finalized at implementation; the constraint is uniqueness and responsibility-describing names within each folder, keeping the existing snake_case style used by neighboring files (`session.ts`, `errors.ts`).

## Affected Scope
- `src/ui/server_sent_events.ts` — rename
- `src/ui/api/server_sent_events.ts` — rename
- `src/ui/index.tsx` — import update
- `src/ui/api/index.ts` — re-export update
- `src/ui/AGENTS.md` — file-list entries updated

## Explicit Constraints
- No code behavior change: pure rename plus import/reference updates.
- Exported symbol names (`startServerSentEventsBridge`, `buildServerSentEventsStreamUrl`, `syncServerSentEventExpressions`) are unchanged; only filenames move.
- Do not merge the three modules into one file.

## Out of Scope
- NAME-001 (casing drift across many more files) — unchecked; this fix does not rename `pubsub.ts`, `session.ts`, or `errors.ts` for casing reasons and does not establish a folder-wide casing policy.
- NAME-003 (stale `getActiveServerTopics` export name) — separate fix definition; the symbol rename belongs there.
- PATT-008 (request bundling bypass in `src/ui/api/server_sent_events.ts:34-39`) — the documented deviation; untouched here.
- NAME-005 (`_`-prefix semantics) — unchecked.

## Downstream Impact
Yes — file renames change import paths for `src/ui/index.tsx` and `src/ui/api/index.ts` and the documented file lists; no public HTTP or symbol-surface change.
