import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { getCookie, getSession, validateApiKey, validateBearerToken, type ApiKeyAuthContext } from "@/services/Auth.ts";
import { devMode } from "@/devmode.ts";
import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";
import serverTiming from "@elysia/server-timing";
import type {Session} from "../types/AuthType.ts";

import type {DBClient} from "@/services/DatabaseDriver.ts";

if (devMode) console.log("API: ⚡ Start API application...");

// Create the API app with proper type decorations
const apiInstance = new Elysia({ prefix: "/api" })
    .decorate("dbClient", {} as DBClient)
    .derive({ as: 'global' }, async ({ request, dbClient }) => {
        // Check for Bearer token (OAuth2.1)
        const authHeader = request.headers.get("Authorization");
        const apiKeyHeader = request.headers.get("X-API-Key");
        let session: Session | undefined = undefined;
        let apiKeyAuth: ApiKeyAuthContext | undefined = undefined;
        let isAuthenticated = false;
        let authMethod: "session" | "apiKey" | "bearer" | undefined = undefined;
        let tokenClaims: Record<string, any> | undefined = undefined;

        // Session takes precedence over all other auth mechanisms.
        const sessionId = getCookie(request, "SessionID");
        if (sessionId) {
            session = await getSession(dbClient, sessionId);
            if (session) {
                authMethod = "session";
                tokenClaims = session.idTokenClaims;
                isAuthenticated = true;
            }
        }

        if (!isAuthenticated && apiKeyHeader) {
            apiKeyAuth = await validateApiKey(dbClient, apiKeyHeader);
            if (apiKeyAuth) {
                authMethod = "apiKey";
                tokenClaims = apiKeyAuth.claims;
                isAuthenticated = true;
            }
        }

        if (!isAuthenticated && authHeader?.startsWith("Bearer ")) {
            const token = authHeader.substring(7);
            tokenClaims = await validateBearerToken(dbClient, token);
            if (tokenClaims) {
                authMethod = "bearer";
                isAuthenticated = true;
            }
        }

        if (isAuthenticated && !tokenClaims && session) {
            tokenClaims = session.idTokenClaims;
        }

        if (isAuthenticated && !tokenClaims && apiKeyAuth) {
            tokenClaims = apiKeyAuth.claims;
        }

        return {
            session,
            apiKeyAuth,
            isAuthenticated,
            authMethod,
            tokenClaims,
        };
    })
    .onBeforeHandle(({ isAuthenticated, request }) => {
        const pathname = new URL(request.url).pathname;
        const isPublicEndpoint = pathname === "/api/health" || pathname.startsWith("/api/docs");

        // Keep docs and health public; everything else requires authentication.
        if (isPublicEndpoint) return;

        if (!isAuthenticated) {
            return new Response(
                JSON.stringify({ error: "Unauthorized", message: "Authentication required" }),
                {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }
    });

// Export the properly typed instance
export const app = apiInstance;

// Export the type of the API instance for route modules to use
export type ApiInstance = typeof apiInstance;

if (devMode) {
    console.log("API: ...⚡ Add server timings...");
    app.use(serverTiming());
}

// Add OpenAPI/Swagger documentation AFTER authentication
if (devMode) console.log("API: ...⚡ Mount OpenAPI documentation...");

app.use(
    swagger({
        documentation: {
            info: {
                title: "API documentation",
                version: "1.0.0",
                description: "API documentation for the application",
            },
            tags: [
                { name: "Health", description: "Health check endpoints" },
                { name: "Realtime", description: "Server-sent events and live event delivery" },
            ],
            components: {
                securitySchemes: {
                    sessionId: {
                        type: "apiKey",
                        in: "header",
                        name: "X-API-Key",
                        description: "API key used for REST API authentication",
                    },
                },
            },
            security: [
                { sessionId: [] },
            ],
        },
        path: "/docs",
        // Exclude all paths that don't start with /api/ using RegExp
        exclude: [
            /^\/(?!api\/).*/,  // Matches any path that doesn't start with /api/
            "/docs/llms.txt"    // Also exclude llms.txt helper from OpenAPI output
        ],
        provider: "scalar",
    })
);

// Generate llms.txt from OpenAPI spec
if (devMode) console.log("API: ...⚡ Mount llms.txt endpoint...");
app.get("/docs/llms.txt", async ({ request }) => {
    try {
        // Fetch the OpenAPI JSON
        const baseUrl = new URL(request.url).origin;
        const openapiUrl = `${baseUrl}/api/docs/json`;
        const response = await fetch(openapiUrl);
        const openapi = await response.json();

        // Convert to markdown
        const result = createMarkdownFromOpenApi(openapi);
        const markdown: string = typeof result === 'string' ? result : (await result);

        return new Response(markdown, {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    } catch (error) {
        if (devMode) console.error("Error generating llms.txt:", error);
        return new Response("Error generating llms.txt", { status: 500 });
    }
});


// Load all API routes from /src/api/
if (devMode) console.log("API: ...⚡ Autoload API routes from /src/api/...");

// Dynamically load all route files
const apiRoutesPath = new URL("../api", import.meta.url).pathname;
const routeFiles = await Array.fromAsync(new Bun.Glob("**/!(*.test).ts").scan({ cwd: apiRoutesPath }));

for (const file of routeFiles) {
    const routePath = `${apiRoutesPath}/${file}`;
    try {
        const routeModule = await import(routePath);
        if (routeModule.default && typeof routeModule.default === "function") {
            routeModule.default(app);
            if (devMode) console.log(`API: ...⚡ Loaded route: ${file}`);
        } else {
            if (devMode) console.warn(`API: ⚠️  Route file ${file} does not export a default function`);
        }
    } catch (error) {
        if (devMode) console.error(`API: ❌ Error loading route ${file}:`, error);
    }
}

if (devMode) console.log("API: ✅ API application ready");
