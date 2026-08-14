# Downstream Plan: RCT-006 — Save-change handlers read latest groups via a ref mirror

## Upstream Change
Reference: `/report/Fix RCT-006 - Save-change handlers read latest groups via a ref mirror.md`. A template admin page's save handler reads the latest groups via a ref mirror, eliminating the stale-read window. Page-internal state access pattern only.

## Upstream's Own Assessment
"None — page-internal state access pattern only; the stale-read window is eliminated."

## Applicability to This Project
Affected: No

Evidence:
- The affected template page (group-detail save flow) is shared and already fixed via the merge.
- No pmdm-owned page implements that save flow pattern.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
