# Fix Definition: PATT-010 — PubSub subscriptions not narrowly scoped; entity derived via UUID-regex over tags

## Source Finding
03-patterns-concepts.md — `AdminUserList.tsx:81,85` subscribes `{or:[TAG_UPDATE,TAG_DISABLE]}` and derives the entity by regexing a UUID out of tags; same in `AdminApiKeyList.tsx:118,121` and `AdminGroupList.tsx:77`; unused domain-tag imports `TAG_USER` (`AdminUserList.tsx:11`), `TAG_API_KEY` (`AdminApiKeyList.tsx:24`)

## Human Directive
None — default interpretation applies.

## Target End State
The admin list pages subscribe narrowly scoped to their domain: `AdminUserList` subscribes `{ and: [TAG_USER, { or: [TAG_UPDATE, TAG_DISABLE] }] }`, `AdminApiKeyList` uses `TAG_API_KEY`, `AdminGroupList` uses `TAG_GROUP` — so events from other domains never reach these handlers. The entity identifier is taken from the event payload's `identifiers`/identifier fields (the publish convention normalized by PATT-003 guarantees its presence) instead of being guessed by running a UUID regex over the tag list. The UUID-regex derivation disappears from all three pages, and the previously dead domain-tag imports become the ones actually used. Cross-domain misfires (an API-key event hitting the user-list handler on UUID coincidence) are impossible.

## Approach
Per page: add the domain tag to the subscription expression (compound `and` with the existing `or`), replace the `tags.find(uuidRegex)` extraction with reading the identifier from `msg.data` (`identifiers` map / `identifier` field, per the PATT-003-normalized publish payloads), and drop the regex. The ref-map key lookup (`labelRefs.current.get(id)`) stays as the applicability check. Keep handler update logic (which fields map to which label refs) unchanged.

Dependency note: this fix assumes PATT-003's payload convention (instance identifier present in every relevant event payload). If implemented before PATT-003, the identifier must be sourced from the tag that equals the domain-tagged instance id — but the regex must still go; implementation should land after or together with PATT-003.

## Affected Scope
- `src/ui/pages/AdminUserList.tsx`, `AdminApiKeyList.tsx`, `AdminGroupList.tsx` — subscription expressions and identifier extraction
- Any other page discovered with the same UUID-regex derivation pattern (sweep at implementation)

## Explicit Constraints
- The "narrowly scoped to the affected resources" rule from root AGENTS.md is the acceptance criterion: handlers must not fire for foreign-domain events.
- No change to what the handlers do once the right event+entity is identified.
- Subscriptions remain compatible with server-side expression filtering (compound `and`/`or` expressions are supported per `src/services/AGENTS.md`).

## Out of Scope
- PATT-009 (unsubscribe idiom) and CPLX-010 (overlapping subscriptions double-applying updates) — separate fix definitions touching the same files.
- CPLX-002 (admin list-page scaffolding duplication) — separate fix definition; do not extract a shared list-page hook here.
- VB-AI-001 — unchecked.

## Downstream Impact
No — subscriber-side narrowing only; publish payloads already carry the identifiers (guaranteed by PATT-003). No export or API changes.
