# AI Agent Guidelines: Types & Typebox Schema Folder

This folder serves as the central hub for **TypeScript type definitions, Typebox schemas, and shared constants** (e.g., PubSub topics).

## 🔄 File Structure & Conventions

The directory contains two distinct types of files based on their naming convention:

1. **Auto-Generated Files (`_<name>.ts`):**
    * **Rule:** These files are automatically generated and **must never be modified** by agents or manual edits.
    * **Handling:** Treat these files as read-only.
    * **Usage:** Never import from these files. They are re-exported by their corresponding "<name>.ts" file, which shall be imported from.

2. **User Definition Files (`<name>.ts`):**
    * **Rule:** These files extend the auto-generated definitions.
    * **Requirement:** They must explicitly re-export everything from their corresponding `_<name>.ts` file and house manual extensions, custom types, or constants.
    * **Restriction:** Only import from following packages: `@sinclair/typebox`, `elysia`, `react`, and `/src/types/**`.
    * **Usage:** Only these files should be imported and used within the rest of the project. It is safe to import from these files into `/src/ui/`.

---

## 🛑 Strict Guidance for Code Modification

* All files must be 100% browser compatible. YOU MUST NOT use any Node.js/backend-specific APIs or modules.
* **Do not edit** any file prefixed with an underscore (`_`).
* When adding or updating custom types, Typebox schemas, or constants, always use or create the corresponding non-prefixed `<name>.ts` file.
* Ensure that the `export * from './_<name>';` statement remains intact at the top of the user definition file.