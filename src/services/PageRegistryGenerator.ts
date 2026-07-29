import fs from "fs";

export function regeneratePageRegistry(pagesDir: string, outputPath: string): void {
    const glob = new Bun.Glob("**/*.tsx");

    const matches = [...glob.scanSync({ cwd: pagesDir, absolute: false, dot: false })];

    matches.sort((a, b) => a.localeCompare(b));

    const lines: string[] = [
        'import type { PageModule } from "@/types/PageType.ts";',
    ];

    matches.forEach((relPath, i) => {
        const importPath = `./pages/${relPath.replace(/\\/g, "/")}`;
        lines.push(`import * as _p${i} from ${JSON.stringify(importPath)};`);
    });

    lines.push("");
    lines.push("export const autoPageModules: readonly PageModule[] = [");

    matches.forEach((_relPath, i) => {
        lines.push(`    { meta: _p${i}.meta, Component: _p${i}.Component },`);
    });

    lines.push("];");
    lines.push("");

    const generated = lines.join("\n");

    try {
        const existing = fs.readFileSync(outputPath, "utf-8");
        if (existing === generated) return;
    } catch {
        // File does not exist yet; proceed.
    }

    try {
        fs.writeFileSync(outputPath, generated, "utf-8");
    } catch (err) {
        console.error("PageRegistryGenerator: failed to write generated registry —", err);
    }
}
