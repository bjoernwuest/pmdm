# Downstream Plan: PATT-009 — Single synchronous unsubscribe idiom across the UI

## Upstream Change
Reference: `/report/Fix PATT-009 - Single synchronous unsubscribe idiom across the UI.md`. Internal cleanup idiom unified (single synchronous unsubscribe) in the shared UI; no exports or behavior contracts change.

## Upstream's Own Assessment
"None — internal cleanup idiom only; no exports or behavior contracts change (other than closing the cleanup race)."

## Applicability to This Project
Affected: No

Evidence:
- The shared UI modules are already fixed via the merge.
- pmdm-owned pages use the same synchronous idiom: `subscribe(...)` returning a token and synchronous `unsubscribe(token)` calls in cleanup paths (e.g. `src/ui/pages/pmdm/ConfigurationConsumableDetail.tsx:253,403,468`, `ConfigurationDataTypeDetail.tsx:392-455`), including the `import("@/ui/pubsub.ts").then((m) => m.unsubscribe(token))` form used by the shared pages themselves.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
