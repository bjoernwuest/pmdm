import type { ApiInstance } from "@/apps/api.ts";
import { Type } from "@sinclair/typebox";
import { devMode } from "@/devmode.ts";
import { bundlingDebug, internalApiBaseUrl, port as envPort } from "@/services/Env.ts";
import type {
    RequestBundlingRequestItem,
    RequestBundlingResponseItem,
    RequestBundlingServerConfig
} from "@/types/RequestBundlingType.ts";
import { getRequestBundlingClientRuntimeConfig, getRequestBundlingServerConfig } from "@/services/RequestBundling.ts";
import { RequestBundlingClientConfigSchema } from "@/types/RequestBundlingType.ts";
import { ErrorResponseSchema, UnauthenticatedErrorResponseSchema } from "@/types/ApiType.ts";

/** Mutating HTTP methods accepted by request bundling. */
const ALLOWED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Runtime validator for request items received over the network.
 */
function isRequestBundlingRequestItem(value: unknown): value is RequestBundlingRequestItem {
    if (!value || typeof value !== "object") return false;

    const candidate = value as Partial<RequestBundlingRequestItem>;
    return (
        typeof candidate.clientRequestId === "string" &&
        ALLOWED_METHODS.has(candidate.method ?? "") &&
        typeof candidate.url === "string" &&
        (typeof candidate.body === "string" || candidate.body === null || candidate.body === undefined) &&
        !!candidate.headers &&
        typeof candidate.headers === "object" &&
        typeof candidate.clientExpectedProcessingMs === "number" &&
        Number.isFinite(candidate.clientExpectedProcessingMs) &&
        candidate.clientExpectedProcessingMs >= 0 &&
        typeof candidate.clientTimeoutMs === "number" &&
        Number.isFinite(candidate.clientTimeoutMs) &&
        candidate.clientTimeoutMs > 0 &&
        typeof candidate.clientMayTakeUntil === "string"
    );
}

/** Clamps a timeout value into the supported server range. */
function clampTimeoutMs(value: number, cfg: RequestBundlingServerConfig): number {
    return Math.max(cfg.minServerTimeoutMs, Math.min(cfg.maxServerTimeoutMs, Math.round(value)));
}

/**
 * Computes the server timeout budget for one bundled request.
 * The budget considers the client timeout hint and expected processing time.
 */
function computeServerTimeoutMs(req: RequestBundlingRequestItem, cfg: RequestBundlingServerConfig): number {
    const clientBudget = clampTimeoutMs(req.clientTimeoutMs, cfg);
    const expected = clampTimeoutMs(Math.max(cfg.minServerTimeoutMs, req.clientExpectedProcessingMs * 2), cfg);
    return Math.max(cfg.defaultServerTimeoutMs, clientBudget, expected);
}

/** Extracts a human-readable error message from arbitrary response bodies, including Elysia-style validation errors. */
function extractErrorMessage(body: unknown, fallback: string): string {
    if (body && typeof body === "object") {
        const candidate = body as Record<string, unknown>;

        if (candidate.type === "validation") {
            const location = typeof candidate.on === "string" ? candidate.on : "request";
            const details = candidate.errors ?? candidate.found ?? body;
            return `Validation failed on ${location}: ${JSON.stringify(details)}`;
        }

        if (typeof candidate.message === "string") return candidate.message;
        if (typeof candidate.error === "string") return candidate.error;
    }

    if (typeof body === "string" && body.length > 0) return body;
    return fallback;
}

/**
 * Resolves with the original promise value or a symbol if the timeout elapses first.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | symbol> {
    const timeoutSymbol = Symbol("request-bundling-timeout");

    return Promise.race([
        promise,
        new Promise<symbol>((resolve) => {
            setTimeout(() => resolve(timeoutSymbol), timeoutMs);
        }),
    ]).then((result) => result === timeoutSymbol ? timeoutSymbol : (result as T));
}

/** Creates a JSON response with a consistent content type header. */
function toJsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// noinspection JSUnusedGlobalSymbols
/**
 * Registers the `/api/request_bundling` endpoint.
 *
 * The endpoint accepts multiple mutating API calls and streams each result as
 * NDJSON so clients can resolve responses incrementally.
 */
