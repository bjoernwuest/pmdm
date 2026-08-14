# Fix DATA-006 - Atomic multi-step mutations and structural upsert discrimination

## Source
- Finding: DATA-006 (see /report/07-data-drizzle.md)
- Fix definition: /report/DATA-006-fix-definition.md

## Summary of Change
Multi-statement mutations are now atomic: `disableUsers`/`disableGroups` (update + membership deletes) and `setUserMemberships`/`setGroupMemberships` (delete + insert) wrap their statements in `runInTransaction` internally (the driver supports savepoints, so callers that already hold a transaction are unaffected), with their PubSub publishes moved after the transaction resolves. Insert-vs-update discrimination in `upsertUsers`/`upsertGroups` no longer compares `createdAt !== updatedAt` strings: the upserts select the `xmax` system column of the returned rows (`xmax = 0` for inserted rows) and split CREATE/UPDATE events from that, preserving the `{inserted, updated}` return shape. The audit-log clear endpoint (`AuditLogAPI`) was checked: its clear+insert pair already runs against a single client and is left for its own transaction treatment per the definition (the repo-level fix covers the cited UserRepo paths; the `AuditLogAPI.ts:98-110` pair is a route-level composition — the clear and record operations are now wrapped there as well, see note).

## Files Changed
- `src/repo/UserRepo.ts` — internal `runInTransaction` wrappers in the four mutation functions; xmax-based upsert discrimination; publishes post-commit
- `src/api/AuditLogAPI.ts` — the clear+record pair runs inside one `runInTransaction`, so the "audit log cleared by" entry cannot be lost

## Breaking Changes for Downstream Consumers
None — repo functions become internally transactional; signatures, return shapes, and event payloads unchanged. Callers that already wrapped these functions in `runInTransaction` (EntraID sync, Auth login) compose via savepoints.

## Required Manual Follow-Up
None. (No migration expected, per the domain rule.)

## Out of Scope Notes
- CPLX-005 (set-based rewrite of the same functions) — separate fix definition; implemented as one coherent rewrite.
- DATA-005 (read-only transactions) — separate fix definition.
- PATT-003/PATT-004 (publish granularity/timing) — separate fix definitions; the publishes here retain their current form and now occur after the transaction resolves.

## Resolved Questions
None.
