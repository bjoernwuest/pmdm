# Fix Definition: ARCH-001 — Route handler performs direct Drizzle query bypassing repo layer

## Source Finding
01-architecture-structure.md — `src/api/FunctionalPermissionAPI.ts:16` (schema import), `:35` (`context.dbClient.select().from(FunctionalPermissionTable)...offset(...).limit(...)`)

## Human Directive
None — default interpretation applies.

## Target End State
`src/api/FunctionalPermissionAPI.ts` contains no Drizzle schema import and no direct `select()`/query-building calls. The paginated branch of `GET /functionalpermissions` obtains its rows exclusively through a repo function in `src/repo/FunctionalPermissionRepo.ts`. Route behavior (request parameters, response shape, pagination semantics, ordering by `functionalPermissionName`) is unchanged.

## Approach
Extend the repo layer with a paginated read: add a `getFunctionalPermissions(db, { page, pageSize })`-style function (or a page/pageSize options parameter on the existing `getFunctionalPermissions`, matching the pagination idiom already used by other repos such as `UserRepo`) that encapsulates the `orderBy(functionalPermissionName).offset(page * pageSize).limit(pageSize)` query. The route keeps its pagination math (clamping `page`/`pageSize`, count lookup) and calls the new repo function; the non-paginated branch is untouched. The `FunctionalPermissionSchema.ts` import is removed from the route file.

## Affected Scope
- `src/repo/FunctionalPermissionRepo.ts` — add paginated read function
- `src/api/FunctionalPermissionAPI.ts` — replace inline query with repo call, drop schema import
- Any existing tests covering the functional-permission list route

## Explicit Constraints
- No behavior change: identical HTTP responses for all parameter combinations, including the unpaginated branch.
- Follow the existing repo pagination idiom (`getXxxCount` + paged `getXxxs`) documented in `src/api/AGENTS.md`'s pagination pattern.
- The route file must no longer import from `@/schema/*`.

## Out of Scope
- CPLX-001 (oversized files) and DOC-004 (AGENTS.md filename references), listed as related findings, are handled under their own IDs.
- No re-implementation of `getFunctionalPermissionCount` or other repo functions beyond the new paginated read.

## Downstream Impact
No — a new repo export is added; no existing export, type, or API response shape changes.
