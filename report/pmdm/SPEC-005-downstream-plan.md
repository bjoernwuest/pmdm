# Downstream Plan: SPEC-005 — Failures no longer indistinguishable from legitimate emptiness

## Upstream Change
Reference: `/report/Fix SPEC-005 - Failures no longer indistinguishable from legitimate emptiness.md`. `/api/me/context` can now return 500 (previously never); failures propagate instead of looking like an empty permission set. Error-body shape follows API-001's canonical `{ error }`.

## Upstream's Own Assessment
"Yes — `/api/me/context` can now return 500 (previously never); clients must already handle non-200 paths (the UI API helpers throw `ApiError`, landing in the pages' load-error handling). Error-body shape follows API-001's canonical `{ error }`."

## Applicability to This Project
Affected: No

Evidence:
- The changed endpoint (`src/api/MeAPI.ts`) is shared and already fixed via the merge.
- This project's consumer (`src/ui/app.tsx` loadContext) already handles non-200 paths: it uses the shared `getViewerContext()` wrapper (which throws `ApiError`) inside a try/catch that intentionally ignores load errors and resets the loading state (`src/ui/app.tsx` `loadContext`). No pmdm code assumed `/api/me/context` could never fail.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
