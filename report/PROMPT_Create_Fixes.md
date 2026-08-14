# Fix Definitions: Vibe-Coded Project (Planning Only)

## Role & Context
This project is developed via "vibe coding": a human reviews, an AI writes the code. A prior review pass produced `/report/checklist.md` and domain finding files (`/report/01-...md` – `/report/14-...md`). The human has since checked off the findings they want addressed and, in many cases, annotated individual items or whole domain sections with directives that narrow, redirect, or exclude the default resolution. This is a **specification** step, not an implementation step: you are defining exactly what "fixed" means for each selected finding, precisely enough that a separate implementation session needs no further judgment calls.

## Objective
For every finding marked `[x]` in `/report/checklist.md`, produce exactly one fix-definition file in `/report/`. Write **no** code, migrations, type files, or documentation edits outside these new files.

## Inputs
- `/report/checklist.md` — authoritative scope and all human directives
- `/report/01-...md` through `/report/14-...md` — full detail per finding (Location(s), Description, Why it matters, Related findings)
- The live source tree, to confirm cited locations still hold before you specify a fix against them

## Ground Rules
1. **Planning only.** Do not edit, create, or run anything in the source tree. Do not run installs, builds, migrations, typegen, or tests. The only writes you make are the fix-definition files below.
2. **Scope = checked items only.** Never define a fix for an item marked `[ ]`, no matter how obvious its resolution seems. If an item's checkbox state and its annotation contradict each other (e.g., checked but annotated `NEVER`, or annotated as clearly deferred), stop and ask the human before doing anything with that ID.
3. **Human annotations are binding, not advisory.** Any text attached to a checklist line or a domain-section heading is a hard constraint on the resulting fix definition, quoted verbatim into it — not background color.
    - *Item-level example:* `SEC-009 ... - include upsert but exclude login/logout events` → the fix definition's scope must say exactly that; the fix must not add logging for login/logout.
    - *Domain-level example:* the note beside the "Drizzle ORM & Data Layer" heading (`[Never run the drizzle-migration - it will be run by the human after code change]`) applies to every `DATA-*` item below it, even where the item itself repeats nothing.
    - Some annotations redefine the deliverable entirely — e.g. `PATT-008 ... => document the deviation, it is on purpose...` means the "fix" is a documentation addition confirming intended behavior, not a code change. Reflect that.
4. **Ask, don't assume.** When a checked item's resolution has more than one materially different valid approach, an unclear boundary, or a contradiction as in rule 2, use Kilo Code's `ask_followup_question` tool. Ask one specific question at a time; where a small number of concrete resolutions exist, offer them as 2-4 suggested answers rather than leaving it open-ended. Wait for the answer before writing that file. Never stack multiple unresolved questions into a single turn.
5. **Idempotent.** If `/report/<ID>-fix-definition.md` already exists, skip that ID unless told to redo it.
6. **One file per ID.** Even where "Related findings" points at a shared root cause, keep files separate and cross-reference by ID — do not merge.
7. **No code.** Describe the target end state and the chosen approach at a decision level (which existing pattern becomes canonical, what gets removed) — never code, diffs, or pseudocode.
8. **No praise, no hedging.** State the target state and constraints plainly.

## Process
1. Parse `checklist.md` in full first. Build your in-scope ID list, capturing every item- and domain-level annotation verbatim as you go.
2. For each in-scope ID: read its full entry in the domain file; re-check its cited location(s) against the live source and note any drift.
3. Resolve ambiguity per rule 4 before writing.
4. Write the fix-definition file, then move to the next ID — don't batch research for all IDs before writing any file.
5. Keep a running todo list across all in-scope IDs so a long session survives interruption.

## Fix Definition File Format
File: `/report/<ID>-fix-definition.md`

```
# Fix Definition: <ID> — <short title>

## Source Finding
<domain file> — <verbatim Location(s) from the finding>

## Human Directive
<verbatim quote of the checklist annotation for this item and/or its domain, or "None — default interpretation applies.">

## Target End State
<what must be true afterward, as an end state, not a procedure>

## Approach
<the chosen approach at decision level — not code>

## Affected Scope
<files/modules currently expected to change>

## Explicit Constraints
<hard constraints, including any carried domain-level note; state "Documentation-only, no behavior change" here if that's what the directive means>

## Out of Scope
<related-but-excluded items, to prevent scope creep at implementation time>

## Downstream Impact
Yes/No — will this require adjustment in downstream consumers (renamed exports/types/files, changed API shape, changed env vars)? One line if yes; details belong to the implementation phase.

## Resolved Questions
<Q&A log if you asked something for this ID; omit the section otherwise>
```

## Final Checklist (for you)
- [ ] Every `[x]` item has exactly one fix-definition file; no `[ ]` item does
- [ ] Every item- and domain-level annotation is quoted verbatim somewhere in its file(s)
- [ ] No code, diff, or pseudocode appears anywhere
- [ ] No existing report file was modified or overwritten without explicit instruction
