# Fix Definition: SPEC-005 — Failures swallowed as "no permissions" or "no overrides"

## Source Finding
13-incomplete-specs-edge-cases.md — `src/api/MeAPI.ts:11` (`.catch(() => [])` hides DB/permission-layer failures); `AdminConfigList.tsx:288` (fetches `/api/me/config` for override badges, catches errors into an empty list silently)

## Human Directive
None — default interpretation applies.

## Target End State
Failures are no longer indistinguishable from legitimate emptiness:

- `src/api/MeAPI.ts:11` — the `.catch(() => [])` is removed: if `getMyFunctionalPermissions` fails (DB error, permission-layer fault), the endpoint returns a 500 (canonical shape per API-001) instead of a 200 with empty permissions. A user with legitimately zero permissions still gets a 200 with an empty list — only the failure case changes.
- `AdminConfigList.tsx:288` — the profile-override fetch failure is surfaced: the page treats a failed `/api/me/config` (profile overrides) call as a load error (reusing the page's existing error state from RCT-002) or, at minimum, renders an explicit non-empty-state indication that override badges are unavailable — it must not silently render "no overrides" badges-absent as if authoritative. Default resolution: let the `Promise.all` rejection flow into the existing `loadEntries` error path (the whole load fails visibly) — this is the honest behavior since config and overrides are one logical dataset for this page.

## Approach
Remove the swallow in `MeAPI.ts` (let the error propagate to Elysia's error handling or map it explicitly to the canonical 500). In `AdminConfigList.tsx`, drop the per-call `.catch(() => ({ entries: [] }))` so the combined load fails into the existing error state (which RCT-002 guarantees exists; if RCT-002 has not landed, this fix adds the error state for this page as part of its own scope). Verify `MeContextResponseSchema` consumers (pages reading `/api/me/context`) handle a 500 path — they use the standard API helpers, which throw `ApiError` on non-OK, landing in the pages' load-error handling (RCT-002 ensures the surfaces exist).

## Affected Scope
- `src/api/MeAPI.ts` — failure propagation
- `src/ui/pages/AdminConfigList.tsx` — override-fetch failure surfaces
- Response schema for 500 on the me/context route, per API-001 conventions (add `500` to the route's `response` map with the canonical description)

## Explicit Constraints
- A legitimate empty permission set still returns 200 with `[]` — only errors change.
- No retry/timeout policy changes.
- Coordinate with RCT-002 (error surfaces) and API-001 (500 shape): this fix uses their conventions; do not invent a page-specific error UI.

## Out of Scope
- ARCH-011's silent `.catch(() => undefined)` in breadcrumb label fetches — deliberate degradation (breadcrumb falls back to static label), documented in ARCH-011's definition; not this fix.
- RCT-002 (page error surfaces generally) — separate fix definition.
- DOC-003's related SPEC-005 mention — the AGENTS.md side is DOC-003's scope.

## Downstream Impact
Yes — `/api/me/context` can now return 500 (previously never); clients must already handle non-200 paths (the UI API helpers throw). Error-body shape follows API-001.
