# Downstream Plan: SPEC-002 — Dead controls removed; dashboard content honest

## Upstream Change
Reference: `/report/Fix SPEC-002 - Dead controls removed; dashboard content honest.md`. Dead controls were removed and dashboard content replaced with honest content in the template Dashboard page. UI-internal; no API or route changes (dashboard route path unchanged).

## Upstream's Own Assessment
"None — UI-internal removals/replacement; no API or route changes (the dashboard's route path is unchanged)."

## Applicability to This Project
Affected: No

Evidence:
- `src/ui/pages/Dashboard.tsx` in this project is upstream's fixed version plus a single leading blank line (diff against `bun-starter` shows only that addition).
- No pmdm-owned code depends on the removed controls or the dashboard internals.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
