# Fix CFG-002 - Runtime config edits now apply to the cited subsystems

## Source
- Finding: CFG-002 (see /report/11-config-deps.md)
- Fix definition: /report/CFG-002-fix-definition.md

## Summary of Change
Made the `editInUI` promise hold for the cited subsystems: the cached `sessionTimeOut` is invalidated on the `SessionExpirationSeconds` config-upsert PubSub event (conservatively also dropping the session store built with the old TTL — existing sessions expire and users log in again); the dead `userFunctionalPermissionsCache` was removed entirely together with its logout subscription handler (permission checks stay DB-backed as today); the root-group identifier is cached with invalidation on the `RootUserGroup` config-upsert event, so `isMemberOfRootUserGroup` no longer re-reads the config row on every `authorize` call (the per-user membership lookup remains). The bundling-config caches were invalidated under PATT-006 (mechanism owned there). All return values and permission semantics are unchanged; only freshness improved.

## Files Changed
- `src/services/Auth.ts` — session-timeout invalidation, dead-cache removal, root-group cache with invalidation
- `src/services/RequestBundling.ts` — (invalidation implemented under PATT-006 in the same change set)
- `src/services/AGENTS.md` — caching policy section (with PATT-006)

## Breaking Changes for Downstream Consumers
Yes — runtime behavior change: session-timeout and bundling config edits apply without restart (a session-timeout edit drops existing sessions), and permission-check DB load is reduced. No API or export changes.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- PATT-006 (caching-idiom unification; RequestBundling invalidation mechanics) — separate fix definition, implemented in the same change set.
- CPLX-004 (hidden singletons) — unchecked.
- CFG-004 (root-group runtime mutability) — unchecked per its "[NEVER: this is on purpose.]" annotation; this fix changed only how often the value is read.

## Resolved Questions
None.
