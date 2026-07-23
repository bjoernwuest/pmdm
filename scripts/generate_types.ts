#!/usr/bin/env bun
/**
 * scripts/generator.ts
 *
 * Generates browser-safe TypeScript/TypeBox files from the Drizzle schema
 * files in `src/schema/`. Run with:
 *
 *   bun run scripts/generator.ts
 *
 * (Bun executes `.ts` natively — no ts-node/tsx involved, including for the
 * dynamic `import()` of each compiled schema file in Step 2.)
 *
 * For every `src/schema/<Name>Schema.ts` this produces two files in `src/types/`:
 *   - `_<Name>Type.ts` — always regenerated. Never hand-edit this file.
 *   - `<Name>Type.ts`  — scaffolded once (`export * from './_<Name>Type'`)
 *                        and never touched again; safe to extend by hand.
 *
 * The `Schema` suffix is stripped when deriving the output name, so
 * `UserSchema.ts` → `_UserType.ts` / `UserType.ts`.
 *
 * The three-phase pipeline (see the linked modules for the detailed design
 * notes on each):
 *   1. `step1-static-copy.ts`             — ts-morph + type checker: copy
 *      plain TS/TypeBox declarations as-is, skip anything drizzle-derived.
 *   2. `step2-drizzle-introspection.ts`   — dynamic import + runtime column
 *      metadata: regenerate Select/Insert/Enum TypeBox schemas for every
 *      pg table/view/enum.
 *   3. `step3-assemble.ts`                — combine, write, scaffold, and
 *      do a final safety-net scan for any stray `drizzle-orm` import.
 *
 * NOTE: `src/types/` is intentionally kept separate from the existing
 * `src/types/` + `scripts/generatetypes.ts` pair, which are left completely
 * untouched by this script. This lets the new generator be reviewed on its
 * own before anything is migrated over by hand.
 *
 * POSTGRES ONLY: only pgTable/pgView/pgEnum/pgSchema from 'drizzle-orm/pg-core'
 * are treated as drizzle definitions. Any mysql-core/sqlite-core/
 * singlestore-core/gel-core (or other non-pg-core) construct found anywhere
 * in a schema file makes this script throw immediately and stop.
 */
import { Project } from "ts-morph";
import { getSchemaEntryFiles, topologicalSortByImports } from "./generate_types/discovery";
import { SCHEMA_GLOB, TSCONFIG_PATH, schemaFileToOutputName } from "./generate_types/paths";
import { analyzeSchemaFile } from "./generate_types/step1-static-copy";
import { introspectSchemaModule } from "./generate_types/step2-drizzle-introspection";
import { validateNoDrizzleImports, writeGeneratedFilePair } from "./generate_types/step3-assemble";

async function main(): Promise<void> {
    // Load the REAL tsconfig so drizzle-orm's conditional package "exports"
    // resolve exactly like they do in the real build (moduleResolution:
    // "bundler", the `@/*` path alias, etc.) — required for Step 1's
    // type-checker-based classification to correctly resolve symbols.
    const project = new Project({ tsConfigFilePath: TSCONFIG_PATH, skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths(SCHEMA_GLOB);

    const entryFiles = getSchemaEntryFiles(project);
    if (entryFiles.length === 0) {
        console.warn(`⚠️  No *Schema.ts files found — nothing to generate. Rename your schema files to end with "Schema.ts" (e.g. UserSchema.ts).`);
        return;
    }

    const orderedFiles = topologicalSortByImports(entryFiles);
    const keptExportsByFile = new Map<string, Set<string>>();
    const generatedNames: string[] = [];

    for (const sourceFile of orderedFiles) {
        const name = schemaFileToOutputName(sourceFile.getBaseNameWithoutExtension());
        console.log(`\n🔎 ${sourceFile.getBaseName()} → _${name}Type.ts / ${name}Type.ts`);

        // STEP 1 — static, type-checker-driven copy of non-drizzle declarations.
        const staticResult = analyzeSchemaFile(sourceFile, keptExportsByFile);
        keptExportsByFile.set(sourceFile.getFilePath(), staticResult.keptExportedNames);

        // STEP 2 — dynamic import + runtime column introspection for tables/views/enums.
        const generatedBlocks = await introspectSchemaModule(sourceFile.getFilePath());
        const generatedSchemasText = generatedBlocks.map(block => block.text).join("\n\n");

        // STEP 3 — assemble + write.
        await writeGeneratedFilePair({
            name,
            keptImportsText: staticResult.importsText,
            keptBodyText: staticResult.bodyText,
            generatedSchemasText,
        });
        generatedNames.push(name);
    }

    validateNoDrizzleImports(generatedNames);
    console.log(`\n✨ Generated ${generatedNames.length} file pair(s) in src/types/`);
}

main().catch(error => {
    console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});

