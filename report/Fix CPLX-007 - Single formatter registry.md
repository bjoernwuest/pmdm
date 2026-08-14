# Fix CPLX-007 - Single formatter registry; no per-render Map in AdminConfigList

## Source
- Finding: CPLX-007 (see /report/04-complexity-maintainability.md)
- Fix definition: /report/CPLX-007-fix-definition.md

## Summary of Change
`AdminConfigList.tsx` no longer constructs its own formatter `Map` per render: `resolveFormatter` and the input-format check now read from the shared `formatterRegistry` exported by `src/ui/components/InputField.tsx` (the single registry). The page-local `"numeric"`/`"uuid"` entries were removed without an alias registration — the config declarations' `inputFormat` values are regex patterns (or empty), never the literal alias `"numeric"`, so the shared registry's names already cover all existing lookups (the regex path handles everything else). The now-dead `uuidFormatter`/`numericFormatter` imports were removed. A sweep found no other page building a private registry.

## Files Changed
- `src/ui/pages/AdminConfigList.tsx` — local registry removed; shared `formatterRegistry` used

## Breaking Changes for Downstream Consumers
None — page-internal change; the shared registry export already existed.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- CPLX-009 (Label/InputField double-seeding) — separate fix definition.
- CPLX-006 (Toggle/InputField internal duplication) — unchecked.
- CPLX-001 (file size) — separate fix definition.

## Resolved Questions
None.
