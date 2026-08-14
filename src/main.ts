import {getDatabaseConnection, initDatabase} from "@/services/DatabaseDriver.ts";
import { Elysia } from "elysia";
import { devMode } from "@/devmode.ts";
import { port as envPort } from "@/services/Env.ts";

console.log("⚡ Start application...");

console.log("...⚡ Initialize database...");
await initDatabase();

console.log("...⚡ Load application modules...");
const { default: setupApp } = await import("@/apps/setup.ts");
const { createLoginApp } = await import("@/apps/login.ts");
const { createApiApp } = await import("@/apps/api.ts");
const { createUiApp } = await import("@/apps/ui.ts");

console.log("...⚡ Get database connection...");
const dbClient = await getDatabaseConnection();

console.log("...⚡ Register functional permissions...");
const { registerFunctionalPermissions } = await import("@/services/auth/FunctionalPermissions.ts");
await registerFunctionalPermissions(dbClient);

console.log("...⚡ Check if setup is required...");
await setupApp();


// Start real app
const app = new Elysia();

// Serve static assets in /public (CSS, images, etc)
if (devMode) console.log("...⚡ Mount /public endpoint...");
app.get("/public/*", async ({ params }) => Bun.file(`./public/${params["*"]}`));
if (devMode) console.log("...⚡ Mount /static/public endpoint...");
app.get("/static/public/*", async ({ params }) => Bun.file(`./static/public/${params["*"]}`));

// ====================================================================================================================
// Mount applications (each app factory receives the real DBClient — non-transactional
// client; Drizzle transactions are scoped per operation via runInTransaction)
// ====================================================================================================================

// ── Auto-discovered autostart tasks ────────────────────────────────────────────
console.log("...⚡ Start autostart tasks...");
try {
  for (const file of new Bun.Glob("*.ts").scanSync({ cwd: `${import.meta.dir}/autostart` })) {
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

if (devMode) console.log("...⚡ Mount login application...");
app.use(createLoginApp(dbClient));
if (devMode) console.log("...⚡ Mount API backend...");
app.use(createApiApp(dbClient));
if (devMode) console.log("...⚡ Mount client frontend...");
app.use(createUiApp(dbClient));

const port = envPort;
app.listen(port);
console.log(`🚀 Application running at http://localhost:${port}`);