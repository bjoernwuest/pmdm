# Fix Definition: VB-AI-003 — Folder AGENTS.md canonical file examples do not exist

## Source Finding
14-vibe-coding-guidance.md — `src/api/AGENTS.md` cites `@/services/AuthType.ts`, `@/services/ConfigSchema.ts`, `@/types/ApiKeySchema.ts`, `@/types/Database.ts`, `@/services/ServerSentEventsType.ts`; `src/ui/AGENTS.md` lists `AuditLogAPI.ts` and `ConfigSchema.ts` as the api/ folder's canonical files (actual: `AuditLog.ts`, `Config.ts`)

## Human Directive
None — default interpretation applies.

## Target End State
Every canonical example file cited in folder AGENTS.md guidance resolves to a real, existing file that an AI session can open and imitate. The concrete corrections are shared with DOC-004 (same locations, same edits — DOC-004 owns the edit execution; see the boundary note). Beyond the enumerated citations, the fix includes a verification sweep of *all* `src/**/AGENTS.md` files confirming that every `@/...` import path and backticked filename mentioned actually exists in the tree at implementation time (post-fix-set state), so the defect class is closed, not just the enumerated instances.

## Approach
DOC-004 and this finding describe the same wrong references from two angles (docs staleness vs. AI-guidance integrity). To avoid conflicting double edits: **DOC-004's fix definition owns the textual corrections**; VB-AI-003's acceptance criterion is the sweep — after DOC-004 (and filename-changing fixes like CPLX-001/PATT-007, if implemented) land, every cited path in every folder AGENTS.md resolves. If the sweep finds additional nonexistent examples beyond DOC-004's list, they are corrected under this ID using the same style (replace with the real file, no rule-wording changes).

## Affected Scope
- `src/api/AGENTS.md`, `src/ui/AGENTS.md` — via DOC-004
- Any other `src/**/AGENTS.md` failing the existence sweep — corrected here

## Explicit Constraints
- Documentation-only, no behavior change.
- Corrections cite the *current* tree at implementation time (post-fix state), not this report's snapshot.
- No guidance-content rewording beyond making references resolve (rule precedence/rewording is VB-AI-004's scope).

## Out of Scope
- DOC-004 (owns the enumerated filename corrections) — separate fix definition; this ID owns the class-closing sweep and acceptance.
- VB-AI-001 (rules contradicted by code) and VB-AI-002 (tests/AGENTS.md) — unchecked.
- VB-AI-004 (rule redundancy/precedence) — separate fix definition.

## Downstream Impact
No — documentation only.
