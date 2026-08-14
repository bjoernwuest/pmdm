# Downstream Plan: ARCH-005 — EntraID sync migrated to the autostart mechanism

## Upstream Change
Reference: `/report/Fix ARCH-005 - EntraID sync migrated to the autostart mechanism.md`. `src/main.ts` lost its explicit EntraID start call; EntraID sync startup now runs as an auto-discovered autostart task file (`src/autostart/entraid-sync.ts`) calling `startScheduler(db)` (signature changed under ARCH-003).

## Upstream's Own Assessment
"Yes — `src/main.ts` lost its explicit EntraID start call; derived projects that copied the explicit-call pattern should use the `src/autostart/` task-file pattern (documented in `design/autostart.md`). `startScheduler(db)`'s signature changed under ARCH-003 (same change set)."

## Applicability to This Project
Affected: No

Evidence:
- `src/main.ts` is byte-identical to upstream's fixed version — no explicit EntraID start call exists in this project.
- `src/autostart/entraid-sync.ts` is byte-identical to upstream's fixed version (diff against `bun-starter`: no differences); it calls `startScheduler(db)` with the injected `DBClient`.
- No pmdm-owned file calls `startScheduler` or starts EntraID sync explicitly (searched `src/`; the only `startScheduler` reference is the shared autostart task). `src/services/Notifications.ts:12` imports `getGraphClient`, whose export was unchanged.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
