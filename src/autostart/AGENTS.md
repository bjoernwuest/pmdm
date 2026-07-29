# AI Agent Guidelines: Autostart

Files in this directory are auto-discovered by [`src/main.ts`](src/main.ts) on startup.
Each `.ts` file is dynamically imported and its `start(db: DBClient)` function is called.

Files here should **only start things** — keep business logic in `src/services/`.

## Required Export

```typescript
import type { DBClient } from "@/services/DatabaseDriver";

export async function start(db: DBClient): Promise<void> {
  // 1. Read runtime config if needed (via getConfigEntriesByKey)
  // 2. Call into src/services/ to start the actual work
  // Example: await startSomeService(db);
}
```

## Rules

- Each file must export a named `start(db: DBClient): Promise<void>` function
- Do NOT call `getDatabaseConnection()` directly — use the `db` parameter
- Do NOT place business logic here — delegate to `src/services/`
- Errors within `start()` are caught by the auto-discovery loop; one failing task does not block others
- Follow [`src/services/AGENTS.md`](src/services/AGENTS.md) for config declaration, imports, and PubSub rules
