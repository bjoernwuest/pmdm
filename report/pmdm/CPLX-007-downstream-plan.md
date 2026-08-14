# Downstream Plan: CPLX-007 — Single formatter registry

## Upstream Change
Reference: `/report/Fix CPLX-007 - Single formatter registry.md`. A template page stopped maintaining its own formatter registry and uses the shared registry export instead. Page-internal change.

## Upstream's Own Assessment
"None — page-internal change; the shared registry export already existed."

## Applicability to This Project
Affected: No

Evidence:
- The shared registry lives in the merged `src/ui/components/InputField.tsx:20-24`; the affected template page is shared and already fixed via the merge.
- Project-wide search of pmdm-owned pages/components (`src/ui/pages/pmdm/*`, `src/ui/components/*`): no pmdm file defines or registers a second formatter registry.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
