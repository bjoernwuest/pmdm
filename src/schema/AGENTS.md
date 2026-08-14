# AI Agent Guidelines: Schema & Types Folder

**Precedence:** sub-directory AGENTS.md take precedence over parent AGENTS.md files; this file is the authoritative layer doc for its folder.

This folder is strictly reserved for **Drizzle ORM schema definitions and their associated type constants**. All agents and automated tools must adhere to the following isolation rules.

## 🛑 Critical Restrictions

1. **Allowed Imports:**
    * You may import functions, types, and utilities exclusively from the `drizzle-orm` package and sub-packages (e.g. `drizzle-orm/pg-core`).
    * Internal imports (files within this exact subfolder importing each other) are permitted.
2. **Forbidden Imports:**
    * **Absolute Prohibition:** No imports from outside this specific folder are allowed under any circumstances.
    * No external npm packages, utils, config files, or environment variables from the broader project.

---

## 📂 Permitted File Content

* **Schema Definitions:** Drizzle table configurations, indexes, and relations.
* **Typings & Constants:** Enums, strict string constants, and TypeScript types directly required for the schema definitions.

*Ensure all generated code passes strict linting and does not break the dependency isolation of this directory.*

---

## Naming guideline

* Schema files should be named in PascalCase and end with `Schema.ts`, e.g., `UserSchema.ts`, `ConfigSchema.ts`.
* Helper files (e.g., `helpers.ts`) may be used for shared schema utilities but must also adhere to the import restrictions. They must end with `.ts` but not `Schema.ts`.