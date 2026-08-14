# Fix Definition: RCT-003 — Empty-state handling inconsistent

## Source Finding
06-react-frontend.md — present: `AdminConfigList.tsx:731-735`, `UserProfileConfigList.tsx:319-323`, `AdminAuditLog.tsx:185-190`, `AdministrationHome.tsx:81`; missing: `AdminUserList.tsx`, `AdminGroupList.tsx`, `AdminFunctionalPermissionList.tsx`, `AdminApiKeyList.tsx` render an empty table body with no message when `total = 0`

## Human Directive
None — default interpretation applies.

## Target End State
Every admin list page renders an explicit empty state when its data set is empty and not loading, so "no data" is visually distinguishable from "loading" and (with RCT-002) from "failed load". The four table-based list pages (`AdminUserList`, `AdminGroupList`, `AdminFunctionalPermissionList`, `AdminApiKeyList`) gain a `total === 0 && !isLoading` empty row/message following the existing in-table pattern of `AdminAuditLog.tsx:185-190` (a `colSpan` row with a "No … found." message, English text). The existing empty states elsewhere are unchanged.

## Approach
Add the empty-row branch to the four pages' table bodies, keyed on the same conditions the audit-log page uses (not loading, zero entries). If CPLX-002's shared pager/scaffolding lands first or concurrently, the empty-state row becomes part of the shared table scaffolding so all four pages get it by construction; otherwise add per page. Messages name the entity ("No users found.", "No groups found.", "No functional permissions found.", "No API keys found.").

## Affected Scope
- `src/ui/pages/AdminUserList.tsx`, `AdminGroupList.tsx`, `AdminFunctionalPermissionList.tsx`, `AdminApiKeyList.tsx`
- Or the CPLX-002 shared scaffolding component, if that lands together

## Explicit Constraints
- English UI text (root AGENTS.md).
- Empty state must not render during loading or after a failed load (RCT-002's error state takes precedence — coordinate the conditions).
- No pagination/URL behavior change; an empty filtered result (e.g. includeInactive off) shows the same empty state.

## Out of Scope
- RCT-002 (error surfaces) — separate fix definition.
- CPLX-002 (scaffolding extraction) — separate fix definition; this fix may ride on it but does not require it.
- ARCH-010 — unchecked.

## Downstream Impact
No — additive page rendering only.
