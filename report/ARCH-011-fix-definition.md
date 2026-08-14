# Fix Definition: ARCH-011 — Breadcrumb data fetching hard-coded per route in the app shell

## Source Finding
01-architecture-structure.md — `src/ui/app.tsx:174-208`

## Human Directive
None — default interpretation applies.

## Target End State
`src/ui/app.tsx` contains no per-route `matchPath`/`apiGet` blocks for detail breadcrumbs. The mapping from "detail route" to "label fetch" is declared alongside the page that owns the route (via the page-metadata contract in `src/types/PageType.ts` and each page's `meta` export), and the app shell resolves the detail breadcrumb label generically for any registered page that declares it. The three existing detail breadcrumbs (user email, group name, functional-permission name) keep working, and the API-key detail page (`/admin/apikeys/:apikeyid` or its actual registered path) gains the breadcrumb label it currently lacks, using the same mechanism.

## Approach
Extend the `PageMeta` contract with an optional declarative detail-breadcrumb capability — e.g., an optional field on `meta` carrying what the shell needs to resolve a detail label for the page's path parameters (a label-fetch function implemented by the page module using the `src/ui/api/` helpers, receiving the matched params). The app shell replaces its three hard-coded blocks with a single generic step: find the matched page (already computed via `currentPage`), check whether its `meta` declares the detail-label capability, and if so invoke it with the route params. Each of the three admin detail pages declares its existing fetch (user email, group name, permission name); the API-key detail page declares an equivalent fetch. Cancellation/error-swallowing semantics of the current effect (ignore failures, reset on navigation) are preserved in the generic implementation.

## Affected Scope
- `src/types/PageType.ts` — optional addition to `PageMeta`
- `src/ui/app.tsx` — replace hard-coded blocks with the generic resolution
- `src/ui/pages/AdminUserDetail.tsx`, `AdminGroupDetail.tsx`, `AdminFunctionalPermissionDetail.tsx`, `AdminApiKeyDetail.tsx` — declare the capability in their `meta` exports
- Possibly `design/ui-page-registry.md` — document the new metadata field if the doc enumerates `PageMeta` fields

## Explicit Constraints
- The app shell must not import page-specific API response types or know about concrete routes after the fix.
- Behavior preserved for the three existing breadcrumbs: same labels, same loading/cancellation behavior, failures still silently fall back to the static menu label.
- The API-key detail breadcrumb is added through the same mechanism (closing the gap the finding notes).
- Label fetching must go through the `src/ui/api/` wrapper layer, per the UI import rules — no direct `fetch()`.

## Out of Scope
- SPEC-005 (failures swallowed as "no permissions") — related to the silent `.catch(() => undefined)` behavior only insofar as it is preserved here; the swallowing-policy question belongs to SPEC-005.
- ARCH-010 (mixed page-architecture paradigms) — unchecked, not addressed.
- General breadcrumb redesign (section/parent logic) — only the detail-label fetching is in scope.

## Downstream Impact
Yes — `PageMeta` gains an optional field; page modules that want detail breadcrumbs must declare it. Existing pages without the field type-check unchanged (optional addition), so no consumer breakage.
