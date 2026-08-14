# Fix ARCH-005 - EntraID sync migrated to the autostart mechanism

## Source
- Finding: ARCH-005 (see /report/01-architecture-structure.md)
- Fix definition: /report/ARCH-005-fix-definition.md

## Summary of Change
EntraID sync now starts through the autostart directory scan: new `src/autostart/entraid-sync.ts` delegates to `startScheduler(db)` and waits inside `start()` for the returned `groupsReady` promise, so the group-sync-before-requests ordering guarantee is preserved; a failed start rejects and the auto-discovery loop logs the warning and continues, matching the previous "continuing without it" semantics. `src/main.ts` no longer imports or starts EntraID sync explicitly. `design/autostart.md` was updated: the startup diagram no longer lists the explicit call (the blocking behavior is shown under the autostart scan), the relationship table lists EntraID sync as auto-scanned with its blocking note, `entraid-sync.ts` was added to the Current Autostart Tasks table, and the scan-mechanism sentence now says `Bun.Glob` (matching the implementation).

## Files Changed
- `src/autostart/entraid-sync.ts` — new thin-launcher task blocking on `groupsReady`
- `src/main.ts` — explicit EntraID import and start block removed
- `design/autostart.md` — diagram, relationship table, current-tasks table, and scan-mechanism description updated

## Breaking Changes for Downstream Consumers
Yes — `src/main.ts` lost its explicit EntraID start call; derived projects that copied the explicit-call pattern should use the `src/autostart/` task-file pattern (documented in `design/autostart.md`). `startScheduler(db)`'s signature changed under ARCH-003 (same change set).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- ARCH-003's `getDatabaseConnection()` removal inside `EntraIDSync.ts` — separate fix definition, implemented first in the same change set; this task file already passes `db` into `start(db)`.
- ARCH-007 (general side-effect-import-ordering concern) — unchecked.
- DOC-001 (stale `design/configuration.md`) — separate, unchecked.
- Root `AGENTS.md` `src/autostart/` description — verified still accurate.

## Resolved Questions
None.
