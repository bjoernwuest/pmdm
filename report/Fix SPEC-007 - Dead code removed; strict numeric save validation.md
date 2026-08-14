# Fix SPEC-007 - Dead code removed; unhandled numeric-validation edge case fixed

## Source
- Finding: SPEC-007 (see /report/13-incomplete-specs-edge-cases.md)
- Fix definition: /report/SPEC-007-fix-definition.md

## Summary of Change
Resolved the cited items: (1) `validateApiKeySecret`'s meaningless `orderBy(desc(createdAt)).limit(1)` was removed (the crypt comparison can match at most one row; return contract unchanged); (2) `ApplicationDefinedFunctionalPermissions.ts` was made honest under ARCH-003 (dead imports gone, `functionalPermissionDefinitions` extension-point export); (3) the three page-registry files now carry one-line header comments stating their distinct roles in the by-design arrangement (`_pageRegistry.generated.ts` = generated list, `app_PageRegistry.ts` = downstream escape hatch, `PageRegistry.ts` = combiner — no structural change); (4) the phantom DELETE publish in `ApiKeyRepo` was fixed under PATT-004 (publish only when a row was deleted — single implementation, cross-referenced); (5) numeric save validation in `AdminConfigList` and `UserProfileConfigList` is now strict — the raw string must fully match a valid number pattern (empty rejected, `Number.isFinite` check), so `"1abc"` no longer persists as `1`; feedback uses the existing hint-text path, and server-side validation remains the authoritative gate.

## Files Changed
- `src/repo/ApiKeyRepo.ts` — dead `orderBy` removed
- `src/services/auth/ApplicationDefinedFunctionalPermissions.ts` — (made honest under ARCH-003; verified here)
- `src/ui/PageRegistry.ts`, `src/ui/app_PageRegistry.ts`, `src/ui/_pageRegistry.generated.ts` — role comments added
- `src/ui/pages/AdminConfigList.tsx`, `src/ui/pages/UserProfileConfigList.tsx` — strict numeric save validation

## Breaking Changes for Downstream Consumers
None — internal cleanups plus the two behavior corrections (no phantom delete events; no partial numbers persisted).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- SEC-010 (regex ReDoS + partial-number as security finding) — unchecked; this fix covers only the validation correctness at the two save sites.
- PATT-004 (phantom-event mechanism) — separate fix definition owning the same `ApiKeyRepo` guard; single implementation, cross-referenced.
- NAME-005 (`_`-prefix semantics) — unchecked; `_pageRegistry.generated.ts` was not renamed.
- ARCH-003 (FP registration redesign) — separate fix definition, implemented earlier; item 2 defers its coherence to it.

## Resolved Questions
None.
