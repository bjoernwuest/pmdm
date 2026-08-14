# Fix Definition: VB-AI-004 — Rule redundancy and dilution across nested AGENTS.md files without precedence resolution

## Source Finding
14-vibe-coding-guidance.md — the mutation-location rule appears in root AGENTS.md, `src/api/AGENTS.md`, and `src/repo/AGENTS.md` with different phrasing; PubSub rules appear in root, `src/services/AGENTS.md`, and design docs with slight wording differences; `src/repo/AGENTS.md`'s "Full Encapsulation" header is contradicted by the ARCH-001 precedent in `src/api/FunctionalPermissionAPI.ts`; root AGENTS.md gives only a one-line precedence note

## Human Directive
"VB-AI-004 — Rule redundancy and dilution across nested AGENTS.md files without precedence resolution - sub-directory AGENTS.md take precedence over "parent" AGENTS.md"

## Human Directive (verbatim, binding)
"sub-directory AGENTS.md take precedence over "parent" AGENTS.md"

## Target End State
- The precedence rule is stated explicitly and identically at both levels: root `AGENTS.md` states that folder-local AGENTS.md files take precedence over it, and each folder AGENTS.md (at minimum those that restate root rules: `src/api/`, `src/repo/`, `src/services/`) carries a one-line note that it is the authoritative layer doc and takes precedence over the root file. Contradictions are thus resolvable by rule, not by guessing.
- Rule restatements are de-duplicated by reference: where a folder file restates a root rule with different phrasing (mutation-location rule, PubSub rules), the folder file keeps its layer-specific *operational* detail and the root file keeps the *policy statement*; wording that merely paraphrases the same rule across levels is aligned so the statements cannot drift (short canonical sentence at root; folder files either quote it verbatim or explicitly extend it with layer detail marked as such).
- The ARCH-001 contradiction (`src/repo/AGENTS.md`'s "Full Encapsulation" vs. the route's direct query) disappears with ARCH-001's fix (code corrected); this fix verifies the repo AGENTS.md wording matches the post-ARCH-001 reality and does not itself change code.

## Approach
Documentation edits only: add/align the precedence sentence in root AGENTS.md and folder files; audit the two named rule families (mutation location, PubSub) across root AGENTS.md, `src/api/AGENTS.md`, `src/repo/AGENTS.md`, `src/services/AGENTS.md`, and `design/pubsub.md`, and align phrasing so each rule has one canonical statement plus clearly-marked layer-specific extensions. Keep edits minimal — this is a coherence pass, not a rewrite of the guidance corpus.

## Affected Scope
- Root `AGENTS.md` — precedence statement (strengthened from the one-line note)
- `src/api/AGENTS.md`, `src/repo/AGENTS.md`, `src/services/AGENTS.md` — precedence note + rule-phrasing alignment
- `design/pubsub.md` — only where its PubSub rule wording contradicts AGENTS.md files (alignment, not restructure; DOC-002 framing issues are unchecked)
- Other folder AGENTS.md files — add the precedence line where missing (sweep)

## Explicit Constraints
- Documentation-only, no behavior change.
- The binding precedence order is exactly the human's: sub-directory AGENTS.md take precedence over parent AGENTS.md.
- Root AGENTS.md remains the repo-wide policy source; folder files refine it — the edit must not invert this into "folders are independent".
- No rule's substantive content changes (e.g. the repo-layer encapsulation rule itself is not weakened; ARCH-001's code fix restores its truth).

## Out of Scope
- ARCH-001 (the code violation contradicting `src/repo/AGENTS.md`) — separate fix definition.
- DOC-004/VB-AI-003 (filename accuracy) — separate fix definitions.
- VB-AI-001/VB-AI-002 — unchecked.

## Downstream Impact
No — documentation only.
