import path from "node:path";
import type { Project, SourceFile } from "ts-morph";
import { SCHEMA_GLOB } from "./paths";

/**
 * Returns every schema source file that should be treated as a generation
 * "entry" — only files matching `*Schema.ts` inside `src/schema/`
 * (e.g. `UserSchema.ts`). Any other file in that directory (helpers, utility
 * re-exports, …) is ignored because it won't match the glob.
 * Results are sorted by file name for deterministic, readable console output.
 */
export function getSchemaEntryFiles(project: Project): SourceFile[] {
    return project
        .getSourceFiles(SCHEMA_GLOB)
        .sort((a, b) => a.getBaseName().localeCompare(b.getBaseName()));
}

/**
 * Orders schema entry files so that if file A imports from file B (anywhere
 * in A), B is processed before A. This guarantees B's "kept export" names
 * are already known in-memory when A's imports are validated/rewritten in
 * Step 1 (see `step1-static-copy.ts`).
 *
 * Throws a clear error if a circular dependency between schema files is
 * detected, since such a cycle can never be resolved into a valid processing
 * order.
 */
export function topologicalSortByImports(entryFiles: SourceFile[]): SourceFile[] {
    const byPath = new Map(entryFiles.map(sourceFile => [sourceFile.getFilePath() as string, sourceFile] as const));
    const dependsOn = new Map<string, Set<string>>();

    for (const sourceFile of entryFiles) {
        const deps = new Set<string>();
        for (const importDecl of sourceFile.getImportDeclarations()) {
            const target = importDecl.getModuleSpecifierSourceFile();
            const targetPath = target?.getFilePath();
            if (target && targetPath && byPath.has(targetPath) && target !== sourceFile) {
                deps.add(targetPath);
            }
        }
        dependsOn.set(sourceFile.getFilePath(), deps);
    }

    const sorted: SourceFile[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    function visit(filePath: string): void {
        if (visited.has(filePath)) return;
        if (visiting.has(filePath)) {
            throw new Error(
                `Circular dependency detected between schema files involving "${path.relative(process.cwd(), filePath)}". ` +
                    `Schema files must form a DAG so generated output can be produced in a single pass.`,
            );
        }
        visiting.add(filePath);
        for (const dep of dependsOn.get(filePath) ?? []) visit(dep);
        visiting.delete(filePath);
        visited.add(filePath);
        sorted.push(byPath.get(filePath)!);
    }

    for (const sourceFile of entryFiles) visit(sourceFile.getFilePath());
    return sorted;
}


