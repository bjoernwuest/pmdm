# Downstream Plan: NAME-003 — getActiveServerTopics renamed to getActiveServerExpressions

## Upstream Change
Reference: `/report/Fix NAME-003 - getActiveServerTopics renamed to getActiveServerExpressions.md`. One exported symbol in the shared `src/ui/pubsub.ts` was renamed from `getActiveServerTopics` to `getActiveServerExpressions`; the only consumer (an unused import in the SSE bridge) was removed.

## Upstream's Own Assessment
"Yes — one exported symbol renamed in `src/ui/pubsub.ts`; the only consumer was the unused import in the SSE bridge (removed)."

## Applicability to This Project
Affected: No

Evidence:
- Project-wide search: the old name `getActiveServerTopics` appears nowhere in this tree; only the new `getActiveServerExpressions` exists (`src/ui/pubsub.ts:132,227-228`).
- No pmdm-owned file imports or shadows the renamed symbol.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
