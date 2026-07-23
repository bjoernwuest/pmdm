import { Elysia } from "elysia";
import { ClientBundleService } from "@/services/ClientBuilder.ts";
import { getCookie, getSession } from "@/services/Auth.ts";
import { devMode } from "@/devmode.ts";


import type {DBClient} from "@/services/DatabaseDriver.ts";

if (devMode) console.log("UI: ⚡ Start frontend...");

// Initialise the SSE PubSub bridge here (not in main.ts) so it only runs when
// the UI sub-app is actually mounted.
await import("@/services/ServerSentEvents.ts");
if (devMode) console.log("UI: ...⚡ SSE bridge initialised");

export const app = new Elysia().decorate("dbClient", {} as DBClient);

if (devMode) console.log("UI: ...⚡ Build client bundle");
const clientBundle = await ClientBundleService.create("src/ui", [
  "./src/ui/index.tsx",
]);

app.get("/ui/client.js", async ({ request }) => {
  const bundle = clientBundle.getBundle();
  if (!bundle) return new Response("Client bundle not available", { status: 503 });

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch === bundle.etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: bundle.etag, "Cache-Control": "no-cache" },
    });
  }
  return new Response(bundle.code, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      ETag: bundle.etag,
      "Cache-Control": devMode
        ? "no-store, must-revalidate"
        : "public, max-age=31536000, immutable",
    },
  });
});

// Catch-all route. Authentication is enforced by redirecting unauthenticated
// requests to /login.
app.get("/*", async ({ request, dbClient }) => {
  const url = new URL(request.url);
  // Don't intercept other sub-apps' routes (login/, api/, public/, oauth/, logout).
  const passthrough = ["/login", "/api", "/oauth", "/logout", "/static/public"];
  if (passthrough.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) return;
  const session = await getSession(dbClient, getCookie(request, "SessionID"));
  if (!session) {
    const returnTo = encodeURIComponent(url.pathname + url.search);
    return new Response(null, { status: 302, headers: { Location: `/login?returnTo=${returnTo}` } });
  }
  return new Response(Bun.file("src/ui/index.html"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
