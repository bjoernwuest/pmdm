# Fix PATT-010 - Narrowly scoped PubSub subscriptions with payload identifiers

## Source
- Finding: PATT-010 (see /report/03-patterns-concepts.md)
- Fix definition: /report/PATT-010-fix-definition.md

## Summary of Change
The admin list pages now subscribe narrowly scoped to their domain: `AdminUserList` uses `{ and: [TAG_USER, { or: [TAG_UPDATE, TAG_DISABLE] }] }`, `AdminApiKeyList` uses `TAG_API_KEY`, `AdminGroupList` uses `TAG_GROUP` — events from other domains no longer reach these handlers. The entity identifier is read from the event payload (`identifier` field or the `identifiers` map, per the PATT-003-normalized publish payloads) instead of a UUID regex over the tag list; the regex derivation is gone from all three pages, and the previously dead domain-tag imports are now the ones actually used. The ref-map key lookup remains the applicability check, and the handler update logic is unchanged. A sweep found no other page with the UUID-regex pattern.

## Files Changed
- `src/ui/pages/AdminUserList.tsx` — domain-scoped subscription; payload-based identifier extraction
- `src/ui/pages/AdminApiKeyList.tsx` — same (api_key identifier)
- `src/ui/pages/AdminGroupList.tsx` — same (group identifier)

## Breaking Changes for Downstream Consumers
None — subscriber-side narrowing only; publish payloads already carry the identifiers (guaranteed by PATT-003, implemented in the same change set).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- PATT-009 (unsubscribe idiom) and CPLX-010 (overlapping subscriptions) — separate fix definitions touching the same files.
- CPLX-002 (admin list-page scaffolding duplication) — separate fix definition; no shared list-page hook was extracted here.
- VB-AI-001 — unchecked.

## Resolved Questions
None.
