# Fix Definition: TS-005 — Duplicated types that can drift

## Source Finding
05-typescript-bun.md — `ConfigValueTypes` duplicated between `src/schema/ConfigSchema.ts:15-23` and generated `src/types/_ConfigType.ts` (acknowledged in `design/configuration.md:31,35`); session shape built inline at `Auth.ts:513-519` vs. `types/AuthType.ts`; `ConfigEntryUI` (`types/ConfigType.ts:27`) lacks `updatedAt` although the server stores it, forcing the `(as any)` casts of TS-001

## Human Directive
None — default interpretation applies.

## Target End State
- `ConfigValueTypes` exists once: the schema layer (`src/schema/ConfigSchema.ts`) imports/re-uses the single definition that the type layer generates (`src/types/_ConfigType.ts`, re-exported via `src/types/ConfigType.ts` — the module all services already import from), or the generation direction is inverted so the schema file is the source and the generated file derives from it. Either way, exactly one hand-maintained definition exists; the duplication is eliminated and `design/configuration.md`'s acknowledgment of the duplication (lines 31, 35) is updated to describe the single-source arrangement. Note: `_ConfigType.ts` is auto-generated — the fix must respect the generation pipeline (`src/types/AGENTS.md`: never edit `_`-files); the likely resolution is the schema file consuming the canonical constant, or the typegen script consuming the schema, whichever the generator supports.
- `ConfigEntryUI` in `src/types/ConfigType.ts` includes `updatedAt` (and any other server-stored fields the UI genuinely consumes), so the TS-001 casts at `AdminConfigList.tsx` become unnecessary.
- The session object assembled in `Auth.ts:513-519` is typed against the shared `Session` type from `src/types/AuthType.ts` with a compile-time guarantee (it is already annotated `const session: Session`; the fix verifies the annotation is complete and removes any residual structural divergence between the inline construction and the type — if the annotation already enforces it, this sub-item closes as verified with the duplication note removed from docs).

## Approach
Single-source each shape at its correct layer: types generated from Drizzle schema stay generated; hand-maintained constants referenced by schema move to one home; `ConfigEntryUI`'s `Pick<...>` gains `updatedAt`. The typegen script (`scripts/`) is adjusted if the generator currently emits the duplicated `ConfigValueTypes` — the duplication must not reappear on the next generation run.

## Affected Scope
- `src/schema/ConfigSchema.ts` and/or `scripts/` typegen + `src/types/_ConfigType.ts` (generated output, via the generator)
- `src/types/ConfigType.ts` — `ConfigEntryUI` Pick list
- `src/services/Auth.ts` — verification, possibly annotation tightening
- `design/configuration.md` — the acknowledgment paragraphs (lines 31, 35)
- `src/ui/pages/AdminConfigList.tsx` — casts removed (tracked in TS-001)

## Explicit Constraints
- The `_`-prefixed generated file is never hand-edited; changes flow through the generator or the schema.
- Adding `updatedAt` to `ConfigEntryUI` must match the server payload actually sent (verify the config API includes it; API-004 owns any contract drift discovered).
- No runtime behavior change.

## Out of Scope
- TS-001 (cast removal) — separate fix definition consuming the completed types.
- API-004 (client/server contract drift on optimistic locking) — separate fix definition.
- DOC-001 (configuration.md staleness generally) — unchecked; only the two duplication-acknowledgment lines are in scope here.

## Downstream Impact
Yes — `ConfigEntryUI` gains a field (additive, safe); the canonical home of `ConfigValueTypes` may change import paths for the schema layer; typegen output changes.
