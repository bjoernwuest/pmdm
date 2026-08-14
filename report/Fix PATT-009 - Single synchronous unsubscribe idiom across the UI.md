# Fix PATT-009 - Single synchronous unsubscribe idiom across the UI

## Source
- Finding: PATT-009 (see /report/03-patterns-concepts.md)
- Fix definition: /report/PATT-009-fix-definition.md

## Summary of Change
Converted the six pages that used the deferred dynamic-import cleanup (`import("@/ui/pubsub").then((m) => m.unsubscribe(token))`) to the canonical synchronous idiom: `unsubscribe` is now part of the existing static import from `@/ui/pubsub` in `AdminUserList`, `AdminApiKeyList`, `AdminGroupList`, `AdminUserDetail`, `AdminGroupDetail` (both cleanups), and `AdminApiKeyDetail`, and the cleanup bodies call `unsubscribe(token)` directly, preserving the `typeof token === "string"` guard. The async cleanup race (messages arriving between cleanup scheduling and execution) no longer exists; `AdminConfigList` already used the static pattern. A sweep found no remaining dynamic pubsub imports.

## Files Changed
- `src/ui/pages/AdminUserList.tsx`, `AdminApiKeyList.tsx`, `AdminGroupList.tsx`, `AdminUserDetail.tsx`, `AdminGroupDetail.tsx`, `AdminApiKeyDetail.tsx` — static `unsubscribe` imports and synchronous cleanups

## Breaking Changes for Downstream Consumers
None — internal cleanup idiom only; no exports or behavior contracts change (other than closing the cleanup race).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- RCT-001 (useEffect dependency problems) — related but separate; no dependency arrays were altered.
- CPLX-010 (overlapping subscriptions in one page) — separate fix definition.
- PATT-010 (subscription scoping) — separate fix definition, implemented in the same change set (different lines).

## Resolved Questions
None.
