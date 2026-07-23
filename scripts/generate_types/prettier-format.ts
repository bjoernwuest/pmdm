import * as prettier from "prettier";

/**
 * Formats `source` with the repo's own Prettier configuration, IF one
 * exists. Uses `prettier.resolveConfig()` — which looks for `.prettierrc*`,
 * `prettier.config.*`, a `"prettier"` key in `package.json`, etc. — to
 * decide whether a config exists. If none is found, `source` is returned
 * completely unchanged rather than silently applying Prettier's built-in
 * defaults.
 */
export async function formatIfConfigured(source: string, filePath: string): Promise<string> {
    try {
        const config = await prettier.resolveConfig(filePath);
        if (!config) return source;
        return await prettier.format(source, { ...config, filepath: filePath });
    } catch (error) {
        console.warn(`⚠️  Prettier formatting skipped for ${filePath}: ${(error as Error).message}`);
        return source;
    }
}

