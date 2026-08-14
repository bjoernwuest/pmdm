# Fix PATT-008 - Request-bundling bypass for SSE sync documented as the single exception

## Source
- Finding: PATT-008 (see /report/03-patterns-concepts.md)
- Fix definition: /report/PATT-008-fix-definition.md

## Summary of Change
Documented the deliberate request-bundling bypass: `syncServerSentEventExpressions` in `src/ui/api/sse_api.ts` (renamed from `server_sent_events.ts` under NAME-002) now carries a comment stating that the PATCH intentionally does not use request bundling — the SSE expression filter must apply immediately and independently of the batching queue to keep the stream filter consistent with local subscription state. `src/ui/AGENTS.md`'s `api/` section records this as the single sanctioned exception to "request bundling is the normal path for mutating client requests". No code behavior changed.

## Files Changed
- `src/ui/api/sse_api.ts` — rationale comment at the bypassing fetch
- `src/ui/AGENTS.md` — api/ section gains the exception note

## Breaking Changes for Downstream Consumers
None — comments and folder documentation only.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- PATT-007 (missing API wrappers) — separate fix definition; this function's transport is explicitly excluded from bundling-related unification.
- VB-AI-001 (AGENTS.md contradictions) — unchecked.

## Resolved Questions
None.
