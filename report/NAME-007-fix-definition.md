# Fix Definition: NAME-007 — Public endpoint typo `/setup/clienType.js`

## Source Finding
02-naming-consistency.md — `src/apps/setup.ts:115,124`

## Human Directive
None — default interpretation applies.

## Target End State
The setup wizard's client bundle is served at `/setup/client.js`, consistent with `/login/client.js` and `/ui/client.js`. The string `clienType` no longer appears in the codebase. Both sides of the pair — the route registration (`src/apps/setup.ts:124`) and the `<script src>` in the setup HTML (`src/apps/setup.ts:115`) — use the corrected path, so the setup wizard keeps working end to end.

## Approach
Rename in lockstep inside `src/apps/setup.ts`: change the script `src="/setup/clienType.js"` and the route `setupApp.get("/setup/clienType.js", ...)` to `/setup/client.js`. No redirect or alias for the old path is kept — the endpoint is an ephemeral setup-mode asset served only while the wizard runs, the typo is consistent today (so nothing external can depend on the misspelled path except a browser tab mid-setup), and the finding itself warns that keeping it fossilizes the typo as public URL surface.

## Affected Scope
- `src/apps/setup.ts` — script src and route path

## Explicit Constraints
- Both occurrences change together in the same change set; a half-applied rename breaks the setup wizard.
- No functional change to bundle serving, ETag, or caching behavior.

## Out of Scope
- ARCH-006 (port release race and `lang` attribute in the same file) — separate fix definition.
- SPEC-004 (setup-demand polling) — unchecked.

## Downstream Impact
No persistent downstream impact — the URL is consumed only by the setup HTML served from the same file; both sides change together.
