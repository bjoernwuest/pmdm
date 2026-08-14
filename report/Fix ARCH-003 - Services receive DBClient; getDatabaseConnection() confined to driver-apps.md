# Fix ARCH-003 - Services receive DBClient; getDatabaseConnection() confined to driver/apps

## Source
- Finding: ARCH-003 (see /report/01-architecture-structure.md)
- Fix definition: /report/ARCH-003-fix-definition.md

## Summary of Change
`getDatabaseConnection()` is now imported/called only inside `src/services/DatabaseDriver.ts` itself and in entry-point/app code (`src/main.ts`, `src/apps/setup.ts`). `EntraIDSync.startScheduler(db)` accepts a `DBClient` and all internal helpers (config seeding/reads, `runInTransaction` calls, cron callback, login-time PubSub subscription) close over it. `AuditLog` captures the `db` passed to `startAuditLog(db)` in module state and `flushBatch` uses it. `Auth.getFunctionalPermissionGrant(db)` now requires the parameter (the `db ? db : getDatabaseConnection()` fallback is gone). `Setup.getSetupDemand(db)`/`getMissingConfigParameters(db)` receive the client from `src/apps/setup.ts`, which already holds a connection. `FunctionalPermissions.ts` no longer self-registers at import time: it exports the `FP_*` constants (with `identifier`/`createdAt`/`updatedAt` populated at registration) plus `registerFunctionalPermissions(db)`, which registers built-in and application-defined permissions; `ApplicationDefinedFunctionalPermissions.ts` now exports a `functionalPermissionDefinitions` array (the downstream extension point). `src/main.ts` creates the `DBClient` after `initDatabase()`, registers permissions explicitly, and passes the client to the EntraID sync start.

## Files Changed
- `src/services/EntraIDSync.ts` — `startScheduler(db)`; all internal DB access uses the parameter
- `src/services/AuditLog.ts` — `activeDb` captured from `startAuditLog(db)`; `flushBatch` uses it
- `src/services/Auth.ts` — `getFunctionalPermissionGrant(db)` parameter made mandatory
- `src/services/Setup.ts` — `getSetupDemand(db)`/`getMissingConfigParameters(db)` take a `DBClient`
- `src/services/auth/FunctionalPermissions.ts` — explicit `registerFunctionalPermissions(db)` startup step; no import-time DB access
- `src/services/auth/ApplicationDefinedFunctionalPermissions.ts` — `functionalPermissionDefinitions` extension-point export (dead imports removed)
- `src/apps/setup.ts` — obtains its connection first and passes it to `getSetupDemand`
- `src/main.ts` — creates `dbClient` early, calls `registerFunctionalPermissions(dbClient)`, passes `dbClient` to `startEntraIDSync`

## Post-Fix Correction

The shipped implementation typed the `FP_*` constants as `FunctionalPermissionInsertType`, breaking the contract promised below: `InsertType` is not assignable to `FunctionalPermissionSelectType` (its `identifier`/`createdAt`/`updatedAt` are optional), which produced 23 `TS2322`/`TS2345` errors in `src/api/*` where `requirePermissions(db, claims, [FP_X])` and `FP_X.identifier` comparisons expect the select type. The corrected pattern (applied to `src/services/auth/FunctionalPermissions.ts`): each `FP_*` is an `export const` typed `FunctionalPermissionSelectType` whose `identifier`/`createdAt`/`updatedAt` start as empty-string placeholders (one shared `registrationPlaceholders` spread); `registerFunctionalPermissions(db)` strips the placeholders before the INSERT (the database remains the sole producer of these values) and merges the registered `.returning()` row onto the const via `Object.assign`. Do not bridge the two phases with `as`/`satisfies` casts (violates TS-001), `Insert | Select` unions (not assignable to `Select`), or by widening `requirePermissions` to accept the insert type (violates TS-001).

## Breaking Changes for Downstream Consumers
Yes — exported signature changes: `startScheduler(db)` (new mandatory parameter), `getFunctionalPermissionGrant(db)` (parameter now mandatory), `getSetupDemand(db)`/`getMissingConfigParameters(db)` (new parameter), new `registerFunctionalPermissions(db)` entry point. The `FP_*` constants keep their shape (`identifier`, `functionalPermissionName`, `group`, `description`, `createdAt`, `updatedAt`) as `const`-bound `FunctionalPermissionSelectType` exports: `identifier`/`createdAt`/`updatedAt` are empty-string placeholders until `registerFunctionalPermissions()` overwrites them with the registered row; the placeholders are stripped before the INSERT so DB-generated values are never overridden. Callers in `src/main.ts` and `src/apps/setup.ts` were adjusted; `src/autostart/audit-log.ts`'s signature was already compatible.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- CPLX-004 (hidden global singletons generally) — related but separate; this fix removed only the `getDatabaseConnection()` coupling.
- ARCH-007 (side-effect import ordering) — this fix removed the functional-permission import-time DB mutation, but the general mechanism is ARCH-007's scope (unchecked).
- ARCH-004 (server/repo importing from `src/ui/*`) — the `FunctionalPermissionNames` import from `@/ui/auth/functional_permissions.ts` was not touched here.

## Resolved Questions
None.
