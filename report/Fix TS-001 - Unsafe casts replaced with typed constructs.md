# Fix TS-001 - Unsafe casts replaced with typed constructs

## Source
- Finding: TS-001 (see /report/05-typescript-bun.md)
- Fix definition: /report/TS-001-fix-definition.md

## Summary of Change
Eliminated the cited unsafe casts by giving the type system real information: `ApiKeyRepo`'s `crypt(...)` hash value is now typed via `sql<string>` in the insert values; `ConfigRepo`'s upsert/update `.returning()` results no longer need `as unknown as` (Drizzle infers the select rows); `UserRepo`'s count queries use `sql<number>` typed selections, removing the `Record<string, unknown>` row casts; `FunctionalPermissionRepo`'s `registerFunctionalPermission` lost the `(db as any)` overload bypass and `(permission as any).group` (plain typed insert/upsert with a runtime no-row check), and `getFunctionalPermissionsOfUser` lost its result cast. UI-side: `(entry as any).updatedAt`/`(response as any).updatedAt`/`(updated as any).updatedAt` in `AdminConfigList.tsx` are gone (`ConfigEntryUI` now carries `updatedAt` per TS-005); the `InputField` context's `unknown`-typed `updatedAt` is narrowed with `typeof` checks; `catch (err: any)` became `catch (err: unknown)` in both config pages (existing `instanceof` narrowing handles it); the monaco `json` access uses a minimal typed declaration (`MonacoJsonDefaults`) behind runtime validation instead of `(monaco.languages as any)`; `AuditEntry.payload` and `formatPayload` use `Record<string, unknown>` instead of `Record<string, any>`. The `{} as DBClient` placeholder was already removed under ARCH-008.

## Files Changed
- `src/repo/ApiKeyRepo.ts` — `sql<string>` for the crypt hash
- `src/repo/ConfigRepo.ts` — returning casts removed
- `src/repo/UserRepo.ts` — typed count selections replace row casts
- `src/repo/FunctionalPermissionRepo.ts` — any-bypass and result casts removed
- `src/ui/pages/AdminConfigList.tsx` — updatedAt casts removed, `unknown` narrowing, typed monaco access
- `src/ui/pages/AdminApiKeyDetail.tsx` — `catch (err: unknown)`
- `src/ui/api/AuditLog.ts`, `src/ui/pages/AdminAuditLog.tsx` — `Record<string, unknown>` payload types

## Breaking Changes for Downstream Consumers
None for the wire: no API shape change — only honest typing of the existing contracts. `AuditEntry.payload`'s TS type changed from `Record<string, any>` to `Record<string, unknown>`; consumers reading fields from the payload must narrow (e.g. `typeof`) before use.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- ARCH-008 (placeholder decorate removal) — separate fix definition, implemented earlier in the same change set.
- TS-005 (adding `updatedAt` to `ConfigEntryUI`) — separate fix definition, implemented first; this fix consumed it.
- TS-002 (non-null assertions) — separate fix definition.

## Resolved Questions
None.
