# Fix Definition: PATT-001 — Four coexisting error-handling strategies

## Source Finding
03-patterns-concepts.md — `status(403, "...")` plain strings in routes (e.g. `src/api/ApiKeyAPI.ts:48`); raw `new Response(JSON.stringify({error:...}), {status:401})` in `src/apps/api.ts:79-86`; `{ok:false,error}` Result objects in `src/services/Config.ts:5` and `src/apps/setup.ts:56-92`; thrown `Error` in repo (`src/repo/UserRepo.ts:67,186`); `src/api/GroupAPI.ts:189,192` passes the caught Error object itself as JSON `message` (allowed by `ErrorSchema` at `src/types/ApiType.ts:56` with `Type.Any()`)

## Human Directive
None — default interpretation applies.

## Target End State
One error-propagation strategy per layer, applied uniformly:

- **Repo layer** — failures are signaled by throwing `Error` (the current repo idiom is kept as canonical). No repo function returns Result-style objects.
- **Service layer** — internal domain operations that are expected to fail as part of normal flow (e.g. config value parsing in `src/services/Config.ts`) may keep the `{ok, …}` Result idiom; anything crossing toward the API surface is translated to either a thrown Error or the canonical API error shape before leaving the service.
- **Route layer** — all error responses use Elysia `status(code, body)`; hand-built `new Response(JSON.stringify(...))` for API error paths is eliminated (the global 401 handler in `src/apps/api.ts` included, insofar as it is converted to the same mechanism or an Elysia-native equivalent).
- **Error body shape** — matches API-001's canonicalization (cross-referenced, defined there); this fix guarantees routes never pass a raw caught `Error` object as the `message` field: caught errors are converted to a string (`String(err)` / `err instanceof Error ? err.message : ...`) at the route boundary. The `Type.Any()` on `ErrorSchema.message` is tightened to `Type.String()` as part of API-001 or here — one of the two definitions owns it (assigned here to API-001; this fix must not rely on `message` accepting non-strings).
- The setup app (`src/apps/setup.ts`) Result-style internal parsing may remain (it is wizard-internal), but its HTTP error responses are normalized to the same plain-string/JSON conventions as the rest of the API surface for consistency.

Success paths, status codes, and which endpoints can produce which errors are unchanged.

## Approach
Layer-by-layer normalization at the boundaries:

1. Keep "throw in repo" as canonical; add nothing new there.
2. At route level, sweep every `catch` that forwards `_err`/`err` directly into a response body (e.g. `GroupAPI.ts:189,192`) and convert to string messages.
3. Replace the raw `new Response(JSON.stringify({error, message}), {status: 401})` in the global auth hook with the same body produced through Elysia's `status()` (or an equivalent early-return helper), so the 401 path uses the same machinery as route-level errors.
4. Document the resulting one-strategy-per-layer rule in `src/api/AGENTS.md` (error-handling pattern section) so the convention is discoverable — it already shows a try/catch example that forwards the raw error; that example is corrected.

## Affected Scope
- `src/api/GroupAPI.ts` and any other routes forwarding caught `Error` objects into bodies
- `src/apps/api.ts` — global 401 response construction
- `src/apps/setup.ts` — HTTP error responses normalization
- `src/api/AGENTS.md` — error-handling example/contract
- `src/services/Config.ts` — unchanged (Result idiom stays internal), verified only

## Explicit Constraints
- HTTP status codes and response shapes observed by clients remain as canonicalized by API-001; coordinate ordering so the two fixes do not conflict (API-001 owns the schema; this fix owns the propagation strategy).
- No raw `Error` instances serialized into any HTTP response.
- The setup wizard must keep working; its internal Result-style parsing is not ripped out.

## Out of Scope
- API-001 (error response shape inconsistency) — owns the canonical wire schema, including tightening `ErrorSchema.message`; this fix assumes that shape.
- PATT-002 (authorize()+403 boilerplate) — separate fix definition; the 403 strings become part of the helper there.
- SPEC-005 (failures swallowed as "no permissions"/"no overrides") — separate fix definition.

## Downstream Impact
Yes — API error bodies for the affected routes change from possibly-serialized Error objects to strings; clients relying on structured Error payloads (none are expected — the UI extracts strings via `extractErrorMessage`) need adjustment. `src/api/AGENTS.md` guidance changes.
