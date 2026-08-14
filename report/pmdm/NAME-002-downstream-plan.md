# Downstream Plan: NAME-002 — Unique responsibility-describing filenames for SSE UI modules

## Upstream Change
Reference: `/report/Fix NAME-002 - Unique responsibility-describing filenames for SSE UI modules.md`. Renamed `src/ui/server_sent_events.ts` → `src/ui/sse_bridge.ts` and `src/ui/api/server_sent_events.ts` → `src/ui/api/sse_api.ts`; imports/re-exports in `src/ui/index.tsx` and `src/ui/api/index.ts` and the `src/ui/AGENTS.md` file list were updated. Exported symbol names and HTTP endpoints unchanged.

## Upstream's Own Assessment
"Yes — file renames change import paths for `src/ui/index.tsx` and `src/ui/api/index.ts` and the documented file lists; no public HTTP or symbol-surface change."

## Applicability to This Project
Affected: No

Evidence:
- The renamed files exist at their new paths in this tree (`src/ui/sse_bridge.ts`, `src/ui/api/sse_api.ts`) — the merge already applied the rename and the import updates.
- Project-wide search: no pmdm-owned file imports the old module paths (`@/ui/server_sent_events`, `@/ui/api/server_sent_events`); the remaining `server_sent_events` strings are the unchanged HTTP endpoint paths in `src/ui/api/sse_api.ts:15,26`.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
