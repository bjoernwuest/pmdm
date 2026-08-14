# Fix Definition: SEC-008 — Undocumented unauthenticated static mount

## Source Finding
08-security.md — `src/main.ts:37` (`Bun.file(\`./public/${params["*"]}\`)`) in addition to the documented `static/public/` (`:39`); root AGENTS.md lists only `static/public/` as unauthenticated

## Human Directive
None — default interpretation applies. (Resolution approach confirmed with the human via the ARCH-009 Q&A: keep the mount, document it.)

## Target End State
The security-relevant facts about the `/public/*` mount are documented and verified:

- Root `AGENTS.md` documents both unauthenticated static mounts (`/public/*` and `/static/public/*`) — shared deliverable with ARCH-009, which owns the AGENTS.md edit. This file tracks the security aspect: reviewers must be able to see that `/public/*` is intentionally unauthenticated and which directory it serves.
- The traversal-safety property the finding flags (reliance on `Bun.file` normalization of `..` segments) is verified at implementation: confirm that requests like `/public/../src/main.ts` cannot escape the `./public/` root (check `Bun.file` behavior with `..` segments; if escape is possible, the route normalizes/rejects such paths before serving — this is the only potential code change).

## Approach
Documentation via ARCH-009 plus a traversal-safety verification (and minimal hardening if the verification fails). No other code change; the mount stays.

## Affected Scope
- `AGENTS.md` (root) — via ARCH-009
- `src/main.ts:37` — only if traversal hardening proves necessary

## Explicit Constraints
- The mount is retained per the human's decision on ARCH-009.
- If hardening is needed, it must not change behavior for legitimate file paths.
- Documentation must state explicitly that both mounts are unauthenticated.

## Out of Scope
- ARCH-009 (the documentation edit itself) — separate fix definition owning the AGENTS.md change.
- DOC-003 (other root AGENTS.md inaccuracies) — separate fix definition.

## Downstream Impact
No — documentation plus possible path-normalization hardening; no API or configuration change.

## Resolved Questions
- Resolved via the ARCH-009 Q&A (shared mount decision): "Keep mount, document it."
