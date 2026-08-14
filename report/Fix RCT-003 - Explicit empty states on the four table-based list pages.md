# Fix RCT-003 - Explicit empty states on the four table-based list pages

## Source
- Finding: RCT-003 (see /report/06-react-frontend.md)
- Fix definition: /report/RCT-003-fix-definition.md

## Summary of Change
The four table-based list pages (`AdminUserList`, `AdminGroupList`, `AdminFunctionalPermissionList`, `AdminApiKeyList`) now render an explicit in-table empty row (`colSpan` matching each table's column count, centered "No … found." message, English text) when their data set is empty. The row follows the existing pattern of `AdminAuditLog.tsx` and renders only inside the already-rendered table (the loading branches render instead while loading), so "no data" is visually distinguishable from "loading". The existing empty states elsewhere were unchanged; no pagination/URL behavior changed.

## Files Changed
- `src/ui/pages/AdminUserList.tsx` — empty row ("No users found.")
- `src/ui/pages/AdminGroupList.tsx` — empty row ("No groups found.")
- `src/ui/pages/AdminFunctionalPermissionList.tsx` — empty row ("No functional permissions found.")
- `src/ui/pages/AdminApiKeyList.tsx` — empty row ("No API keys found.")

## Breaking Changes for Downstream Consumers
None — additive page rendering only.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- RCT-002 (error surfaces) — separate fix definition; the empty-vs-failed distinction is resolved by both together (the error state's precedence is coordinated there).
- CPLX-002 (scaffolding extraction) — separate fix definition; the empty row will move into the shared scaffolding if that lands later.
- ARCH-010 — unchecked.

## Resolved Questions
None.
