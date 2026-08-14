# Downstream Plan: CPLX-001 — Oversized files decomposed along domain boundaries

## Upstream Change
Reference: `/report/Fix CPLX-001 - Oversized files decomposed along domain boundaries.md`. `Auth.ts` was decomposed into `src/services/auth/*` sub-modules behind an `Auth.ts` facade; all previously exported names remain available from `@/services/Auth.ts` with unchanged signatures.

## Upstream's Own Assessment
"Yes — new modules and the `Auth.ts` facade; all previously exported names remain available from `@/services/Auth.ts` (signatures unchanged), so existing importers compile unchanged. New code may import `@/services/auth/*` directly."

## Applicability to This Project
Affected: No

Evidence:
- This project's own files import only the facade surface: `import { authorize, getLoggedinUserObject } from "@/services/Auth.ts"` (e.g. `src/api/ProductAPI.ts:3`, `src/api/NotificationsAPI.ts:6`, `src/api/ScriptLogAPI.ts`) and `requirePermissions` where used — all confirmed present in the merged facade (`src/services/Auth.ts:21-25`).
- No pmdm-owned file imports a removed or decomposed-away path; the sub-modules are additive and shared.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
