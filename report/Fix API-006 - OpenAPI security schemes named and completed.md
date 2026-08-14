# Fix API-006 - OpenAPI security schemes named and completed

## Source
- Finding: API-006 (see /report/09-api-interfaces.md)
- Fix definition: /report/API-006-fix-definition.md

## Summary of Change
The swagger configuration in `src/apps/api.ts` now documents all three real authentication mechanisms under self-describing scheme ids: `apiKey` (type apiKey, header `X-API-Key`), `sessionCookie` (type apiKey, cookie `SessionID`), and `bearerToken` (type http, scheme bearer). The global `security` list expresses the alternative (`{ apiKey: [] }, { sessionCookie: [] }, { bearerToken: [] }` — OR semantics), and each scheme's description states its precedence per the auth-resolution order (session → API key → bearer) and the 401 behavior. The old misnamed `sessionId` id is gone. No auth code paths changed.

## Files Changed
- `src/apps/api.ts` — swagger `components.securitySchemes` and `security` replaced

## Breaking Changes for Downstream Consumers
Yes — OpenAPI document content changed: scheme id `sessionId` → `apiKey` plus new `sessionCookie`/`bearerToken` schemes. Consumers that generate code against the old `sessionId` scheme id must adjust. Docs-facing only; no runtime contract change.

## Required Manual Follow-Up
None. (The rendered `/api/docs` and `/api/docs/llms.txt` will show all three schemes once the server runs.)

## Out of Scope Notes
- Auth mechanism behavior (session/bearer/api-key resolution order) — unchanged by definition.
- SEC-003/PATT-005 (bearer/discovery caching) — unchecked.
- SPEC-001 (bearer path half-implemented) — unchecked; the scheme documents the mechanism as it exists.

## Resolved Questions
None.
