# Fix Definition: CPLX-003 — Duplicated server-side logic across files

## Source Finding
04-complexity-maintainability.md — `apps/setup.ts:36-94` vs. `services/Config.ts:7-46` (near-identical parse logic — `design/configuration.md:107-113` claims they share it, which is false); `ConfigAPI.ts:20-34` vs. `UserProfileConfigAPI.ts:17-31` (identical `canonicalizeJson`/`equalsJson`); `ApiKeyAPI.ts:38-40`, `UserAPI.ts:21-23`, `GroupAPI.ts:26-28` (identical `parseBooleanQuery`); `src/ui/api/_client.ts:21-30` vs. `src/ui/api/server_sent_events.ts:8-17` (identical `extractErrorMessage`)

## Human Directive
None — default interpretation applies.

## Target End State
Each of the four duplicated units exists exactly once, in the layer-appropriate shared location, and every former copy imports it:

- Config value parsing/validation: `src/services/Config.ts` (`parseConfigValue`, `schemaForType`) is the single implementation; `src/apps/setup.ts` imports from there (setup app importing a service is the sanctioned direction). The claim in `design/configuration.md:107-113` becomes true rather than being deleted.
- `canonicalizeJson`/`equalsJson`: one implementation, placed where both API files can import it (a shared API-helper location or `src/types/`-adjacent utility consistent with layer rules; `ConfigAPI.ts` and `UserProfileConfigAPI.ts` both import it).
- `parseBooleanQuery`: one implementation; `src/api/AGENTS.md` already documents a canonical boolean-parse pattern — the shared helper becomes that pattern's home, and `ApiKeyAPI.ts`, `UserAPI.ts`, `GroupAPI.ts` import it.
- `extractErrorMessage`: one implementation in the UI API layer (it belongs with the transport helpers, e.g. in `errors.ts` or `_client.ts`), imported by both `_client.ts` and `server_sent_events.ts`.

Behavior of each function is unchanged; where the two copies differ slightly (setup's parse vs. the service's parse), the service implementation is canonical and any setup-specific behavior difference is evaluated at implementation — default is adopt the service version, since the design doc already claims they share it.

## Approach
Single-source each function and update import sites. This is the merge counterpart to the docs: `design/configuration.md`'s sharing claim is kept and made true (the doc is stale per DOC-001, which is unchecked — so this fix makes the code match the doc's claim rather than editing the doc's claim away, since the claim describes the desired architecture).

## Affected Scope
- `src/services/Config.ts` — remains canonical; verify it exports everything setup needs (add `schemaForType` export if missing)
- `src/apps/setup.ts` — delete local `schemaForType`/`parseValue`, import from the service
- `src/api/ConfigAPI.ts`, `src/api/UserProfileConfigAPI.ts` — import shared `canonicalizeJson`/`equalsJson`
- `src/api/ApiKeyAPI.ts`, `src/api/UserAPI.ts`, `src/api/GroupAPI.ts` — import shared `parseBooleanQuery`
- `src/ui/api/_client.ts`, `src/ui/api/server_sent_events.ts` — import shared `extractErrorMessage` (likely from `errors.ts`)
- `src/ui/AGENTS.md` api/ file list if a module's responsibility description changes

## Explicit Constraints
- No behavior change per call site (parse results, canonicalization, boolean parsing, error-message extraction all identical from the caller's perspective).
- Layer rules respected: UI imports from UI; API imports from services/types; apps import from services. The shared homes must sit in a layer all consumers may import from.
- `design/configuration.md` is not edited under this ID beyond what making-the-claim-true requires (DOC-001 owns the doc).

## Out of Scope
- DOC-001 (stale configuration.md generally) — unchecked; only the now-true sharing claim is relevant here.
- API-001 (error shape canonicalization) — separate fix definition; `extractErrorMessage` merging does not change shapes.
- PATT-001 (error strategies) — separate fix definition.

## Downstream Impact
Yes — functions move to shared modules; import sites in four API/app files and two UI modules change. No runtime contract changes.
