# Fix CFG-003 - Dependency hygiene: playwright to dev, typebox override removed, typescript peer resolved

## Source
- Finding: CFG-003 (see /report/11-config-deps.md)
- Fix definition: /report/CFG-003-fix-definition.md

## Summary of Change
`package.json` now reflects reality: `playwright` moved from `dependencies` to `devDependencies` (an import sweep confirmed nothing in `src/` imports it; it is used only by the E2E test path). The global `@sinclair/typebox` override was removed after verification — `bun install` resolved `0.34.52` (the same version the override pinned, since Elysia declares `>= 0.34.0 < 1` and drizzle-typebox `^0.34.8`), the full typecheck passed, and the production build (`bun run build`) succeeded — so no rationale note was needed. The vestigial `peerDependencies` block was dropped and `typescript@^6.0.3` added to `devDependencies` (the typegen pipeline's `ts-morph` resolves `typescript` at runtime; the private app does not auto-install peers). The lockfile was regenerated via the package-manager install step.

## Files Changed
- `package.json` — playwright → devDependencies; `overrides` removed; `peerDependencies` removed; `typescript` added to devDependencies
- `bun.lock` — regenerated (no content change beyond metadata — the same typebox version resolved)

## Breaking Changes for Downstream Consumers
Yes — production installs become slimmer (no playwright); the transitive typebox version is unchanged in practice (`0.34.52` before and after), verified by typecheck plus a production build; `typescript` resolution for tooling is now an explicit devDependency instead of an unsatisfied peer.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- Broader dependency updates/audits — not cited.
- NAME-012/CFG-005 (test env config) — unchecked.
- TEST-* (test infrastructure) — unchecked.

## Resolved Questions
None.
