# Downstream Plan: PATT-003 — Single instance-form PubSub event per affected entity

## Upstream Change
Reference: `/report/Fix PATT-003 - Single instance-form PubSub event per affected entity.md`. `src/repo/ApiKeyRepo.ts` no longer publishes tag-only + instance-form pairs; each API-key mutation publishes exactly one instance-form event, and the delete event gained the instance form. `src/services/AGENTS.md` states the instance form is the only form.

## Upstream's Own Assessment
"Yes — event multiplicity changed for API-key mutations: subscribers now see exactly one event per mutation instead of two, and the delete event gained an instance tag. Any subscriber written against the old multiplicity must be reviewed (in-repo subscribers were verified: the audit-log expression and UI list expressions still match the instance-form tags)."

## Applicability to This Project
Affected: No

Evidence:
- `src/repo/ApiKeyRepo.ts` is byte-identical to upstream's fixed version (diff against `bun-starter`: no differences), and its subscribers (audit-log expression, UI list expressions) are shared/fixed via the merge.
- This project's own publish sites use their own pmdm-defined tag sets (`message_*` constants) for pmdm's own entities and are not the cited API-key mutation sites; the upstream change does not alter those tags or their subscribers, so nothing pmdm-owned breaks. (pmdm's own `message_*` tag-only definitions are a separate pmdm design question outside this fix's implemented scope.)

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
