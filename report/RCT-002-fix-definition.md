# Fix Definition: RCT-002 — Error handling inconsistent across pages

## Source Finding
06-react-frontend.md — no catch at all: `AdminUserList.tsx:110-138`, `AdminGroupList.tsx` (load), `AdminFunctionalPermissionList.tsx`, `AdminUserDetail.tsx:44-69`, `AdminGroupDetail.tsx:82-116`, `AdminFunctionalPermissionDetail.tsx:63-90` (failure leaves perpetual "Loading..."); catch into `error` state: `AdminApiKeyList.tsx:190-195`, `AdminAuditLog.tsx:80-84`, `AdminConfigList.tsx:304-306`; bare `await` mutations with no try/catch (unhandled rejections): `AdminApiKeyDetail.tsx:434-447`, `AdminApiKeyList.tsx:307-310`, `AdminGroupDetail.tsx:210-229`, `AdminFunctionalPermissionDetail.tsx:160-179`

## Human Directive
None — default interpretation applies.

## Target End State
One failure convention exists across admin pages, and every page follows it:

- **Load failures**: the page leaves the loading state and displays an error indication (the existing `error`-state pattern from `AdminApiKeyList.tsx`/`AdminAuditLog.tsx`/`AdminConfigList.tsx` becomes canonical — a catchable error state rendered in place of perpetual "Loading..."). No page can remain in an infinite loading state after a failed fetch.
- **Mutation failures**: every mutation call site is wrapped (try/catch or `.catch`) and surfaces failure to the user via the page's existing feedback mechanism (hint text / error state), with no unhandled promise rejections. 409 conflict handling already specified elsewhere (PATT-011 helper) is preserved and routed through the same convention.

The convention is documented once (page-level pattern, e.g. in `src/ui/AGENTS.md` guidance or the shared scaffolding from CPLX-002) so new pages have a single pattern to copy.

## Approach
- Add an error state + catch to the six load paths that lack one, following the existing three-page pattern.
- Wrap the four cited bare-`await` mutation sites in try/catch that surfaces the failure (hint text or error state as the page already does elsewhere) instead of rejecting unhandled.
- Where CPLX-002's shared list hook lands, the load-error state becomes part of the shared hook so the four list pages get it by construction; sequence this fix after or together with CPLX-002 to avoid double work.

## Affected Scope
- `src/ui/pages/AdminUserList.tsx`, `AdminGroupList.tsx`, `AdminFunctionalPermissionList.tsx`, `AdminUserDetail.tsx`, `AdminGroupDetail.tsx`, `AdminFunctionalPermissionDetail.tsx` — load error states
- `src/ui/pages/AdminApiKeyDetail.tsx`, `AdminApiKeyList.tsx`, `AdminGroupDetail.tsx`, `AdminFunctionalPermissionDetail.tsx` — mutation error surfacing
- Possibly the CPLX-002 shared hook — error-state contract built in
- `src/ui/AGENTS.md` — convention note

## Explicit Constraints
- English UI text only for new error strings (root AGENTS.md).
- Error presentation follows the existing in-page pattern (no new global toast/notification system is introduced in this fix).
- Successful-path behavior unchanged; loading indicators behave as today except that failure exits them.

## Out of Scope
- ARCH-010 (page paradigm unification) — unchecked.
- SPEC-005 (failures swallowed as "no permissions"/"no overrides") — separate fix definition; that fix concerns misleading success-shaped emptiness, this one concerns missing error surfaces.
- RCT-003 (empty states) — separate fix definition; the empty-vs-failed distinction is resolved by both together.

## Downstream Impact
No — page-internal error handling; no API or component API changes.
