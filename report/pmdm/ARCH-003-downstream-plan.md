# Downstream Plan: ARCH-003 — Services receive DBClient; getDatabaseConnection() confined to driver-apps

## Upstream Change
Reference: `/report/Fix ARCH-003 - Services receive DBClient; getDatabaseConnection() confined to driver-apps.md`. Services must receive a `DBClient` parameter instead of calling `getDatabaseConnection()`; functional-permission registration moved from import-time self-registration against the global connection to the startup entry point `registerFunctionalPermissions(db)` (called from `src/main.ts`), with `FP_*` constants becoming placeholder `FunctionalPermissionSelectType` exports that get overwritten with registered rows at startup. Signature changes: `startScheduler(db)`, `getFunctionalPermissionGrant(db)` (mandatory), `getSetupDemand(db)`/`getMissingConfigParameters(db)`.

## Upstream's Own Assessment
"Yes — exported signature changes: `startScheduler(db)` (new mandatory parameter), `getFunctionalPermissionGrant(db)` (parameter now mandatory), `getSetupDemand(db)`/`getMissingConfigParameters(db)` (new parameter), new `registerFunctionalPermissions(db)` entry point. The `FP_*` constants keep their shape (`identifier`, `functionalPermissionName`, `group`, `description`, `createdAt`, `updatedAt`) as `const`-bound `FunctionalPermissionSelectType` exports: `identifier`/`createdAt`/`updatedAt` are empty-string placeholders until `registerFunctionalPermissions()` overwrites them with the registered row; the placeholders are stripped before the INSERT so DB-generated values are never overridden. Callers in `src/main.ts` and `src/apps/setup.ts` were adjusted; `src/autostart/audit-log.ts`'s signature was already compatible."

## Applicability to This Project
Affected: Yes

Evidence:
- `src/services/auth/ApplicationDefinedFunctionalPermissions.ts` (pmdm-divergent) still uses the pre-fix model: 25 `export const FP_X = await registerFunctionalPermission(getDatabaseConnection(), ...)` import-time registrations, and it references `FunctionalPermissionNames`, `registerFunctionalPermission`, `getDatabaseConnection` without importing any of them. It also exports the new-style `functionalPermissionDefinitions = []` while simultaneously using the old pattern — a broken half-merge state.
- The shared `src/services/auth/FunctionalPermissions.ts` (byte-identical to upstream) does NOT export the domain `FP_*` constants, yet all pmdm route files import them from it (e.g. `src/api/BusinessDomainsAPI.ts:2`, `src/api/ProductAPI.ts:4-11`) — the import surface cannot resolve.
- `src/services/ScriptLog.ts:41` — `const db = client ?? await getDatabaseConnection();` (service-side global-connection fallback).
- `src/services/Notifications.ts:488` — `void sendDigest(getDatabaseConnection());` inside the cron callback of `init(db)`.
- Shared fixed call sites are already present via the merge: `src/main.ts:21-22` calls `registerFunctionalPermissions(dbClient)`, `src/apps/setup.ts`/`src/autostart/entraid-sync.ts` pass `db`. No pmdm-owned call site uses `getFunctionalPermissionGrant`/`getSetupDemand`/`getMissingConfigParameters`/`startScheduler` (verified by search).

## Target End State
The pmdm app-defined permissions follow the new registration model: `FP_*` constants are placeholder `FunctionalPermissionSelectType` exports populated with the registered rows at startup (before the server listens); no import-time DB mutation, no `getDatabaseConnection()` call outside driver-apps (`src/main.ts`, `src/apps/setup.ts`, `src/services/DatabaseDriver.ts`); all pmdm route files import their domain `FP_*` from the app-defined module; services `ScriptLog.ts`/`Notifications.ts` use the injected `db`.

## Approach
1. Rewrite `src/services/auth/ApplicationDefinedFunctionalPermissions.ts`:
   - Import `FunctionalPermissionNames` from `@/ui/auth/app_functional_permissions.ts` (server importing `@/ui/*` shared constants is allowed).
   - Define each `FP_*` as a `FunctionalPermissionSelectType` object (name/description/group + inline `identifier`/`createdAt`/`updatedAt` empty-string placeholders — inline to avoid a circular import with the shared `FunctionalPermissions.ts`).
   - Export `functionalPermissionDefinitions: FunctionalPermissionInsertType[]` built from the constants via map (`{ functionalPermissionName, description, group }` only, so the shared startup loop's INSERT never receives placeholder fields), and export the constants array for the assign step.
2. Add `src/autostart/app-functional-permissions.ts` (pmdm-owned, auto-discovered): `start(db)` upserts each app permission via the shared repo `registerFunctionalPermission` and `Object.assign`s the registered row into the exported `FP_*` constant object. Autostart tasks run before `app.listen()` (see `src/main.ts`), so identifiers are populated before any request is served.
3. Redirect the 12 pmdm-owned route files (`BusinessDomainsAPI.ts`, `TargetSystemsAPI.ts`, `DataTypesAPI.ts`, `ProductTypesAPI.ts`, `ConsumablesAPI.ts`, `LookupsAPI.ts`, `ProductAPI.ts`, `ProductRequestAPI.ts`, `ProductExportAPI.ts`, `NotificationsAPI.ts`, `ScriptApi.ts`, `ScriptLogAPI.ts`) to import their domain `FP_*` from `@/services/auth/ApplicationDefinedFunctionalPermissions.ts`. Files importing only built-in `FP_*` from the shared module stay unchanged.
4. `src/services/ScriptLog.ts`: `init(db: DBClient)` — drop the `client ?? getDatabaseConnection()` fallback (both callers pass `db`).
5. `src/services/Notifications.ts`: cron callback uses the `db` parameter of `init(db)` instead of `getDatabaseConnection()`.

## Affected Scope
- `src/services/auth/ApplicationDefinedFunctionalPermissions.ts`
- `src/autostart/app-functional-permissions.ts` (new)
- `src/api/BusinessDomainsAPI.ts`, `ConsumablesAPI.ts`, `DataTypesAPI.ts`, `LookupsAPI.ts`, `NotificationsAPI.ts`, `ProductAPI.ts`, `ProductExportAPI.ts`, `ProductRequestAPI.ts`, `ProductTypesAPI.ts`, `ScriptApi.ts`, `ScriptLogAPI.ts`, `TargetSystemsAPI.ts`
- `src/services/ScriptLog.ts`, `src/services/Notifications.ts`

## Anticipated Manual Follow-Up
None.

## Open Questions
None.
