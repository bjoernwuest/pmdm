# Fix SEC-008 - /public/* mount: traversal safety verified, documentation shared with ARCH-009

## Source
- Finding: SEC-008 (see /report/08-security.md)
- Fix definition: /report/SEC-008-fix-definition.md

## Summary of Change
Verified the traversal-safety property of the `/public/*` mount (`src/main.ts`'s `Bun.file(\`./public/${params["*"]}\`)`). An Elysia harness replicating the route was exercised against raw HTTP requests: `/public/../secret.txt` and percent-encoded dot segments (`%2e%2e`, `%2E%2E`) never reach the route (Elysia/Bun.serve normalize dot segments before routing — 404), and encoded-slash/double-encoded variants (`..%2f`, `%2e%2e%2f`, `%252e%252e%252f`) reach the route as literal filenames that cannot traverse (Bun.file looks up a file literally named with those characters). Conclusion: requests cannot escape the `./public/` root, so no path-normalization hardening was needed and no code was changed. The shared documentation deliverable is the root `AGENTS.md` entry added under ARCH-009 (same mount); its wording states the unauthenticated nature of both mounts explicitly.

## Files Changed
- None (verification only). Documentation delivered via ARCH-009's `AGENTS.md` edit.

## Breaking Changes for Downstream Consumers
None — documentation plus verified path-safety; no API or configuration change.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- ARCH-009 (the AGENTS.md edit itself) — separate fix definition owning the change.
- DOC-003 (other root AGENTS.md inaccuracies) — separate fix definition.

## Resolved Questions
- Shared mount decision (from the ARCH-009 Q&A): "Keep mount, document it." — adopted.
