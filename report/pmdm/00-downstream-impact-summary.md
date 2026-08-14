# Downstream Impact Summary

## Evaluated
| Upstream ID | Breaking Change | Affected Here | Status |
|---|---|---|---|
| API-001 | Error bodies become canonical JSON `{error}`; `ConfigUpdateConflictSchema` removed | Yes | Adapted |
| API-002 | Shared strict params/query schemas; 400 on invalid page/pageSize/UUIDs | Yes | Adapted |
| API-003 | No `status()` across transaction boundaries | No | Not applicable |
| API-004 | Config PUT moves from `knownValue` to `knownUpdatedAt` round-trip | Yes | Adapted |
| API-005 | Request bundling executes sub-requests sequentially | No | Not applicable |
| API-006 | OpenAPI scheme id `sessionId` → `apiKey` (+ sessionCookie/bearerToken) | No | Not applicable |
| ARCH-001 | Functional-permission pagination moved into repo layer (additive) | No | Not applicable |
| ARCH-002 | Central env module (`Env.ts`); `devmode.ts` re-export | Yes | Adapted |
| ARCH-003 | Services receive DBClient; FP registration via `registerFunctionalPermissions(db)` | Yes | Adapted |
| ARCH-005 | EntraID sync moved to autostart; `startScheduler(db)` | No | Not applicable |
| ARCH-006 | Setup server port released before main app binds | No | Not applicable |
| ARCH-008 | App factories (`createApiApp(db)` etc.) replace `app` exports | No | Not applicable |
| ARCH-009 | `/public/*` unauthenticated mount documented | No | Not applicable |
| ARCH-011 | `PageMeta.detailBreadcrumb` (additive) | No | Not applicable |
| CFG-001 | Env-var docs; advisory-lock default single-sourced in code | Yes | Adapted |
| CFG-002 | Runtime config edits apply to session-timeout/bundling subsystems | No | Not applicable |
| CFG-003 | Dependency hygiene (playwright dev-only, typescript explicit) | No | Not applicable |
| CPLX-001 | `Auth.ts` facade over decomposed `auth/*` modules | No | Not applicable |
| CPLX-002 | Shared admin list-pagination scaffolding (additive) | No | Not applicable |
| CPLX-003 | `parseBooleanQuery`/`extractErrorMessage` single-sourced | Yes | Adapted |
| CPLX-005 | Set-based batch mutations in `UserRepo` (internal) | No | Not applicable |
| CPLX-007 | Single formatter registry (page-internal) | No | Not applicable |
| CPLX-008 | Key-order-insensitive expression equality (internal) | No | Not applicable |
| CPLX-009 | Label re-seeding guarded (page-internal) | No | Not applicable |
| CPLX-010 | One reaction per config event (page-internal) | No | Not applicable |
| DATA-001 | Schema gains three indexes (migration) | Yes | Adapted (migration pending) |
| DATA-002 | Config tables gain timestamps; `knownUpdatedAt` CAS (migration) | Yes | Adapted (migration pending) |
| DATA-003 | `$onUpdate` removed; explicit `updatedAt: sql now()`; no `::timestamp` casts | Yes | Adapted |
| DATA-004 | Set-based reads replace N+1 loops (additive repo exports) | No | Not applicable |
| DATA-005 | No serializable read-write transactions around pure reads | No | Not applicable |
| DATA-006 | Atomic multi-step mutations (internal) | No | Not applicable |
| DOC-003 | Root AGENTS.md corrected | No | Not applicable |
| DOC-004 | Folder AGENTS.md filename citations corrected | No | Not applicable |
| DOC-005 | SSE terminology split resolved in docs | No | Not applicable |
| DOC-007 | Comment rot corrected; TODO-FIXME inventory resolved | No | Not applicable |
| NAME-002 | SSE UI module file renames (`sse_bridge.ts`, `sse_api.ts`) | No | Not applicable |
| NAME-003 | `getActiveServerTopics` → `getActiveServerExpressions` | No | Not applicable |
| NAME-004 | SSE endpoint names in docs corrected | No | Not applicable |
| NAME-006 | `GroupCount` → `getGroupCount` | No | Not applicable |
| NAME-007 | Setup bundle endpoint typo corrected | No | Not applicable |
| PATT-001 | Error bodies carry strings, not serialized Error objects | No | Not applicable |
| PATT-002 | Shared `requirePermissions()` replaces open-coded 403 blocks | Yes | Adapted |
| PATT-003 | Single instance-form PubSub event per API-key mutation | No | Not applicable |
| PATT-004 | PubSub events deferred until transaction commit | No | Not applicable |
| PATT-006 | One caching policy (config-change invalidation) | No | Not applicable |
| PATT-007 | Complete UI API wrapper layer (additive) | No | Not applicable |
| PATT-008 | Bundling bypass for SSE sync documented | No | Not applicable |
| PATT-009 | Single synchronous unsubscribe idiom | No | Not applicable |
| PATT-010 | Narrowly scoped PubSub subscriptions | No | Not applicable |
| PATT-011 | Shared save-confirmation helper (additive) | No | Not applicable |
| PATT-012 | Shared array-editor modal (additive) | No | Not applicable |
| RCT-001 | Minimal useEffect dependency arrays (page-internal) | No | Not applicable |
| RCT-002 | One failure convention across admin pages | No | Not applicable |
| RCT-003 | Explicit empty states on table list pages | No | Not applicable |
| RCT-004 | Toggle as single toggle primitive | No | Not applicable |
| RCT-005 | Honest loading indicator; imperative handles | No | Not applicable |
| RCT-006 | Save handlers read latest groups via ref mirror | No | Not applicable |
| SEC-006 | Forwarded-header trust gated behind `TRUST_PROXY` | No | Not applicable |
| SEC-008 | public mount traversal safety verified/documented | No | Not applicable |
| SEC-009 | Audit subscription covers config upserts | No | Not applicable |
| SPEC-002 | Dead controls removed; dashboard content honest | No | Not applicable |
| SPEC-003 | Client PubSub surface aligned (`subscribeOnce` widened) | No | Not applicable |
| SPEC-005 | `/api/me/context` can return 500 | No | Not applicable |
| SPEC-006 | Login redirect param unified on `returnTo` | No | Not applicable |
| SPEC-007 | Dead code removed; strict numeric save validation | No | Not applicable |
| TS-001 | Unsafe casts replaced; `AuditEntry.payload` → `Record<string, unknown>` | No | Not applicable |
| TS-002 | Non-null assertions replaced (internal) | No | Not applicable |
| TS-003 | Bun-first API idioms | No | Not applicable |
| TS-004 | `NODE_ENV` no longer read; `DEV_MODE` is the single idiom | No | Not applicable |
| TS-005 | `ConfigEntryUI` gains `updatedAt` (additive) | No | Not applicable |
| TS-006 | `satisfies` mismatch in `getUsers` corrected | No | Not applicable |
| VB-AI-003 | AGENTS.md canonical file examples resolve | No | Not applicable |
| VB-AI-004 | AGENTS.md precedence rule at both levels | No | Not applicable |

