# Downstream Plan: SPEC-007 — Dead code removed; strict numeric save validation

## Upstream Change
Reference: `/report/Fix SPEC-007 - Dead code removed; strict numeric save validation.md`. Internal cleanups in template config pages plus two behavior corrections (no phantom delete events; no partial numbers persisted).

## Upstream's Own Assessment
"None — internal cleanups plus the two behavior corrections (no phantom delete events; no partial numbers persisted)."

## Applicability to This Project
Affected: No

Evidence:
- The affected template pages (config pages) are shared and already fixed via the merge.
- pmdm's own config-style page (`src/ui/pages/pmdm/AdminNotifications.tsx`) implements its own numeric validation (`parseFloat` with NaN rejection before saving) and does not use the cleaned-up code paths.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
