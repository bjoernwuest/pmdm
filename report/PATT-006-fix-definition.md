# Fix Definition: PATT-006 — Five distinct caching idioms

## Source Finding
03-patterns-concepts.md — lazy singleton via `let x: undefined|T` + async getter (`Auth.ts:156-160,243-269,272-276`; `Setup.ts:13-29,84-96`); `TTLMap` (`src/utils/TTLMap.ts`); module-level `Map` (`ServerSentEvents.ts:154`); module-level plain caches (`Auth.ts:660-662`, `RequestBundling.ts:37-38`); DB-backed config cache

## Human Directive
None — default interpretation applies.

## Target End State
The codebase documents and follows one caching policy with a small, explicit set of sanctioned idioms, each tied to a lifetime/invalidation requirement:

- **Expiring entry sets** (sessions, permission caches, in-flight refreshes) — `TTLMap`, already the de-facto standard; remains.
- **Long-lived derived state that changes only when DB config changes** (OIDC config, request-bundling server/client config, setup-demand state) — the lazy-singleton idiom *plus* a documented invalidation path: the cache is reset when the relevant config-update PubSub event arrives (config-update events already exist per the finding). `RequestBundling.ts:37-38`'s cache-forever behavior is eliminated: runtime config edits take effect without restart.
- **Process-lifetime registries by design** (SSE client filter registry in `ServerSentEvents.ts`, `functionalPermission_Grant`) — explicitly documented in `src/services/AGENTS.md` (or a design note) as intentional process state, so they are not mistaken for ad-hoc caches.

The "five idioms" collapse to: TTLMap for expiring data, lazy singleton with invalidation for config-derived data, documented module state for process registries. Each existing cache site in the finding is classified into exactly one of these.

## Approach
- `src/services/RequestBundling.ts`: subscribe to the config-update PubSub event for the `request_bundling` domain (or the config tags published by `ConfigRepo.ts:89`) and drop `cachedServerConfig`/`cachedClientConfig` on change. This is the only behavioral change in this fix.
- `src/services/Auth.ts` `loadOIDCConfig`: add the same invalidation-on-config-change (OIDC config is DB-backed and editable via the config UI); alternatively document why it is restart-only — decision at implementation must resolve the "silently do not apply" complaint rather than preserve it.
- `src/services/Setup.ts` lazy setup-demand cache: classified and documented; interplay with SPEC-004 (setup-demand cache logic, unchecked) must be respected — do not redesign its semantics here.
- Add a short caching-policy section to `src/services/AGENTS.md` naming the sanctioned idioms and when each applies, so future code has one convention to imitate.

## Affected Scope
- `src/services/RequestBundling.ts` — config-cache invalidation
- `src/services/Auth.ts` — OIDC config cache invalidation or documented restart-only decision
- `src/services/Setup.ts` — classification/documentation only
- `src/services/AGENTS.md` — caching policy section
- Possibly `src/utils/TTLMap.ts` — unchanged, confirmed as the standard expiring-cache

## Explicit Constraints
- No cache-invalidation redesign beyond config-change-driven resets; do not introduce TTLs where correctness depends on immediate config visibility without measuring impact.
- The SSE client registry (`ServerSentEvents.ts`) and `functionalPermission_Grant` are explicitly retained as process-lifetime state; do not "fix" them into TTLMap.
- Session security semantics (900 s TTL etc.) unchanged.

## Out of Scope
- CFG-002 (runtime config edits silently not applying to *some* subsystems) — separate fix definition owning the full subsystem audit; this fix addresses the caching-idiom unification and the two named caches (`RequestBundling`, OIDC). CFG-002 may add invalidation to further subsystems.
- PATT-005 (OIDC discovery caching) — unchecked; the discovery document is a different cache than `loadOIDCConfig`'s config object.
- CPLX-004 (hidden global singletons) — unchecked.

## Downstream Impact
Yes — runtime behavior change: config edits for request bundling (and possibly OIDC) now apply without restart; `src/services/AGENTS.md` gains a policy section.
