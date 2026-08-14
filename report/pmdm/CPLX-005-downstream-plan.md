# Downstream Plan: CPLX-005 — Set-based batch mutations in UserRepo

## Upstream Change
Reference: `/report/Fix CPLX-005 - Set-based batch mutations in UserRepo.md`. `UserRepo`'s batch mutations were rewritten set-based; signatures and event payloads unchanged.

## Upstream's Own Assessment
"None — internal implementation of existing repo functions; signatures and event payloads unchanged."

## Applicability to This Project
Affected: No

Evidence:
- `src/repo/UserRepo.ts` in this project is upstream's fixed version plus pmdm-added doc comments only (diff against `bun-starter` shows exclusively added `/** ... */` doc blocks; no logic differences).
- No pmdm-owned repo reimplements `upsertUsers` or other affected batch mutations with the pre-fix per-row loops.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
