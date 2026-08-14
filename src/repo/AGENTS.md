# AI Agent Guidelines: Data Repository Layer

This folder is the dedicated **Data Access Layer** of the application. Its primary objective is to fully encapsulate all `drizzle-orm` queries and database logic, preventing direct database leaks into the business logic.

**Precedence:** this file is the authoritative layer doc for `src/repo/` and takes precedence over parent `AGENTS.md` files (including the root file).

## 📁 Naming & Mapping Conventions

* **1:1 Mapping:** For every schema file in the project, there must be exactly one corresponding repository file here.
* **Naming Convention:** Files must use PascalCase/camelCase matching the schema file, replace `Schema.ts` with `Repo.ts` (e.g., `UserSchema.ts` schema maps to `UserRepo.ts`).

---

## 🛑 Strict Architectural Rules

1. **Full Encapsulation:** All database queries, insertions, updates, and deletions using Drizzle ORM must happen exclusively inside these repository files.
2. **No External Leakage:** Never export raw Drizzle query builders or database connections to the rest of the project. Only expose clean, predictable asynchronous functions (e.g., `getUserById`, `createGroup`).
3. **Isolation Focus:** If you are building or modifying features outside of this folder, do not write raw Drizzle queries. Instead, add a descriptive method inside the appropriate `<schemaFileName>Repo.ts` file and call it from your business logic.