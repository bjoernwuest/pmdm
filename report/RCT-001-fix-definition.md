# Fix Definition: RCT-001 — useEffect dependency problems across pages

## Source Finding
06-react-frontend.md — `AdminApiKeyDetail.tsx:119-121` (effect depends on both `searchParams.toString()` and derived `permissionsPage`/`permissionsPageSize`, and calls an outer `load` re-created each render but not in deps); `AdminApiKeyList.tsx:198-200` (same outer-`load` pattern); `AdminConfigList.tsx:436,472` (effects re-subscribe and re-seed InputField on every `groups` change, including the passive PubSub update at `:475-494` — an incoming SSE for a different key re-runs the inline-edit effect); `AdminUserList.tsx:65-76`, `AdminApiKeyList.tsx:104-113` (seeding effects re-run `setText` on all refs on every data change)

## Human Directive
None — default interpretation applies.

## Target End State
Every cited effect has a correct, minimal dependency array and no stale closures:

- The `load`-calling effects (`AdminApiKeyDetail.tsx`, `AdminApiKeyList.tsx`) either wrap `load` in `useCallback` with its own correct deps and depend on it, or inline the load body into the effect; the redundant double dependency (`searchParams.toString()` plus values derived from those same params) is resolved to one source of truth — the derived primitive values.
- `AdminConfigList.tsx:436,472` — the inline-edit re-subscribe/re-seed effects no longer depend on the whole `groups` array; they depend on the specific entry being edited (derived by the edit target's domain+key), so SSE updates to *other* keys do not churn subscriptions or clobber an in-progress edit.
- The seeding effects (`AdminUserList.tsx:65-76`, `AdminApiKeyList.tsx:104-113`) re-seed only on actual data change — this is jointly owned with CPLX-009's guard (CPLX-009 owns the guard; this fix owns the dependency-array correctness of those effects).

## Approach
Restructure the cited effects: derive edit-target-specific dependencies instead of whole-collection dependencies; use `useCallback` for load functions consumed by effects; keep cancellation flags. The page behavior (what loads when, what re-seeds when) is preserved for the *intended* triggers and eliminated for the spurious ones (SSE for unrelated keys, redundant param double-counting). Coordinate with CPLX-009 (guard) and CPLX-010 (subscription consolidation) which touch the same effects — the end state must satisfy all three definitions simultaneously.

## Affected Scope
- `src/ui/pages/AdminApiKeyDetail.tsx`, `AdminApiKeyList.tsx`, `AdminConfigList.tsx`, `AdminUserList.tsx`

## Explicit Constraints
- Rules-of-hooks compliant results; no conditional hooks introduced.
- No regression in loading behavior: pagination changes, id changes, and live updates must still trigger the intended reload/re-seed exactly once.
- Interactions with CPLX-009/CPLX-010 in the same files must be reconciled, not layered blindly.

## Out of Scope
- CPLX-009 (double-seeding contract) and CPLX-010 (overlapping subscriptions) — separate fix definitions owning their aspects.
- PATT-009 (unsubscribe idiom) — separate fix definition.
- ARCH-010 (page paradigm unification) — unchecked.

## Downstream Impact
No — page-internal effect restructuring only.
