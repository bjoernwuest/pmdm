# Full-Codebase Review: Vibe-Coded Project

## Role & Context

You are performing a comprehensive, **read-only** review of this Bun software project that is developed and will continue to be developed via "vibe coding": a human reviews, but an AI writes all the code. Because of that workflow, the biggest long-term risk to this project isn't any single bug — it's **inconsistency and rising complexity that compound over successive AI-driven changes**. Weight your review accordingly: a pattern used three different ways across the codebase is often more damaging to this project's future than one isolated bug.

**Tech stack:** Bun, TypeScript, React, Drizzle ORM. Apply idioms and known pitfalls specific to this stack, not generic advice.

## Objective

Produce a findings report that a human can triage (via checkboxes) and that a future AI coding session can use as a precise, unambiguous work order for fixes — without you proposing any fixes yourself.

## Ground Rules

1. **Read-only.** Do not modify, refactor, reformat, or "fix" anything, even trivially. Do not run the app or execute tests to generate coverage numbers.
2. **Findings only — deviations, not commentary.** Report only what deviates from the rubric. Do not suggest fixes (a later task owns that). Do not note what's done well, idiomatic, clean, "clear," or "good practice" — praise and affirmation are out of scope and add noise a human has to read past. If a domain has no findings, the file consists of the rubric plus a single line: "No findings identified in this domain." Nothing more.
3. **Evidence-based.** Every finding must cite concrete file paths (and line numbers/ranges where applicable). No vague "some parts of the codebase..." claims — if you can't point to it, don't report it as a finding.
4. **Traceable.** Every finding gets a stable, unique ID (scheme below) so it can be referenced later without ambiguity.
5. **Calibrated.** Before listing findings, each domain file states the rubric you're evaluating against — what "good" looks like for *this* project, given its actual stack and apparent conventions (not an abstract ideal). This lets a human sanity-check your lens, and lets a future AI understand the standard to hold itself to. The rubric is a measuring stick, not a place to praise conformance.
6. **Out of scope:** business/product logic correctness, visual/UX design opinions, performance benchmarking (unless a concrete architectural complexity or security risk), anything not evidenced in the code or its immediate specs/docs/tests.

## Process

1. **Orient first.** Read `package.json`, `tsconfig.json`, and the full directory tree before writing anything. Build a mental model of the intended architecture.
2. **Track your work.** Maintain a running todo list across the domains below so progress survives long sessions.
3. **Go domain by domain.** For each domain: state the rubric, then investigate, then write that domain's report file to disk before moving to the next — don't hold everything until the end.
4. **Cross-reference.** If a finding in one domain is a root cause or symptom of a finding in another (e.g., a naming inconsistency driving a complexity finding), note the related ID(s) in both.
5. **Finish with the overview and checklist**, once all domain files exist, so the aggregation is accurate.

## Review Domains

Create one file per domain in `/report/`.

| # | File | ID prefix | Domain | What to check |
|---|------|-----------|--------|----------------|
| 1 | `01-architecture-structure.md` | `ARCH` | Architecture & Directory Structure | Directory/file layout logic, module boundaries, layering, circular or unclear dependencies, whether structure matches the apparent intent of the app |
| 2 | `02-naming-consistency.md` | `NAME` | Naming & Terminology Consistency | Casing conventions, terminology drift (same concept named differently in different places), file/symbol naming vs. content, abbreviation consistency |
| 3 | `03-patterns-concepts.md` | `PATT` | Design Patterns & Cross-Cutting Concepts | Consistent use (or inconsistent reinvention) of things like pubsub, request bundling/batching, separation of concerns, dependency injection, error propagation strategy |
| 4 | `04-complexity-maintainability.md` | `CPLX` | Complexity & Maintainability Drivers | Deep nesting, oversized files/functions, duplicated logic, tight coupling, "clever" code that obscures intent, hidden global state |
| 5 | `05-typescript-bun.md` | `TS` | TypeScript & Bun Practices | `strict` mode usage, `any`/unsafe casts, type duplication vs. inference, Bun-specific APIs used correctly vs. Node-isms carried over unnecessarily, script/build config, proper TypeScript language feature utilization |
| 6 | `06-react-frontend.md` | `RCT` | React & Frontend Practices | Component structure, state management consistency (local vs. context vs. external store), hook usage/rules-of-hooks violations, prop drilling, render-performance anti-patterns tied to correctness (not raw perf tuning) |
| 7 | `07-data-drizzle.md` | `DATA` | Drizzle ORM & Data Layer | Schema design, indexing, query patterns (N+1, missing transactions), type-safety between schema and app code |
| 8 | `08-security.md` | `SEC` | Security | AuthN/AuthZ, input validation boundaries, secrets handling, injection risks, unsafe deserialization, dependency-introduced exposure, CORS/config exposure |
| 9 | `09-api-interfaces.md` | `API` | API & Interface Contracts | Boundary validation, error-shape consistency, versioning/backwards-compat posture, contract drift between client and server types, OpenAPI documentation and human-understandability |
| 10 | `10-testing.md` | `TEST` | Testing & Coverage Gaps | What's tested vs. not, test quality (are they asserting behavior or just running code), missing edge-case tests, test structure consistency |
| 11 | `11-config-deps.md` | `CFG` | Configuration, Environment, Secrets & Dependencies | Env var handling, config duplication/drift across environments, outdated or risky dependencies, lockfile hygiene |
| 12 | `12-docs-style.md` | `DOC` | Documentation & Coding Style | Comment quality/staleness, README/architecture docs accuracy, formatting/lint consistency, dead code and TODO/FIXME inventory |
| 13 | `13-incomplete-specs-edge-cases.md` | `SPEC` | Incomplete/Inconsistent Specs & Edge Cases | Contradictions between code and docs/comments, half-implemented features, unhandled edge cases (empty states, concurrency, failure paths) implied but not covered |
| 14 | `14-vibe-coding-guidance.md` | `VB-AI` | AI-Guidance Instructions (AGENTS.md and equivalents) | Clarity, actionability, and internal consistency of any AI-facing instruction files; contradictions between them; redundant or diluted instructions repeated across nested files; precedence conflicts when multiple such files apply to the same directory; staleness against actual code |

## Finding Format (used inside every domain file)

Each domain file opens with:
```
## Rubric
[2-5 sentences: what "good" looks like for this project in this domain, given its actual stack and apparent intent]
```

Then each finding:
```
### [PREFIX-NNN] Short descriptive title
- **Location(s):** path/to/file.ts:L120-134
- **Description:** What was observed, factually.
- **Why it matters:** Concrete impact — on correctness, security, or on future AI-driven changes specifically.
- **Related findings:** [other IDs, if any]
```

## `00-overview.md`

Written last. Contains:
- One-paragraph factual description of the codebase as understood (no evaluative language)
- Methodology note (what was and wasn't examined)
- A table: findings count per domain

## `checklist.md`

A single file, all findings, grouped by domain and ID, each as a checkbox the human can mark.

## Final Deliverable Checklist (for you)

Before finishing, confirm:
- [ ] All 14 domain files exist in `/report/`, each with a rubric and evidenced, ID'd findings (or the single "No findings identified in this domain." line)
- [ ] No file contains a suggested fix, remediation, or praise/affirmation of existing code
- [ ] `00-overview.md` accurately aggregates counts per domain
- [ ] `checklist.md` includes every finding ID, grouped by domain, cross-linked to its domain file
