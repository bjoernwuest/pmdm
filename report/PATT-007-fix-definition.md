# Fix Definition: PATT-007 — UI API wrapper layer exists for only 4 of ~10 APIs; pages build URLs inline

## Source Finding
03-patterns-concepts.md — wrappers exist: `src/ui/api/ApiKeys.ts`, `AuditLog.ts`, `Config.ts`, `UserProfileConfig.ts`; inline `apiGet` URL strings: `AdminUserList.tsx:117` (`/api/users`), `AdminUserDetail.tsx:49,87`, `AdminGroupList.tsx:110` (`/api/groups`), `AdminGroupDetail.tsx:76-91`, `AdminFunctionalPermissionList.tsx:55`, `AdminFunctionalPermissionDetail.tsx:69-71,102`, `AdminApiKeyDetail.tsx:97-99`, `AdminAuditLog.tsx:71`, `AdministrationHome.tsx:60`, `src/ui/app.tsx:180-200,314`; no `Users.ts`/`Groups.ts`/`FunctionalPermissions.ts` wrappers exist

## Human Directive
None — default interpretation applies.

## Target End State
Every API endpoint consumed by the UI is reached through a named wrapper function in a domain module under `src/ui/api/`, following the existing `ApiKeys.ts` style (typed parameters in, typed response out, URL construction — including pagination strings like `page=${...}&pageSize=${...}` — inside the wrapper). Page and shell code contains no inline `/api/...` URL strings; `apiGet`/`apiPost`/etc. are imported only by wrapper modules (and the transport layer itself). The root AGENTS.md rule "use the helpers in `src/ui/api/`" becomes uniformly true for the domains cited: users, groups, functional permissions, and the `me/context` endpoint.

## Approach
- Add wrapper modules `src/ui/api/Users.ts`, `src/ui/api/Groups.ts`, `src/ui/api/FunctionalPermissions.ts`, and a home for `me/context` (e.g. extend `session.ts` or a small `Me.ts`), each exposing typed functions covering every call site listed in the finding (list with pagination/includeInactive, detail by id, membership/permission assignment mutations, prolong-style sub-endpoints where used).
- Re-export the new wrappers from `src/ui/api/index.ts` per the folder convention.
- Migrate every cited page call site (and any discovered by a sweep for `"/api/` literals under `src/ui/`) to the wrappers, including `src/ui/app.tsx`'s breadcrumb fetches (coordinate with ARCH-011: whichever fix lands second adapts; the breadcrumb fetches must end up calling wrappers regardless of the ARCH-011 mechanism).
- Wrapper functions own query-string assembly (page/pageSize/includeInactive), removing per-site `page=${page-1}` arithmetic.
- Note the ARCH-011 interplay: if ARCH-011 introduces page-declared breadcrumb fetchers, those fetchers call the wrappers.

## Affected Scope
- New `src/ui/api/Users.ts`, `src/ui/api/Groups.ts`, `src/ui/api/FunctionalPermissions.ts`, and a `me/context` wrapper
- `src/ui/api/index.ts` — re-exports
- All pages listed in the finding plus `src/ui/app.tsx`
- `src/ui/AGENTS.md` — api/ file list updated with the new modules

## Explicit Constraints
- No API contract changes: wrappers call exactly the endpoints the pages call today, with identical query semantics (including the existing `page-1` 0/1-based conversions — any off-by-one conventions are preserved, not "fixed" here).
- Mutations keep flowing through request bundling (the wrappers build on `apiPost`/`apiPut`/etc. which already route through `_request_bundling.ts`).
- Response typing uses the existing shared types from `@/types/*`; no duplicated inline type declarations in pages.
- PATT-008's documented exception (SSE expression PATCH using raw `fetch`) remains untouched.

## Out of Scope
- API-004 (config optimistic-locking contract drift) — separate fix definition.
- VB-AI-001 (AGENTS.md rules contradicted by codebase) — unchecked; this fix removes one contradiction source but does not audit others.
- The SSE/session transport internals (`_client.ts`, `_request_bundling.ts`) — unchanged.
- PATT-008 — documentation-only fix, separate file.

## Downstream Impact
Yes — new wrapper modules and exports; pages import from them. `src/ui/AGENTS.md` file list changes. Downstream projects with inline URL strings get a complete convention to copy.
