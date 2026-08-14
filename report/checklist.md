# Review Findings Checklist

## Architecture & Directory Structure — [01-architecture-structure.md](01-architecture-structure.md)
- [x] **ARCH-001** — Route handler performs direct Drizzle query bypassing repo layer
- [x] **ARCH-002** — Environment-variable reading duplicated across entry points, no central env module
- [x] **ARCH-003** — Services call `getDatabaseConnection()` despite explicit prohibition
- [ ] **ARCH-004** — Server and repo layers import from `src/ui/*`
- [x] **ARCH-005** — Two bootstrap mechanisms coexist; EntraID sync not migrated to autostart
- [x] **ARCH-006** — Setup app binds the same port as the main app without a release wait
- [ ] **ARCH-007** — Side-effect import ordering is load-bearing
- [x] **ARCH-008** — `dbClient` injected via placeholder decorate + global derive ordering
- [x] **ARCH-009** — Undocumented unauthenticated `./public/*` mount in addition to `static/public/`
- [ ] **ARCH-010** — Mixed page-architecture paradigms across admin UI pages [LATER, need to consider how to improve those pages in general]
- [x] **ARCH-011** — Breadcrumb data fetching hard-coded per route in the app shell

## Naming & Terminology Consistency — [02-naming-consistency.md](02-naming-consistency.md)
- [ ] **NAME-001** — Casing drift in service and UI files [LATER: harmonize casing, establish "common" schema for files that are supposed to be overwritten downstream]
- [x] **NAME-002** — Two modules named `server_sent_events.ts` with different responsibilities; three SSE-related UI modules
- [x] **NAME-003** — Misleading export name `getActiveServerTopics` after topics→expressions migration
- [x] **NAME-004** — SSE endpoint names differ between code and docs
- [ ] **NAME-005** — `_`-prefixed files encode two different meanings
- [x] **NAME-006** — Function/parameter casing drift inside repo layer
- [x] **NAME-007** — Public endpoint typo `/setup/clienType.js`
- [ ] **NAME-008** — Config domain strings inconsistent between code and docs
- [ ] **NAME-009** — Test file naming contradicts the design doc
- [ ] **NAME-010** — Test directory naming contradicts docs (`workflows/` vs documented `e2e/`, missing `smoke/`)
- [ ] **NAME-011** — Page-object naming/structure contradicts the design doc
- [ ] **NAME-012** — Env variable names and defaults contradict the design doc
- [ ] **NAME-013** — Test helper file names contradict the design doc

## Design Patterns & Cross-Cutting Concepts — [03-patterns-concepts.md](03-patterns-concepts.md)
- [x] **PATT-001** — Four coexisting error-handling strategies
- [x] **PATT-002** — `authorize()` + 403 re-check boilerplate duplicated ~15 times
- [x] **PATT-003** — PubSub publish granularity inconsistent across repos
- [x] **PATT-004** — PubSub events published before transaction commit
- [ ] **PATT-005** — OIDC `discovery()` invoked per operation with no caching [LATER, understand what "caching" means, e.g. if .well-known includes hint for caching duration]
- [x] **PATT-006** — Five distinct caching idioms
- [x] **PATT-007** — UI API wrapper layer exists for only 4 of ~10 APIs; pages build URLs inline
- [x] **PATT-008** — Request bundling bypassed for one mutation class => document the deviation, it is on purpose that mutation in src/ui/api/server_sent_events.ts:34-39 does not use request bundling.
- [x] **PATT-009** — Two unsubscribe patterns, one deferring cleanup asynchronously
- [x] **PATT-010** — PubSub subscriptions not narrowly scoped; entity derived via UUID-regex over tags
- [x] **PATT-011** — Duplicated "three-stream race" save logic
- [x] **PATT-012** — Duplicated array-editor modal and helper functions (~180 lines)

