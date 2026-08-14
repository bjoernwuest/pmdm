# Downstream Plan: TS-001 — Unsafe casts replaced with typed constructs

## Upstream Change
Reference: `/report/Fix TS-001 - Unsafe casts replaced with typed constructs.md`. Unsafe casts in upstream files were replaced with typed constructs; `AuditEntry.payload`'s TS type changed from `Record<string, any>` to `Record<string, unknown>` (consumers reading payload fields must narrow).

## Upstream's Own Assessment
"None for the wire: no API shape change — only honest typing of the existing contracts. `AuditEntry.payload`'s TS type changed from `Record<string, any>` to `Record<string, unknown>`; consumers reading fields from the payload must narrow (e.g. `typeof`) before use."

## Applicability to This Project
Affected: No

Evidence:
- The changed files are shared and already fixed via the merge.
- Project-wide search: no pmdm-owned file consumes `AuditEntry.payload` fields (the only payload consumers are the shared audit-log UI/API files), so the `Record<string, unknown>` narrowing requirement has no pmdm call sites.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
