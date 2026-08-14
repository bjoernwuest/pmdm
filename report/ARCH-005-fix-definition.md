# Fix Definition: ARCH-005 — Two bootstrap mechanisms coexist; EntraID sync not migrated to autostart

## Source Finding
01-architecture-structure.md — `src/main.ts:4,25-29` (explicit `startEntraIDSync` import/call) vs. `src/main.ts:54-72` (autostart directory scan); acknowledged in `design/autostart.md:29,170`

## Human Directive
None — default interpretation applies.

## Target End State
The autostart directory-scan mechanism is the single bootstrap path for startup tasks. EntraID sync starts through an `src/autostart/` task file delegating to `src/services/EntraIDSync.ts`, like `audit-log.ts` does for the audit log. `src/main.ts` contains no explicit EntraID import or start call. The one ordering property the explicit path provides today — group sync completing before the server accepts requests (`await syncState.groupsReady`) — is preserved: the autostart task blocks inside its `start()` until the initial group sync is done, which the autostart contract explicitly permits ("If a task needs to block startup, it should wait inside `start()` before resolving"). `design/autostart.md` no longer describes EntraID sync as "not yet migrated".

## Approach
- Create `src/autostart/entraid-sync.ts` following the `audit-log.ts` thin-launcher pattern: import `startScheduler` from `src/services/EntraIDSync.ts`, and inside `start(db)` call it, await the returned `groupsReady` promise, and let failures reject so the existing per-task try/catch in `main.ts` logs the warning and continues — matching the current "continuing without it" semantics of `main.ts:29`.
- Remove the explicit import (`main.ts:4`) and the explicit try/catch start block (`main.ts:25-29`) from `src/main.ts`.
- Update `design/autostart.md`: the startup diagram (line 29) and the "Relationship to Other Startup Code" table (line 170) no longer list EntraID sync as an explicit, unmigrated element; it appears in the "Current Autostart Tasks" table instead.
- This composes with ARCH-003: the autostart contract passes `db` into `start(db)`, which is exactly the parameter `startScheduler` needs once ARCH-003 lands. If implemented independently, the task file calls `startScheduler()` in its current signature; the `db` parameter adoption is ARCH-003's scope.

## Affected Scope
- New `src/autostart/entraid-sync.ts`
- `src/main.ts` — remove explicit import and start block
- `design/autostart.md` — diagram, relationship table, current-tasks table
- Root `AGENTS.md` `src/autostart/` description remains accurate (verify)

## Explicit Constraints
- Startup-blocking semantics for the initial group sync must be preserved (the login-permissions race the current code avoids must not be reintroduced).
- Failure semantics must be preserved: a failed EntraID sync start logs a warning and the server still starts.
- No change to `EntraIDSync.ts` sync logic itself beyond what ARCH-003 specifies.

## Out of Scope
- ARCH-003's `getDatabaseConnection()` removal inside `EntraIDSync.ts` (separate fix definition, though the two compose naturally).
- ARCH-007's general side-effect-import-ordering concern.
- DOC-001 (stale `design/configuration.md`), listed as related — handled under its own ID.

## Downstream Impact
Yes — `src/main.ts` loses its EntraID import; `design/autostart.md` content changes; derived projects that copied the explicit-call pattern need the new task-file pattern documented.
