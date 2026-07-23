import fs from "node:fs";
import path from "node:path";
import { OUTPUT_DIR } from "./paths";
import { formatIfConfigured } from "./prettier-format";

/**
 * STEP 3 — Assemble & validate.
 *
 * Combines Step 1's statically-copied declarations with Step 2's
 * runtime-introspected TypeBox schemas into one `_<name>Type.ts` file per
 * schema, scaffolds the accompanying hand-editable `<name>Type.ts` exactly
 * once, and (after everything has been written) re-scans every generated
 * file to make sure no `drizzle-orm` import slipped through.
 */

export interface FileGenerationInput {
    /** e.g. "ApiKey" — the schema file's base name, without extension. */
    name: string;
    /** Import statements text needed by the kept (Step 1) declarations. */
    keptImportsText: string;
    /** Kept plain/typebox declarations' source text (Step 1). */
    keptBodyText: string;
    /** Generated Select/Insert/Enum schema text (Step 2). */
    generatedSchemasText: string;
}

const GENERATED_HEADER = "// AUTO-GENERATED — DO NOT EDIT";
const TYPEBOX_IMPORT = `import { Type, type Static } from '@sinclair/typebox';`;
const NULLABLE_IMPORT = `import { Nullable } from './helpers.ts';`;

/** Builds the full `_<name>Type.ts` source text for one schema file. */
function buildGeneratedFileText(input: FileGenerationInput): string {
    const combinedBody = [input.keptBodyText, input.generatedSchemasText].filter(text => text.trim().length > 0).join("\n\n");
    const needsTypebox = /\bType\.\w|\bStatic</.test(combinedBody);
    const needsNullable = /\bNullable\(/.test(combinedBody);
    const alreadyImportsTypebox = /@sinclair\/typebox/.test(input.keptImportsText);
    const alreadyImportsNullable = /from\s+['"][^'"]*helpers(?:\.ts)?['"]/.test(input.keptImportsText);

    const importLines = [
        input.keptImportsText.trim(),
        needsTypebox && !alreadyImportsTypebox ? TYPEBOX_IMPORT : "",
        needsNullable && !alreadyImportsNullable ? NULLABLE_IMPORT : "",
    ]
        .filter(text => text.length > 0)
        .join("\n");

    const sections = [importLines, combinedBody].filter(text => text.trim().length > 0);
    return `${GENERATED_HEADER}\n\n${sections.join("\n\n")}\n`;
}

/** Writes `_<name>Type.ts` (always overwritten) and scaffolds `<name>Type.ts`
 * (only if it doesn't exist yet — an existing file is never modified). */
export async function writeGeneratedFilePair(input: FileGenerationInput): Promise<void> {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const generatedPath = path.join(OUTPUT_DIR, `_${input.name}Type.ts`);
    const rawText = buildGeneratedFileText(input);
    const formattedText = await formatIfConfigured(rawText, generatedPath);
    fs.writeFileSync(generatedPath, formattedText);
    console.log(`  ✅ wrote ${path.relative(process.cwd(), generatedPath)}`);

    const userPath = path.join(OUTPUT_DIR, `${input.name}Type.ts`);
    const reExportLine = `export * from './_${input.name}Type.ts';`;

    if (!fs.existsSync(userPath)) {
        const scaffold =
            `// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend\n` +
            `// with hand-written exports (additional TypeBox schemas, types, constants, ...) —\n` +
            `// the generator only creates this file if it is missing; it will never\n` +
            `// overwrite or delete anything you add here afterwards.\n` +
            `${reExportLine}\n`;
        const formattedScaffold = await formatIfConfigured(scaffold, userPath);
        fs.writeFileSync(userPath, formattedScaffold);
        console.log(`  🆕 scaffolded ${path.relative(process.cwd(), userPath)}`);
    } else {
        const existing = fs.readFileSync(userPath, "utf8");
        const hasReExport = new RegExp(`export\\s+\\*\\s+from\\s+['"]\\./_${input.name}Type.ts['"]`).test(existing);
        if (!hasReExport) {
            console.warn(
                `  ⚠️  ${path.relative(process.cwd(), userPath)} exists but does not contain "${reExportLine}". ` +
                    `Downstream imports of ./_${input.name}Type may be broken. Leaving this file untouched — please add it by hand.`,
            );
        }
    }
}

/**
 * Re-scans every generated `_<name>Type.ts` file for forbidden drizzle-orm
 * imports and throws — listing every offending file/import — if any are
 * found. This is a final safety net on top of Step 1's import rewriting.
 */
export function validateNoDrizzleImports(names: string[]): void {
    const offenders: string[] = [];
    const importRegex = /from\s+['"](drizzle-orm(?:\/[^'"]*)?)['"]/g;

    for (const name of names) {
        const filePath = path.join(OUTPUT_DIR, `_${name}Type.ts`);
        const text = fs.readFileSync(filePath, "utf8");
        for (const match of text.matchAll(importRegex)) {
            offenders.push(`${path.relative(process.cwd(), filePath)} imports "${match[1]}"`);
        }
    }

    if (offenders.length > 0) {
        throw new Error(
            `Generated file(s) illegally import drizzle-orm — these must be 100% browser-safe:\n` +
                offenders.map(offender => `  - ${offender}`).join("\n"),
        );
    }
}

