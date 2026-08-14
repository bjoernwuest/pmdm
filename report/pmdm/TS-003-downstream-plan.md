# Downstream Plan: TS-003 — Bun-first API idioms

## Upstream Change
Reference: `/report/Fix TS-003 - Bun-first API idioms.md`. Bun-first API idioms applied in upstream files (stable etags, dev-mode rebuild triggering, migration file discovery); runtime behavior parity verified.

## Upstream's Own Assessment
"None. Runtime behavior parity: etags remain stable per content (digest values identical — same SHA-256 algorithm and truncation), dev-mode rebuild triggering still works, migrations still discover files."

## Applicability to This Project
Affected: No

Evidence:
- The changed files (client builder, dev-mode watcher, migration discovery) are shared and already fixed via the merge.
- No pmdm-owned file reimplements those mechanisms with non-Bun idioms that the change would affect.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
