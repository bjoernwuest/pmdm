# Fix Definition: ARCH-003 — Services call `getDatabaseConnection()` despite explicit prohibition

## Source Finding
01-architecture-structure.md — `src/services/EntraIDSync.ts:225,232,252,261,262,289`; `src/services/AuditLog.ts:70`; `src/services/Auth.ts:707`; `src/services/Setup.ts:95`; `src/services/auth/FunctionalPermissions.ts:9-45` (every export); `src/services/auth/ApplicationDefinedFunctionalPermissions.ts:6`

## Human Directive
None — default interpretation applies.

## Target End State
After the fix, `getDatabaseConnection()` is imported and called only inside `src/services/DatabaseDriver.ts` itself (and in entry-point/app-composition code such as `src/main.ts`, which is outside the services rule). Specifically:

- `src/services/EntraIDSync.ts` — `startScheduler` and all internal helpers use a `DBClient` received as a parameter (supplied once by the caller at startup), including the cron callback and the login-time PubSub subscription callback.
- `src/services/AuditLog.ts` — `flushBatch()` uses the `DBClient` captured by `startAuditLog(db)`; no direct `getDatabaseConnection()` call remains.
- `src/services/Auth.ts` — `getFunctionalPermissionGrant(db)` requires a `DBClient` parameter; the `db ? db : getDatabaseConnection()` fallback is removed and the parameter is no longer optional.
- `src/services/Setup.ts` — setup-demand evaluation uses a `DBClient` passed in by its caller (`src/apps/setup.ts`, which already holds a connection).
- `src/services/auth/FunctionalPermissions.ts` and `ApplicationDefinedFunctionalPermissions.ts` — permission-registration functions take a `DBClient` parameter; the top-level-await self-registration against the global connection is replaced by an explicit registration step invoked at startup with the connection from `src/main.ts`.

The contract of the `FP_*` exports consumed by route files (`identifier`, `functionalPermissionName`, `group`, etc.) remains intact so permission checks in `src/api/*` keep working; consumers needing the full registered DB rows go through the startup registration result rather than import-time side effects. Concretely: each `FP_*` export is an `export const` typed `FunctionalPermissionSelectType`; its `identifier`/`createdAt`/`updatedAt` are initialized to empty-string placeholders at definition time and overwritten with the DB-generated values by the startup registration. The registration strips the placeholder fields before the INSERT (the database remains the sole producer of `identifier`/`createdAt`/`updatedAt`) and merges the registered row onto the const. The `src/services/AGENTS.md` rule "Don't call `getDatabaseConnection()` in services" becomes true without exception-list edits.

## Approach
Thread the `DBClient` through instead of reaching for the global:

- EntraIDSync: change `startScheduler()` to accept `db: DBClient`; the caller in `src/main.ts` already has the connection. All inner uses (config reads, `runInTransaction`, the PubSub login handler) close over that parameter.
- AuditLog: capture the `db` passed to `startAuditLog` in module state alongside the existing `batch`/`flushTimer` state and use it in `flushBatch`.
- Auth: make `db` non-optional in `getFunctionalPermissionGrant` and update internal callers (`Auth.ts:761` and any others) to pass their existing client.
- Setup: `getSetupDemand`/`getMissingConfigParameters` receive the connection already available in `src/apps/setup.ts` (`setup.ts:100`).
- FunctionalPermissions: convert the module from import-time self-registration into explicit definition constants plus a `registerFunctionalPermissions(db)` startup function (also covering `ApplicationDefinedFunctionalPermissions.ts`, which today registers nothing but imports the global connection). The `FP_*` constants stay `export const` bindings typed `FunctionalPermissionSelectType`: their DB-generated fields (`identifier`, `createdAt`, `updatedAt`) are empty-string placeholders at definition time; the registration function inserts a copy containing only `functionalPermissionName`/`description`/`group` (never the placeholders) and merges the upsert's `.returning()` row back onto the const with `Object.assign`. The startup call is sequenced in `src/main.ts` where the `await import(...)` side-effect currently sits, preserving ordering guarantees. This simultaneously resolves the import-time DB-mutation side effect noted in ARCH-007 for this module, without claiming ARCH-007's scope.

## Affected Scope
- `src/services/EntraIDSync.ts`
- `src/services/AuditLog.ts`
- `src/services/Auth.ts`
- `src/services/Setup.ts`
- `src/services/auth/FunctionalPermissions.ts`
- `src/services/auth/ApplicationDefinedFunctionalPermissions.ts`
- Callers updated accordingly: `src/main.ts` (EntraIDSync start, FP registration), `src/apps/setup.ts` (setup-demand call), `src/autostart/audit-log.ts` (signature unchanged, verify), any route/service calling `getFunctionalPermissionGrant`

## Explicit Constraints
- No behavior change: same registrations, same sync scheduling semantics, same audit batching behavior, same setup-demand detection.
- The startup ordering guarantees of `main.ts` (permissions registered before apps mount; EntraID `groupsReady` awaited) must be preserved.
- `FP_*` exports must remain synchronously importable `export const` bindings typed `FunctionalPermissionSelectType` for `src/api/*` permission checks (identifier/name/group fields), per the import rules in `src/api/AGENTS.md`. The Insert→Select bridge must not use `as`/`satisfies` casts or `Insert | Select` unions (TS-001); use empty-string placeholder fields overwritten at registration.
- The placeholder `identifier`/`createdAt`/`updatedAt` values must be stripped before the INSERT so the database always assigns the real values; application-defined `functionalPermissionDefinitions` entries remain `FunctionalPermissionInsertType` and are registered as-is.

## Out of Scope
- CPLX-004 (hidden global singletons generally) — related but handled separately; this fix removes only the `getDatabaseConnection()` coupling.
- ARCH-007 (side-effect import ordering) — this fix removes one specific import-time side effect but does not address the general mechanism.
- ARCH-004 (server/repo importing from `src/ui/*`) — the `FunctionalPermissionNames` import from `@/ui/auth/functional_permissions.ts` is not touched here.

## Downstream Impact
Yes — exported signatures change (`startScheduler(db)`, `getFunctionalPermissionGrant(db)` mandatory parameter, new FP registration entry point); callers in `src/main.ts`, `src/apps/setup.ts`, and `src/autostart/` must be adjusted.
