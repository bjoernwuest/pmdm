# Downstream Fix API-004 - Config optimistic-locking contract aligned (knownUpdatedAt round-trip)

## Source
- Upstream fix: `/report/Fix API-004 - Config optimistic-locking contract aligned.md`
- Downstream plan: /report/pmdm/API-004-downstream-plan.md

## Summary of Change
Migrated the pmdm-owned notifications config update path from the old `knownValue` contract to the canonical `knownUpdatedAt` optimistic-locking round-trip. The GET list now returns `updatedAt` per entry, the PUT route requires `{ value, knownUpdatedAt: string }`, performs the guarded update via the shared repo CAS (`updateConfigEntry`), returns the updated entry including `updatedAt`, and answers `409 { error, currentValue }` (declared as `OptimisticLockConflictResponseSchema`) on lock mismatch. The UI wrapper and its call site now send `entry.updatedAt` and carry `updatedAt` in the entry type. The per-data-type `knownValues` feature in the product-request domain is separate and was not touched.

## Files Changed
- `src/api/NotificationsAPI.ts` — `ConfigEntryUiSchema` and GET mapping include `updatedAt`; PUT body schema is `{ value, knownUpdatedAt }`; JSON-compare + `upsertConfigEntry` replaced by `updateConfigEntry` with 409/`currentValue` on mismatch; unused import dropped
- `src/ui/api/Notifications.ts` — `NotificationConfigEntry` gains `updatedAt: string`; `updateNotificationConfig(key, value, knownUpdatedAt)` sends `{ value, knownUpdatedAt }`
- `src/ui/pages/pmdm/AdminNotifications.tsx` — both update call sites pass `entry.updatedAt`

## Required Manual Follow-Up
None.

## Verification Notes
Confirmed via project-wide search that no `knownValue` reference remains in the notifications config path (`src/api/NotificationsAPI.ts`, `src/ui/api/Notifications.ts`, `src/ui/pages/pmdm/AdminNotifications.tsx`); confirmed the remaining `knownValues` occurrences belong to the separate product-request value-locking feature; confirmed `updateConfigEntry` and `OptimisticLockConflictResponseSchema` exist in the merged shared code.
