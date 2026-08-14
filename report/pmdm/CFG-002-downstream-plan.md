# Downstream Plan: CFG-002 — Runtime config edits now apply to the cited subsystems

## Upstream Change
Reference: `/report/Fix CFG-002 - Runtime config edits now apply to the cited subsystems.md`. Runtime behavior change: session-timeout and request-bundling config edits apply without restart (a session-timeout edit drops existing sessions), and the permission-check DB load is reduced. Implemented via the shared config-cache invalidation pattern (config-upsert PubSub subscription). No API or export changes.

## Upstream's Own Assessment
"Yes — runtime behavior change: session-timeout and bundling config edits apply without restart (a session-timeout edit drops existing sessions), and permission-check DB load is reduced. No API or export changes."

## Applicability to This Project
Affected: No

Evidence:
- The cited subsystems (session timeout in `src/services/auth/sessions.ts`, request bundling in `src/services/RequestBundling.ts`, permission-check caching in `src/services/auth/*`) are all shared files, already fixed via the merge.
- This project's own services (`src/services/Notifications.ts`, `ScriptEngine.ts`, `ScriptLog.ts`) read their config once at startup to schedule cron jobs; they implement no runtime config cache, no session-timeout or bundling logic, and no permission-check caching — none of the changed subsystems is reimplemented in pmdm-owned code, so nothing needs invalidation wiring here.
- Project-wide search found no pmdm-owned config cache without invalidation.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
