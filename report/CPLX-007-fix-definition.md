# Fix Definition: CPLX-007 — `formatterRegistry` rebuilt per render and partially duplicated

## Source Finding
04-complexity-maintainability.md — `AdminConfigList.tsx:326-328` constructs a new `Map` and registers two formatters on every render, shadowing the exported `formatterRegistry` from `src/ui/components/InputField.tsx:19-24` (which registers five, including uuid)

## Human Directive
None — default interpretation applies.

## Target End State
`src/ui/components/InputField.tsx`'s exported `formatterRegistry` is the single formatter registry. `AdminConfigList.tsx` no longer constructs its own `Map` per render; its `resolveFormatter` reads from the shared registry. Formatter-name mismatches are resolved deliberately: the page currently looks up `"numeric"` while the shared registry registers `"digits"` — the fix aligns on the shared registry's names (config entries using the page-local alias are mapped at the lookup site if any such inputFormat values actually exist in config data; otherwise the lookup simply uses the shared names). No re-render-time allocation remains.

## Approach
Delete the local `formatterRegistry` construction and `resolveFormatter`'s dependency on it in `AdminConfigList.tsx`; import the shared `formatterRegistry` (and any missing formatter, if `"numeric"` semantics differ from `"digits"`, register that alias once in the shared registry — implementation verifies against actual `inputFormat` values in config declarations). Confirm no other page builds a private registry (sweep).

## Affected Scope
- `src/ui/pages/AdminConfigList.tsx` — remove local registry, use shared one
- `src/ui/components/InputField.tsx` — possibly add an alias registration if config data requires it

## Explicit Constraints
- The displayed/formatted values for existing config entries must be identical before/after (verify against the `inputFormat` values present in `src/services` config declarations and seeded rows).
- No API change to `InputField` components; the registry export stays the single source.

## Out of Scope
- CPLX-009 (Label/InputField double-seeding) — separate fix definition.
- CPLX-006 (Toggle/InputField internal duplication) — unchecked.
- CPLX-001 (file size) — separate fix definition; this fix removes a small duplicated block, not the page's overall size problem.

## Downstream Impact
No — page-internal change; shared registry export already exists.