## Divergences from Upstream Assessment
Upstream's "Breaking Changes for Downstream Consumers" field said "None" (or "None for clients"/"None for the existing surface") but this project's evaluation concluded "Affected: Yes":

- **ARCH-002** (upstream: "None for the existing surface") — pmdm's divergent `src/devmode.ts` re-declared `sqlLogging` (duplicate module export) and read `process.env` directly for an unused `debugFrontend`; fixed by restoring the pure upstream re-export.
- **CFG-001** (upstream: "None") — pmdm's own `README.md` documented `ADVISORY_LOCK` as required, contradicting the merged code default; corrected to optional with the `Env.ts` default.
- **DATA-003** (upstream: "None for clients … internal") — pmdm's divergent `src/schema/helpers.ts` still carried `$onUpdate`, and pmdm-owned repo update paths relied on it; removed the driver-side generation and made every pmdm-owned update path set `updatedAt: sql\`now()\`` explicitly, plus removed two `::timestamp` comparison casts in `ProductRepo.ts`.

## Consolidated Manual Follow-Up
- **Apply the pending database migration** (covers DATA-001's indexes and DATA-002's `config`/`user_profile_config` timestamp columns; this project's consolidated migration is `src/migrations/20260814174708_yummy_ozymandias.sql`). Run by starting the app (`initDatabase()` runs Umzug) or the project's migration runner.
- **Optional typegen check** (DATA-002): `bun run typegen` to regenerate `_ConfigType.ts`/`_UserProfileConfigType.ts` — the shared files already match upstream's hand-extended output, so this is a consistency check only.
- No other migrations, installs, builds, or generation steps are required by the adapted IDs. Type checking/building is part of the project's normal workflow and was not executed here.
