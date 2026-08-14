# Fix VB-AI-003 - AGENTS.md canonical file examples all resolve (existence sweep)

## Source
- Finding: VB-AI-003 (see /report/14-vibe-coding-guidance.md)
- Fix definition: /report/VB-AI-003-fix-definition.md

## Summary of Change
Per the boundary with DOC-004 (which owned the textual corrections), the enumerated nonexistent citations were corrected under DOC-004 in this change set, and this fix's acceptance criterion — the class-closing existence sweep — was executed: every `@/...` import citation and backticked `.ts`/`.tsx` filename in every `AGENTS.md` under `src/` was checked against the live tree. All citations resolve. The only flagged tokens are naming-pattern placeholders (`Schema.ts`/`Repo.ts` inside "must end with `Schema.ts`" / "replace `Schema.ts` with `Repo.ts`" guidance), which are templates, not concrete file citations, and were left as-is. No additional corrections beyond DOC-004's list were needed.

## Files Changed
- None directly (corrections delivered via DOC-004; sweep is the deliverable)

## Breaking Changes for Downstream Consumers
None — documentation only.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- DOC-004 (owns the enumerated filename corrections) — separate fix definition, implemented in the same change set.
- VB-AI-001 (rules contradicted by code) and VB-AI-002 (tests/AGENTS.md) — unchecked.
- VB-AI-004 (rule redundancy/precedence) — separate fix definition.

## Resolved Questions
None.
