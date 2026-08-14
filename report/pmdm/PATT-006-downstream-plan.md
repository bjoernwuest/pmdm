# Downstream Plan: PATT-006 — One caching policy with sanctioned idioms

## Upstream Change
Reference: `/report/Fix PATT-006 - One caching policy with sanctioned idioms.md`. Runtime behavior change: request-bundling config edits (and OIDC/EntraID config edits) now apply without restart via the sanctioned config-change invalidation idiom. No API changes.

## Upstream's Own Assessment
"Yes — runtime behavior change: request-bundling config edits (and OIDC/EntraID config edits) now apply without restart. No API changes."

## Applicability to This Project
Affected: No

Evidence:
- The affected caches (request-bundling server/client config, OIDC/EntraID config) live in shared service files, already fixed via the merge.
- This project's own services implement no runtime config caches (verified under CFG-002): `Notifications.ts`/`ScriptLog.ts` read config once at startup to schedule cron jobs, which is startup behavior, not runtime caching.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
