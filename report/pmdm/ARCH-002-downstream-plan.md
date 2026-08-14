# Downstream Plan: ARCH-002 — Central environment-variable module

## Upstream Change
Reference: `/report/Fix ARCH-002 - Central environment-variable module.md`. `src/services/Env.ts` became the single server-side env module (typed `Bun.env` accessors); `src/devmode.ts` became a pure re-export of `devMode`/`sqlLogging` from it; `src/main.ts`, `src/apps/setup.ts`, `src/api/RequestBundlingAPI.ts`, `src/services/DatabaseDriver.ts` now read accessors instead of ad-hoc `process.env` reads. Parse semantics unchanged.

## Upstream's Own Assessment
"None for the existing surface: `@/devmode.ts` still exports `devMode`/`sqlLogging` with identical values. New exports (`@/services/Env.ts`) are additive. No env var names, defaults, or parse semantics changed."

## Applicability to This Project
Affected: Yes

Evidence:
- `src/devmode.ts` is a pmdm-divergent file. It contains the upstream re-export line `export { devMode, sqlLogging } from "@/services/Env.ts";` PLUS two pmdm additions:
  1. `export const sqlLogging: boolean = process.env.SQL_LOGGING === "1";` — a duplicate export of `sqlLogging` (duplicate module export, a compile/module-evaluation error) and an ad-hoc `process.env` read that the central module already provides.
  2. `export const debugFrontend: boolean = process.env.DEBUG_FRONTEND === "1";` — an ad-hoc `process.env` read; project-wide search shows nothing imports `debugFrontend` from `@/devmode.ts` (the `debugFrontend` references in `src/ui/app.tsx` come from the `/api/me/context` payload, which never carries the field; client state is managed by `src/ui/debug.ts`).
- All other pre-fix `process.env`/`Bun.env` read sites in this tree are shared files already fixed by the merge (verified: only `src/devmode.ts` remains outside `src/services/Env.ts`).
- All `@/devmode.ts` importers (e.g. `src/services/DatabaseDriver.ts`, `src/repo/*.ts`, `src/main.ts`) only consume `devMode`/`sqlLogging`, which the re-export continues to provide with identical values.

## Target End State
`src/devmode.ts` is the pure upstream re-export of `devMode`/`sqlLogging` from `src/services/Env.ts` (byte-identical to upstream's fixed file); no ad-hoc `process.env` reads remain in any file outside `src/services/Env.ts`; all existing import sites keep working with identical values.

## Approach
Edit `src/devmode.ts` to remove the duplicate `sqlLogging` declaration and the unused `debugFrontend` declaration, leaving only the re-export (and its doc comment). Removing `debugFrontend` is behavior-neutral: nothing imports it, and the client-side `debugFrontend` state in `src/ui/app.tsx` is fed from `/api/me/context`, which does not (and did not) include the field.

## Affected Scope
- `src/devmode.ts`

## Anticipated Manual Follow-Up
None.

## Open Questions
None.
