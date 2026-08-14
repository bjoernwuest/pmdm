# Downstream Plan: CFG-003 — Dependency hygiene

## Upstream Change
Reference: `/report/Fix CFG-003 - Dependency hygiene.md`. Production installs became slimmer (playwright no longer in production dependencies), and `typescript` resolution for tooling is an explicit devDependency; the transitive typebox version is unchanged in practice (`0.34.52`).

## Upstream's Own Assessment
"Yes — production installs become slimmer (no playwright); the transitive typebox version is unchanged in practice (`0.34.52` before and after), verified by typecheck plus a production build; `typescript` resolution for tooling is now an explicit devDependency instead of an unsatisfied peer."

## Applicability to This Project
Affected: No

Evidence:
- Diff of `package.json` against upstream's fixed version shows this project already carries the fixed dependency layout: `playwright` and `typescript` are in `devDependencies` (no production playwright), and the only differences are this project's own additions (`@types/bun` in devDependencies, `@office-kit/xlsx` in dependencies — pmdm-specific libraries used by the XLSX import/export features).
- No pmdm-owned code imports playwright or depends on a different typebox version.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
