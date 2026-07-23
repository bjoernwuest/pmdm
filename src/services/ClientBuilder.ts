import { watch } from "fs";
import { createHash } from "crypto";
import path from "path";
import {devMode} from "@/devmode.ts";

interface ClientBundle {
    code: string;
    etag: string;
    timestamp: number;
}

export class ClientBundleService {
    private _Bundle: ClientBundle | null = null;
    private _IsBuilding = false;
    private _BuildQueue: Array<() => void> = [];
    private _EntryPoints: string[];
    private _WatchPath: string;

    private constructor(sourcePath: string = "src/client", entrypoints: string[] = ["./src/client/index.tsx"]) {
        this._EntryPoints = entrypoints;
        this._WatchPath = sourcePath;
    }

    static async create(sourcePath: string = "src/client", entrypoints: string[] = ["./src/client/index.tsx"]): Promise<ClientBundleService> {
        const instance = new ClientBundleService(sourcePath, entrypoints);
        await instance.buildBundle();
        if (devMode) { instance.watchClientFiles(); }
        return instance;
    }

    private async buildBundle(): Promise<void> {
        if (this._IsBuilding) {
            // Wenn bereits ein Build läuft, in Queue einreihen
            return new Promise((resolve) => {
                this._BuildQueue.push(resolve);
            });
        }

        this._IsBuilding = true;
        console.log("🔨 Building bundle...");

        try {
            // Bun unterstützt React JSX nativ
            const result = await Bun.build({
                entrypoints: this._EntryPoints,
                target: "browser",
                format: "esm",
                minify: !devMode,
                sourcemap: devMode ? "inline" : "none",
            });

            if (!result.success) {
                console.error("❌ Build failed:");
                for (const log of result.logs) {
                    console.error(log);
                }
                throw new Error("Build failed");
            }

            if (!result.outputs || result.outputs.length === 0) {
                throw new Error("No output from build");
            }

            const code = await result.outputs[0]!.text();

            // ETag generieren (Hash des Bundle-Contents)
            const etag = `"${createHash("sha256").update(code).digest("hex").substring(0, 16)}"`;

            this._Bundle = {
                code,
                etag,
                timestamp: Date.now(),
            };

            console.log(`✅ Bundle built successfully (${(code.length / 1024).toFixed(2)} KB)`);
            console.log(`   ETag: ${etag}`);
        } catch (error) {
            console.error("❌ Error building bundle:", error);
            throw error;
        } finally {
            this._IsBuilding = false;

            // Queue abarbeiten
            const callbacks = [...this._BuildQueue];
            this._BuildQueue = [];
            callbacks.forEach(cb => cb());
        }
    }

    private watchClientFiles(): void {
        const clientDir = path.join(process.cwd(), this._WatchPath);

        console.log("👀 Watching for changes...");

        watch(clientDir, { recursive: true }, (eventType, filename) => {
            if (filename && (filename.endsWith(".tsx") || filename.endsWith(".ts") || filename.endsWith(".css"))) {
                console.log(`📝 Change detected: ${filename}`);
                this.buildBundle().catch(console.error);
            }
        });
    }

    getBundle(): ClientBundle | null {
        return this._Bundle;
    }

    hasBundle(): boolean {
        return this._Bundle !== null;
    }
}
