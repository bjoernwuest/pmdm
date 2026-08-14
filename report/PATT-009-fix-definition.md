# Fix Definition: PATT-009 — Two unsubscribe patterns, one deferring cleanup asynchronously

## Source Finding
03-patterns-concepts.md — static `unsubscribe(token)`: `AdminConfigList.tsx:322,470,493`; dynamic `import("@/ui/pubsub").then((m) => m.unsubscribe(token))`: `AdminUserList.tsx:103-107`, `AdminApiKeyList.tsx:137-141`, `AdminGroupList.tsx:96-100`, `AdminUserDetail.tsx:105-109`, `AdminGroupDetail.tsx:137-141,153-157`, `AdminApiKeyDetail.tsx:203-207` — files that already statically import `subscribe` from the same module

## Human Directive
None — default interpretation applies.

## Target End State
One unsubscribe idiom exists across the UI: the effect cleanup calls the statically-imported `unsubscribe(token)` synchronously (the `AdminConfigList.tsx` pattern becomes canonical). No `import("@/ui/pubsub").then(...)` cleanup remains anywhere; every file that statically imports `subscribe` from `@/ui/pubsub` also statically imports `unsubscribe` from the same module. The async cleanup race (message arriving between cleanup scheduling and execution) no longer exists.

## Approach
Mechanical replacement in the six cited files (plus a sweep for any other `import("@/ui/pubsub")` cleanup): add `unsubscribe` to the existing static import from `@/ui/pubsub` and replace the dynamic-import cleanup body with a direct synchronous `unsubscribe(token)` call, preserving the `typeof token === "string"` guard. Where a page has multiple subscriptions (`AdminGroupDetail.tsx`), each cleanup is converted. The convention ("cleanup must be synchronous via the static import") is added to `src/ui/AGENTS.md` guidance if a natural home exists (the PubSub/subscription guidance), otherwise to the code comment in `src/ui/pubsub.ts`'s `unsubscribe`.

## Affected Scope
- `src/ui/pages/AdminUserList.tsx`, `AdminApiKeyList.tsx`, `AdminGroupList.tsx`, `AdminUserDetail.tsx`, `AdminGroupDetail.tsx`, `AdminApiKeyDetail.tsx`
- Sweep target: any other `import("@/ui/pubsub")` dynamic cleanup
- `src/ui/AGENTS.md` or `src/ui/pubsub.ts` docstring — convention note

## Explicit Constraints
- No subscription-logic change: same expressions, same handlers, same guard clauses; only the cleanup path changes.
- No new module or abstraction is introduced — the fix is "use the static import everywhere".
- RCT-001 (useEffect dependency problems) is related but separate; this fix does not alter effect dependency arrays.

## Out of Scope
- RCT-001 (useEffect dependency problems across pages) — separate fix definition.
- CPLX-010 (overlapping subscriptions in one page double-applying updates) — separate fix definition.
- PATT-010 (subscription scoping) — separate fix definition touching the same files; implementations must be coordinated but remain distinct changes.

## Downstream Impact
No — internal cleanup idiom only; no exports or behavior contracts change (other than closing the cleanup race).
