# Fix Definition: API-001 — Error response shape inconsistency

## Source Finding
09-api-interfaces.md — JSON `{error, message}` for 401 from the global hook (`src/apps/api.ts:79-84`); plain strings for 403/404/409 via `status()` (e.g. `ApiKeyAPI.ts:48`); object `{error, currentValue}` for 409 (`ConfigAPI.ts:113-116`); `{error, message: _err}` leaking an Error object (`GroupAPI.ts:189`); two competing schemas `ErrorSchema` vs `ErrorResponseSchema` (`src/types/ApiType.ts:56,67`) both in use (`GroupAPI.ts:199` vs `ConfigAPI.ts:167`); the 401 schema documented as `Type.String()` in routes does not match the actual JSON payload

## Human Directive
None — default interpretation applies.

## Target End State
One canonical error contract exists and every endpoint conforms in both code and OpenAPI declaration:

- **Canonical body**: error responses carry a JSON object; the minimal form is `{ error: string }` (`ErrorResponseSchema` becomes the single base), with the optional extension `message: string` (`ErrorSchema` tightened from `Type.Any()` to `Type.String()`) and the 409 extension `{ error, currentValue? }` for optimistic-lock conflicts. Plain-string error bodies are eliminated from the API surface (the `status(403, "...")` pattern becomes `status(403, { error: "..." })` with the same human-readable text inside).
- The global 401 hook in `src/apps/api.ts:79-84` already emits `{error, message}` — its `message` becomes a string (it already is) and route-level 401 documentation is corrected to the JSON schema (`ErrorSchema`/`ErrorResponseSchema` as appropriate), replacing the `Type.String()` declarations that misdescribe it.
- One schema pair remains in `src/types/ApiType.ts`; every route's `response` error entries reference them (or their 409 variant), removing per-route ad-hoc declarations that disagree.
- Client-side error extraction (`extractErrorMessage` in the UI API layer) continues to work unchanged — it already reads `message`/`error` from JSON bodies; string bodies are gone so no client fallback is needed anymore.

The canonical error descriptions table in `src/api/AGENTS.md` remains the wording standard; bodies wrap those strings in the JSON shape.

## Approach
Decide the shape once (above), then: tighten `ErrorSchema.message` to `Type.String()`; convert every plain-string `status(code, "...")` error response in `src/api/*` to the object form; fix every route's declared error schemas to match reality (401 = JSON object per the global hook); deduplicate to the single schema pair. This is the wire-shape owner; PATT-001 (propagation strategy) and PATT-002 (403 helper) consume this definition — the helper from PATT-002 emits exactly this shape.

## Affected Scope
- `src/types/ApiType.ts` — `ErrorSchema.message` tightened; schemas confirmed as the single pair
- All `src/api/*.ts` route files — error response bodies and declared response schemas
- `src/apps/api.ts` — global 401 (shape kept, declaration aligned)
- `src/api/AGENTS.md` — error-shape contract stated explicitly (it currently shows `Type.String()` for 401/403 — updated)
- UI error extraction — verified compatible

## Explicit Constraints
- Human-readable message texts (the canonical description strings) are preserved; only the envelope changes.
- OpenAPI output at `/api/docs` must reflect the real shapes for every status code documented.
- 409 optimistic-lock responses keep carrying `currentValue` where they do today (ConfigAPI), formalized in the schema.
- Coordinate with PATT-001 (owns propagation strategy) and PATT-002 (owns the 403 helper): no conflicting edits to the same lines — the helper implements this shape.

## Out of Scope
- PATT-001 (error propagation strategies across layers) — separate fix definition.
- PATT-002 (authorize/403 boilerplate) — separate fix definition.
- API-003 (status() through transaction callbacks) — separate fix definition.
- UI pages' error *display* handling (RCT-002) — separate fix definition.

## Downstream Impact
Yes — error response bodies change shape (string → JSON object) for 403/404/409 endpoints; API consumers and the UI's error extraction must use the JSON shape. This is a breaking wire change for any external client relying on string bodies.
