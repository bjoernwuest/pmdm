# Downstream Plan: CPLX-010 — One reaction per config event in AdminConfigList

## Upstream Change
Reference: `/report/Fix CPLX-010 - One reaction per config event in AdminConfigList.md`. The template `AdminConfigList` page's subscription wiring was reduced to one reaction per config event (live value updates and editing-row protection preserved). Page-internal subscription wiring only.

## Upstream's Own Assessment
"None — page-internal subscription wiring only; live value updates and editing-row protection are preserved."

## Applicability to This Project
Affected: No

Evidence:
- `AdminConfigList.tsx` is shared and already fixed via the merge.
- No pmdm-owned page duplicates this config-list subscription wiring (pmdm's own config-style page, `src/ui/pages/pmdm/AdminNotifications.tsx`, reloads on 409 and does not subscribe to config PubSub events).

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
