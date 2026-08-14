# Fix PATT-001 - One error-propagation strategy per layer

## Source
- Finding: PATT-001 (see /report/03-patterns-concepts.md)
- Fix definition: /report/PATT-001-fix-definition.md

## Summary of Change
Normalized error propagation at the layer boundaries: repo functions keep throwing `Error`; `src/services/Config.ts`'s internal `{ok, …}` Result idiom was verified unchanged; at the route boundary every catch that forwarded a raw caught `Error` into a response body (`GroupAPI.ts`, `FunctionalPermissionAPI.ts` — "Could not resolve user"/"Could not grant"/"Could not revoke" sites) now converts it to `String(_err)` before it enters `message`; the global 401 auth hook in `src/apps/api.ts` now produces its `{error, message}` body through Elysia's `status()` instead of a hand-built `new Response(JSON.stringify(...))`; the setup wizard's two HTTP 401 responses were normalized from plain-text bodies to the `{ error }` JSON shape (its internal Result-style parsing remains). `src/api/AGENTS.md`'s error-handling example now shows the string conversion, so no example forwards a raw error anymore.

## Files Changed
- `src/api/GroupAPI.ts` — caught errors converted via `String(_err)` at the three grant/revoke/resolve sites
- `src/api/FunctionalPermissionAPI.ts` — same conversion at the four sites
- `src/apps/api.ts` — global 401 hook now uses `status(401, { error, message })`
- `src/apps/setup.ts` — two 401 responses normalized to `{ error }` JSON with `Content-Type: application/json`
- `src/api/AGENTS.md` — error-handling example corrected to `message: String(_err)`; one-strategy-per-layer convention stated alongside the error-shape contract
- `src/services/Config.ts` — verified only: internal Result idiom retained

## Breaking Changes for Downstream Consumers
Yes — error bodies for the affected routes changed from possibly-serialized `Error` objects to strings in `message` (the envelope itself was canonicalized by API-001 in the same change set). The setup wizard's 401 body changed from plain text `"Unauthorized"` to `{"error":"Unauthorized"}` (JSON).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- API-001 (canonical wire schema, including `ErrorSchema.message` tightening) — separate fix definition, implemented first; this fix assumed that shape.
- PATT-002 (authorize/403 boilerplate helper) — separate fix definition.
- SPEC-005 (failures swallowed as "no permissions"/"no overrides") — separate fix definition.

## Resolved Questions
None.
