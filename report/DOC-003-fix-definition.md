# Fix Definition: DOC-003 — Root AGENTS.md inaccuracies

## Source Finding
12-docs-style.md — `.env` section lists only `DATABASE_URL`/`ADVISORY_LOCK` (actual also `APP_BASE_URL`, `PORT`, `DEV_MODE`, `SQL_LOGGING`, `INTERNAL_API_BASE_URL`, `BUNDLING_DEBUG`, `NODE_ENV`); `./public/*` mount undocumented (only `static/public/` listed); `TODO.md` described as a project file while `.gitignore:9` ignores it and its content is only "NEVER READ THIS FILE"

## Human Directive
None — default interpretation applies.

## Target End State
Root `AGENTS.md` matches reality on all three points:

1. **Env-var documentation** — the `.env` entry documents the full variable surface. This is owned content-wise by CFG-001; DOC-003 tracks the AGENTS.md-side acceptance (the file no longer presents a two-variable list as complete). Sequencing: whichever of CFG-001/DOC-003 lands second verifies the other did not leave a stale subset.
2. **Static mounts** — both unauthenticated mounts (`/public/*` and `/static/public/*`) are listed in the static-asset section — owned by ARCH-009 (human-directed: keep mount, document it); DOC-003 tracks the acceptance and must not produce a conflicting second edit.
3. **TODO.md** — the root-files entry for `TODO.md` is corrected to describe its actual status: an ignored scratch file whose current content instructs readers to ignore it ("informal backlog / scratchpad" is replaced by an accurate description — e.g. that the file is git-ignored, not part of the project documentation, and its content is void). Alternatively the TODO.md entry is removed from the file list entirely; the implementation picks one — default: correct the description, since the file physically exists in a fresh clone and a reader will encounter it.

## Approach
Targeted edits to root `AGENTS.md`: env surface (with CFG-001), static mounts (with ARCH-009/SEC-008), TODO.md description. No other root-file entries change under this ID; the other DOC-003-related items (SPEC-005's mention) are unrelated.

## Affected Scope
- `AGENTS.md` (root) — `.env` bullet/section, static-asset section, TODO.md bullet

## Explicit Constraints
- Documentation-only, no behavior change.
- Must not conflict with ARCH-009's edit (same section): ARCH-009 writes the `/public/*` entry; this fix verifies presence and correctness rather than double-editing.
- Must not document `NODE_ENV` as load-bearing if TS-004 removes its use (final wording follows TS-004's outcome).

## Out of Scope
- CFG-001 (env documentation content + advisory-lock dedup) — owns the actual env table; this fix owns the AGENTS.md-side consistency.
- ARCH-009/SEC-008 (public mount) — own the mount entry.
- DOC-001/DOC-002/DOC-006 (design docs) — DOC-001/006 unchecked; DOC-002 unchecked.
- SPEC-005 — separate fix definition.

## Downstream Impact
No — documentation only.