## Complexity & Maintainability Drivers — [04-complexity-maintainability.md](04-complexity-maintainability.md)
- [x] **CPLX-001** — Oversized files
- [x] **CPLX-002** — Duplicated admin list-page scaffolding (~4 copies)
- [x] **CPLX-003** — Duplicated server-side logic across files
- [ ] **CPLX-004** — Hidden global singletons across 8+ modules [LATER: need better understanding on this]
- [x] **CPLX-005** — Per-row mutations in batch operations
- [ ] **CPLX-006** — Toggle and InputField internal duplication [LATER: would need to check with downstream if this can be addressed or if it is just preparation of functionality required downstream]
- [x] **CPLX-007** — `formatterRegistry` rebuilt per render and partially duplicated
- [x] **CPLX-008** — JSON-stringify identity comparisons for expressions
- [x] **CPLX-009** — Label/InputField double-seeding (prop + imperative effect)
- [x] **CPLX-010** — Overlapping PubSub subscriptions double-apply updates in one page

## TypeScript & Bun Practices — [05-typescript-bun.md](05-typescript-bun.md)
- [x] **TS-001** — Unsafe casts eroding the type system
- [x] **TS-002** — Widespread non-null assertions
- [x] **TS-003** — Node-isms carried into a Bun-first project
- [x] **TS-004** — Two production-mode flags with different semantics
- [x] **TS-005** — Duplicated types that can drift
- [x] **TS-006** — Mismatched `satisfies` in repo pagination branch
- [ ] **TS-007** — `useRef<Handle>(null!)` with render-phase assignment [LATER: need to understand impact and cause, eventually this is for "atomic" UI updates]

## React & Frontend Practices — [06-react-frontend.md](06-react-frontend.md)
- [x] **RCT-001** — useEffect dependency problems across pages
- [x] **RCT-002** — Error handling inconsistent across pages
- [x] **RCT-003** — Empty-state handling inconsistent
- [x] **RCT-004** — Two toggle primitives used side by side; half-completed migration
- [x] **RCT-005** — Render-phase ref mutation and fake loading bar
- [x] **RCT-006** — Save handlers capture stale `groups` closures

## Drizzle ORM & Data Layer — [07-data-drizzle.md](07-data-drizzle.md) [Never run the drizzle-migration - it will be run by the human after code change]
- [x] **DATA-001** — Missing indexes on hot paths
- [x] **DATA-002** — Optimistic locking on config is a non-atomic TOCTOU check
- [x] **DATA-003** — Optimistic-lock timestamp comparison mixes `timestamp` cast with `timestamptz` columns
- [x] **DATA-004** — N+1 query patterns
- [x] **DATA-005** — Read-only serializable read-write transactions; outer client used inside the callback
- [x] **DATA-006** — Multi-step mutations without transactions; fragile insert/update discrimination

## Security — [08-security.md](08-security.md)
- [ ] **SEC-001** — Setup key uses non-cryptographic RNG and non-constant-time comparison [This is fine since it is a temporary key regenerated upon each start]
- [ ] **SEC-002** — Sessions are in-memory only [This is on purpose, restarting the application means users need to login again]
- [ ] **SEC-003** — Bearer-token introspection per request, uncached [LATER: need to understand if this just for each first bearer call, and afterwards sessionID / authToken is used]
- [ ] **SEC-004** — Cookie/CSRF posture depends on a flag combination; GET-based state changes [This is on purpose. In non-prod env, there may be no https. In prod, if there is no https, the app shall fail. Logout can be always "unprotected", in worst case user must re-login]
- [ ] **SEC-005** — SSE stream keyed by user `oid`, not session [LATER: need to monitor. Until now, no negative impact has been observed, even running in multiple tabs]
- [x] **SEC-006** — Proxy headers trusted unconditionally - in the fix include instruction on proper configuration of trusted proxy
- [ ] **SEC-007** — Request bundling forwards arbitrary absolute URLs with caller credentials [LATER: requires evaluation on severity. Since all endpoints are permission-protected, there is no "I impose a session and can steal" scenario]
- [x] **SEC-008** — Undocumented unauthenticated static mount
- [x] **SEC-009** — Audit-log gaps for security-relevant events - include upsert but exclude login/logout events
- [ ] **SEC-010** — Server-stored regexes compiled in the browser; partial-number acceptance on save [LATER: need further analysis. I think I understood, but need re-verification]

