# Autostart — Startup Task Auto-Discovery

This document describes how derived projects can register startup tasks
(scheduled jobs, background services, PubSub subscribers, etc.) without
modifying any file in the bun-starter base.

## Motivation

Originally, every startup task was imported and started explicitly in
[`src/main.ts`](src/main.ts). Derived projects that needed a custom task had
to edit `main.ts`, which caused merge conflicts when pulling updates from the
upstream bun-starter.

The auto-discovery mechanism lets derived projects drop a `.ts` file into
`src/autostart/` and have it loaded automatically — no base-project edits
required. Base-project startup tasks (like the audit log subscriber) also use
the same mechanism, keeping `main.ts` lean.

## How It Works

[`src/main.ts`](src/main.ts) scans the directory [`src/autostart/`](src/autostart/)
at startup using `fs.readdirSync`. Every `.ts` file is dynamically imported,
and its exported `start()` function is called with the current database client.

```
app startup
  └─ initDatabase()
  └─ startEntraIDSync()            ← explicit, blocking (not yet migrated)
  └─ load apps (setup, login, api, ui)
  └─ getDatabaseConnection()
  └─ scan src/autostart/*.ts       ← auto-discovery
  │   ├─ import -> start(dbClient)
  │   ├─ import -> start(dbClient)
  │   └─ ...
  └─ mount apps, listen
```

A task file is **not imported** if the directory does not exist, if the file
does not end in `.ts`, or if the file has no `start()` export. One failing task
does **not** prevent other tasks or the server from starting.

## Contract

Every file in `src/autostart/` must export:

```typescript
export async function start(db: DBClient): Promise<void>;
```

| Parameter | Purpose |
|---|---|
| `db` | A Drizzle database client for reading config or performing data operations. Must not call `getDatabaseConnection()` directly. |

The return value is ignored — tasks are fire-and-forget. If a task needs to block
startup, it should wait inside `start()` before resolving.

### Responsibility Boundary

Files in `src/autostart/` should **only start things** — keep business logic
in `src/services/`. A typical autostart file looks like:

```typescript
import { startMyService } from "@/services/MyService";
import type { DBClient } from "@/services/DatabaseDriver";

export async function start(db: DBClient): Promise<void> {
  await startMyService(db);
}
```

See [`src/autostart/audit-log.ts`](src/autostart/audit-log.ts) for the canonical example.

### Optional Exports

A task file may also export a `config` object following the standard
[configuration pattern](design/configuration.md#where-parameters-are-declared).
The auto-discovery loop does **not** inspect `config` — it is only used by
the setup wizard during initial deployment.

## Current Autostart Tasks

| File | Delegates to | Purpose |
|---|---|---|
| `audit-log.ts` | [`startAuditLog()`](src/services/AuditLog.ts:101) | Subscribes to PubSub audit events and starts periodic flush timer |

## How to Use (for Derived Projects)

### 1. Create the directory (if it does not exist)

```bash
mkdir -p src/autostart
```

### 2. Create a task file

Example: `src/autostart/daily-report.ts`

```typescript
import { Cron } from "croner";
import { getConfigEntriesByKey, upsertConfigEntry } from "@/repo/ConfigRepo";
import type { DBClient } from "@/services/DatabaseDriver";
import { ConfigValueTypes, type ConfigEntrySelectType } from "@/types/ConfigType";

export const config = {
  cfgInterval: {
    domain: "daily-report",
    key: "Schedule",
    description: "Cron expression for the daily report generation.",
    type: ConfigValueTypes.string,
    value: "0 6 * * *",
    inputFormat: "",
    outputFormat: "",
    editInUI: true,
    mandatoryForStart: false,
    userProfile: false,
  } satisfies ConfigEntrySelectType,
} satisfies Record<string, ConfigEntrySelectType>;

export async function start(db: DBClient): Promise<void> {
  // Seed config row with default on first run
  const [row] = await getConfigEntriesByKey(
    db, config.cfgInterval.domain, config.cfgInterval.key, { limit: 1 },
  );
  if (!row) await upsertConfigEntry(db, config.cfgInterval);

  const expr = row?.value ? String(row.value) : config.cfgInterval.value;
  if (!expr || expr === "off") return;

  new Cron(String(expr), async () => {
    // Generate and send report
  }, { name: "daily-report" });
}
```

### 3. Restart the application

The task is automatically discovered and started. Check the console output for:

```
...⚡ Start autostart tasks...
  ✓ autostart: daily-report.ts
```

### 4. Disable a task

For croner-based tasks: set the configuration value to `"off"` through the
admin UI or database. For other task types: implement your own opt-out
mechanism in `start()`.

Alternatively, delete the `.ts` file from `src/autostart/`.

### 5. Troubleshooting

If a task fails to start, a warning is emitted to the console but the server
continues:

```
  ✗ autostart daily-report.ts failed: <error message>
```

Common causes:
- A cron expression is invalid (check with a cron validator).
- A config entry is missing from the database (seed it in `start()`).
- A dependency import fails (ensure the package is in `package.json`).

## Relationship to Other Startup Code

| Startup element | Discovery method | Blocks startup? |
|---|---|---|
| EntraID sync | Explicit `import` in [`src/main.ts`](src/main.ts) | Yes (until groups are synced) |
| Autostart tasks | Auto-scanned from `src/autostart/` | No (sequential, but each is awaited) |
| Setup wizard | Explicit `import` in [`src/main.ts`](src/main.ts) | Yes (blocks until config is complete) |

## Error Handling

The auto-discovery loop in [`src/main.ts`](src/main.ts) wraps each task
individually in try/catch. Errors during `start()` are logged and the next
task proceeds. Errors inside a scheduled callback or background worker are the
task's own responsibility — the loop does not capture them.

If `src/autostart/` does not exist, the loop silently skips (no directory
needed when no custom tasks are defined).

## Design Rationale

- **Why `start()` instead of a default export?** Named exports are more
  discoverable and support potential future additions (e.g., `stop()`, `health()`)
  without breaking existing tasks.
- **Why pass `dbClient` as parameter?** Follows the rule in
  [`src/services/AGENTS.md`](src/services/AGENTS.md) that services must not call
  `getDatabaseConnection()` directly. Keeps database access explicit.
- **Why sequential import/start?** Each `await import()` blocks while the
  module initializes. Sequential execution makes startup order predictable and
  avoids race conditions. If parallel startup is needed later, it can be
  changed without affecting the contract.
- **Why `.ts` only?** The project uses Bun with `noEmit: true` — `.ts` files
  are the runtime format. There is no compilation step that produces `.js`
  output.
- **Why delegate to `src/services/`?** Autostart files are thin launchers.
  Business logic belongs in services where it can be tested, reused, and
  versioned independently of the startup infrastructure.
