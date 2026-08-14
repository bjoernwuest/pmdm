# Fix PATT-007 - Complete UI API wrapper layer; no inline /api URLs in pages

## Source
- Finding: PATT-007 (see /report/03-patterns-concepts.md)
- Fix definition: /report/PATT-007-fix-definition.md

## Summary of Change
Completed the `src/ui/api/` wrapper layer and migrated every page/shell call site: new `Users.ts` (`getUsers(page, pageSize, includeInactive)`, `getUserDetail(id, includeInactive)`), `Groups.ts` (`getGroups`, `getGroupDetail`, `getGroupFunctionalPermissions`, `grantPermissionsToGroup`, `revokePermissionsFromGroup`), `FunctionalPermissions.ts` (`getFunctionalPermissions`, `getFunctionalPermissionDetail`, `assignGroupsToFunctionalPermission`, `removeGroupsFromFunctionalPermission`), and `getViewerContext()` in `session.ts` for `/api/me/context` (all re-exported via `src/ui/api/index.ts`). All inline `apiGet`/`apiPost`/`apiDelete` URL strings in `AdminUserList`, `AdminUserDetail`, `AdminGroupList`, `AdminGroupDetail`, `AdminFunctionalPermissionList`, `AdminFunctionalPermissionDetail`, `AdminApiKeyDetail`, `AdminApiKeyList`, `AdminAuditLog`, `AdministrationHome`, and `src/ui/app.tsx` (including the breadcrumb fetches) were replaced by wrapper calls; wrappers own all query-string assembly (URLSearchParams), including the existing `page - 1` 0/1-based conversions. Pages/shell no longer import `apiGet`/etc.; mutations keep flowing through request bundling via the wrappers. Response typing uses the shared `@/types/*` types. `src/ui/AGENTS.md`'s `api/` file list gained the new modules. PATT-008's documented SSE-PATCH exception remains untouched.

## Files Changed
- `src/ui/api/Users.ts`, `Groups.ts`, `FunctionalPermissions.ts` — new wrapper modules
- `src/ui/api/session.ts` — `getViewerContext` wrapper added
- `src/ui/api/index.ts` — re-exports
- `src/ui/pages/AdminUserList.tsx`, `AdminUserDetail.tsx`, `AdminGroupList.tsx`, `AdminGroupDetail.tsx`, `AdminFunctionalPermissionList.tsx`, `AdminFunctionalPermissionDetail.tsx`, `AdminApiKeyDetail.tsx`, `AdminApiKeyList.tsx`, `AdminAuditLog.tsx`, `AdministrationHome.tsx` — inline calls migrated
- `src/ui/app.tsx` — breadcrumb and context fetches migrated to wrappers
- `src/ui/AGENTS.md` — api/ file list updated

## Breaking Changes for Downstream Consumers
Yes — new wrapper modules and exports; pages import from them. `src/ui/AGENTS.md`'s file list changed. Downstream projects with inline URL strings now have a complete convention to copy.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- API-004 (config optimistic-locking contract drift) — separate fix definition, implemented earlier.
- VB-AI-001 (AGENTS.md contradictions) — unchecked; this fix removed one contradiction source.
- The SSE/session transport internals (`_client.ts`, `_request_bundling.ts`) — unchanged.
- PATT-008 — documentation-only fix, implemented in the same change set.

## Resolved Questions
None.