## API & Interface Contracts — [09-api-interfaces.md](09-api-interfaces.md)
- [x] **API-001** — Error response shape inconsistency
- [x] **API-002** — Missing `params`/`query` TypeBox schemas despite AGENTS.md requirement
- [x] **API-003** — `status()` responses smuggled through transaction callbacks with result sniffing
- [x] **API-004** — Client/server contract drift on config optimistic locking
- [x] **API-005** — Request bundling semantics contradict its own description - ensure semantic processing
- [x] **API-006** — OpenAPI security scheme misnamed and incomplete

## Testing & Coverage Gaps — [10-testing.md](10-testing.md)
- [ ] **TEST-001** — API coverage gaps
- [ ] **TEST-002** — Page/workflow coverage gaps
- [ ] **TEST-003** — Assertions that assert nothing meaningful
- [ ] **TEST-004** — `assertPaginatedResponse` helper contradicts the actual API shape
- [ ] **TEST-005** — `assertStatus` consumes the body and is called without `await`
- [ ] **TEST-006** — Hand-rolled `fetch` with `X-API-Key` headers instead of the api-client helper
- [ ] **TEST-007** — Cleanup records the wrong `updatedAt`
- [ ] **TEST-008** — Test structure contradicts the design doc
- [ ] **TEST-009** — Test bootstrap/config inert or mismatched
- [ ] **TEST-010** — Page-object selectors do not match the actual DOM

## Configuration, Environment, Secrets & Dependencies — [11-config-deps.md](11-config-deps.md)
- [x] **CFG-001** — Env var surface undocumented and parsed ad hoc; duplicated advisory-lock value
- [x] **CFG-002** — Runtime config edits silently do not apply to some subsystems
- [x] **CFG-003** — Dependency hygiene issues
- [ ] **CFG-004** — `cfgRootUserGroup` is a runtime-mutable privilege bypass [NEVER: this is on purpose.]
- [ ] **CFG-005** — Test environment config contradictions

## Documentation & Coding Style — [12-docs-style.md](12-docs-style.md)
- [ ] **DOC-001** — `design/configuration.md` extensively stale
- [ ] **DOC-002** — `design/pubsub.md` frames a completed migration as pending
- [x] **DOC-003** — Root AGENTS.md inaccuracies
- [x] **DOC-004** — Folder AGENTS.md files reference wrong filenames
- [x] **DOC-005** — SSE terminology split between docs
- [ ] **DOC-006** — UI design docs contain stale line references and structural contradictions
- [x] **DOC-007** — Comment rot, typos, and TODO/FIXME inventory

## Incomplete/Inconsistent Specs & Edge Cases — [13-incomplete-specs-edge-cases.md](13-incomplete-specs-edge-cases.md)
- [ ] **SPEC-001** — Bearer-token auth path half-implemented
- [x] **SPEC-002** — Dead user-visible controls and mock data presented as the app
- [x] **SPEC-003** — PubSub client API asymmetry and dead surface
- [ ] **SPEC-004** — Setup-demand cache logic and polling rescan
- [x] **SPEC-005** — Failures swallowed as "no permissions" or "no overrides"
- [x] **SPEC-006** — Login redirect parameter mismatch
- [x] **SPEC-007** — Miscellaneous dead code and unhandled edge cases

## AI-Guidance Instructions — [14-vibe-coding-guidance.md](14-vibe-coding-guidance.md)
- [ ] **VB-AI-001** — Root AGENTS.md rules contradicted by the codebase they govern [LATER: after above fixes, let's see what remains]
- [ ] **VB-AI-002** — `tests/AGENTS.md` internally contradictory and factually wrong
- [x] **VB-AI-003** — Folder AGENTS.md canonical file examples do not exist
- [x] **VB-AI-004** — Rule redundancy and dilution across nested AGENTS.md files without precedence resolution - sub-directory AGENTS.md take precedence over "parent" AGENTS.md

**Total: 114 findings**
