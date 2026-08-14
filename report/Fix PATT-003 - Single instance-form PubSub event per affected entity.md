# Fix PATT-003 - Single instance-form PubSub event per affected entity

## Source
- Finding: PATT-003 (see /report/03-patterns-concepts.md)
- Fix definition: /report/PATT-003-fix-definition.md

## Summary of Change
Normalized publish granularity to the single instance-form convention. `src/repo/ApiKeyRepo.ts` no longer publishes tag-only + instance-form pairs: `updateApiKeyMetadata`, `prolongApiKey`, and `disableApiKey` each publish exactly one event carrying the instance tag plus the merged payload (instance fields plus the `identifiers` map), and `deleteApiKey` gained the instance form (previously tag-only). The remaining repos were swept and already conform (single per-entity events in `UserRepo`, `ConfigRepo`, `FunctionalPermissionRepo`, `UserProfileConfigRepo`; bulk mutations keep the per-entity publish loop). `src/services/AGENTS.md`'s PubSub section now states the instance form is the only form and forbids paired/tag-only publishes. Subscribers (audit log, UI) keep matching because the instance form carries the domain tag.

## Files Changed
- `src/repo/ApiKeyRepo.ts` — double-publishes collapsed; delete path uses the instance form
- `src/services/AGENTS.md` — PubSub publish convention tightened to the instance form

## Breaking Changes for Downstream Consumers
Yes — event multiplicity changed for API-key mutations: subscribers now see exactly one event per mutation instead of two, and the delete event gained an instance tag. Any subscriber written against the old multiplicity must be reviewed (in-repo subscribers were verified: the audit-log expression and UI list expressions still match the instance-form tags).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- PATT-004 (publish timing / phantom delete event) — separate fix definition, implemented in the same change set; the delete-only-on-success guard is documented there.
- PATT-010 (UI subscription scoping) — subscriber side, separate fix definition.
- SEC-009 (audit-log coverage gaps) — separate fix definition; the double-count symptom is resolved here.
- CPLX-010 (overlapping subscriptions in one page) — separate fix definition.

## Resolved Questions
None.
