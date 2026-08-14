# Fix DOC-003 - Root AGENTS.md corrected on env surface, static mounts, and TODO.md

## Source
- Finding: DOC-003 (see /report/12-docs-style.md)
- Fix definition: /report/DOC-003-fix-definition.md

## Summary of Change
Root `AGENTS.md` now matches reality on all three points: (1) the `.env` entry documents the complete env-var surface — that content was written by CFG-001 (implemented earlier in this change set) and this fix verified it presents the full table, not the old two-variable list; (2) both unauthenticated mounts (`/public/*` and `/static/public/*`) are listed in the static-asset section — written by ARCH-009 (implemented in this change set) and verified here without a conflicting second edit; (3) the `TODO.md` root-files entry now describes the file's actual status: git-ignored, not part of the project documentation, and its content is void (the file instructs readers to ignore it) — the old "informal backlog / scratchpad" description was replaced per the default resolution. `NODE_ENV` is not documented as load-bearing (TS-004 removed its use).

## Files Changed
- `AGENTS.md` (root) — `TODO.md` bullet corrected (env table and static mounts verified as present via CFG-001/ARCH-009)

## Breaking Changes for Downstream Consumers
None — documentation only.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- CFG-001 (env documentation content + advisory-lock dedup) — separate fix definition; owns the actual env table.
- ARCH-009/SEC-008 (public mount) — separate fix definitions; own the mount entry.
- DOC-001/DOC-002/DOC-006 (design docs) — DOC-001/006 unchecked; DOC-002 unchecked.
- SPEC-005 — separate fix definition.

## Resolved Questions
None.
