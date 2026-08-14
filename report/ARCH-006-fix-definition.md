# Fix Definition: ARCH-006 — Setup app binds the same port as the main app without a release wait

## Source Finding
01-architecture-structure.md — `src/apps/setup.ts:228,235,245`; `src/main.ts:83-84`

## Human Directive
None — default interpretation applies.

## Target End State
When setup completes, the setup server's port is guaranteed to be released before `src/main.ts` proceeds to bind the main application to the same port: the `server.stop()` promise is awaited inside `src/apps/setup.ts` before the setup function resolves, so no `EADDRINUSE` race exists on the setup-completion path. Additionally, the setup wizard HTML document at `src/apps/setup.ts:107` declares `<html lang="en">`, satisfying the root AGENTS.md rule "All UI text must be in English."

## Approach
- In `src/apps/setup.ts`, inside the polling completion branch (currently `setup.ts:245`), await `server.stop()` before calling `resolve()`. Elysia's `stop()` returns a promise that settles when the server has stopped serving; awaiting it inside the existing async interval callback closes the race without restructuring `main.ts`.
- Keep `stop()` called without the abrupt flag (graceful close of in-flight requests) — setup completion is not time-critical, and in-flight setup responses should finish.
- Change the `lang="de"` attribute to `lang="en"` in the setup HTML template. All user-visible strings in that template are already English; only the attribute is wrong.

## Affected Scope
- `src/apps/setup.ts` — await the stop promise; fix the `lang` attribute

## Explicit Constraints
- No change to the setup flow's external behavior: same port, same polling interval, same console output ordering (the "Setup completed! Starting main application..." message still precedes the return to `main.ts`).
- The fix must not introduce a fixed sleep/arbitrary delay; awaiting the actual stop promise is the resolution.
- The language fix is limited to the attribute; no other setup-wizard text changes.

## Out of Scope
- SPEC-004 (setup-demand cache logic and polling rescan) — related to the polling loop's config detection, not to the port race; handled under its own ID.
- NAME-007 (`/setup/clienType.js` endpoint typo) — same file, separate fix definition.

## Downstream Impact
No — internal startup sequencing and an HTML attribute only; no exports, API shapes, or configuration change.