export default function register(app: ApiInstance) {
    app.get("/request_bundling/config", async ({ dbClient }) => {
        return await getRequestBundlingClientRuntimeConfig(dbClient);
    }, {
        response: {
            200: RequestBundlingClientConfigSchema,
            401: UnauthenticatedErrorResponseSchema,
        },
        detail: {
            tags: ["Request Bundling"],
            summary: "Get request bundling runtime configuration for browser clients",
            description: "Retrieve the current request bundling configuration that browser clients should use for optimal performance. This configuration specifies queue thresholds (age, size, count) and timeout default values. No authentication required.",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
            ],
        },
    });

    app.post("/request_bundling", async ({ request, dbClient }) => {
        const config = await getRequestBundlingServerConfig(dbClient);
        let parsedBody: unknown;

        try {
            parsedBody = await request.json();
        } catch {
            return toJsonResponse(400, { error: "Invalid JSON payload" });
        }

        const requests = (parsedBody as { requests?: unknown })?.requests;
        if (!Array.isArray(requests) || requests.length === 0 || !requests.every(isRequestBundlingRequestItem)) {
            return toJsonResponse(400, { error: "requests must be a non-empty array of valid request bundling items" });
        }

        const serverPort = envPort;
        const localOrigin = `http://localhost:${serverPort}`;
        const origin = devMode ? localOrigin : (internalApiBaseUrl || localOrigin);
        const authorizationHeader = request.headers.get("Authorization") ?? undefined;
        const apiKeyHeader = request.headers.get("X-API-Key") ?? undefined;
        const cookieHeader = request.headers.get("Cookie") ?? undefined;
        const encoder = new TextEncoder();

        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({
            start(c) {
                controller = c;
            },
        });

        const encodeItem = (item: RequestBundlingResponseItem): Uint8Array => encoder.encode(`${JSON.stringify(item)}\n`);

        void (async () => {
            const buffer: RequestBundlingResponseItem[] = [];
            let bufferedBytes = 0;
            let flushTimer: ReturnType<typeof setTimeout> | null = null;

            const flush = () => {
                if (flushTimer !== null) {
                    clearTimeout(flushTimer);
                    flushTimer = null;
                }
                if (buffer.length === 0) return;

                const items = buffer.splice(0, buffer.length);
                bufferedBytes = 0;

                for (const item of items) {
                    try {
                        controller.enqueue(encodeItem(item));
                    } catch {
                        return;
                    }
                }
            };

            const scheduleFlush = () => {
                if (buffer.length >= config.flushCount || bufferedBytes >= config.flushBytes) {
                    flush();
                    return;
                }

                if (flushTimer === null) {
                    flushTimer = setTimeout(flush, config.flushMs);
                }
            };

            const enqueueResponse = (item: RequestBundlingResponseItem) => {
                const encoded = encodeItem(item);
                buffer.push(item);
                bufferedBytes += encoded.length;
                scheduleFlush();
            };

            const dispatchOne = async (req: RequestBundlingRequestItem) => {
                const subUrl = req.url.startsWith("http://") || req.url.startsWith("https://") ? req.url : `${origin}${req.url}`;

                if (subUrl.endsWith("/api/request_bundling")) {
                    enqueueResponse({
                        clientRequestId: req.clientRequestId,
                        status: 400,
                        body: null,
                        error: "Nested /api/request_bundling requests are not allowed",
                    });
                    return;
                }

                const headers = new Headers();
                headers.set("Content-Type", "application/json");
                for (const [key, value] of Object.entries(req.headers)) {
                    if (typeof value === "string") {
                        headers.set(key, value);
                    }
                }
                if (authorizationHeader) headers.set("Authorization", authorizationHeader);
                if (apiKeyHeader) headers.set("X-API-Key", apiKeyHeader);
                if (cookieHeader) headers.set("Cookie", cookieHeader);

                try {
                    const startedAt = Date.now();
                    const serverTimeoutMs = computeServerTimeoutMs(req, config);
                    const serverMayTakeUntil = new Date(startedAt + serverTimeoutMs).toISOString();

                    const responseOrTimeout = await withTimeout(fetch(subUrl, {
                        method: req.method,
                        headers,
                        body: req.body ?? undefined,
                    }), serverTimeoutMs);

                    if (typeof responseOrTimeout === "symbol") {
                        enqueueResponse({
                            clientRequestId: req.clientRequestId,
                            status: 504,
                            body: null,
                            error: `Timed out while waiting for server response after ${serverTimeoutMs} ms`,
                            signal: "timeout",
                            mayHaveExecuted: true,
                            serverMayTakeUntil,
                        });
                        return;
                    }

                    const response = responseOrTimeout;

                    let body: unknown = null;
                    if (response.status !== 204) {
                        const contentType = response.headers.get("content-type") ?? "";
                        if (contentType.includes("application/json")) {
                            try {
                                body = await response.json();
                            } catch {
                                body = null;
                            }
                        } else {
                            body = await response.text();
                        }
                    }

                    if (!response.ok && bundlingDebug) {
                        console.warn(`[api/request_bundling] sub-request ${response.status}`, {
                            method: req.method,
                            url: subUrl,
                            requestBody: req.body,
                            responseBody: body,
                        });
                    }

                    enqueueResponse({
                        clientRequestId: req.clientRequestId,
                        status: response.status,
                        body,
                        ...(response.ok ? {} : { error: extractErrorMessage(body, `HTTP ${response.status}`) }),
                        serverMayTakeUntil,
                    });
                } catch (error) {
                    if (devMode) console.error(`[api/request_bundling] sub-request failed for ${req.clientRequestId}:`, error);
                    enqueueResponse({
                        clientRequestId: req.clientRequestId,
                        status: 500,
                        body: null,
                        error: error instanceof Error ? error.message : "Internal error",
                        serverMayTakeUntil: new Date(Date.now() + computeServerTimeoutMs(req, config)).toISOString(),
                    });
                }
            };

            // Sub-requests are executed sequentially, in request order (the documented
            // semantic): each sub-request is awaited before the next starts, so ordering
            // assumptions like create-then-update within one batch hold. Per-request results
            // are still streamed as NDJSON as each completes.
            for (const req of requests) {
                await dispatchOne(req);
            }
            flush();

            try {
                controller.close();
            } catch {
                // Ignore close errors for disconnected clients.
            }
        })().catch((error) => {
            if (devMode) console.error("[api/request_bundling] unexpected stream error:", error);
            try {
                controller.close();
            } catch {
                // Ignore close errors for disconnected clients.
            }
        });

        return new Response(stream, {
            status: 200,
            headers: {
                "Content-Type": "application/x-ndjson",
                "Cache-Control": "no-store",
                "X-Accel-Buffering": "no",
            },
        });
    }, {
        response: {
            200: Type.Any({ description: "NDJSON stream where each line is the result of one sub-request: clientRequestId, status, body or error, optional signal/mayHaveExecuted, and serverMayTakeUntil." }),
            400: ErrorResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
        },
        detail: {
            tags: ["Request Bundling"],
            summary: "Execute multiple mutating API requests in a single streamed request bundling call",
            description: "Submit a batch of mutating API requests (POST, PUT, PATCH, DELETE) to be executed sequentially. Responses are streamed back as NDJSON (newline-delimited JSON) for real-time processing. Supports automatic retry with duplicate detection via clientRequestId. API key authentication headers are forwarded to all sub-requests. Note: nested bundling requests are rejected.",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication. Forwarded to all sub-requests.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
            ],
        },
    });
}
