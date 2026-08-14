# Fix ARCH-009 - Unauthenticated ./public/* mount documented

## Source
- Finding: ARCH-009 (see /report/01-architecture-structure.md)
- Fix definition: /report/ARCH-009-fix-definition.md

## Summary of Change
Documented the second unauthenticated static mount in root `AGENTS.md`'s static-asset section: `./public/` (repo root) is served at `/public/*` without authorization, alongside the existing `/static/public/*` entry. The entry states that the directory may not exist in the base template (it is available for derived projects; `Bun.file` returns 404-style misses for absent files) and that traversal requests cannot escape the `./public/` root. The mount itself is unchanged (kept per the human's decision). The existing `static/public/` entry also now states its URL prefix explicitly so the documented surface matches the actual surface.

## Files Changed
- `AGENTS.md` (root) — static-asset section gains the `/public/*` entry; `static/public/` entry states its URL prefix

## Breaking Changes for Downstream Consumers
None — documentation only; no behavior change.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- SEC-008 (same mount, security aspect) — fixed by the same documentation change but tracked in its own fix-definition file (see its implementation doc for the traversal verification).
- DOC-003 (other root AGENTS.md inaccuracies) — separate fix definition covering its own enumerated items.

## Resolved Questions
- Q: The `/public/*` mount serves a `./public/` directory that does not exist in the repo, and no code references `/public/*` URLs. Remove the mount, keep and document it, or gate it on directory existence?
- A: "Keep mount, document it." (Resolution was recorded in the fix definition; adopted here.)
