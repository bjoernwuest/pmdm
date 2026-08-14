# Fix Definition: ARCH-008 — `dbClient` injected via placeholder decorate + global derive ordering

## Source Finding
01-architecture-structure.md — `src/main.ts:44-46,75` (Elysia `derive` returning real `dbClient`); `src/apps/api.ts:15`, `src/apps/ui.ts:17`, `src/apps/login.ts:11` each `.decorate("dbClient", {} as DBClient)`

## Human Directive
None — default interpretation applies.

## Target End State
The `dbClient` available to handlers in the API, UI, and login apps is the real `DBClient` created in `src/main.ts`, supplied through a mechanism that fails fast and visibly if wiring is wrong. No app file contains a fake `{} as DBClient` placeholder cast. The mechanism is documented in `src/apps/AGENTS.md` (the "Context Extension" section) so that it no longer depends on undocumented global ordering knowledge. Handler-visible behavior is unchanged: every route still receives the same working `dbClient`.

## Approach
Replace the placeholder-decorate pattern with explicit factory-style injection: each app module exports a factory that accepts the `DBClient` (or the apps are mounted with the real instance supplied at composition time in `main.ts` via a scoped `decorate("dbClient", dbClient)` before mounting, using Elysia's instance-typing support rather than a later global `derive`). The decision between the two shapes is made at implementation time against Elysia's typing constraints, with one hard requirement: constructing or mounting an app without a real `DBClient` must be a type error or an immediate startup error — never a silently-hollow `{}`.

Whichever shape is chosen:
- The `{} as DBClient` casts in `api.ts`, `ui.ts`, and `login.ts` are removed.
- The global `derive({ as: 'global' })` injection helper in `main.ts:44-46` is removed or reduced to the chosen mechanism.
- `src/apps/AGENTS.md` "Context Extension (`.decorate` + `.derive`)" section is updated to describe the final mechanism accurately, since it currently documents the placeholder pattern as the contract.

## Affected Scope
- `src/main.ts` — injection helper and mount sequence
- `src/apps/api.ts`, `src/apps/ui.ts`, `src/apps/login.ts` — remove placeholder decorate; adopt chosen injection shape
- `src/apps/AGENTS.md` — document the final mechanism
- `src/api/AGENTS.md` — verify the "`.decorate("dbClient", …)`" description still matches reality; adjust if the mechanism changes what route files must know

## Explicit Constraints
- No unsafe `as DBClient` cast on an empty object may remain anywhere in app setup.
- Route handlers' context typing (`context.dbClient: DBClient`) must be preserved; no route file changes should be required beyond what type-checking reveals.
- Auth-derive behavior in `api.ts` (session/API-key/bearer resolution) is untouched except where it reads `dbClient`.
- This fix is about the DI mechanism only; it does not change transaction scoping or how repos receive clients.

## Out of Scope
- TS-001 (unsafe casts generally) — related; the cast removal here is limited to the `dbClient` placeholder pattern.
- ARCH-003 (services calling `getDatabaseConnection()`) — separate fix definition.
- Setup app (`src/apps/setup.ts`) — it already obtains its own connection directly and does not use the placeholder pattern.

## Downstream Impact
Yes — app module export shapes may change (factory signatures or mount-time decoration); `main.ts` composition code and the two AGENTS.md descriptions are updated accordingly.
