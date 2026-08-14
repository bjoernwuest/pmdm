# Fix CPLX-010 - One reaction per config event in AdminConfigList

## Source
- Finding: CPLX-010 (see /report/04-complexity-maintainability.md)
- Fix definition: /report/CPLX-010-fix-definition.md

## Summary of Change
`AdminConfigList.tsx` now reacts to each config-update event exactly once: the overlapping `{ and: [TAG_CONFIG, TAG_UPDATE] }` full-reload subscription (which called `loadEntries()`) was removed, and the `{ and: [TAG_CONFIG] }` targeted in-place merge remains the page's single reaction to config events. Verification showed the full reload provided no state the merge misses: config values update live via the merge (with the stored `updatedAt`), editing rows keep their per-entry concurrent-modification subscriptions (`{ and: [TAG_CONFIG, domain, key, TAG_UPDATE] }`) and hint/dirty protection, and no runtime path creates or deletes config entries (the API only updates values), so no reload-only structure refresh exists. Profile-override data was never refreshed by the removed subscription (those events carry `TAG_USER_PROFILE_CONFIG`, not `TAG_CONFIG`).

## Files Changed
- `src/ui/pages/AdminConfigList.tsx` — full-reload subscription effect removed; targeted merge remains the single reaction

## Breaking Changes for Downstream Consumers
None — page-internal subscription wiring only; live value updates and editing-row protection are preserved.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- RCT-001 (useEffect dependency problems generally) — separate fix definition.
- PATT-003/PATT-004 (publish granularity/timing) — publisher side, separate fix definitions, implemented earlier in the same change set.
- CPLX-001/CPLX-002 (size/scaffolding) — separate fix definitions.

## Resolved Questions
None.
