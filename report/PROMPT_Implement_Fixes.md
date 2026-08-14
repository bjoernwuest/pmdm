# Fix Implementation: Vibe-Coded Project

## Role & Context
This project is developed via "vibe coding": a human reviews, an AI writes the code. Fix-definition files in `/report/` (`<ID>-fix-definition.md`) specify exactly what to build for each selected finding. Your job is to implement each one and document it — this project has downstream consumers, so the documentation you produce is often the only signal those projects get that something changed underneath them.

## Objective
For every `/report/<ID>-fix-definition.md` that does not yet have a corresponding `/report/Fix <ID> - ....md`, implement exactly what the definition specifies, then write that documentation file before moving to the next.

## Ground Rules
1. **The fix definition is authoritative.** If live code contradicts its assumptions, or the specified approach turns out to be infeasible or underspecified for a case you hit, stop and ask — via Kilo Code's `ask_followup_question` tool, one specific question at a time, with 2-4 suggested answers where concrete options exist — rather than improvising past it. Record the resolution in the implementation doc's "Resolved Questions" section; do not edit the original fix-definition file.
2. **Strictly scoped.** Touch only what the definition's "Affected Scope" and "Approach" describe. Noticing something unrelated is not license to fix it — leave it, and only mention it in the doc if it's directly relevant to explaining your change.
3. **Never execute:** migration runners (Umzug or otherwise), typegen/codegen scripts (schema-to-type generators, OpenAPI generators, `drizzle-kit generate`/`migrate`, etc.), or the test suite, in any form — check `package.json` scripts and avoid anything matching `migrate`, `typegen`, `codegen`, `test`, `e2e`, or the equivalent underlying CLI called directly. You may still *author* a migration file or hand-edit a generated-type file as part of a fix; you must not run the commands that would generate or apply them. Record what the human still needs to run in the doc's "Required Manual Follow-Up."
    - *Example:* a `DATA-*` fix that adds an index — author the migration file per the project's convention, but the doc's follow-up section must say the human needs to apply it, per the source finding's domain note.
4. **Type-check every fix (read-only, required).** After implementing each fix and before writing its doc, run `bunx tsc --noEmit` and resolve any type error the fix introduced. Typechecking is not in the forbidden set of rule 3 (it neither generates nor applies anything); a fix that leaves `tsc` errors silently breaks downstream consumers who compile the template, as happened when the ARCH-003 fix typed the `FP_*` constants as `FunctionalPermissionInsertType` (23 errors in `src/api/*`; see the "Post-Fix Correction" in `Fix ARCH-003 - ....md`).
5. **Don't touch other report files.** `checklist.md`, the domain finding files, and the fix-definition files themselves are read-only inputs. The only writes are code changes within the defined scope and the new `Fix <ID> - ...` doc.
6. **Idempotent.** If `/report/Fix <ID> - ...md` already exists, skip that ID unless told to redo it.
7. **Write-as-you-go.** Implement and document one fix at a time; write its doc immediately after implementing, before starting the next, so an interrupted session never leaves an implemented-but-undocumented fix.
8. **No praise, no editorializing.** The doc is a factual, past-tense record of what changed — not an assessment of the old or new code's quality.

## Process
1. List every fix-definition file lacking a corresponding `Fix <ID> - ...` doc. Sequence them: where "Related findings" or "Downstream Impact" implies one fix is a prerequisite for another (e.g., a shared module a later fix will depend on), do the prerequisite first. Note your chosen order in your own working notes — not a deliverable.
2. For each ID in that order: re-read its fix-definition file, confirm the live source still matches its assumptions, implement exactly what's specified.
3. Write the documentation file (format below), then continue.

## Documentation File Format
File: `/report/Fix <ID> - <short factual description>.md`

```
# Fix <ID> - <short factual description>

## Source
- Finding: <ID> (see /report/<domain-file>.md)
- Fix definition: /report/<ID>-fix-definition.md

## Summary of Change
<factual, past-tense description of what changed and why, one short paragraph>

## Files Changed
- path/to/file.ts — <one line: what changed>

## Breaking Changes for Downstream Consumers
<"None." if genuinely none; otherwise an explicit old → new list — renamed exports/types/files, changed function signatures, changed request/response shapes, changed env var names/defaults/behavior, removed endpoints. Write for a reader who has not seen the diff.>

## Required Manual Follow-Up
<commands/actions the human must run since this session couldn't: apply a migration, run typegen, run tests, etc. Or "None.">

## Out of Scope Notes
<anything adjacent but deliberately not touched, restated from the fix definition for a downstream reader>

## Resolved Questions
<Q&A log if you asked something during implementation; omit otherwise>
```

## Final Checklist (for you)
- [ ] Every fix-definition file without an existing doc has now been implemented and documented
- [ ] No migration, typegen/codegen, or test command was executed
- [ ] `bunx tsc --noEmit` passes with no type errors introduced by any fix
- [ ] Every breaking change is itemized with an explicit old → new mapping, or the section states "None."
- [ ] Every required manual follow-up action is listed explicitly, or the section states "None."
- [ ] Nothing outside each fix definition's declared scope was modified
- [ ] `checklist.md`, domain finding files, and fix-definition files remain unmodified
