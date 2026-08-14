# Fix Definition: CPLX-001 — Oversized files

## Source Finding
04-complexity-maintainability.md — `src/ui/pages/AdminConfigList.tsx` 1091 lines (component spans `:273-1090` with 7 hooks, 3 subscription effects, 3 modal/inline state machines); `src/services/Auth.ts` 799 lines (cookies + OIDC + sessions + API keys + permissions + caches + config); `AdminApiKeyDetail.tsx` 630; `UserProfileConfigList.tsx` 609; `src/api/ApiKeyAPI.ts` 523 (~60% repetitive OpenAPI boilerplate); `src/ui/components/Toggle.tsx` 506; `InputField.tsx` 440; `src/api/RequestBundlingAPI.ts` 339

## Human Directive
None — default interpretation applies.

## Target End State
Every cited file is decomposed along its natural concern boundaries so each resulting module has a single discernible purpose. Concretely:

- `src/services/Auth.ts` is split by domain into cohesive modules (cookie/session handling, OIDC flow, API-key auth, functional-permission checks/caches, auth config), with `Auth.ts` either removed or reduced to a thin re-export/facade so existing import paths keep working during transition. (Note: the `src/api/AGENTS.md` already references `@/services/AuthType.ts` for `authorize` — the split aligns filenames with what docs describe; reconcile at implementation.)
- `AdminConfigList.tsx` is decomposed into the page component plus extracted units: the array-editor modal/helpers (shared per PATT-012), the save-confirmation race (shared per PATT-011), the formatter usage (per CPLX-007), leaving a page file concerned with wiring.
- `AdminApiKeyDetail.tsx` loses the duplicated save handlers (PATT-011) and is split into page + sub-concerns if it remains oversized after that extraction.
- `UserProfileConfigList.tsx` benefits from the same PATT-012 extraction; remaining size reassessed afterwards.
- `ApiKeyAPI.ts`'s repetitive OpenAPI response decorations are factored via shared response-schema constants (per the canonical-error-description table already in `src/api/AGENTS.md`), shrinking the file without changing any documented response.
- `Toggle.tsx` and `InputField.tsx` internal duplication is CPLX-006's scope (unchecked); for CPLX-001 these two files get only what decomposition is naturally implied by other checked fixes — no dedicated refactor here.
- `RequestBundlingAPI.ts` (339 lines) is acceptable if cohesive; it is split only if a clean seam exists (e.g. NDJSON dispatch vs. config endpoint) — implementation judges, but no forced split.

No behavior change anywhere: pure code motion plus shared-constant extraction.

## Approach
Move-don't-rewrite: extract contiguous, already-cohesive regions into new modules with unchanged code, then rewire imports. For `Auth.ts`, define the module boundaries by the domains the finding lists; keep all exported symbols available through a facade to bound the blast radius, and let new code import from the specific modules. For the two config pages, land PATT-011/PATT-012 extractions first (they remove the largest duplicated chunks), then evaluate what remains. For `ApiKeyAPI.ts`, introduce shared response-schema constants in `src/types/ApiType.ts` (canonical 401/403/404/409 entries) and reference them across routes.

## Affected Scope
- `src/services/Auth.ts` → several new modules under `src/services/` (e.g. `auth/` subfolder) + facade
- `src/ui/pages/AdminConfigList.tsx`, `AdminApiKeyDetail.tsx`, `UserProfileConfigList.tsx`
- `src/api/ApiKeyAPI.ts` and shared constants in `src/types/ApiType.ts`
- Importers of `Auth.ts` exports across `src/api/`, `src/apps/`, `src/autostart/` (facade keeps them compiling)
- `src/services/AGENTS.md` file list, if it names `Auth.ts` specifically

## Explicit Constraints
- No behavior, signature, or timing changes; this is decomposition.
- The facade must not become permanent dead weight: new code imports the specific modules; the facade exists to avoid a flag-day across all importers.
- Ordering dependency: PATT-011, PATT-012, CPLX-007 extractions should land before final page decomposition to avoid double moves.
- `Toggle.tsx`/`InputField.tsx` are explicitly not refactored under this ID (CPLX-006 is unchecked).

## Out of Scope
- CPLX-006 (Toggle/InputField internal duplication) — unchecked.
- ARCH-010 (page paradigm unification) — unchecked; decomposition does not change page architecture patterns.
- PATT-011/PATT-012/CPLX-007 — own fix definitions; this fix consumes their extractions.

## Downstream Impact
Yes — new modules and possible import-path changes for `Auth.ts` consumers (mitigated by the facade); AGENTS.md file lists updated.
