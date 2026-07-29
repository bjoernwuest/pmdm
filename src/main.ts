import { readdirSync } from "node:fs";
import { join } from "node:path";
import {type DBClient, getDatabaseConnection, initDatabase} from "@/services/DatabaseDriver.ts";
import { startScheduler as startEntraIDSync } from "@/services/EntraIDSync.ts";
import { init as initNotifications } from "@/services/Notifications.ts";
import { startScriptEngine } from "@/services/ScriptEngine.ts";
import { init as initScriptLogCleanup } from "@/services/ScriptLog.ts";
import { Elysia } from "elysia";
import { devMode } from "@/devmode.ts";

console.log("⚡ Start application...");

console.log("...⚡ Initialize database...");
await initDatabase();

console.log("...⚡ Register functional permissions...");
await import("@/services/auth/FunctionalPermissions.ts");

console.log("...⚡ Load application modules...");
const { default: setupApp } = await import("@/apps/setup.ts");
const { app: loginApp } = await import("@/apps/login.ts");
const { app: apiApp } = await import("@/apps/api.ts");
const { app: uiApp } = await import("@/apps/ui.ts");

console.log("...⚡ Check if setup is required...");
await setupApp();

console.log("...⚡ Start EntraID sync...");
try {
  const syncState = await startEntraIDSync();
  await syncState.groupsReady;
} catch (e) { console.warn("EntraID sync could not start (continuing without it):", e); }


// Start real app
const app = new Elysia();

// Serve static assets in /public (CSS, images, etc)
if (devMode) console.log("...⚡ Mount /public endpoint...");
app.get("/public/*", async ({ params }) => Bun.file(`./public/${params["*"]}`));
if (devMode) console.log("...⚡ Mount /static/public endpoint...");
app.get("/static/public/*", async ({ params }) => Bun.file(`./static/public/${params["*"]}`));

// ====================================================================================================================
// Inject database connection (not transaction - Drizzle transactions need to be scoped per operation)
// ====================================================================================================================
const injectDb = (dbClient: DBClient) => new Elysia({ name: 'db-inject' }).derive({ as: 'global' }, async () => {
    return { dbClient };
});


// ====================================================================================================================
// Mount applications
// ====================================================================================================================
const dbClient = await getDatabaseConnection();

// ── Auto-discovered autostart tasks ────────────────────────────────────────────
console.log("...⚡ Start autostart tasks...");
const autostartDir = join(import.meta.dir, "autostart");
try {
  for (const file of readdirSync(autostartDir)) {
    if (!file.endsWith(".ts")) continue;
    try {
      const mod = await import(`@/autostart/${file}`);
      if (typeof mod.start === "function") {
        await mod.start(dbClient);
        console.log(`  ✓ autostart: ${file}`);
      }
    } catch (e) {
      console.warn(`  ✗ autostart ${file} failed:`, e);
    }
  }
} catch (e: any) {
  if (e?.code !== "ENOENT") console.warn("Could not scan autostart directory:", e);
}

if (devMode) console.log("...💉 Injecting Drizzle database connection");
app.use(injectDb(dbClient));
// Start the notification digest scheduler
console.log("...⚡ Start notification scheduler...");
await initNotifications(dbClient);
console.log("...⚡ Start script log cleanup scheduler...");
await initScriptLogCleanup(dbClient);
// Seed the Script Engine config entries
console.log("...⚡ Start script engine...");
await startScriptEngine(dbClient);
if (devMode) console.log("...⚡ Mount login application...");
app.use(loginApp);
if (devMode) console.log("...⚡ Mount API backend...");
app.use(apiApp);
if (devMode) console.log("...⚡ Mount client frontend...");
app.use(uiApp);

const port = Number(process.env.PORT) || 8000;
app.listen(port);
console.log(`🚀 Application running at http://localhost:${port}`);