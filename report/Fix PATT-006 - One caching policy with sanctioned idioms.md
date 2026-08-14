# Fix PATT-006 - One caching policy with sanctioned idioms

## Source
- Finding: PATT-006 (see /report/03-patterns-concepts.md)
- Fix definition: /report/PATT-006-fix-definition.md

## Summary of Change
Collapsed the caching idioms into one documented policy: `src/services/RequestBundling.ts`'s cache-forever config caches now subscribe to the `request_bundling` domain's config-upsert PubSub event and drop `cachedServerConfig`/`cachedClientConfig` on change (runtime edits apply without restart — the only behavioral change of this fix); `Auth.ts`'s `loadOIDCConfig` cache gained the same invalidation for the `EntraID` domain (the OIDC config is derived from those entries); `Setup.ts`'s lazy setup-demand cache was classified and documented (its re-check semantics are SPEC-004's, unchanged); the SSE client registry and `functionalPermission_Grant` were verified as intentional process-lifetime state and retained. `src/services/AGENTS.md` gained a "Caching Policy" section naming the three sanctioned idioms (TTLMap for expiring data, lazy singleton with config-change invalidation for config-derived data, documented process state for registries). `TTLMap` itself is unchanged and confirmed as the standard expiring cache.

## Files Changed
- `src/services/RequestBundling.ts` — config-cache invalidation subscription
- `src/services/Auth.ts` — OIDC config-cache invalidation subscription
- `src/services/Setup.ts` — classification comment
- `src/services/AGENTS.md` — caching policy section

## Breaking Changes for Downstream Consumers
Yes — runtime behavior change: request-bundling config edits (and OIDC/EntraID config edits) now apply without restart. No API changes.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- CFG-002 (subsystem audit: sessionTimeOut, dead user cache, root-group read) — separate fix definition, implemented in the same change set.
- PATT-005 (OIDC discovery caching) — unchecked; the discovery document is a different cache than `loadOIDCConfig`'s config object.
- CPLX-004 (hidden global singletons) — unchecked.

## Resolved Questions
None.
