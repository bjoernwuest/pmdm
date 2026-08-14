# Downstream Plan: PATT-011 — Shared three-stream save-confirmation helper

## Upstream Change
Reference: `/report/Fix PATT-011 - Shared three-stream save-confirmation helper.md`. New shared module export (`runSaveWithConfirmation` + `SaveConfirmationOptions`); three template call sites migrated. No HTTP or PubSub payload changes.

## Upstream's Own Assessment
"Yes — one new shared module export (`runSaveWithConfirmation` + `SaveConfirmationOptions`); three call sites migrated. No HTTP or PubSub payload changes."

## Applicability to This Project
Affected: No

Evidence:
- The upstream change is additive; the three migrated call sites are template pages (shared, merged). No export was removed, so pmdm-owned pages are unaffected.
- pmdm-owned save flows implement their own 409/reload handling against pmdm's own endpoints (e.g. `src/ui/pages/pmdm/AdminNotifications.tsx` reloads on `ApiError` 409), which is not the template's save-confirmation mechanism.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
