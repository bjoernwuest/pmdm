# Fix Definition: API-004 — Client/server contract drift on config optimistic locking

## Source Finding
09-api-interfaces.md — `ConfigEntryUI` lacks `updatedAt` (`src/types/ConfigType.ts:27`) although the server stores it; config pages cast `(entry as any).updatedAt` (`AdminConfigList.tsx:386,451`) but send `knownValue` instead (`:626-629`, `Config.ts:12-21`, `ConfigUpdateRequest` at `ConfigType.ts:57-60`); query strings built manually in `ui/api/ApiKeys.ts:9-10` vs `URLSearchParams` in `ui/api/AuditLog.ts:28-34`

## Human Directive
None — default interpretation applies.

## Target End State
One optimistic-lock convention governs config updates end to end, per root AGENTS.md's `updatedAt` round-trip rule:

- `ConfigEntryUI` includes `updatedAt` (delivered by TS-005; the server payloads include it), and the UI's config update request carries `knownUpdatedAt` — the value the client last saw — instead of (or in addition to, during transition) `knownValue`. The canonical token is `knownUpdatedAt`; `knownValue` is removed from `ConfigUpdateRequest` once the server-side CAS (DATA-002) is in place.
- The config PUT endpoints validate `knownUpdatedAt` against the stored value atomically (DATA-002 owns the server-side atomicity) and return the fresh `updatedAt` in the response; the UI stores it back into component context without any `as any` casts (TS-001 consumes this).
- URL building in `src/ui/api/` wrappers uses one idiom — `URLSearchParams` — and `ApiKeys.ts:9-10`'s manual string interpolation is converted (behavior identical, including the exact parameter names/encodings).

The end state satisfies: "read `updatedAt` from the server, round-trip it through UI/API, include it in update checks, return 409 on mismatch" for config exactly as for API keys.

## Approach
This is the contract-alignment owner; it composes with three sibling fixes: TS-005 (adds `updatedAt` to `ConfigEntryUI`), DATA-002 (atomic CAS + schema columns), TS-001 (cast removal). This fix's own work: change `ConfigUpdateRequest` to `knownUpdatedAt`, update `src/ui/api/Config.ts` and the call sites in `AdminConfigList.tsx`/`UserProfileConfigList.tsx` to send it from component context (the context already carries `updatedAt` per the existing casts), align the server handlers' accepted body schema (`ConfigUpdateBodySchema`), and unify wrapper URL building on `URLSearchParams`. Sequencing requirement: the server must accept `knownUpdatedAt` no later than the client starts sending it — implement server+client in one change set.

## Affected Scope
- `src/types/ConfigType.ts` — `ConfigUpdateRequest`, `ConfigUpdateBodySchema`, `ConfigEntryUI` (via TS-005)
- `src/ui/api/Config.ts` — request construction
- `src/ui/pages/AdminConfigList.tsx`, `UserProfileConfigList.tsx` — call sites send `knownUpdatedAt`
- `src/api/ConfigAPI.ts`, `UserProfileConfigAPI.ts` — body schema + lock check (with DATA-002)
- `src/ui/api/ApiKeys.ts`, `AuditLog.ts` — URLSearchParams unification

## Explicit Constraints
- No mixed lock conventions remain afterward for config endpoints: `knownUpdatedAt` is the token.
- 409 semantics preserved: mismatch ⇒ 409 with current state, per API-001's shape.
- URL-building unification must not change any actual request string (verify encoding of booleans/numbers stays identical).
- Server and client ship together; no intermediate state where one side speaks only the old token.

## Out of Scope
- DATA-002 (schema columns + atomic CAS) — separate fix definition; dependency.
- TS-005 (type fields) and TS-001 (casts) — separate fix definitions; dependencies/consumers.
- VB-AI-001 — unchecked.
- User-profile-config specific behaviors beyond the shared lock contract.

## Downstream Impact
Yes — the config update request body changes (`knownValue` → `knownUpdatedAt`); any external consumer of the config PUT endpoints must follow. UI wrapper internals change idiom only.
