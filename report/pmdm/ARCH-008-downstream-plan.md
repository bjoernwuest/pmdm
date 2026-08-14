# Downstream Plan: ARCH-008 — Real DBClient injected via app factories, no placeholder casts

## Upstream Change
Reference: `/report/Fix ARCH-008 - Real DBClient injected via app factories, no placeholder casts.md`. App module export shapes changed: the `app` exports are gone; consumers call `createApiApp(dbClient)` (async) / `createLoginApp(dbClient)` / `createUiApp(dbClient)`. `src/main.ts` composition code was updated; `ApiInstance` type export remains.

## Upstream's Own Assessment
"Yes — app module export shapes changed: `app` exports are gone; consumers now call `createApiApp(dbClient)` / `createLoginApp(dbClient)` / `createUiApp(dbClient)` (the api factory is async). `src/main.ts` composition code was updated accordingly. The `ApiInstance` type export remains and route files type-check unchanged."

## Applicability to This Project
Affected: No

Evidence:
- `src/main.ts` is byte-identical to upstream's fixed version and uses the factory calls (`createLoginApp(dbClient)`, `createApiApp(dbClient)`, `createUiApp(dbClient)` at lines 61-65).
- Project-wide search: no pmdm-owned file imports the removed `app` exports from `@/apps/*`; route files import only the unchanged `ApiInstance` type (`import type { ApiInstance } from "@/apps/api.ts"`).
- No pmdm-owned module composes apps outside `src/main.ts`.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
