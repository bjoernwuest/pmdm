# Downstream Plan: TS-002 — Non-null assertions replaced with guard-carrying constructs

## Upstream Change
Reference: `/report/Fix TS-002 - Non-null assertions replaced with guard-carrying constructs.md`. Internal code constructs in upstream files: non-null assertions replaced with guard-carrying constructs; genuinely-undefined paths now fail with descriptive errors instead of TypeErrors.

## Upstream's Own Assessment
"None — internal code constructs only; no exports or behavior contracts change. The genuinely-undefined paths now fail with descriptive errors instead of TypeErrors (both previously crashed)."

## Applicability to This Project
Affected: No

Evidence:
- The changed files are shared and already fixed via the merge; no exported symbol or contract changed.
- pmdm-owned files were not part of the fix's cited sites, and their own non-null-assertion usage is untouched by this upstream change (no compile or runtime coupling).

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
