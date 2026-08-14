# Fix API-003 - No HTTP responses across transaction boundaries

## Source
- Finding: API-003 (see /report/09-api-interfaces.md)
- Fix definition: /report/API-003-fix-definition.md

## Summary of Change
Restructured the two remaining `status()`-through-transaction sites so no HTTP response object crosses a `runInTransaction` boundary: the functional-permission grant and revoke handlers in `src/api/FunctionalPermissionAPI.ts` now have transaction callbacks that return typed domain outcomes (`{ ok: true }` / `{ ok: false, reason }`), with the 404 mapping performed in the handler after the transaction resolves. The result-sniffing duck-type check (`"status" in result`) is gone. The `UserAPI.ts` site dissolved earlier in this change set via DATA-005 (read-only transaction removal). The "transactions return outcomes; routes map outcomes to HTTP" rule was added to `src/api/AGENTS.md`'s Transactions section. Client-visible status codes and bodies (per API-001's canonical shape) are unchanged; partial-grant commit behavior on failure is preserved as before.

## Files Changed
- `src/api/FunctionalPermissionAPI.ts` — grant and revoke handlers use two-phase outcome structure; duck-typing removed
- `src/api/AGENTS.md` — Transactions section gains the outcome-mapping rule

## Breaking Changes for Downstream Consumers
None. Server-internal control flow; HTTP contract unchanged.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- DATA-005 (read-only transaction removal, which dissolved the `UserAPI` instance) — separate fix definition, implemented first.
- API-001 (error body shapes) — separate fix definition; the outcomes map to its canonical shapes.
- PATT-004 (publish-before-commit) — separate fix definition.

## Resolved Questions
None.
