# Fix Definition: API-002 — Missing `params`/`query` TypeBox schemas despite AGENTS.md requirement

## Source Finding
09-api-interfaces.md — `ApiKeyAPI.ts:52-54`, `UserAPI.ts:33-35`, `GroupAPI.ts:38-40`, `AuditLogAPI.ts:19-22`, `FunctionalPermissionAPI.ts:29-33` read `context.query.page` etc. with no `query:` schema; `params:` schemas only in `ConfigAPI.ts:136` and `UserProfileConfigAPI.ts:145`; `src/api/AGENTS.md` marks both as "required"

## Human Directive
None — default interpretation applies.

## Target End State
Every route that reads path parameters or query parameters declares the corresponding TypeBox `params:`/`query:` schema in its route registration, per the `src/api/AGENTS.md` requirement — with per-property `description` options as the folder rules require. Pagination query shapes (`page`, `pageSize`, `includeInactive`/`includeDisabled`) are defined once in `src/types/ApiType.ts` (or the relevant domain type file) and reused across the list endpoints rather than redeclared per route. Invalid input is rejected by Elysia validation with 400 before handler code runs, eliminating the NaN-pagination and invalid-UUID-to-DB paths.

## Approach
- Define shared query schemas: a `PaginationQuerySchema` ({ page?: integer ≥ 0, pageSize?: integer ≥ 1 }) and the boolean-flag pattern (`includeInactive`/`includeDisabled` as optional string unions `"true"|"false"|"1"|"0"` matching the existing `parseBooleanQuery` semantics — the schema accepts exactly what the parser accepts today, no tightening of accepted values).
- Define `params:` schemas for path parameters (e.g. `Type.Object({ userid: Type.String({ format: "uuid" }) })` — verify the identifier format: schema uses `uuid` columns, so `format: "uuid"` is correct; where an identifier is not a UUID, use the appropriate constraint).
- Apply to all routes in the five cited files plus a full sweep of `src/api/*.ts` for any other route reading `context.params`/`context.query` without schemas.
- Confirm handler code still type-checks: Elysia infers narrower types from the schemas, which may remove the need for some `Number(...)` coercions — keep runtime conversions where the query schema keeps string types (Elysia `Type.Integer()` on query coerces; verify at implementation and keep behavior identical).

## Affected Scope
- `src/types/ApiType.ts` (or domain type files) — shared pagination/params schemas
- `src/api/ApiKeyAPI.ts`, `UserAPI.ts`, `GroupAPI.ts`, `AuditLogAPI.ts`, `FunctionalPermissionAPI.ts`, plus sweep findings (incl. `ConfigAPI.ts`, `UserProfileConfigAPI.ts` for completeness of their remaining routes)
- `src/api/AGENTS.md` — no rule change needed (the requirement exists); verify examples match the shared schemas

## Explicit Constraints
- Accepted-value semantics per endpoint are unchanged (no previously-working request becomes invalid; schemas describe the current contract, they do not redesign it).
- OpenAPI `parameters` documentation stays in sync (the detail blocks already document these params; schema addition must not contradict them).
- 400 responses on validation failure get the canonical description from `src/api/AGENTS.md`.

## Out of Scope
- Redesigning pagination semantics (0- vs 1-based, defaults) — preserved as-is.
- API-001 (error shapes) — separate fix definition; the 400 shape follows whatever API-001 canonicalizes.
- Body-schema gaps (not cited).

## Downstream Impact
Yes — new shared schema exports; route registrations gain `params`/`query` entries; OpenAPI output becomes stricter/more accurate. Runtime behavior only changes for previously-invalid inputs (now clean 400s instead of 500s/NaN behavior).
