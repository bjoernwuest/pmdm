# Fix Definition: ARCH-009 — Undocumented unauthenticated `./public/*` mount in addition to `static/public/`

## Source Finding
01-architecture-structure.md — `src/main.ts:37` (`Bun.file(\`./public/${params["*"]}\`)`), `:39` (`./static/public/...`); root AGENTS.md documents only `static/public/` as unauthenticated

## Human Directive
None — default interpretation applies. (Resolution approach confirmed with the human via Q&A: keep the mount, document it.)

## Target End State
The `./public/*` mount in `src/main.ts:37` remains functional, and the root `AGENTS.md` static-asset section documents both unauthenticated mounts — `/public/*` (serving the repo-root `./public/` directory) and `/static/public/*` — so the documented surface matches the actual surface. A reader can tell from `AGENTS.md` alone which URL prefixes serve files without authentication and from which directories.

## Approach
Documentation addition to root `AGENTS.md` under "Static asset subdirectories": add an entry for `./public/` (mounted at `/public/*`) next to the existing `static/public/` entry, stating that it is served without authorization and that the directory may not exist in the base template (it is available for derived projects; Bun.file returns 404-style misses for absent files). No code changes in `src/main.ts`.

## Affected Scope
- `AGENTS.md` (root) — static-asset section

## Explicit Constraints
- Documentation-only, no behavior change.
- The mount itself stays exactly as is; do not gate, rename, or remove it.
- Wording must make the unauthenticated nature of both mounts explicit.

## Out of Scope
- SEC-008 (same mount, security aspect) — fixed by the same documentation change but tracked in its own fix-definition file; do not expand this file's scope beyond the architecture/documentation aspect.
- DOC-003 (other root AGENTS.md inaccuracies) — separate fix definition covering its own enumerated items.

## Downstream Impact
No — documentation only.

## Resolved Questions
- Q: The `/public/*` mount serves a `./public/` directory that does not exist in the repo, and no code references `/public/*` URLs. Remove the mount, keep and document it, or gate it on directory existence?
- A: "Keep mount, document it."
