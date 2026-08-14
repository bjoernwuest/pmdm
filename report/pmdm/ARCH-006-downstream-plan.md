# Downstream Plan: ARCH-006 — Setup server port released before main app binds

## Upstream Change
Reference: `/report/Fix ARCH-006 - Setup server port released before main app binds.md`. Internal startup sequencing in `src/apps/setup.ts` (setup server's port released before the main app binds) plus an HTML attribute change; no exports, API shapes, or configuration changes.

## Upstream's Own Assessment
"None — internal startup sequencing and an HTML attribute only; no exports, API shapes, or configuration change."

## Applicability to This Project
Affected: No

Evidence:
- `src/apps/setup.ts` is byte-identical to upstream's fixed version (diff against `bun-starter`: no differences).
- The setup wizard client assets under `src/setup/` are shared and unmodified here.
- No pmdm-owned code interacts with the setup server startup sequencing or its HTML attributes.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
