import { Elysia } from "elysia";
import { ClientBundleService } from "@/services/ClientBuilder.ts";
import { buildDeleteCookieHeader, deleteSession, getCookie, getSession, startAuth, finishAuth, logout } from "@/services/Auth.ts";
import { devMode } from "@/devmode.ts";


import type {DBClient} from "@/services/DatabaseDriver.ts";

if (devMode) console.log("Login: ⚡ Start login application...");
export const app = new Elysia().decorate("dbClient", {} as DBClient);

if (devMode) console.log("Login: ...⚡ Initializing login client bundle...");
const loginClientBundle = await ClientBundleService.create("src/login", ["./src/login/index.tsx"]);

// Helper to create redirect response with cookies
function redirectWithCookies(url: string, cookies: string[]): Response {
    const headers = new Headers({ "Location": url });
    for (const cookie of cookies) { headers.append("Set-Cookie", cookie); }
    return new Response(null, { status: 302, headers });
}

// ====================================================================================================================
// OIDC Authentication Routes
// ====================================================================================================================
if (devMode) console.log("Login: ...⚡ Mount login endpoints...");

// POST /login -> Start OIDC auth flow
app.post("/login", async ({ request, dbClient }) => {
    try {
        // Parse returnTo from query or body
        const url = new URL(request.url);
        let returnTo = url.searchParams.get("returnTo") || "/";

        // Try to get returnTo from form body
        try {
            const contentType = request.headers.get("content-type") || "";
            if (contentType.includes("application/x-www-form-urlencoded")) {
                const text = await request.clone().text();
                const params = new URLSearchParams(text);
                returnTo = params.get("returnTo") || returnTo;
            }
        } catch (e) {
            if (devMode) console.error("POST /login: failed to parse body", e);
        }

        const result = await startAuth(dbClient, request.url, returnTo);
        return redirectWithCookies(result.redirectUrl, result.cookies);
    } catch (e) {
        if (devMode) console.error("POST /login error:", e);
        return new Response(null, { status: 302, headers: { Location: "/login?error=auth_start_failed" } });
    }
});

// GET /login/oauth2/code/entraid -> OIDC callback
app.get("/login/oauth2/code/entraid", async ({ request, dbClient }) => {
    try {
        const result = await finishAuth(dbClient, request, "/ui/loading");
        return redirectWithCookies(result.redirectUrl, result.cookies);
    } catch (e) {
        if (devMode) console.error("OIDC callback error:", e);
        return new Response(null, { status: 302, headers: { Location: "/login?error=grant_failed" } });
    }
});

// GET /login/logout -> Logout
app.get("/login/logout", async ({ request, dbClient }) => {
    try {
        const result = await logout(dbClient, request);
        return redirectWithCookies(result.redirectUrl, result.cookies);
    } catch (e) {
        if (devMode) console.error("Logout error:", e);
        return new Response(null, { status: 302, headers: { Location: "/" } });
    }
});

// GET /login/local-logout -> local logout only (keep Entra SSO intact)
app.get("/login/local-logout", async ({ request, dbClient }) => {
    try {
        const sessionId = getCookie(request, "SessionID");
        if (sessionId) await deleteSession(dbClient, sessionId);
        return redirectWithCookies("/login", [buildDeleteCookieHeader("SessionID", { path: "/" })]);
    } catch (e) {
        if (devMode) console.error("Local logout error:", e);
        return new Response(null, { status: 302, headers: { Location: "/login" } });
    }
});

// GET /login/loading -> Show loading page for login bundle
app.get("/login/loading", async ({ request, dbClient }) => {
    const sessionId = getCookie(request, "SessionID");
    if (sessionId) {
        const session = await getSession(dbClient, sessionId);
        if (session) {
            // Already logged in, skip loading and redirect to returnTo or home
            const url = new URL(request.url);
            const returnTo = url.searchParams.get("returnTo") || "/";
            return new Response(null, { status: 302, headers: { Location: returnTo } });
        }
    }
    // Not logged in, serve loading page which will load the login client bundle
    return new Response(Bun.file("src/login/loading.html"), { headers: { "Content-Type": "text/html; charset=utf-8" } });
});

// GET /login -> Show login page (if already logged in, redirect to home)
app.get("/login", async ({ request, dbClient }) => {
    const sessionId = getCookie(request, "SessionID");
    if (sessionId) {
        const session = await getSession(dbClient, sessionId);
        if (session) {
            // Already logged in, redirect to returnTo or home
            const url = new URL(request.url);
            const returnTo = url.searchParams.get("returnTo") || "/";
            return new Response(null, { status: 302, headers: { Location: returnTo } });
        }
    }
    // Not logged in, serve login page HTML
    return new Response(Bun.file("src/login/index.html"), { headers: { "Content-Type": "text/html; charset=utf-8" } });
});

// GET /login/client.js -> Serve login client bundle (no auth required)
app.get("/login/client.js", async ({ request }) => {
    const bundle = loginClientBundle.getBundle();

    if (!bundle) return new Response("Login client bundle not available", { status: 503 });

    // ETag-based caching
    const clientETag = request.headers.get("if-none-match");

    if (clientETag === bundle.etag) {
        return new Response(null, {
            status: 304,
            headers: {
                "ETag": bundle.etag,
                "Cache-Control": "no-cache",
            },
        });
    }

    // Deliver client.js bundle with ETag
    return new Response(bundle.code, {
        headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "ETag": bundle.etag,
            "Cache-Control": (process.env.NODE_ENV === "production") ? "public, max-age=31536000, immutable" : "no-cache",
        },
    });
});

