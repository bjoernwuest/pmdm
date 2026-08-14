# 05 — TypeScript & Bun Practices

## Rubric
`strict` is on (with `noUncheckedIndexedAccess`, `noImplicitOverride`); the project is Bun-first per its stack definition. Good means: no unsafe casts (`any`, `as unknown as`) except at genuinely typed boundaries, no non-null assertions where the invariant is not locally evident, Bun-native APIs (`Bun.env`, `Bun.file`, `Bun.Glob`) instead of Node-isms, one environment-flag idiom, and no duplicated type definitions that can drift from their source.

### [TS-001] Unsafe casts eroding the type system
- **Location(s):** `src/repo/ApiKeyRepo.ts:141` (`sql\`crypt(...)\` as unknown as string` — a SQL fragment stored in a string column); `ConfigRepo.ts:104` (`rows as unknown as ConfigEntrySelectType[]`); `UserRepo.ts:258-259`; `FunctionalPermissionRepo.ts:76,158,163` (`(DBClient as any).insert`, `(permission as any).group` — inline comment admits bypassing "strict Drizzle overload checks"); `apps/api.ts:15` (`{} as DBClient`); UI: `AdminConfigList.tsx:386,451,608,633` (`(entry as any).updatedAt`), `:637` (`catch (err: any)`), `:715` (`(monaco.languages as any).json`); `AdminApiKeyDetail.tsx:312,418`; `ui/api/AuditLog.ts:6` and `AdminAuditLog.tsx:28` (`Record<string, any>`); `apps/api.ts:24`
- **Description:** Casts are used to defeat Drizzle overload checks and to paper over missing fields on client types.
- **Why it matters:** The Drizzle layer's type safety (the reason the ORM is used) is bypassed in the repo layer; the UI casts hide a real contract gap (updatedAt not in `ConfigEntryUI`).
- **Related findings:** API-004, DATA-002, ARCH-008

### [TS-002] Widespread non-null assertions
- **Location(s):** `Toggle.tsx:115,187,189,239,248,256,320-322,341,355,377,392`; `InputField.tsx:208`; `Label.tsx:101`; `PageRegistry.ts:89,164,198,212,214`; `AdminUserList.tsx:182`; `AdminGroupList.tsx:171`; `AdminApiKeyList.tsx:284`; `UserProfileConfigList.tsx:304`; `availablePageSizes[0]!` in `AdminApiKeyDetail.tsx:108`, `AdminUserList.tsx:124`, `AdminGroupList.tsx:117`, `AdminFunctionalPermissionList.tsx:62`, `AdminFunctionalPermissionDetail.tsx:81`, `AdminGroupDetail.tsx:102`; `src/ui/index.tsx:26`
- **Description:** Non-null assertions (`!`) are used pervasively, including on array indexing where `noUncheckedIndexedAccess` made the undefined case real.
- **Why it matters:** The strictness flags are neutralized at the assertion site; a genuinely missing value crashes at runtime instead of failing compilation.
- **Related findings:** —

### [TS-003] Node-isms carried into a Bun-first project
- **Location(s):** `node:fs`/`node:path` imports in `main.ts:1-2`, `DatabaseDriver.ts:9-10`, `utils/fs.ts:1-2`; `fs.watch` + `crypto.createHash` in `ClientBuilder.ts:1-3`; `process.env` used throughout (e.g. `devmode.ts:2`, `main.ts:83`, `RequestBundlingAPI.ts:142-144`) instead of `Bun.env`; `NodeJS.Timeout` type in `utils/TTLMap.ts:31` — while `Bun.Glob`/`Bun.file` are used elsewhere (`main.ts:168`, `apps/api.ts:168`)
- **Description:** The codebase mixes Bun-native and Node APIs for the same categories of task (filesystem, env, timers).
- **Why it matters:** Two idioms for every task; `NodeJS.Timeout` depends on ambient `@types/node` leaking via `bun-types`.
- **Related findings:** ARCH-002

### [TS-004] Two production-mode flags with different semantics
- **Location(s):** `apps/login.ts:145` uses `NODE_ENV === "production"`; everything else uses `devMode` (`src/devmode.ts`, `package.json:22,24` sets `DEV_MODE=1` for dev, `NODE_ENV=production` for start); `ClientBuilder.ts:54-55` keys minify/sourcemap off `devMode`
- **Description:** Two flags control the same "is production" concept, in different files.
- **Why it matters:** Running with neither flag set yields combinations (unminified + `no-cache`, secure cookies off + production intent) that no single flag can express.
- **Related findings:** ARCH-002, CFG-001, SEC-004

### [TS-005] Duplicated types that can drift
- **Location(s):** `ConfigValueTypes` duplicated between `src/schema/ConfigSchema.ts:15-23` and generated `src/types/_ConfigType.ts` (acknowledged in `design/configuration.md:31,35`); session shape built inline at `Auth.ts:513-519` vs. `types/AuthType.ts`; `ConfigEntryUI` (`types/ConfigType.ts:27`) lacks `updatedAt` although the server stores it, forcing the `(as any)` casts of TS-001
- **Description:** The same shapes exist in hand-written and generated files; one client type is structurally incomplete relative to the server.
- **Why it matters:** Generated copies drift from hand-maintained ones; the missing field is only visible as casts.
- **Related findings:** TS-001, API-004

### [TS-006] Mismatched `satisfies` in repo pagination branch
- **Location(s):** `src/repo/UserRepo.ts:290` returns `satisfies UserInsertType[]` in a paged branch while the function signature (`:276`) declares `Promise<UserSelectType[]>`
- **Description:** A `satisfies` expression names the insert type where select is declared; masked by the declared return type.
- **Why it matters:** Indicates copy-paste; future edits trusting the branch's stated type will be wrong.
- **Related findings:** CPLX-005

### [TS-007] `useRef<Handle>(null!)` with render-phase assignment
- **Location(s):** `Toggle.tsx:205-217,256-258`; `InputField.tsx:178-192,208-210`; `Label.tsx:89-96,101-103`
- **Description:** Refs are typed with `null!` and mutated during render (`handleRef.current = {...}` every render).
- **Why it matters:** Render-phase mutation of refs violates React render-purity expectations under StrictMode (`src/ui/index.tsx:29`).
- **Related findings:** RCT-005
