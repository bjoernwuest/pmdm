# Downstream Plan: PATT-004 — PubSub events deferred until transaction commit

## Upstream Change
Reference: `/report/Fix PATT-004 - PubSub events deferred until transaction commit.md`. `runInTransaction`/`PubSub` interaction gained publish scoping: events from a transaction become visible only after commit, and rolled-back transactions never deliver. New internal exports (`beginPublishScope`/`commitPublishScope`/`rollbackPublishScope`) serve the driver.

## Upstream's Own Assessment
"Yes — `runInTransaction`/`PubSub` interaction gained new internal behavior: events from a transaction become visible only after commit, and events from rolled-back transactions are never delivered. No export renames; new internal exports `beginPublishScope`/`commitPublishScope`/`rollbackPublishScope` exist for the driver's use (and potential testing)."

## Applicability to This Project
Affected: No

Evidence:
- `src/services/PubSub.ts` is byte-identical to upstream's fixed version; `src/services/DatabaseDriver.ts` (pmdm-divergent only in its advisory-lock mechanics) contains the merged publish-scope wiring (`beginPublishScope`/`commitPublishScope`/`rollbackPublishScope` at lines 221-227, import at line 5).
- No pmdm-owned code manipulates publish scopes directly or relies on pre-commit event visibility.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
