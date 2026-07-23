import path from "node:path";

/** Absolute path to the repository root (one level up from /scripts). */
export const ROOT_DIR = path.resolve(import.meta.dirname, "../..");

/** Directory containing hand-written Drizzle schema files (one file per domain). */
export const SCHEMA_DIR = path.join(ROOT_DIR, "src", "schema");

/**
 * Output directory for generated browser-safe TypeScript/TypeBox files.
 *
 * NOTE: This intentionally targets `src/types` — a sandbox directory kept
 * separate from the existing `src/types` folder and its
 * `scripts/generatetypes.ts` generator (both of which are left untouched).
 * That lets this new generator be exercised and reviewed on its own before
 * anything is migrated over by hand.
 */
export const OUTPUT_DIR = path.join(ROOT_DIR, "src", "types");

/**
 * Absolute path to the repo's tsconfig.json. Loading the *real* tsconfig
 * (rather than default compiler options) matters here: drizzle-orm publishes
 * conditional package "exports", and only `moduleResolution: "bundler"` (as
 * configured in this repo) resolves those the same way the real build does.
 */
export const TSCONFIG_PATH = path.join(ROOT_DIR, "tsconfig.json");

/**
 * Glob pattern for schema files that are eligible for generation.
 * Only files whose name ends with `Schema.ts` (e.g. `UserSchema.ts`) are
 * treated as generator inputs. Everything else in `src/schema/` (e.g.
 * `helpers.ts`, plain utility files, re-export barrels, …) is ignored
 * automatically — no explicit exclusion list is required.
 */
export const SCHEMA_GLOB = path.join(SCHEMA_DIR, "*Schema.ts").replace(/\\/g, "/");

/**
 * Derives the output base name for a schema file.
 *
 * `UserSchema.ts`  →  `User`
 *
 * The `Schema` suffix is stripped so that the generated pair is
 * `_UserType.ts` / `UserType.ts` rather than `_UserSchemaType.ts`.
 */
export function schemaFileToOutputName(baseNameWithoutExt: string): string {
    return baseNameWithoutExt.endsWith("Schema") ? baseNameWithoutExt.slice(0, -"Schema".length) : baseNameWithoutExt;
}

