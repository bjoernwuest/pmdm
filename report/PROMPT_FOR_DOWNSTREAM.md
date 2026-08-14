# Downstream Adaptation: Sync With Upstream Fixes

## Role & Context
This project consumes an upstream project that is developed via "vibe coding" and maintains its own fix cycle. That upstream project's `/report` directory — domain findings, fix-definition files, and implemented-fix documentation (`Fix <ID> - ...md`) — has been made available to you as read-only reference material. This prompt runs entirely inside this downstream project: your job is to determine which of the upstream's already-implemented, documented breaking changes actually affect this codebase, plan the adaptation, then implement and document it here.

## Inputs
- **Upstream report path:** `<UPSTREAM_REPORT_PATH>` — replace with the actual location before running (e.g. a path where the upstream `/report` directory has been copied or mounted into this project). If this isn't set or the path doesn't resolve, ask the human for it before doing anything else.
- **Project name:** `<PROJECT_NAME>` — this project's own identifying name, used as the output subdirectory below. If it isn't set, ask the human for it before writing any files.
- Within the upstream path, the authoritative source for your work is every `Fix <ID> - ...md` file — specifically each one's **"Breaking Changes for Downstream Consumers"** section. Use the corresponding `<ID>-fix-definition.md` and domain finding file (`NN-<domain>.md`) only for extra context if a Fix doc's breaking-change description isn't enough to act on.
- This project's own `/report/<PROJECT_NAME>/` directory (create it if it doesn't exist) — where you write everything you produce. Keep it distinct from the upstream report path; never write into the upstream directory.

## Objective
For every upstream `Fix <ID> - ...md` — regardless of what upstream itself concluded about downstream impact — determine whether this project is actually affected, and if so, adapt this codebase to match. Upstream's own "Breaking Changes for Downstream Consumers" assessment reflects only what upstream knows about its own consumers; it is not a reliable filter for what *this* project depends on, so every implemented fix gets evaluated here, not just the ones upstream flagged.

## Ground Rules
1. **Nothing gets executed.** No installs, builds, dev server, migrations, typegen/codegen, tests, linter autofixes, or git operations (commit/push/etc.). Reading, searching, and editing files is fine and expected — that's investigation, not execution. Anywhere a real fix would normally require running a command, write it into "Required Manual Follow-Up" instead and stop there.
2. **Every implemented fix is in scope.** The entry gate is the existence of a `Fix <ID> - ...md` file — not its "Breaking Changes for Downstream Consumers" field. Do not use that field to exclude an ID from evaluation; treat it as one input to your own applicability assessment, not a filter. Upstream cannot see this project's dependencies, so its "None" is evidence, not proof.
3. **Evaluate every implemented ID, even if the answer is "not affected."** Write the plan file regardless of outcome, so there's a complete audit trail proving every upstream fix was actually checked against this codebase — not silently skipped because it looked irrelevant, or because upstream didn't flag it.
4. **Plan before implementing.** For an affected ID, the plan file must exist and describe the target end state and approach before you touch any code.
5. **Ask, don't assume.** Use Kilo Code's `ask_followup_question` tool — one specific question at a time, with 2-4 suggested answers where concrete options exist — when: the upstream path isn't resolvable, whether this project is actually affected is genuinely unclear from a search, or there's more than one materially different way to adapt. Wait for the answer before proceeding; never stack unresolved questions.
6. **Strictly scoped.** Only touch what a given ID's plan describes. Don't opportunistically fix unrelated things you notice while searching or editing.
7. **Idempotent.** If `/report/<PROJECT_NAME>/<ID>-downstream-plan.md` already concludes "not affected," or `/report/<PROJECT_NAME>/Downstream Fix <ID> - ...md` already exists, skip that ID unless told to redo it.
8. **Write-as-you-go.** Finish evaluating, planning, implementing, and documenting one ID completely before starting the next.
9. **No praise, no editorializing.** Plans and docs are factual and directive, not narrative.

