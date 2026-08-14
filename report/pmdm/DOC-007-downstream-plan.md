# Downstream Plan: DOC-007 — Comment rot corrected; TODO-FIXME inventory resolved

## Upstream Change
Reference: `/report/Fix DOC-007 - Comment rot corrected; TODO-FIXME inventory resolved.md`. Stale comments were corrected and the TODO/FIXME inventory was resolved in upstream source files (the `PRODUCT_NAME` constant is UI-internal; behavior identical).

## Upstream's Own Assessment
"None — comment and documentation corrections only (the `PRODUCT_NAME` constant is UI-internal, behavior identical)."

## Applicability to This Project
Affected: No

Evidence:
- The affected source files are shared and already fixed via the merge (diff against `bun-starter` shows no comment-rot divergence in shared files).
- pmdm's own files were not part of upstream's comment inventory; pmdm's `src/ui/app.tsx` defines its own `PRODUCT_NAME` ("PMDM"), which is a deliberate pmdm divergence, not the cited rot. The single `// FIXME: adjust to new schema` marker in `src/services/auth/ApplicationDefinedFunctionalPermissions.ts` was removed as part of the ARCH-003 rewrite.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
