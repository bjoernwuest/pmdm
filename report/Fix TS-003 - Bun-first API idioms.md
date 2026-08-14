# Fix TS-003 - Bun-first API idioms

## Source
- Finding: TS-003 (see /report/05-typescript-bun.md)
- Fix definition: /report/TS-003-fix-definition.md

## Summary of Change
Applied Bun-native idioms to the cited Node-isms: `NodeJS.Timeout` in `src/utils/TTLMap.ts` became `ReturnType<typeof setInterval>`; `crypto.createHash("sha256")` in `src/services/ClientBuilder.ts` was replaced by `Bun.CryptoHasher` (same SHA-256 hex digest, truncated identically, so etags stay stable per content); `src/main.ts`'s `readdirSync`+`join` autostart scan was replaced by `Bun.Glob("*.ts").scanSync(...)`; `fs.watch`/`path` in `ClientBuilder.ts` and `fs`/`path` in `src/utils/fs.ts` were retained (no Bun-native equivalents for change notification and dirent-based recursion) with explicit `node:`-prefixed imports and explanatory comments. The central env module from ARCH-002 uses `Bun.env` as the accessor, satisfying the idiom decision inside it.

## Files Changed
- `src/utils/TTLMap.ts` — timer type now `ReturnType<typeof setInterval>`
- `src/services/ClientBuilder.ts` — `Bun.CryptoHasher` for etags; `node:fs`/`node:path` explicit imports with sanctioned-exception comment
- `src/utils/fs.ts` — `node:fs`/`node:path` explicit imports with comment
- `src/main.ts` — autostart scan via `Bun.Glob`, `node:fs`/`node:path` imports removed

## Breaking Changes for Downstream Consumers
None. Runtime behavior parity: etags remain stable per content (digest values identical — same SHA-256 algorithm and truncation), dev-mode rebuild triggering still works, migrations still discover files.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- ARCH-002 (per-file `process.env` replacement) — separate fix definition, implemented first; this fix only set the `Bun.env` idiom inside the central module.
- TS-004 (production-mode flags) — separate fix definition.
- Node APIs outside the cited categories (e.g. `src/services/PageRegistryGenerator.ts`, `node:url` in DatabaseDriver) were not converted.

## Resolved Questions
None.
