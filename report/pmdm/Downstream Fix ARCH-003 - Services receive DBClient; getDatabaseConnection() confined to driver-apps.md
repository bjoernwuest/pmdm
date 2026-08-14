# Downstream Fix ARCH-003 - Services receive DBClient; getDatabaseConnection() confined to driver-apps

## Source
- Upstream fix: `/report/Fix ARCH-003 - Services receive DBClient; getDatabaseConnection() confined to driver-apps.md`
- Downstream plan: /report/pmdm/ARCH-003-downstream-plan.md

## Summary of Change
Migrated the pmdm app-defined functional permissions onto the upstream registration model and removed the remaining service-side `getDatabaseConnection()` calls. `src/services/auth/ApplicationDefinedFunctionalPermissions.ts` was rewritten: the 25 `FP_*` constants are now placeholder `FunctionalPermissionSelectType` exports (empty-string `identifier`/`createdAt`/`updatedAt`), `functionalPermissionDefinitions` carries pure insert-type objects for the shared startup loop (placeholders stripped), and import-time self-registration against the global connection is gone. A new autostart task (`src/autostart/app-functional-permissions.ts`) upserts the definitions and assigns the registered rows into the exported constants before the server listens. The 12 pmdm-owned route files now import their domain `FP_*` from the app-defined module. `ScriptLog.init` requires `db` (fallback removed) and the `Notifications` cron uses the injected `db`.

## Files Changed
- `src/services/auth/ApplicationDefinedFunctionalPermissions.ts` — rewritten: placeholder `FP_*` constants, `applicationFunctionalPermissions` array, pure-insert `functionalPermissionDefinitions`, no import-time DB access
- `src/autostart/app-functional-permissions.ts` — new autostart task: `start(db)` upserts each app permission and `Object.assign`s the registered row into the exported constant
- `src/api/BusinessDomainsAPI.ts`, `ConsumablesAPI.ts`, `DataTypesAPI.ts`, `LookupsAPI.ts`, `NotificationsAPI.ts`, `ProductAPI.ts`, `ProductExportAPI.ts`, `ProductRequestAPI.ts`, `ProductTypesAPI.ts`, `ScriptApi.ts`, `ScriptLogAPI.ts`, `TargetSystemsAPI.ts` — domain `FP_*` imports redirected from `@/services/auth/FunctionalPermissions.ts` to `@/services/auth/ApplicationDefinedFunctionalPermissions.ts`
- `src/services/ScriptLog.ts` — `init(db: DBClient)`; `getDatabaseConnection()` fallback removed; unused import dropped
- `src/services/Notifications.ts` — cron digest callback uses the injected `db`; unused `getDatabaseConnection` import dropped

## Required Manual Follow-Up
None.

## Verification Notes
Confirmed via project-wide search that `getDatabaseConnection()` is now only referenced in driver-apps (`src/main.ts`, `src/apps/setup.ts`, `src/services/DatabaseDriver.ts`) and a doc comment; that all remaining `@/services/auth/FunctionalPermissions.ts` imports in route files are built-in permissions the shared module exports; that the UI side already resolves domain `FP_*` via the shared file's `export * from "./app_functional_permissions.ts"`; that the autostart contract (`start(db)`) matches `src/autostart/AGENTS.md`; that shared startup call sites (`src/main.ts`, `src/apps/setup.ts`, `src/autostart/entraid-sync.ts`) already use the new `db`-passing signatures.
