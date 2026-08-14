# Fix Definition: TS-002 — Widespread non-null assertions

## Source Finding
05-typescript-bun.md — `Toggle.tsx:115,187,189,239,248,256,320-322,341,355,377,392`; `InputField.tsx:208`; `Label.tsx:101`; `PageRegistry.ts:89,164,198,212,214`; `AdminUserList.tsx:182`; `AdminGroupList.tsx:171`; `AdminApiKeyList.tsx:284`; `UserProfileConfigList.tsx:304`; `availablePageSizes[0]!` in `AdminApiKeyDetail.tsx:108`, `AdminUserList.tsx:124`, `AdminGroupList.tsx:117`, `AdminFunctionalPermissionList.tsx:62`, `AdminFunctionalPermissionDetail.tsx:81`, `AdminGroupDetail.tsx:102`; `src/ui/index.tsx:26`

## Human Directive
None — default interpretation applies.

## Target End State
The cited non-null assertions are replaced by constructs that carry the invariant in code: length checks before indexing (`effective[0]` guarded by the `length === 1` check already present — restructure so the compiler sees it), early returns, explicit `if (!x) return/throw` with meaningful fallback behavior, default values (`??`), or locally-evident narrowing. `document.getElementById("root")!` in `src/ui/index.tsx:26` is guarded by an explicit existence check with a clear error. After the sweep, `!` assertions remain only where the invariant is structurally guaranteed and locally obvious (e.g. immediately after a length check the compiler cannot track); the pervasive pattern is gone from the cited files.

Special case: `useRef<Handle>(null!)` in `Label.tsx:101` / `Toggle.tsx` / `InputField.tsx` is TS-007's subject, which is **unchecked** — this fix therefore does not touch the `null!` ref-initialization pattern itself; it covers only the other assertions at the cited lines. Where a cited line *is* a `null!` ref case, it is deferred to TS-007's future scope and noted as excluded here.

## Approach
File-by-file replacement: index assertions after length checks become destructuring after explicit guards; `availablePageSizes[0]!` becomes a guarded fallback (the pages already check `availablePageSizes.length > 0` in most paths — restructure so the guard dominates the access); `menu.parent!` in `PageRegistry.ts` becomes filter-then-map without assertion (the filter already checks truthiness — restructure to a `flatMap`/type-guard so narrowing is preserved). Behavior on the genuinely-undefined path: fall back to the current defensive default where one exists nearby, otherwise fail with a descriptive error — never a silent continuation that today would have crashed.

## Affected Scope
- `src/ui/components/Toggle.tsx`, `InputField.tsx`, `Label.tsx` (non-`null!` sites only)
- `src/ui/PageRegistry.ts`
- `src/ui/pages/AdminUserList.tsx`, `AdminGroupList.tsx`, `AdminApiKeyList.tsx`, `UserProfileConfigList.tsx`, `AdminApiKeyDetail.tsx`, `AdminFunctionalPermissionList.tsx`, `AdminFunctionalPermissionDetail.tsx`, `AdminGroupDetail.tsx`
- `src/ui/index.tsx`

## Explicit Constraints
- No runtime behavior change on success paths.
- The `null!` ref pattern is excluded (belongs to unchecked TS-007); do not opportunistically fix it here.
- Replacements must satisfy `noUncheckedIndexedAccess` honestly — no assertion swapped for an equivalent `as` cast.

## Out of Scope
- TS-007 (`useRef<Handle>(null!)` + render-phase assignment) — unchecked; overlapping lines are deferred.
- CPLX-006 (Toggle/InputField duplication) — unchecked.
- Any `!` sites outside the cited files beyond a verifying sweep (sweep findings are reported, not fixed, unless trivially the same pattern).

## Downstream Impact
No — internal code constructs only; no exports or behavior contracts change.
