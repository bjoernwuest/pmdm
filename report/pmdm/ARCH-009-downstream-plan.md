# Downstream Plan: ARCH-009 — Unauthenticated public mount documented

## Upstream Change
Reference: `/report/Fix ARCH-009 - Unauthenticated public mount documented.md`. Root `AGENTS.md`'s static-asset section gained the `./public/` → `/public/*` unauthenticated-mount entry (including the traversal-safety statement and the "may not exist in the base template" note); the `static/public/` entry now states its URL prefix. The mount itself is unchanged.

## Upstream's Own Assessment
"None — documentation only; no behavior change."

## Applicability to This Project
Affected: No

Evidence:
- This project's root `AGENTS.md` is byte-identical to upstream's fixed version (diff against `bun-starter`: no differences) and already contains the `/public/*` entry (`AGENTS.md:55`).
- The mount code (`src/main.ts`) is shared and unchanged; pmdm adds no own static-mount documentation that would contradict the entry.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
