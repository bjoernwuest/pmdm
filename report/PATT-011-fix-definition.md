# Fix Definition: PATT-011 — Duplicated "three-stream race" save logic

## Source Finding
03-patterns-concepts.md — `AdminConfigList.tsx:554-653` (`handleSave`), `AdminApiKeyDetail.tsx:222-326` (`handleSaveName`), `:328-432` (`handleSaveDescription`); comment "=== THREE-STREAM RACE ==="

## Human Directive
None — default interpretation applies.

## Target End State
The "await confirmation via PubSub event, server response, or timeout-fallback refetch — first stream wins, guarded by a `resolved` flag, with 409 conflict handling" logic exists exactly once, as a shared UI helper (in `src/ui/` outside `pages/`, per the UI AGENTS.md rule that shared concerns live outside page files). The three cited handlers are thin callers supplying only their specifics: the mutation call, the PubSub expression to await, the timeout/re-fetch behavior, the success application to the component, and the 409 path. Timeout value (1000 ms), cleanup ordering, and conflict semantics are defined once in the helper and identical for all callers.

## Approach
Extract a helper (e.g. `runSaveWithConfirmation` in a new `src/ui/saveConfirmation.ts` or inside an existing suitable shared module) encapsulating: the `resolved` latch, PubSub subscribe/unsubscribe around the save, the timer fallback with re-fetch callback, the server-response stream, and the 409-conflict surface. The helper's parameter object carries per-call specifics. Migrate `AdminConfigList.handleSave`, `AdminApiKeyDetail.handleSaveName`, and `handleSaveDescription` to it; delete the copy-pasted bodies including the "THREE-STREAM RACE" comments. Behavior parity is the bar: same winner semantics, same timeout, same 409 handling, same component state transitions (`setOriginalValue`, `setDirty`, button enables, hint clearing).

## Affected Scope
- New shared helper module under `src/ui/` (not under `pages/`)
- `src/ui/pages/AdminConfigList.tsx` — `handleSave` replaced by helper call
- `src/ui/pages/AdminApiKeyDetail.tsx` — both save handlers replaced
- `src/ui/AGENTS.md` — mention the shared helper in the UI guidance if a natural section exists

## Explicit Constraints
- Behavior parity per call site: same PubSub expressions, timeout duration, conflict handling, and UI state transitions as today.
- The helper uses the static `subscribe`/`unsubscribe` imports (consistent with PATT-009's canonical idiom).
- The helper must not swallow real errors differently than the current copies do (current error paths are preserved per call site via callbacks).
- Coordinate with CPLX-002 (admin scaffolding duplication): this extraction is limited to the save-confirmation race, not the whole page scaffolding.

## Out of Scope
- CPLX-002 (list-page scaffolding duplication) — separate fix definition.
- CPLX-009 / CPLX-008 (Label/InputField seeding, JSON-stringify comparisons) — separate fix definitions; the helper must not change component APIs.
- PATT-009 (unsubscribe idiom in these files) — separate fix definition; the helper adopts the canonical idiom by construction.

## Downstream Impact
Yes — one new shared module export; three call sites migrated. No HTTP or PubSub payload changes.
