# Downstream Plan: PATT-010 — Narrowly scoped PubSub subscriptions with payload identifiers

## Upstream Change
Reference: `/report/Fix PATT-010 - Narrowly scoped PubSub subscriptions with payload identifiers.md`. Subscriber-side narrowing in the shared UI; publish payloads already carry the identifiers (guaranteed by PATT-003).

## Upstream's Own Assessment
"None — subscriber-side narrowing only; publish payloads already carry the identifiers (guaranteed by PATT-003, implemented in the same change set)."

## Applicability to This Project
Affected: No

Evidence:
- The shared subscriber changes are merged.
- pmdm-owned pages already subscribe with narrow, identifier-scoped expressions: e.g. `subscribe({ and: [TAG_CONSUMABLE, id, { or: [TAG_UPDATE, TAG_DISABLE] }] }, ...)` in `src/ui/pages/pmdm/ConfigurationConsumableDetail.tsx:253` — the target end state of this fix, not the pre-fix broad form.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
