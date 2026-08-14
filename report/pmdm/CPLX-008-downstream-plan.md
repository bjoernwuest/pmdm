# Downstream Plan: CPLX-008 — Key-order-insensitive expression equality in the client PubSub

## Upstream Change
Reference: `/report/Fix CPLX-008 - Key-order-insensitive expression equality in the client PubSub.md`. Internal equality primitive in the shared client PubSub module made key-order-insensitive; the module's exported API is unchanged.

## Upstream's Own Assessment
"None — internal equality primitive; the module's exported API is unchanged."

## Applicability to This Project
Affected: No

Evidence:
- The changed module (`src/ui/pubsub.ts`) is shared and already fixed via the merge.
- No pmdm-owned file implements its own PubSub expression equality primitive (project-wide search: no matches outside shared code).
- pmdm pages use the unchanged exported API only (`subscribe`/`unsubscribe`, e.g. `src/ui/pages/pmdm/ConfigurationLookupDetail.tsx:37,299,342`).

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
