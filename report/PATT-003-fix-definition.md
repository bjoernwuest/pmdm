# Fix Definition: PATT-003 — PubSub publish granularity inconsistent across repos

## Source Finding
03-patterns-concepts.md — double-publish per mutation (tag-only + instance form): `src/repo/ApiKeyRepo.ts:188-189,222-223,255-256`; single instance form: `src/repo/UserRepo.ts:108,111,164,167`; tag-only on delete: `ApiKeyRepo.ts:279`; instance-only on another path: `ApiKeyRepo.ts:320`

## Human Directive
None — default interpretation applies.

## Target End State
Every mutation in `src/repo/` publishes exactly one PubSub event per affected entity, in the narrowly-scoped instance form: `[TAG_<DOMAIN>, <entity-identifier>, TAG_<ACTION>, TAG_AFTER]` with an `identifiers` entry in the payload (the `UserRepo.ts:108`-style single instance form becomes canonical). No repo publishes the tag-only and instance-form pair for the same mutation; no repo publishes tag-only delete events. Subscribers (audit log, UI merge logic) observe exactly one event per mutation from every repo, so the audit-log double-count of ApiKey updates disappears.

## Approach
- Normalize `src/repo/ApiKeyRepo.ts` to the single-instance-form convention: collapse the pairs at `:188-189`, `:222-223`, `:255-256` into one publish each (keeping the instance-form variant with its richer payload, merging any payload fields the tag-only variant uniquely carried — e.g. `identifiers: { api_key: ... }` — into the surviving event); give the delete path (`:279`) the instance form with the identifier as a tag.
- Sweep the other repos (`UserRepo.ts`, `ConfigRepo.ts`, `FunctionalPermissionRepo.ts`, `UserProfileConfigRepo.ts`) for deviations from the convention and normalize; where a bulk mutation affects N entities, the per-entity publish loop (as in `UserRepo.ts:72,190`) is the accepted pattern.
- Publish timing (inside-transaction vs post-commit) is PATT-004's scope; this fix standardizes *what* is published, PATT-004 standardizes *when*.
- Document the convention ("one event per affected entity, instance form, payload carries `identifiers`") in `src/services/AGENTS.md`'s PubSub section, which already describes the instance form — tighten the wording to state it is the only form.

## Affected Scope
- `src/repo/ApiKeyRepo.ts` — collapse double-publishes, fix delete form
- `src/repo/UserRepo.ts`, `ConfigRepo.ts`, `FunctionalPermissionRepo.ts`, `UserProfileConfigRepo.ts` — sweep/normalize
- `src/services/AGENTS.md` — convention wording
- Subscribers relying on tag-only ApiKey events (audit log expression in `src/services/AuditLog.ts`, UI subscriptions) — verified to work with instance form; instance form still carries the domain tag so existing `TAG_API_KEY` expression subscriptions keep matching

## Explicit Constraints
- Event count per mutation becomes deterministic: exactly one per affected entity.
- Every published event continues to carry exactly one timing tag (`TAG_AFTER` for these post-mutation events), per `src/services/AGENTS.md`.
- Payload fields currently consumed by subscribers must survive the merge (audit log reads payloads; UI list pages derive entities from tags/payloads — see PATT-010 for the UI-side subscription scoping, which is a separate fix).
- No change to PubSub topic/expression infrastructure itself.

## Out of Scope
- PATT-004 (publish before commit / phantom delete event) — separate fix definition governing timing; this fix assumes PATT-004's timing rule is applied to the same call sites.
- PATT-010 (UI subscription scoping) — subscriber side, separate fix definition.
- SEC-009 (audit-log coverage gaps) — separate fix definition; the double-count symptom is resolved here, coverage gaps there.
- CPLX-010 (overlapping subscriptions in one page) — separate fix definition.

## Downstream Impact
Yes — event multiplicity per mutation changes (ApiKey subscribers see one event instead of two, delete gains an instance tag); subscribers written against the old multiplicity must be reviewed at implementation time.
