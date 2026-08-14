# Fix Definition: CFG-002 — Runtime config edits silently do not apply to some subsystems

## Source Finding
11-config-deps.md — `sessionTimeOut` cached forever at module level (`Auth.ts:108-120`, never invalidated despite config `TAG_UPSERT` events); bundling config cached forever (`RequestBundling.ts:37-38`); `userFunctionalPermissionsCache` declared but never populated, only deleted (`Auth.ts:660,724`) — dead cache; `isMemberOfRootUserGroup` performs 2 DB queries per call (`Auth.ts:676-681,712-719`) on every `authorize`

## Human Directive
None — default interpretation applies.

## Target End State
The `editInUI` promise holds for the cited subsystems:

- `sessionTimeOut` (`Auth.ts:108-120`): a runtime edit of `SessionExpirationSeconds` takes effect without restart — the cache is invalidated on the config-change PubSub event (config upserts already publish `TAG_UPSERT`-tagged events per `ConfigRepo.ts:89-95`, scoped by domain/key) or re-read per the PATT-006 policy. New sessions and session-expiry checks use the current value.
- Bundling config (`RequestBundling.ts:37-38`): same invalidation-on-config-change behavior — owned mechanically by PATT-006; this fix tracks it as in-scope for the *subsystem audit* and the two definitions must land consistently (PATT-006 implements; CFG-002 verifies and covers any subsystem PATT-006 did not name).
- The dead `userFunctionalPermissionsCache` is either wired to actually cache (populated on authorize, invalidated on logout/permission changes) or — the simpler, safer resolution — removed entirely, with the logout/permission-change subscriptions cleaned up accordingly. Default: **remove the dead cache** (permission checks stay as they are today, DB-backed; no new cache-invalidation surface is introduced in the auth hot path).
- `isMemberOfRootUserGroup`'s two-queries-per-call shape is reduced: the root-group identifier is cached with config-change invalidation (same mechanism as sessionTimeOut), so `authorize` does not re-read the config row on every call. The membership lookup per user remains (it is per-request state), unless a trivially safe batch form exists — the goal is eliminating the config read, not redesigning permission checks.

## Approach
Subscribe the owning modules to the config-change event filtered to their domain (`Authentication and Authorization` / `request_bundling`), dropping the cached values on change. Remove `userFunctionalPermissionsCache` and its two subscription handlers if unused after removal (verify no other module references it). Add the root-group-identifier cache with the same invalidation. All changes preserve current return values and semantics; only freshness improves.

## Affected Scope
- `src/services/Auth.ts` — sessionTimeOut invalidation, dead-cache removal, root-group cache
- `src/services/RequestBundling.ts` — invalidation (with PATT-006)
- `src/services/PubSub.ts` usage — new subscriptions in those modules

## Explicit Constraints
- Security invariant: invalidation must be conservative — when in doubt, expire (never serve stale *permissions* beyond what today's TTLs already allow; the removed dead cache must not reduce permission freshness).
- No behavior change for unchanged config values.
- Boundary with PATT-006 (idiom unification + the two named caches) respected: this fix owns the subsystem audit outcome (sessionTimeOut, dead cache, root-group read); mechanism consistency with PATT-006's policy is required.
- CPLX-004 is unchecked — do not attempt a global-singleton redesign.

## Out of Scope
- PATT-006 (caching-idiom unification, RequestBundling/OIDC mechanics) — separate fix definition.
- CPLX-004 (hidden singletons) — unchecked.
- CFG-004 (root-group runtime mutability) — unchecked per its "[NEVER: this is on purpose.]" annotation; this fix changes only how often the value is read, not its editability.

## Downstream Impact
Yes — runtime behavior change: session-timeout and bundling config edits apply without restart; permission-check DB load reduced. No API or export changes.
