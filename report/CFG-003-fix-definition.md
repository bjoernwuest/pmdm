# Fix Definition: CFG-003 — Dependency hygiene issues

## Source Finding
11-config-deps.md — `package.json:39` — `playwright` in `dependencies` (shipped to production installs) rather than devDependencies; `:48-50` — global `overrides` pinning `@sinclair/typebox` to `0.34` across all transitive deps; `peerDependencies` declares `typescript ^6.0.3` while nothing installs it

## Human Directive
None — default interpretation applies.

## Target End State
`package.json` reflects reality:

- `playwright` moves from `dependencies` to `devDependencies` (it is used only by the E2E test path; nothing in `src/` imports it — implementation verifies this with an import sweep before moving).
- The global `@sinclair/typebox` override is either removed (if Elysia/drizzle-typebox now resolve compatible versions without it — implementation verifies by installing and type-checking without the override) or, if removal breaks the build, narrowed/documented: a comment-adjacent note (in `package.json` via a `"//"` field is not valid JSON — so the rationale goes into `README.md` or `AGENTS.md`) records exactly why the override exists and when it can be dropped. The default resolution is removal if verification passes.
- The `typescript` peer dependency is resolved honestly: either `typescript` is added to `devDependencies` (making the peer declaration meaningful for a private app where peers are not auto-installed) or the `peerDependencies` block is removed as vestigial. Since this is a private application template (`"private": true`), and Bun runs TypeScript without the `typescript` package for execution, the default resolution is: add `typescript` to `devDependencies` if any script/tool (e.g. `ts-morph`, `tsc` type-checking, drizzle-kit) needs it resolvable; otherwise drop the peer block. Implementation verifies which tools actually resolve `typescript`.

## Approach
Three independent edits to `package.json`, each verified: (1) move playwright after confirming no `src/` import; (2) remove or justify the override after an install+typecheck+boot test without it; (3) fix the typescript declaration per the verification. Lockfile updated accordingly (`bun.lock` regenerates via the package-manager step the human runs or as part of implementation's verification install — installation commands for verification are part of the implementation phase, not this planning step).

## Affected Scope
- `package.json` — dependency placement, overrides, peerDependencies
- `bun.lock` — regenerated
- `README.md` or `AGENTS.md` — override rationale note (only if the override is retained)

## Explicit Constraints
- The production install must still boot the app (`bun run start` path) after playwright moves to devDependencies — verified at implementation.
- If the typebox override cannot be removed without type errors, it stays with documented rationale — do not force removal.
- No dependency version upgrades beyond what the override removal implies.

## Out of Scope
- Broader dependency updates/audits (outdated packages generally) — not cited.
- NAME-012/CFG-005 (test env config) — unchecked.
- TEST-* (test infrastructure) — unchecked.

## Downstream Impact
Yes — production installs become slimmer (no playwright); transitive typebox version may change if the override is removed (type-check plus a boot smoke test must pass); typescript resolution changes for tooling.
