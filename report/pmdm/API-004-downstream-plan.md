# Downstream Plan: API-004 — Config optimistic-locking contract aligned (knownUpdatedAt round-trip)

## Upstream Change
Reference: `/report/Fix API-004 - Config optimistic-locking contract aligned.md`. The config update contract was moved end to end from `knownValue` to `knownUpdatedAt`: `PUT /api/config/:domain/:key` requires `{ value, knownUpdatedAt: string }`, `PUT /api/me/config/:domain/:key` accepts optional `knownUpdatedAt`; responses include `updatedAt`; the shared `ConfigAPI.ts` now performs the guarded update via `updateConfigEntry(db, domain, key, value, knownUpdatedAt)` (repo-side CAS, `409 { error, currentValue }` on mismatch); UI pages send `knownUpdatedAt` from the state they last saw and store the returned `updatedAt`. Server and client shipped together.

## Upstream's Own Assessment
"Yes — the config update request body changed: `PUT /api/config/:domain/:key` now expects `{ value, knownUpdatedAt: string }` (old: `{ value, knownValue }`); `PUT /api/me/config/:domain/:key` now accepts `{ value, knownUpdatedAt?: string }` (old: `knownValue?`). Any external consumer of the config PUT endpoints must follow. Responses additionally carry `updatedAt` (profile: override `updatedAt`, nullable). UI wrapper internals changed idiom only (`URLSearchParams`, identical requests)."

## Applicability to This Project
Affected: Yes

Evidence:
- This project owns a config-style update route that still speaks the OLD contract: `src/api/NotificationsAPI.ts` `PUT /api/notifications/config/:key` — body schema `{ value: t.Any(), knownValue: t.Any() }` (line 130-133), handler reads `knownValue` and compares `JSON.stringify(entry.value) !== JSON.stringify(knownValue)` (lines 88-92), and writes via `upsertConfigEntry`.
- The pmdm-owned UI wrapper `src/ui/api/Notifications.ts` sends `{ value, knownValue }` and its `NotificationConfigEntry` type lacks `updatedAt`.
- The caller `src/ui/pages/pmdm/AdminNotifications.tsx:63,86` passes `entry.value` as the known value and its GET source (`NotificationsAPI.ts` GET mapping, lines 46-55) does not return `updatedAt`, so no round-trip exists.
- Upstream's `updateConfigEntry` (repo CAS) and `OptimisticLockConflictResponseSchema` are already available in this tree (merged) but unused by this route.
- The `knownValues` occurrences in `ProductRequestRepo.ts`/`ProductRequests.ts`/`ProductRequestAPI.ts`/`ProductRequestDetailPage.tsx` are a separate pmdm domain feature (per-data-type value locking) and are NOT part of the upstream config contract; left untouched.

## Target End State
The notifications config update round-trips `updatedAt`: GET `/api/notifications/config` returns `updatedAt` per entry; `PUT /api/notifications/config/:key` requires `{ value, knownUpdatedAt: string }`, performs the guarded update via `updateConfigEntry`, returns the updated entry including `updatedAt`, and answers `409 { error, currentValue }` on lock mismatch; the UI wrapper sends `knownUpdatedAt` (from `entry.updatedAt`) and its entry type carries `updatedAt`.

## Approach
1. `src/api/NotificationsAPI.ts`: add `updatedAt` to the local `ConfigEntryUiSchema`; include `updatedAt` in the GET mapping; change the PUT body schema to `{ value: t.Any(), knownUpdatedAt: t.String() }`; replace the JSON-compare + `upsertConfigEntry` logic with `updateConfigEntry(dbClient, configDomain, key, value, body.knownUpdatedAt)`; on empty result return `status(409, { error: "Conflict: entry was modified by another session", currentValue: current?.value ?? null })`; success returns the UI shape with `updatedAt`. Drop the now-unused `upsertConfigEntry` import.
2. `src/ui/api/Notifications.ts`: `NotificationConfigEntry` gains `updatedAt: string`; `updateNotificationConfig(key, value, knownUpdatedAt: string)` sends `{ value, knownUpdatedAt }`.
3. `src/ui/pages/pmdm/AdminNotifications.tsx`: pass `entry.updatedAt` at both update call sites.

## Affected Scope
- `src/api/NotificationsAPI.ts`
- `src/ui/api/Notifications.ts`
- `src/ui/pages/pmdm/AdminNotifications.tsx`

## Anticipated Manual Follow-Up
None.

## Open Questions
None.
