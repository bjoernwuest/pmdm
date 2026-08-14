# Fix Definition: CPLX-010 — Overlapping PubSub subscriptions double-apply updates in one page

## Source Finding
04-complexity-maintainability.md — `AdminConfigList.tsx:317` subscribes `{and:[TAG_CONFIG,TAG_UPDATE]}` (full `loadEntries`), `:477` subscribes `{and:[TAG_CONFIG]}` (targeted state merge) — both fire for every config update

## Human Directive
None — default interpretation applies.

## Target End State
`AdminConfigList.tsx` reacts to each config-update event exactly once. The full-reload subscription (`{and:[TAG_CONFIG,TAG_UPDATE]}` → `loadEntries()`) and the targeted-merge subscription (`{and:[TAG_CONFIG]}` → in-place state merge) no longer both fire for the same event: one subscription path is kept as the page's update reaction and the other is removed or re-scoped so their event sets are disjoint. The decision of which survives is made against correctness: the targeted merge is the cheaper, more precise reaction and is kept as the primary path; the full reload is removed unless a concrete case exists where the merge misses state that only a reload provides (implementation must verify by comparing what `loadEntries` refreshes versus what the merge updates — e.g. newly added/deleted config entries, group structure changes — and if such cases exist, the kept subscription expression is narrowed to exactly those event kinds instead of all `TAG_CONFIG` updates).

## Approach
Consolidate to one subscription: keep the `{and:[TAG_CONFIG]}` targeted merge (extended if needed to also handle create/delete-style events that change the entry set, using the action tags the publish convention provides), and delete the `{and:[TAG_CONFIG,TAG_UPDATE]}` full-reload effect. Verify no user-visible regression: values still update live, editing rows are not clobbered (the merge already respects `inlineEdit` state — preserve that guard), and group/entry structure changes still reflect.

## Affected Scope
- `src/ui/pages/AdminConfigList.tsx` — remove/narrow one subscription, possibly extend the survivor's event handling

## Explicit Constraints
- Exactly one reaction per config event; no double application.
- The editing-row protection (active inline edit not overwritten by passive updates) must be preserved.
- Live updates must remain working for value changes; structure changes (entry added/removed) must still be handled — by the surviving subscription or a deliberately narrowed reload trigger.

## Out of Scope
- RCT-001 (useEffect dependency problems generally) — separate fix definition.
- PATT-003/PATT-004 (publish granularity/timing) — publisher side, separate fix definitions.
- CPLX-001/CPLX-002 (size/scaffolding) — separate fix definitions.

## Downstream Impact
No — page-internal subscription wiring only.
