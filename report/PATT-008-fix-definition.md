# Fix Definition: PATT-008 — Request bundling bypassed for one mutation class

## Source Finding
03-patterns-concepts.md — `src/ui/api/server_sent_events.ts:34-39` issues a PATCH via raw `fetch`, while `src/ui/api/_client.ts` routes POST/PUT/PATCH/DELETE through `_request_bundling.ts`

## Human Directive
"=> document the deviation, it is on purpose that mutation in src/ui/api/server_sent_events.ts:34-39 does not use request bundling."

## Target End State
The deliberate bypass is documented where a reader will encounter it: a comment at `src/ui/api/server_sent_events.ts:34-39` (the `syncServerSentEventExpressions` fetch) states that this mutation intentionally does not use request bundling and why (the SSE expression sync must apply immediately and independently of the batching queue to keep the stream filter consistent with local subscription state), and the `src/ui/AGENTS.md` guidance for the `api/` folder (or the request-bundling note in root AGENTS.md's vicinity, i.e. the folder doc) names this call as the single sanctioned exception to "request bundling is the normal path for mutating client requests". No code behavior changes.

## Approach
Documentation-only: add the rationale comment at the call site and record the exception in `src/ui/AGENTS.md` (api/ section) so the rule and the deviation are co-located in the guidance AI agents read.

## Affected Scope
- `src/ui/api/server_sent_events.ts` — comment only
- `src/ui/AGENTS.md` — exception note only

## Explicit Constraints
- Documentation-only, no behavior change.
- The exception is singular: documentation must state this is the only mutation permitted to bypass bundling, not establish a general opt-out.
- Do not route the SSE PATCH through bundling "for consistency" — the directive forbids it.

## Out of Scope
- PATT-007 (missing API wrappers) — separate fix definition; this function's transport is explicitly excluded from bundling-related unification.
- VB-AI-001 (AGENTS.md contradictions) — unchecked.

## Downstream Impact
No — comments and folder documentation only.
