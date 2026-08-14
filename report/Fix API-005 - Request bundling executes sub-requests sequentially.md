# Fix API-005 - Request bundling executes sub-requests sequentially as documented

## Source
- Finding: API-005 (see /report/09-api-interfaces.md)
- Fix definition: /report/API-005-fix-definition.md

## Summary of Change
Made the implementation match the documented execution model (per the human directive "ensure semantic processing"): the `Promise.allSettled`-based concurrent dispatch in `src/api/RequestBundlingAPI.ts` was replaced by a sequential `for...of` await loop — each sub-request is awaited before the next starts, so ordering assumptions (e.g. create-then-update within one batch) hold, while per-request results are still streamed as NDJSON as each completes. The OpenAPI description ("executed sequentially") is now true without rewording. The endpoint notes in `src/api/AGENTS.md` gained the explicit statements that execution is strictly sequential and that sub-response headers (including `Set-Cookie`) are not forwarded to the bundling client (endpoints relying on cookie-setting must not be bundled) — no header-forwarding mechanism was added, per the safe semantic.

## Files Changed
- `src/api/RequestBundlingAPI.ts` — dispatch loop sequentialized
- `src/api/AGENTS.md` — bundling endpoint notes: sequential execution + header-dropping rule

## Breaking Changes for Downstream Consumers
Yes — behavioral change: bundles now execute strictly sequentially (slower wall-clock for independent mutations, deterministic for dependent ones). Clients relying on concurrent execution (none should, per the documented contract) are affected. Request bundling now guarantees in-order sequential execution as documented.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- SEC-007 (arbitrary absolute URL fetching with credentials) — unchecked per its annotation; URL/credential handling was not altered.
- Client-side bundling queue (`src/ui/api/_request_bundling.ts`) — unchanged.
- PATT-006 (server config caching in `RequestBundling.ts`) — separate fix definition, implemented earlier.

## Resolved Questions
None.
