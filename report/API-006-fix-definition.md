# Fix Definition: API-006 — OpenAPI security scheme misnamed and incomplete

## Source Finding
09-api-interfaces.md — `src/apps/api.ts:117-123` defines security scheme id `sessionId` of type `apiKey` for the `X-API-Key` header, applied globally at `:126`; cookie and bearer alternatives are undocumented

## Human Directive
None — default interpretation applies.

## Target End State
The OpenAPI document at `/api/docs` describes the three real authentication mechanisms, each under a correctly named scheme:

- `apiKey` — type `apiKey`, `in: header`, name `X-API-Key` (the current scheme with a truthful id; the `sessionId` id disappears).
- `sessionCookie` — type `apiKey`, `in: cookie`, name `SessionID` (documenting the browser-session path).
- `bearerToken` — type `http`, scheme `bearer` (documenting the OAuth2.1 bearer path).

The global `security` list expresses the alternative: `[{ apiKey: [] }, { sessionCookie: [] }, { bearerToken: [] }]` (OR semantics per the OpenAPI spec — any one of them). Generated docs and `llms.txt` then explain authentication correctly to humans and LLM consumers.

## Approach
Edit the swagger `components.securitySchemes` and `security` configuration in `src/apps/api.ts:115-126`. Verify the actual auth precedence (session → API key → bearer, per `src/api/AGENTS.md`) is what the prose descriptions of the schemes convey (each scheme's `description` field notes the precedence and the 401 behavior). No code-path changes — this is documentation-metadata only; the auth derivation itself is untouched.

## Affected Scope
- `src/apps/api.ts` — swagger security configuration

## Explicit Constraints
- Documentation metadata only; no auth behavior change.
- Scheme ids must be self-describing (no id named after a different mechanism).
- Verify the rendered `/api/docs` and `/api/docs/llms.txt` show all three schemes after the change.

## Out of Scope
- Auth mechanism behavior (session/bearer/api-key resolution order) — unchanged by definition.
- SEC-003/PATT-005 (bearer/discovery caching) — unchecked.
- SPEC-001 (bearer path half-implemented) — unchecked; the scheme documents the mechanism as it exists.

## Downstream Impact
Yes — OpenAPI document content changes (scheme names and set); consumers with codegen against the old `sessionId` scheme id must adjust (docs-facing only; no runtime contract change).
