# Fix ARCH-008 - Real DBClient injected via app factories, no placeholder casts

## Source
- Finding: ARCH-008 (see /report/01-architecture-structure.md)
- Fix definition: /report/ARCH-008-fix-definition.md

## Summary of Change
Replaced the placeholder-decorate pattern with explicit factory injection: `src/apps/api.ts` now exports `createApiApp(dbClient)` (async; returns the fully-wired instance and re-exports `ApiInstance` as its awaited return type), `src/apps/login.ts` exports `createLoginApp(dbClient)`, and `src/apps/ui.ts` exports `createUiApp(dbClient)`. Each factory decorates the real `DBClient` on its instance; the `{} as DBClient` casts are gone, and constructing an app without a client is a compile-time error. `src/main.ts` removed the `injectDb` global-derive helper and mounts the three apps via their factories with the `DBClient` created there. The api route autoloader, swagger/llms.txt wiring, and the login routes moved inside their factories so the decorated client is in scope. `src/api/AGENTS.md`'s Context Extension section and `src/apps/AGENTS.md` now describe the factory mechanism.

## Files Changed
- `src/apps/api.ts` — converted to `createApiApp(dbClient)` factory; auth derive closes over the parameter; `ApiInstance = Awaited<ReturnType<typeof createApiApp>>`
- `src/apps/login.ts` — converted to `createLoginApp(dbClient)` factory; routes moved inside
- `src/apps/ui.ts` — converted to `createUiApp(dbClient)` factory; routes moved inside
- `src/main.ts` — `injectDb` derive helper removed; apps mounted via factories with the real `DBClient`
- `src/api/AGENTS.md` — Context Extension section documents the factory injection
- `src/apps/AGENTS.md` — file list updated; DB-injection guidance added

## Breaking Changes for Downstream Consumers
Yes — app module export shapes changed: `app` exports are gone; consumers now call `createApiApp(dbClient)` / `createLoginApp(dbClient)` / `createUiApp(dbClient)` (the api factory is async). `src/main.ts` composition code was updated accordingly. The `ApiInstance` type export remains and route files type-check unchanged.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- TS-001 (unsafe casts generally) — related; only the `dbClient` placeholder casts were removed here.
- ARCH-003 (services calling `getDatabaseConnection()`) — separate fix definition.
- Setup app (`src/apps/setup.ts`) — it already obtains its own connection directly and did not use the placeholder pattern.

## Resolved Questions
None.
