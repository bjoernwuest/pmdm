# Downstream Fix CFG-001 - Env-var surface documented; single advisory-lock default

## Source
- Upstream fix: `/report/Fix CFG-001 - Env-var surface documented; single advisory-lock default.md`
- Downstream plan: /report/pmdm/CFG-001-downstream-plan.md

## Summary of Change
Corrected this project's `README.md` environment-variable section: `ADVISORY_LOCK` is now documented as optional with the application default (`-7482650123549836421`, single-sourced from `src/services/Env.ts`) used when unset. Previously the pmdm README marked it as required, which is no longer accurate after the merged central env module.

## Files Changed
- `README.md` — `ADVISORY_LOCK` line updated from "(required)" to "(optional; when unset, the application default `-7482650123549836421` from `src/services/Env.ts` is used)"

## Required Manual Follow-Up
None.

## Verification Notes
Confirmed the merged `src/services/Env.ts` carries `defaultAdvisoryLockId = -7482650123549836421n` and `advisoryLockId` with the same fallback semantics; confirmed `.env` keeps an explicit `ADVISORY_LOCK` value, which remains fully supported; no code references the README text.
