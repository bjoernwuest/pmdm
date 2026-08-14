# Downstream Fix ARCH-002 - Central environment-variable module

## Source
- Upstream fix: `/report/Fix ARCH-002 - Central environment-variable module.md`
- Downstream plan: /report/pmdm/ARCH-002-downstream-plan.md

## Summary of Change
Restored `src/devmode.ts` to the upstream fixed state (pure re-export of `devMode`/`sqlLogging` from `src/services/Env.ts`). Removed the pmdm-added duplicate `export const sqlLogging` (which duplicated the re-exported name and read `process.env` directly) and the unused `export const debugFrontend` (nothing imports it; the client-side `debugFrontend` state in `src/ui/app.tsx` is fed from `/api/me/context` and was never populated from this export). The file is now byte-identical to upstream's.

## Files Changed
- `src/devmode.ts` — removed duplicate `sqlLogging` declaration and unused `debugFrontend` declaration; kept the `Env.ts` re-export

## Required Manual Follow-Up
None.

## Verification Notes
Confirmed via project-wide search that no file outside `src/services/Env.ts` reads `process.env`/`Bun.env` anymore, that no importer references `debugFrontend` from `@/devmode.ts`, and that all `@/devmode.ts` importers consume only `devMode`/`sqlLogging` (unchanged values). `diff` against upstream's `src/devmode.ts` shows no differences.
