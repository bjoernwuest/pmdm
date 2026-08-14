# Fix Definition: SPEC-007 — Miscellaneous dead code and unhandled edge cases

## Source Finding
13-incomplete-specs-edge-cases.md — `src/repo/ApiKeyRepo.ts:331-343` (`validateApiKeySecret` has a meaningless `orderBy(desc(createdAt)).limit(1)` on a query that can match at most one hash); `src/services/auth/ApplicationDefinedFunctionalPermissions.ts:1-6` (all imports unused — dead template file, passing only because `noUnusedLocals: false`, `tsconfig.json:31-33`); three page-registry files (`src/ui/PageRegistry.ts`, `src/ui/app_PageRegistry.ts`, `src/ui/_pageRegistry.generated.ts`); `ApiKeyRepo.ts:279-280` (publishes DELETE event even when nothing was deleted); `AdminConfigList.tsx:531`/`UserProfileConfigList.tsx:254` (`parseFloat` accepts partial numbers on save)

## Human Directive
None — default interpretation applies.

## Target End State
Each cited item resolved:

1. **`validateApiKeySecret` dead ordering** — the `orderBy(desc(createdAt)).limit(1)` is removed (the crypt comparison can match at most one row; the ordering is dead cost). Return contract unchanged.
2. **`ApplicationDefinedFunctionalPermissions.ts`** — the file is an intentional template extension point (per its own header comment and ARCH-003's fix, which converts it to a registration function): it is kept but made honest — unused imports removed, and its role as the downstream-project extension point is preserved through ARCH-003's redesign (the registration entry point iterates both built-in and application-defined permissions). If ARCH-003 has not landed, this fix minimally removes the dead imports while keeping the file's contract comment; full coherence arrives with ARCH-003.
3. **Page-registry file redundancy** — the three-file arrangement is *by design* per `src/ui/AGENTS.md` (`_pageRegistry.generated.ts` = generated list, `app_PageRegistry.ts` = downstream escape hatch, `PageRegistry.ts` = combiner). Resolution: keep all three, and eliminate the *appearance* of redundancy by ensuring each file's header comment states its distinct role (one line each) — no structural change. (The finding questions the arrangement; the docs sanction it; the fix is clarity, not deletion.)
4. **Phantom DELETE publish** (`ApiKeyRepo.ts:279-280`) — publish only when a row was deleted. This is also listed in PATT-004; the deletion-guard is specified there and cross-referenced here; implementation does it once.
5. **`parseFloat` partial-number acceptance** (`AdminConfigList.tsx:531`, `UserProfileConfigList.tsx:254`) — numeric save validation becomes strict: the raw string must be a fully valid number (e.g. `Number(raw)` semantics with empty-string guard, or a full-match regex) before parse; `"1abc"` no longer persists as `1`. Error feedback uses the existing hint-text path. (Note: SEC-010 covers the same lines as a security issue and is unchecked with a LATER annotation; this fix resolves the validation-correctness aspect only — server-side validation remains the authoritative gate, per root AGENTS.md "Client and server both validate input".)

## Approach
Itemized micro-fixes as above; each is a small, independently reviewable edit. For item 5, apply identical strict validation in both pages (PATT-012's shared-helper extraction, if landed first, absorbs this — the strict validation then lives in the shared helper).

## Affected Scope
- `src/repo/ApiKeyRepo.ts` — dead orderBy removal, phantom-publish guard (with PATT-004)
- `src/services/auth/ApplicationDefinedFunctionalPermissions.ts` — dead imports / honest stub (with ARCH-003)
- `src/ui/PageRegistry.ts`, `app_PageRegistry.ts`, `_pageRegistry.generated.ts` (stub) — role comments only
- `src/ui/pages/AdminConfigList.tsx`, `UserProfileConfigList.tsx` — strict numeric validation

## Explicit Constraints
- No behavior change except items 4 and 5, whose behavior change is the point (no phantom events; no partial numbers persisted).
- Item 3 must not restructure the registry mechanism (the three-file design stays).
- Item 5 must keep parity with server-side validation (server already validates via `Value.Check` on number schema — client strictness aligns with it).
- NAME-005 (`_`-prefix semantics) is unchecked — do not rename `_pageRegistry.generated.ts`.

## Out of Scope
- SEC-010 (regex ReDoS + partial-number as security finding) — unchecked; this fix covers only the validation correctness at the two save sites.
- PATT-004 (phantom-event mechanism) — owns the same ApiKeyRepo line's guard; single implementation, two definitions cross-referenced.
- NAME-005 — unchecked.
- ARCH-003 (FP registration redesign) — separate fix definition; this fix's item 2 defers full coherence to it.

## Downstream Impact
No — internal cleanups plus the two validation/event behavior corrections; no export or API shape changes.