## Process
1. Confirm the upstream report path resolves; list every `Fix <ID> - ...md` in it. Do not filter by the breaking-changes field — every implemented fix gets evaluated, on the assumption that upstream's own assessment may be incomplete from this project's vantage point.
2. For each remaining ID, in the order encountered:
   a. Search this codebase for usage of what changed (the renamed/removed export, type, endpoint, env var, response shape, etc. — as described in the upstream doc).
   b. Write `/report/<PROJECT_NAME>/<ID>-downstream-plan.md` (format below) with your evaluation and, if affected, your plan.
   c. If affected: implement exactly what the plan describes.
   d. If the upstream change touches something this project also generates from (e.g. a shared DB schema this project also runs typegen or migrations against), flag that as a Required Manual Follow-Up here too — do not run it yourself.
   e. Write `/report/<PROJECT_NAME>/Downstream Fix <ID> - ...md` (format below) immediately after implementing.
3. Once every gated ID has a plan file, write `/report/<PROJECT_NAME>/00-downstream-impact-summary.md`.

## Plan File Format
File: `/report/<PROJECT_NAME>/<ID>-downstream-plan.md`

```
# Downstream Plan: <ID> — <short title, from the upstream fix doc>

## Upstream Change
<condensed, factual restatement of what the fix actually changed, with a reference to the upstream Fix doc>

## Upstream's Own Assessment
<verbatim or condensed quote of the upstream "Breaking Changes for Downstream Consumers" field — recorded for context only, not as a determination of applicability here>

## Applicability to This Project
Affected: Yes / No
<evidence — what was searched, what was found or not found, file:line references where relevant>

## Target End State
<only if affected>

## Approach
<only if affected — decision-level, not code>

## Affected Scope
<only if affected — files/modules in this project expected to change>

## Anticipated Manual Follow-Up
<only if affected — e.g. "this project regenerates its API client from the upstream OpenAPI spec; a typegen run will be needed here after this change merges." Or omit.>

## Open Questions
<Q&A log if asked; omit otherwise>
```

## Downstream Fix Documentation Format
File: `/report/<PROJECT_NAME>/Downstream Fix <ID> - <short factual description>.md` (written only for IDs where Affected: Yes)

```
# Downstream Fix <ID> - <short factual description>

## Source
- Upstream fix: <reference to the upstream Fix doc>
- Downstream plan: /report/<PROJECT_NAME>/<ID>-downstream-plan.md

## Summary of Change
<factual, past tense>

## Files Changed
- path — what changed

## Required Manual Follow-Up
<migrations/typegen/other commands the human must run in this project, or "None.">

## Verification Notes
<what was checked by reading/searching since nothing was executed — e.g. "confirmed via project-wide search that no other call site references the old export name">
```

## Summary File Format
File: `/report/<PROJECT_NAME>/00-downstream-impact-summary.md`, written last:

```
# Downstream Impact Summary

## Evaluated
| Upstream ID | Breaking Change | Affected Here | Status |
|---|---|---|---|
| ARCH-001 | <one line> | Yes/No | Adapted / Not applicable / Pending question |

## Divergences from Upstream Assessment
<every ID where upstream's own field said "None" but this project's evaluation concluded "Affected: Yes" — these are exactly the cases this process exists to catch, since upstream could not have seen them. Or "None.">

## Consolidated Manual Follow-Up
<every distinct action the human needs to run in this project across all adapted IDs, de-duplicated — migrations, typegen, etc. Or "None.">
```

## Final Checklist (for you)
- [ ] Every upstream `Fix <ID> - ...md` file has a plan file here — including ones where upstream's own field said "None"
- [ ] No ID was skipped solely because upstream's breaking-changes field said "None"
- [ ] No plan file was skipped because the answer looked like "no"
- [ ] Every "Affected: Yes" ID has a corresponding `Downstream Fix <ID> - ...` doc
- [ ] Nothing was installed, built, migrated, generated, tested, or committed
- [ ] `00-downstream-impact-summary.md` accounts for every evaluated ID and consolidates all follow-up actions the human must run
