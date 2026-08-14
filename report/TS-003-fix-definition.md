# Fix Definition: TS-003 — Node-isms carried into a Bun-first project

## Source Finding
05-typescript-bun.md — `node:fs`/`node:path` imports in `main.ts:1-2`, `DatabaseDriver.ts:9-10`, `utils/fs.ts:1-2`; `fs.watch` + `crypto.createHash` in `ClientBuilder.ts:1-3`; `process.env` used throughout (e.g. `devmode.ts:2`, `main.ts:83`, `RequestBundlingAPI.ts:142-144`) instead of `Bun.env`; `NodeJS.Timeout` type in `utils/TTLMap.ts:31` — while `Bun.Glob`/`Bun.file` are used elsewhere (`main.ts:168`, `apps/api.ts:168`)

## Human Directive
None — default interpretation applies.

## Target End State
The codebase uses Bun-native APIs as the default idiom for the categories the finding names, and each remaining Node API is either converted or consciously retained:

- `NodeJS.Timeout` in `src/utils/TTLMap.ts:31` becomes `ReturnType<typeof setInterval>` — no ambient `@types/node` dependency for a timer handle. (Pure type change.)
- `crypto.createHash("sha256")` in `ClientBuilder.ts` is replaced by a Bun-native hash (e.g. `Bun.CryptoHasher` or the Web Crypto `crypto.subtle` digest) producing the same etag semantics (a stable hex digest of the bundle; the exact digest algorithm may change as long as etag stability per content is preserved).
- `fs.watch` in `ClientBuilder.ts` and `fs`/`path` usage in `utils/fs.ts`, `DatabaseDriver.ts`, `main.ts` are evaluated against Bun equivalents (`Bun.Glob` for directory scanning already used elsewhere; `fs.watch` has no direct Bun equivalent — it is retained and documented as a sanctioned exception, or replaced with `node:fs` import made explicit). Node APIs that Bun documents as supported-but-polyfilled are converted only where a native Bun counterpart exists; otherwise the `node:`-prefixed import is used explicitly and noted.
- `process.env` reads: ownership belongs to ARCH-002 (central env module). This fix's scope is limited to making the *idiom decision* inside that module (`process.env` vs `Bun.env`) — `Bun.env` becomes the accessor inside the central module, so the rest of the codebase is already clean once ARCH-002 lands. No double work: the per-file `process.env` replacements are ARCH-002's, not this fix's.

## Approach
Sweep the cited categories and apply the Bun-first conversion where a Bun-native API exists (`Bun.CryptoHasher`, `Bun.Glob`, `Bun.file`, `ReturnType<typeof setTimeout/interval>`); where no Bun equivalent exists (`fs.watch`), keep the Node API via an explicit `node:`-prefixed import and record the exception in a brief comment or the relevant AGENTS.md note. Verify the dev-mode rebuild path (file watching) still works after any change to `ClientBuilder.ts`.

## Affected Scope
- `src/utils/TTLMap.ts` — timer type
- `src/services/ClientBuilder.ts` — hash, watch
- `src/utils/fs.ts`, `src/services/DatabaseDriver.ts`, `src/main.ts` — fs/path idioms
- Central env module (ARCH-002 deliverable) — `Bun.env` inside

## Explicit Constraints
- Bun-first means Bun-native where available, not gratuitous churn: no conversion that loses functionality (watch behavior, etag stability, migration globbing).
- Runtime behavior parity: etags remain stable per content; dev-mode rebuild triggering still works; migrations still discover files.
- This fix does not move `process.env` reads itself — that is ARCH-002; this fix only sets the `Bun.env` idiom inside the resulting central module.

## Out of Scope
- ARCH-002 (central env module) — separate fix definition owning per-file `process.env` replacement.
- TS-004 (production-mode flags) — separate fix definition.
- Any Node API not in the cited categories (e.g. `node:url` in DatabaseDriver) unless the sweep shows a Bun-native equivalent with identical behavior.

## Downstream Impact
No external impact — runtime idiom changes only; etags remain valid but their digest values may differ from previously cached ones (clients re-fetch once, which is benign).
