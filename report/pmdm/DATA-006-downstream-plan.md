# Downstream Plan: DATA-006 — Atomic multi-step mutations and structural upsert discrimination

## Upstream Change
Reference: `/report/Fix DATA-006 - Atomic multi-step mutations and structural upsert discrimination.md`. Upstream repo functions became internally transactional with structural insert/update discrimination; signatures, return shapes, and event payloads unchanged. Callers that already wrap them in `runInTransaction` compose via savepoints.

## Upstream's Own Assessment
"None — repo functions become internally transactional; signatures, return shapes, and event payloads unchanged. Callers that already wrapped these functions in `runInTransaction` (EntraID sync, Auth login) compose via savepoints."

## Applicability to This Project
Affected: No

Evidence:
- The affected repo (`src/repo/UserRepo.ts`) is upstream's fixed version plus pmdm-added doc comments only (no logic divergence).
- The cited callers (`src/services/EntraIDSync.ts` — pmdm diff is a whitespace-only doc comment change; `src/services/Auth.ts`/auth login path — shared) are already aligned via the merge.
- No pmdm-owned repo reimplements those multi-step mutations with the pre-fix non-transactional structure.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
