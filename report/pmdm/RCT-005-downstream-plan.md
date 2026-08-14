# Downstream Plan: RCT-005 — Honest loading indicator; imperative handles via useImperativeHandle

## Upstream Change
Reference: `/report/Fix RCT-005 - Honest loading indicator; imperative handles via useImperativeHandle.md`. Component internals and the shell loading screen were corrected; imperative APIs unchanged.

## Upstream's Own Assessment
"None — component internals and the shell loading screen only; imperative APIs unchanged."

## Applicability to This Project
Affected: No

Evidence:
- The shared components (`InputField`/`Label`) and the app shell are already fixed via the merge; pmdm's `src/ui/app.tsx` carries its own indeterminate loading screen (a deliberate pmdm divergence) but consumes the unchanged imperative component APIs.
- No pmdm-owned component reimplements the cited imperative-handle mechanism in a conflicting way.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
