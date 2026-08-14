# Fix ARCH-011 - Declarative detail breadcrumbs resolved generically by the app shell

## Source
- Finding: ARCH-011 (see /report/01-architecture-structure.md)
- Fix definition: /report/ARCH-011-fix-definition.md

## Summary of Change
`src/ui/app.tsx` no longer contains per-route `matchPath`/fetch blocks for detail breadcrumbs. `PageMeta` gained an optional `detailBreadcrumb` capability (`resolveLabel(params)` — a label-fetch function the page implements using the `src/ui/api/` wrappers), and the app shell resolves the detail label generically: it takes the matched page (`currentPage`), checks whether its `meta` declares the capability, and invokes `resolveLabel` with the matched route params. The three existing detail breadcrumbs (user email, group name, functional-permission name) declare their existing fetches in their `meta` exports, and the API-key detail page gains the breadcrumb it lacked (API key name). Cancellation and silent-failure semantics (reset on navigation, fall back to the static menu label) are preserved; the shell no longer imports page-specific API response types or knows concrete routes.

## Files Changed
- `src/types/PageType.ts` — optional `detailBreadcrumb` field added to `PageMeta`
- `src/ui/app.tsx` — hard-coded blocks replaced by the generic resolution
- `src/ui/pages/AdminUserDetail.tsx`, `AdminGroupDetail.tsx`, `AdminFunctionalPermissionDetail.tsx` — `meta` declares the capability
- `src/ui/pages/AdminApiKeyDetail.tsx` — `meta` declares the capability (new breadcrumb)

## Breaking Changes for Downstream Consumers
Yes — `PageMeta` gains an optional field; pages that want detail breadcrumbs must declare it. Existing pages without the field type-check unchanged (additive).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- SPEC-005 (failures swallowed as "no permissions") — the silent `.catch(() => undefined)` fallback is preserved here; the swallowing-policy question belongs to SPEC-005.
- ARCH-010 (mixed page-architecture paradigms) — unchecked.
- General breadcrumb redesign — only the detail-label fetching was in scope.

## Resolved Questions
None.
