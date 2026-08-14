# Fix Definition: TS-001 — Unsafe casts eroding the type system

## Source Finding
05-typescript-bun.md — `src/repo/ApiKeyRepo.ts:141` (`sql\`crypt(...)\` as unknown as string`); `ConfigRepo.ts:104` (`rows as unknown as ConfigEntrySelectType[]`); `UserRepo.ts:258-259`; `FunctionalPermissionRepo.ts:76,158,163` (`(DBClient as any).insert`, `(permission as any).group`); `apps/api.ts:15` (`{} as DBClient`); UI: `AdminConfigList.tsx:386,451,608,633` (`(entry as any).updatedAt`), `:637` (`catch (err: any)`), `:715` (`(monaco.languages as any).json`); `AdminApiKeyDetail.tsx:312,418`; `ui/api/AuditLog.ts:6` and `AdminAuditLog.tsx:28` (`Record<string, any>`); `apps/api.ts:24`

## Human Directive
None — default interpretation applies.

## Target End State
The cited unsafe casts are eliminated by giving the type system real information instead of overriding it:

- `ApiKeyRepo.ts:141` — the `crypt(...)` SQL expression is stored via a properly typed mechanism (Drizzle's `sql` in a `set`/values position typed as SQL, or the hash computed in a way the column type accepts without a string-cast fiction).
- `ConfigRepo.ts:104` — the upsert result is typed so `.returning()` yields the select type without `as unknown as`.
- `UserRepo.ts:258-259` — count-query rows are typed via the query's inferred shape (typed `sql<number>` selections) instead of `as unknown as Record<string, unknown>`.
- `FunctionalPermissionRepo.ts:76,158,163` — the Drizzle overload bypass is removed: the insert/upsert is expressed in a way that type-checks (correct value typing, `satisfies` on the insert object), and the `group` column access is typed through the insert type. The inline comment admitting the bypass is removed with the bypass.
- `apps/api.ts:15` — resolved by ARCH-008 (placeholder removal); this fix verifies no `{} as DBClient` remains after ARCH-008 lands. (Cross-reference only; not double-specified here.)
- UI sites — `(entry as any).updatedAt` disappears because `ConfigEntryUI` gains the field under TS-005 (dependency; this fix consumes it), `catch (err: any)` becomes `catch (err: unknown)` with narrowing, `(monaco.languages as any).json` gets a minimal typed declaration or a typed dynamic access, `AdminApiKeyDetail.tsx:312,418` and the `Record<string, any>` in `ui/api/AuditLog.ts`/`AdminAuditLog.tsx:28` are replaced by the actual response/data types from `@/types/*`.

TypeScript strictness is genuinely in force at these sites: no `any`, no `as unknown as`, no non-null assertion disguised as a cast. Where a boundary truly is untyped, the cast is replaced by explicit runtime validation (the codebase already uses `@sinclair/typebox/value` `Value.Check` for this idiom).

## Approach
Site-by-site replacement of casts with typed constructs, in this dependency order: (1) TS-005 adds the missing `updatedAt` to `ConfigEntryUI`; (2) repo casts are replaced using Drizzle's typing features; (3) UI casts are replaced with the now-complete types; (4) ARCH-008 removes the placeholder cast (tracked there). A repo-wide lint/type sweep at the end confirms no new `as unknown as`/`as any` were introduced in the touched files.

## Affected Scope
- `src/repo/ApiKeyRepo.ts`, `ConfigRepo.ts`, `UserRepo.ts`, `FunctionalPermissionRepo.ts`
- `src/ui/pages/AdminConfigList.tsx`, `AdminApiKeyDetail.tsx`, `AdminAuditLog.tsx`
- `src/ui/api/AuditLog.ts`
- `src/apps/api.ts` — via ARCH-008

## Explicit Constraints
- No runtime behavior change (same SQL, same payloads, same error paths) — this is type-level honesty, not logic change.
- Do not silence errors by widening types to `any` elsewhere; the fix direction is precision.
- `catch` clauses use `unknown` + narrowing, not `any`.

## Out of Scope
- ARCH-008 (placeholder decorate) — owns the `apps/api.ts:15` removal itself.
- TS-005 (duplicated/missing type fields) — owns adding `updatedAt` to `ConfigEntryUI`; this fix depends on it.
- TS-002 (non-null assertions) — separate fix definition.
- ARCH-003 post-fix correction — the startup-populated `FP_*` constants in `src/services/auth/FunctionalPermissions.ts` bridge `FunctionalPermissionInsertType` → `FunctionalPermissionSelectType` via empty-string placeholder fields (stripped before the DB insert, overwritten at registration) — not via casts. Any rework of that module must keep it cast-free.
- API-004 (contract drift) — separate fix definition.

## Downstream Impact
Yes — some client types gain fields (via TS-005) and UI modules import real types; no API shape change, only honest typing of the existing one.
