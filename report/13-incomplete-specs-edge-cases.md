# 13 — Incomplete/Inconsistent Specs & Edge Cases

## Rubric
Features are either complete or explicitly flagged as in progress; user-visible controls are functional; half-migrated systems do not leave dead or asymmetric public surfaces; empty states, failure paths, and concurrency cases are handled; and design docs agree with code on feature status. Good means: no dead buttons, no silently swallowed failures, no dead template files, and consistent redirect/auth edge behavior.

### [SPEC-001] Bearer-token auth path half-implemented
- **Location(s):** `src/services/Auth.ts:767-770` (FIXME: "get groups from OAUTH token") — `getMyFunctionalPermissions` returns `[]` for bearer-authenticated requests
- **Description:** Bearer tokens authenticate but grant zero permissions.
- **Why it matters:** An authentication mechanism that can never authorize is a trap for API consumers; the FIXME is not tracked in any backlog file.
- **Related findings:** DOC-007

### [SPEC-002] Dead user-visible controls and mock data presented as the app
- **Location(s):** `src/ui/app.tsx:250` ("View docs" button, no handler), `:291-293` (notifications bell, no handler); `src/ui/pages/Dashboard.tsx` entirely hard-coded mock data (e.g. $24k budget) as the start page; `AdminConfigList.tsx:711-723` (`configureObjectSchema` mutates Monaco's global `jsonDefaults` on every dialog open without reset)
- **Description:** Shipped UI contains inert controls and placeholder data.
- **Why it matters:** Users click controls that do nothing; global Monaco schema state leaks between dialogs.
- **Related findings:** RCT-004, SEC-009

### [SPEC-003] PubSub client API asymmetry and dead surface
- **Location(s):** `src/ui/pubsub.ts:45-51,207-209` (`subscribeOnce` returns `this` on the class but `void` from the exported wrapper); `clearSubscriptions`/`countSubscriptions`/`getSubscriptions`/`getServerExpressions` exist only on the class, never exported; `getActiveServerTopics` stale name (`:219-221`)
- **Description:** The exported API and the class API diverge; part of the class surface is unreachable.
- **Why it matters:** Callers cannot rely on consistent return values; exported names mislead.
- **Related findings:** NAME-003

### [SPEC-004] Setup-demand cache logic and polling rescan
- **Location(s):** `src/services/Setup.ts:94-96` (`if (!demand || 0 < demand.size) demand = await getMissingConfigParameters(...)` — refetches whenever non-empty); the completion poll loop (`apps/setup.ts:241-247`) calls `getSetupDemand` every 2s, rescanning services; once empty, the result is cached forever
- **Description:** The demand check rescans on every poll while work remains and never re-evaluates after completion.
- **Why it matters:** Repeated dynamic imports and DB scans in the polling loop; config problems appearing after setup are never re-detected.
- **Related findings:** ARCH-006

### [SPEC-005] Failures swallowed as "no permissions" or "no overrides"
- **Location(s):** `src/api/MeAPI.ts:11` (`.catch(() => [])` hides DB/permission-layer failures); `AdminConfigList.tsx:288` (fetches `/api/me/config` for override badges, catches errors into an empty list silently)
- **Description:** Outages are masked as legitimate empty results.
- **Why it matters:** Authorization-loss and DB outages present as "user has no permissions", hiding real failures.
- **Related findings:** —

### [SPEC-006] Login redirect parameter mismatch
- **Location(s):** `src/ui/api/session.ts:8` redirects to `/login?target=...` (from the 401 interceptor); `src/login/Login.tsx:10` reads `returnTo`, not `target`
- **Description:** The post-error re-login target parameter is silently dropped by parameter-name mismatch.
- **Why it matters:** Users are returned to the default landing page instead of their intended destination after re-authentication.
- **Related findings:** —

### [SPEC-007] Miscellaneous dead code and unhandled edge cases
- **Location(s):** `src/repo/ApiKeyRepo.ts:331-343` (`validateApiKeySecret` has a meaningless `orderBy(desc(createdAt)).limit(1)` on a query that can match at most one hash); `src/services/auth/ApplicationDefinedFunctionalPermissions.ts:1-6` (all imports unused — dead template file, passing only because `noUnusedLocals: false`, `tsconfig.json:31-33`); three page-registry files (`src/ui/PageRegistry.ts`, `src/ui/app_PageRegistry.ts`, `src/ui/_pageRegistry.generated.ts`); `ApiKeyRepo.ts:279-280` (publishes DELETE event even when nothing was deleted); `AdminConfigList.tsx:531`/`UserProfileConfigList.tsx:254` (`parseFloat` accepts partial numbers on save)
- **Description:** Dead ordering, dead template code, redundant registry files, phantom delete events, and permissive numeric validation.
- **Why it matters:** Dead code accumulates and is imitated; phantom events mislead UI; invalid values persist.
- **Related findings:** SEC-010, PATT-004, NAME-005
