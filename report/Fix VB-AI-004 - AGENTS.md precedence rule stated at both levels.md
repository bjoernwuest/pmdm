# Fix VB-AI-004 - AGENTS.md precedence rule stated at both levels; rule phrasing aligned

## Source
- Finding: VB-AI-004 (see /report/14-vibe-coding-guidance.md)
- Fix definition: /report/VB-AI-004-fix-definition.md

## Summary of Change
The precedence rule is now explicit and identical at both levels: root `AGENTS.md` states that sub-directory AGENTS.md files take precedence over parent AGENTS.md files (including the root file), and every folder AGENTS.md under `src/` now carries a one-line note that it is the authoritative layer doc for its folder and takes precedence over the root file — so contradictions are resolvable by rule. Rule restatements were aligned: the mutation-location family (root policy statement; `src/repo/`'s "Full Encapsulation" verified against post-ARCH-001 reality — the code now conforms, so the wording needed no change; `src/api/`'s boundary list updated to the current lock token `knownUpdatedAt`, which was also made accurate under API-004/DATA-002) and the PubSub family (root policy statement; `src/services/`'s operational detail, tightened under PATT-003/PATT-004). `design/pubsub.md`'s PubSub wording was checked for contradiction with the AGENTS.md files — none found beyond the terminology/endpoint corrections already made under NAME-004/DOC-005.

## Files Changed
- `AGENTS.md` (root) — precedence statement strengthened
- `src/api/AGENTS.md` — precedence note; lock-token wording updated
- `src/repo/AGENTS.md`, `src/services/AGENTS.md` — precedence notes
- `src/apps/AGENTS.md`, `src/autostart/AGENTS.md`, `src/login/AGENTS.md`, `src/migrations/AGENTS.md`, `src/schema/AGENTS.md`, `src/setup/AGENTS.md`, `src/types/AGENTS.md`, `src/ui/AGENTS.md`, `src/utils/AGENTS.md` — precedence notes added

## Breaking Changes for Downstream Consumers
None — documentation only.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- ARCH-001 (the code violation contradicting `src/repo/AGENTS.md`) — separate fix definition, implemented earlier; this fix verified the repo wording matches the corrected code.
- DOC-004/VB-AI-003 (filename accuracy) — separate fix definitions, implemented in the same change set.
- VB-AI-001/VB-AI-002 — unchecked.

## Resolved Questions
None.
