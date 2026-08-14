# Fix CPLX-001 - Oversized files decomposed along domain boundaries

## Source
- Finding: CPLX-001 (see /report/04-complexity-maintainability.md)
- Fix definition: /report/CPLX-001-fix-definition.md

## Summary of Change
Decomposed the cited oversized files. `src/services/Auth.ts` (was ~854 lines) is now a thin facade re-exporting from cohesive sub-modules under `src/services/auth/`: `cookies.ts` (cookie helpers), `authConfig.ts` (the `config` export, API-key defaults, OIDC config loading), `sessions.ts` (session store, session-timeout cache with config-change invalidation, `getSession`/`putSession`/`deleteSession`), `oidc.ts` (OIDC flow: `startAuth`/`finishAuth`/`logout`, refresh, bearer validation), `apiKeys.ts` (API-key auth context and the API-key permission cache), `permissions.ts` (authorize/requirePermissions/permission checks, root-group cache, `init`, membership-sync status). All existing export names are preserved through the facade; new code should import the specific modules. `AdminConfigList.tsx` and `UserProfileConfigList.tsx` had their largest duplicated chunks extracted under PATT-011/PATT-012/CPLX-007; the remaining pages are wiring plus the object-modal — assessed as acceptable remaining size (the object-modal is a single cohesive concern). `AdminApiKeyDetail.tsx` lost its duplicated save handlers under PATT-011 and the remainder was assessed as page + permission-table concern — no further split warranted. `ApiKeyAPI.ts`'s repetitive OpenAPI error decorations were factored into the shared schema constants under API-001. `Toggle.tsx`/`InputField.tsx` were not decomposed (CPLX-006 is unchecked; only the RCT-005 internal changes applied). `RequestBundlingAPI.ts` was judged cohesive and left whole (no forced split). No behavior, signature, or timing changes — pure code motion plus shared-constant extraction.

## Files Changed
- `src/services/Auth.ts` — reduced to a facade
- `src/services/auth/cookies.ts`, `authConfig.ts`, `sessions.ts`, `oidc.ts`, `apiKeys.ts`, `permissions.ts` — new cohesive modules
- `src/services/AGENTS.md` — file-naming examples updated to the facade + sub-module layout
- `src/ui/pages/AdminConfigList.tsx`, `AdminApiKeyDetail.tsx`, `UserProfileConfigList.tsx` — (size reduced via PATT-011/PATT-012/CPLX-007; assessed, no further split)
- `src/api/ApiKeyAPI.ts` — (boilerplate factored under API-001; no further split)

## Breaking Changes for Downstream Consumers
Yes — new modules and the `Auth.ts` facade; all previously exported names remain available from `@/services/Auth.ts` (signatures unchanged), so existing importers compile unchanged. New code may import `@/services/auth/*` directly. `src/services/AGENTS.md` file list updated.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- CPLX-006 (Toggle/InputField internal duplication) — unchecked; explicitly not refactored under this ID.
- ARCH-010 (page paradigm unification) — unchecked; decomposition did not change page architecture patterns.
- PATT-011/PATT-012/CPLX-007 — own fix definitions, implemented earlier in the same change set; this fix consumed their extractions.

## Resolved Questions
None.
