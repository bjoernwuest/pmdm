# Fix Definition: CFG-001 — Env var surface undocumented and parsed ad hoc; duplicated advisory-lock value

## Source Finding
11-config-deps.md — root AGENTS.md documents only `DATABASE_URL` and `ADVISORY_LOCK`; code additionally reads `APP_BASE_URL`, `PORT` (`main.ts:83`), `DEV_MODE`/`SQL_LOGGING` (`src/devmode.ts`), `INTERNAL_API_BASE_URL`/`BUNDLING_DEBUG` (`RequestBundlingAPI.ts:144,265`), `NODE_ENV` (`apps/login.ts:145`); the advisory-lock default `-7482650123549836421n` is duplicated in `.env:2` and `DatabaseDriver.ts:114`

## Human Directive
None — default interpretation applies.

## Target End State
- **Documentation**: one authoritative env-var reference exists — the root `AGENTS.md` `.env` entry (or a linked `design/` doc it points to) lists every environment variable the application reads, with name, meaning, default, and where it is consumed: `DATABASE_URL`, `ADVISORY_LOCK`, `APP_BASE_URL`, `PORT`, `DEV_MODE`, `SQL_LOGGING`, `INTERNAL_API_BASE_URL`, `BUNDLING_DEBUG`, plus `NODE_ENV` marked as non-load-bearing or removed per TS-004's resolution, and the new trusted-proxy variable introduced by SEC-006 (if CFG-001 lands first, SEC-006 appends its entry; the docs home established here is the one SEC-006 references).
- **Single value source**: the advisory-lock default lives exactly once — in the central env module created by ARCH-002 (or a shared constant in `DatabaseDriver.ts` if ARCH-002 lands later) — and `.env` carries only a commented example or the explicit value, never a second hard-coded copy that can drift. The parse (`BigInt(value) || default`) exists once.
- Parsing itself is ARCH-002's scope; this fix owns the documentation and the magic-value deduplication, per the boundary stated in ARCH-002's definition.

## Approach
After/with ARCH-002's central module: enumerate its exports (that list *is* the env surface), write the documentation table into root `AGENTS.md` (expanding the `.env` bullet into a short subsection or pointing at a `design/` page — keep it in AGENTS.md since that file already owns the `.env` mention). For the advisory lock: define the default once; make `.env`'s entry a commented template line (`.env` is git-ignored and local — the fix adjusts the template/documentation, not the human's live file; the code default is the single runtime source).

## Affected Scope
- Root `AGENTS.md` — env-var documentation
- `src/services/DatabaseDriver.ts` and/or the ARCH-002 central env module — single advisory-lock default
- `.env` — only if a template/comment form is established (do not commit it; it stays ignored)

## Explicit Constraints
- No variable renamed, no default changed, no new required variable introduced by this fix.
- The human's local `.env` file is not rewritten as part of the fix; documentation shows the template.
- Boundary with ARCH-002 respected: this fix does not build the central module; it documents its surface and deduplicates the constant.
- Coordinate with SEC-006 (new TRUST_PROXY-style variable) so its documentation lands in the same place.

## Out of Scope
- ARCH-002 (central env module implementation) — separate fix definition.
- TS-004 (production-flag semantics) — separate fix definition; this fix documents whichever flag survives.
- DOC-003 (other root AGENTS.md inaccuracies) — separate fix definition; the env documentation gap belongs to this fix, the file's other items to DOC-003.
- SEC-006 (proxy trust implementation) — separate fix definition.

## Downstream Impact
Yes — documentation surface expands; the advisory-lock default moves to a single source. No runtime behavior change.
