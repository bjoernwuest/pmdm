# Fix PATT-011 - Shared three-stream save-confirmation helper

## Source
- Finding: PATT-011 (see /report/03-patterns-concepts.md)
- Fix definition: /report/PATT-011-fix-definition.md

## Summary of Change
Extracted the "three-stream race" save logic into a shared helper `runSaveWithConfirmation` in new `src/ui/saveConfirmation.ts`: the `resolved` latch, PubSub subscribe/unsubscribe around the save, the 1000 ms timer fallback with re-fetch callback, the server-response stream, and 409-conflict surfacing are defined once; the helper's parameter object carries per-call specifics (`pubsubExpression`, `confirmFromPubSub`, `confirmFromRefetch`, `mutate`, `onSuccess`, `onTimeoutResolved`/`onTimeoutFailure`, `onConflict`, `onOtherError`). `AdminConfigList.handleSave`, `AdminApiKeyDetail.handleSaveName`, and `handleSaveDescription` are now thin callers; the copy-pasted bodies including the "THREE-STREAM RACE" comments are gone. The helper uses the static `subscribe`/`unsubscribe` imports (PATT-009's canonical idiom). Per a resolved question, the helper preserves the current observable timeout behavior exactly (the timeout stream claims the latch before its refetch resolves and never applies the refetched value; per-caller button re-enable behavior is preserved via `onTimeoutResolved`/`onTimeoutFailure`).

## Files Changed
- `src/ui/saveConfirmation.ts` — new shared helper module
- `src/ui/pages/AdminConfigList.tsx` — `handleSave` replaced by helper call
- `src/ui/pages/AdminApiKeyDetail.tsx` — both save handlers replaced by helper calls
- `src/ui/AGENTS.md` — shared helper listed in the file overview

## Breaking Changes for Downstream Consumers
Yes — one new shared module export (`runSaveWithConfirmation` + `SaveConfirmationOptions`); three call sites migrated. No HTTP or PubSub payload changes.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- CPLX-002 (admin list-page scaffolding) — separate fix definition; this extraction covers only the save-confirmation race.
- CPLX-009 / CPLX-008 (Label/InputField seeding, JSON-stringify comparisons) — separate fix definitions; component APIs unchanged.
- PATT-009 (unsubscribe idiom) — separate fix definition, implemented in the same change set; the helper adopts the canonical idiom by construction.

## Resolved Questions
- Q: The timeout stream in the live save handlers contains a self-nullifying latch (the timer sets `resolved = true`, so `finalizeSuccess` always early-returns — the timeout stream can never apply the refetched value; it only re-enables buttons). The fix definition describes the timeout as a working "first stream wins" fallback. Which behavior should the shared helper implement?
- A: "Preserve current behavior exactly." — the helper replicates today's observable timeout behavior (refetched value never applied; per-caller button/hint outcomes preserved), with the latch claimed first inside the helper's timer stream.
