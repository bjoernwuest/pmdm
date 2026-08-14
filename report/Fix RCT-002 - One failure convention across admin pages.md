# Fix RCT-002 - One failure convention across admin pages

## Source
- Finding: RCT-002 (see /report/06-react-frontend.md)
- Fix definition: /report/RCT-002-fix-definition.md

## Summary of Change
Established and applied the single failure convention: the six load paths that lacked error handling (`AdminUserList`, `AdminGroupList`, `AdminFunctionalPermissionList`, `AdminUserDetail`, `AdminGroupDetail`, `AdminFunctionalPermissionDetail`) now catch load failures into a page-level `error` state (rendered as the existing `admin-config-error` banner used by `AdminApiKeyList`/`AdminAuditLog`/`AdminConfigList`) and leave the loading state — no page can remain in an infinite loading state after a failed fetch. The four cited bare-`await` mutation sites are wrapped: the API-key disable buttons on `AdminApiKeyDetail` and `AdminApiKeyList` catch and surface failures via the page error state (the detail page gained the error state), and the permission-assignment toggles on `AdminGroupDetail`/`AdminFunctionalPermissionDetail` catch and surface failures the same way (no unhandled rejections). 409 handling via PATT-011's helper is unchanged; successful-path behavior is identical.

## Files Changed
- `src/ui/pages/AdminUserList.tsx`, `AdminGroupList.tsx`, `AdminFunctionalPermissionList.tsx` — error state + load catch + banner
- `src/ui/pages/AdminUserDetail.tsx`, `AdminGroupDetail.tsx`, `AdminFunctionalPermissionDetail.tsx` — error state + load catch + banner
- `src/ui/pages/AdminApiKeyDetail.tsx` — error state added; disable mutation wrapped
- `src/ui/pages/AdminApiKeyList.tsx` — disable mutation wrapped

## Breaking Changes for Downstream Consumers
None — page-internal error handling; no API or component API changes.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- ARCH-010 (page paradigm unification) — unchecked.
- SPEC-005 (failures swallowed as "no permissions"/"no overrides") — separate fix definition (misleading success-shaped emptiness vs. missing error surfaces).
- RCT-003 (empty states) — separate fix definition; the empty-vs-failed distinction is resolved by both together.

## Resolved Questions
None.
