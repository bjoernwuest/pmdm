# Downstream Plan: PATT-002 — Shared requirePermissions() 403 helper

## Upstream Change
Reference: `/report/Fix PATT-002 - Shared requirePermissions() 403 helper.md`. Added `requirePermissions(dbClient, claims, requiredPermissions, additionalGrantedPermissions?)` to `src/services/Auth.ts` returning `{ ok: true, authz } | { ok: false, denial }` (denial = canonical 403 `{ error }` response). All upstream route files replaced their open-coded `claims → authorize → 403` blocks with the helper; `src/api/AGENTS.md` now mandates it. Denial semantics unchanged (same 403, same permission names in messages, same auth precedence).

## Upstream's Own Assessment
"Yes — new shared helper export `requirePermissions` in `@/services/Auth.ts`; route files no longer call `authorize` directly for the 403 pattern. Denial semantics unchanged (same status code, same required-permission naming in messages, same session-claims-before-token-claims precedence); `cfgRootUserGroup` bypass behavior inside `authorize()` is untouched."

## Applicability to This Project
Affected: Yes

Evidence:
- Every pmdm-owned route file still open-codes the pre-fix pattern `const authz = await authorize(...); if (!authz.some(...)) return status(403, ...)` — e.g. `src/api/_crud_API.ts` (5 permission blocks), `src/api/ProductAPI.ts` (8), `src/api/ProductTypesAPI.ts` (~30), `src/api/ConsumablesAPI.ts`, `LookupsAPI.ts`, `DataTypesAPI.ts`, `NotificationsAPI.ts`, `ProductExportAPI.ts`, `ProductRequestAPI.ts`, `ScriptApi.ts`, `ScriptLogAPI.ts` — the exact pattern upstream eliminated.
- The merged `requirePermissions` helper exists in `src/services/Auth.ts`/`auth/permissions.ts` and is already mandated by the merged `src/api/AGENTS.md` ("must check functional permissions via the shared requirePermissions() helper — do not open-code the claims/authorize/403 sequence").
- The shared route files (ApiKeyAPI, UserAPI, GroupAPI, ConfigAPI, AuditLogAPI, FunctionalPermissionAPI, MeAPI) are already converted via the merge.

## Target End State
No pmdm-owned route file open-codes the claims→authorize→403 sequence; all permission checks go through `requirePermissions`, with the same denial semantics (403, same permission names). Gatekeeper-plus-domain checks pass both permissions as required (AND, as today); OR-variant checks (alternative list permissions, `FP_READ_PRODUCT_FILTER`) request the permissions as additional and perform the OR subset check against `permissionCheck.authz` with the current message text.

## Approach
Per file:
1. Replace the `authorize` import with `requirePermissions` (keep `getLoggedinUserObject` where used).
2. Single-permission blocks: `const permissionCheck = await requirePermissions(db, claims, [FP_X]); if (!permissionCheck.ok) return permissionCheck.denial;`; replace subsequent `authz` references with `permissionCheck.authz`.
3. AND blocks (gatekeeper + domain permission): pass both as required.
4. OR blocks (e.g. `FP_VIEW_X || FP_READ_PRODUCT_FILTER`, alternative list permissions in `_crud_API`): required = gatekeeper only (when present), additional = the OR set; keep the existing OR check and message against `permissionCheck.authz`.

## Affected Scope
- `src/api/_crud_API.ts`
- `src/api/DataTypesAPI.ts`, `ConsumablesAPI.ts`, `LookupsAPI.ts`, `NotificationsAPI.ts`, `ProductAPI.ts`, `ProductExportAPI.ts`, `ProductRequestAPI.ts`, `ProductTypesAPI.ts`, `ScriptApi.ts`, `ScriptLogAPI.ts`

## Anticipated Manual Follow-Up
None.

## Open Questions
None.
