# Fix Definition: API-003 — `status()` responses smuggled through transaction callbacks with result sniffing

## Source Finding
09-api-interfaces.md — `FunctionalPermissionAPI.ts:136-143,188-195` return `status(404, ...)` from inside `runInTransaction` callbacks and detect it via `"status" in result`; `UserAPI.ts:99` same

## Human Directive
None — default interpretation applies.

## Target End State
No HTTP response object crosses a `runInTransaction` boundary. The cited routes use a two-phase structure instead: the transaction callback returns only domain outcomes (discriminated result values, e.g. `{ ok: true }` / `{ ok: false, reason: "group-not-found" }`), and the HTTP mapping (`status(404, ...)` etc.) happens in the route handler after the transaction resolves — no duck-typing (`"status" in result`) anywhere. Serializable-retry semantics become sane: retries re-execute domain logic, not response construction. Status codes and error bodies observed by clients are unchanged (404 with the same payload shape — as canonicalized by API-001 — for the same conditions).

## Approach
Restructure the three cited sites (`FunctionalPermissionAPI.ts` grant and revoke handlers, `UserAPI.ts:99` — the latter dissolves entirely if DATA-005's transaction removal lands first, since that path is read-only; whichever lands second adapts): callbacks return typed outcome objects; the handler maps outcomes to `status()` responses. Sweep `src/api/` for any other `status(` inside `runInTransaction` callbacks and apply the same pattern. The pattern ("transactions return outcomes; routes map outcomes to HTTP") is added to `src/api/AGENTS.md`'s Transactions section as the stated rule.

## Affected Scope
- `src/api/FunctionalPermissionAPI.ts` — both handlers restructured
- `src/api/UserAPI.ts` — `:99` site (interaction with DATA-005 noted)
- Sweep findings in `src/api/`
- `src/api/AGENTS.md` — Transactions section rule

## Explicit Constraints
- Client-visible behavior unchanged: same status codes, same bodies for the same conditions.
- The transaction callback must not construct or return Elysia `status()`/Response objects.
- Compose with DATA-005 (removes the read-only transaction in `UserAPI`) and DATA-006 (adds transactions elsewhere): each fix keeps the other's invariant.

## Out of Scope
- DATA-005 (read-only transaction removal) — separate fix definition.
- API-001 (error body shapes) — separate fix definition; the outcomes map to whatever API-001 canonicalizes.
- PATT-004 (publish-before-commit) — separate fix definition.

## Downstream Impact
No — server-internal control flow; HTTP contract unchanged.
