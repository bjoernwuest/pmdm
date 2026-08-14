// Node `fs`/`path` are retained via explicit `node:`-prefixed imports: `walkDir` needs
// `readdir` with dirent types and path manipulation, which have no Bun-native equivalent.
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Recursively walks through a directory and yields file paths with specified extensions.
 *
 * @param {string} dir - The root directory to start walking from.
 * @param {string[]} [exts=[".ts"]] - An array of file extensions to filter the files. Default is [".ts"].
 * @return {AsyncGenerator<{path: string}, void, unknown>} An async generator yielding objects containing file paths relative to the current working directory.
 */
export async function* walkDir(dir: string, exts: string[] = [".ts"]): AsyncGenerator<{ path: string }, void, unknown> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
        const res = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
            yield* walkDir(res, exts);
        } else if (dirent.isFile()) {
            const ext = path.extname(res);
            if (exts.includes(ext)) {
                // Make path relative to process.cwd() and normalize to forward slashes
                let rel = path.relative(process.cwd(), res);
                rel = rel.split(path.sep).join("/");
                yield { path: rel };
            }
        }
    }
}
