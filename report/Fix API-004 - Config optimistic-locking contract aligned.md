# Fix API-004 - Config optimistic-locking contract aligned: knownUpdatedAt round-trip

## Source
- Finding: API-004 (see /report/09-api-interfaces.md)
- Fix definition: /report/API-004-fix-definition.md

## Summary of Change
Aligned the config update contract end to end on `knownUpdatedAt`. `ConfigUpdateRequest`/`ConfigUpdateBodySchema` now carry `knownUpdatedAt: string` instead of `knownValue`; `UserProfileConfigUpdateSchema` carries optional `knownUpdatedAt` instead of optional `knownValue`; `ConfigEntryUI` (via TS-005) and the config API responses include `updatedAt`, and profile-config responses include the override's `updatedAt`. The config pages (`AdminConfigList.tsx`, `UserProfileConfigList.tsx`) send `knownUpdatedAt` from the entry/context state they last saw and store the fresh `updatedAt` from the responses back into their state. `src/ui/api/ApiKeys.ts` now builds its query string with `URLSearchParams` (same parameters/encoding as before), matching the idiom in `AuditLog.ts`. Server and client shipped together in one change set; no intermediate state exists where one side speaks only the old token.

## Files Changed
- `src/types/ConfigType.ts` — `ConfigUpdateRequest`/`ConfigUpdateBodySchema` use `knownUpdatedAt`
- `src/types/UserProfileConfigType.ts` — `UserProfileConfigUpdateSchema` uses optional `knownUpdatedAt`; `UserProfileConfigEntrySchema` gains optional nullable `updatedAt`
- `src/ui/api/UserProfileConfig.ts` — request type uses `knownUpdatedAt`; entry type gains `updatedAt`
- `src/ui/pages/AdminConfigList.tsx` — four update call sites send `knownUpdatedAt`
- `src/ui/pages/UserProfileConfigList.tsx` — four update call sites send `knownUpdatedAt` and store the returned `updatedAt`
- `src/ui/api/ApiKeys.ts` — query string built with `URLSearchParams`

## Breaking Changes for Downstream Consumers
Yes — the config update request body changed: `PUT /api/config/:domain/:key` now expects `{ value, knownUpdatedAt: string }` (old: `{ value, knownValue }`); `PUT /api/me/config/:domain/:key` now accepts `{ value, knownUpdatedAt?: string }` (old: `knownValue?`). Any external consumer of the config PUT endpoints must follow. Responses additionally carry `updatedAt` (profile: override `updatedAt`, nullable). UI wrapper internals changed idiom only (`URLSearchParams`, identical requests).

## Required Manual Follow-Up
None.

## Out of Scope Notes
- DATA-002 (schema columns + atomic CAS server-side) — separate fix definition, implemented in the same change set.
- TS-005 (type fields) and TS-001 (cast removal) — separate fix definitions (TS-005 implemented first; TS-001 consumes the completed types).
- VB-AI-001 — unchecked.
- User-profile-config behaviors beyond the shared lock contract — not addressed.

## Resolved Questions
None.
