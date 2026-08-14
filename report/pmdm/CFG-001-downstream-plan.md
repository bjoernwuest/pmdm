# Downstream Plan: CFG-001 — Env-var surface documented; single advisory-lock default

## Upstream Change
Reference: `/report/Fix CFG-001 - Env-var surface documented; single advisory-lock default.md`. The env-var surface was documented in the root docs (README.md/AGENTS.md) and the `ADVISORY_LOCK` default became single-sourced from code (`defaultAdvisoryLockId` in `src/services/Env.ts`, default `-7482650123549836421`) instead of being duplicated; explicit `ADVISORY_LOCK` values remain fully supported. No variable renamed, no default changed, no new required variable.

## Upstream's Own Assessment
"None. No variable renamed, no default changed, no new required variable. The advisory-lock default is now sourced from code (`Env.ts`) instead of being duplicated; behavior is identical when `ADVISORY_LOCK` is unset."

## Applicability to This Project
Affected: Yes (documentation accuracy in a pmdm-owned file)

Evidence:
- This project's `README.md` (pmdm-rewritten, diverges from upstream) still states at line 92: "`ADVISORY_LOCK` — PostgreSQL advisory lock ID for migrations (required)". Since the merged `Env.ts` supplies the default (`-7482650123549836421` when unset), the variable is no longer required — upstream's own README documents it as optional. This project's doc claim is now factually wrong.
- `.env` (git-ignored, local) carries an explicit `ADVISORY_LOCK=9158437265819472037` — explicit values remain fully supported, so no change is needed there.
- `.env.template` (pmdm-owned) listing `ADVISORY_LOCK` is fine — the template documents that the variable exists and can be set explicitly.
- The merged `src/services/Env.ts` already carries `defaultAdvisoryLockId`/`advisoryLockId`; behavior is unchanged.

## Target End State
This project's README describes `ADVISORY_LOCK` as optional with the code default, matching the merged reality and upstream's documentation.

## Approach
Update the single line in `README.md` to state the variable is optional and that the application default (`-7482650123549836421`, from `src/services/Env.ts`) is used when unset.

## Affected Scope
- `README.md`

## Anticipated Manual Follow-Up
None.

## Open Questions
None.
