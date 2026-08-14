# Fix Definition: API-005 — Request bundling semantics contradict its own description

## Source Finding
09-api-interfaces.md — `src/api/RequestBundlingAPI.ts:327` says sub-requests are "executed sequentially" but `:293` uses `Promise.allSettled` (concurrent); sub-response headers including `Set-Cookie` are discarded (`:251-263`)

## Human Directive
"API-005 — Request bundling semantics contradict its own description - ensure semantic processing"

## Target End State
The implementation matches the documented execution model — "ensure semantic processing" is binding: sub-requests in a bundle are **executed sequentially**, in request order, so ordering assumptions (e.g. create-then-update within one batch) hold. The `Promise.allSettled`-based concurrent dispatch at `:293` is replaced by sequential dispatch (each sub-request awaited before the next starts), with per-request results still streamed as NDJSON as each completes (streaming behavior preserved — sequential execution does not delay the stream's first line beyond the first sub-request's completion). The OpenAPI/summary text at `:327` remains accurate without rewording ("executed sequentially" becomes true).

Sub-response headers: the discarded-headers behavior is made explicit rather than silently lossy — the endpoint's documentation states that sub-response headers (including `Set-Cookie`) are not forwarded to the bundling client, and that endpoints relying on cookie-setting must not be bundled. (No header-forwarding mechanism is added: forwarding `Set-Cookie` from sub-requests would let a bundled logout/login mutate the bundler's own session mid-stream — dropping headers is the safe semantic; the gap is documentation, which this fix closes.)

## Approach
Replace the concurrent map/`allSettled` with a sequential `for...of` await loop over the sub-requests inside the stream producer; keep the existing per-request timeout/error mapping (`mayHaveExecuted`, `serverMayTakeUntil`) and flush logic intact. Update the endpoint notes in `src/api/AGENTS.md`'s Request Bundling section to state sequential execution and the header-dropping rule.

## Affected Scope
- `src/api/RequestBundlingAPI.ts` — dispatch loop sequentialized; docs text verified
- `src/api/AGENTS.md` — bundling endpoint notes gain the header-dropping statement

## Explicit Constraints
- Sequential = completion order equals submission order; no interleaving of sub-request execution.
- NDJSON streaming shape, timeout semantics, `clientRequestId` duplicate detection, and nested-bundling rejection are unchanged.
- Auth-header forwarding to sub-requests is unchanged (SEC-007 is unchecked — do not alter URL/credential handling here).
- Performance note: sequential execution is the directive's chosen semantic; do not "optimize" back to concurrency.

## Out of Scope
- SEC-007 (arbitrary absolute URL fetching with credentials) — unchecked per its annotation.
- Client-side bundling queue behavior (`src/ui/api/_request_bundling.ts`) — unchanged.
- PATT-006 (server config caching in `RequestBundling.ts`) — separate fix definition.

## Downstream Impact
Yes — behavioral change: bundles now execute strictly sequentially (slower wall-clock for independent mutations, deterministic for dependent ones). Clients relying on concurrent execution (none should, per the documented contract) are affected. One line for downstream: request bundling now guarantees in-order sequential execution as documented.
