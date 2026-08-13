import type { ApiInstance } from "@/apps/api.ts";
import { sse, status } from "elysia";
import { Type } from "@sinclair/typebox";
import {
    disconnectServerSentEventFilter,
    getKnownTags,
    nextServerSentEvent,
    updateServerSentEventClientExpressions,
    upsertServerSentEventFilter,
} from "@/services/ServerSentEvents.ts";
import {
    SseExpressionsUpdateBodySchema,
    SseExpressionFilterStateSchema,
    SseKnownTagsResponseSchema,
} from "@/types/ServerSentEventsType.ts";

/**
 * Derive a stable session key from the request's auth context.
 *
 * - API key sessions: `api_key:<apiKeyIdentifier claim>`
 * - Session fallback: `session_user:<oid claim>`
 *
 * The key is opaque to the browser so the browser never needs to manage it.
 * Using the SessionID (or oid) as key ensures that reconnecting with the
 * same credentials restores the previously synced expression filter.
 */
function deriveSseKey(_request: Request, tokenClaims: Record<string, any> | undefined): string | null {
    const apiKeyIdentifier = tokenClaims?.apiKeyIdentifier;
    if (typeof apiKeyIdentifier === "string" && apiKeyIdentifier.length > 0) return `api_key:${apiKeyIdentifier}`;

    const oid = tokenClaims?.oid;
    if (typeof oid === "string" && oid.length > 0) return `session_user:${oid}`;

    return null;
}

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    /**
     * GET /api/server_sent_events/stream
     *
     * Opens an SSE stream for the authenticated session. The session key is
     * derived server-side from the API key context – the browser
     * does not need to supply a clientId. If the browser reconnects (same
     * credentials) an existing expression filter is preserved.
     */
    app.get("/server_sent_events/stream", async function* ({ request, tokenClaims }) {
        const sessionKey = deriveSseKey(request, tokenClaims);
        if (!sessionKey) {
            yield sse({ event: "error", data: { message: "Could not derive session key" } });
            return;
        }

        // Expressions are seeded via PATCH; on reconnect the existing filter is preserved.
        const filter = upsertServerSentEventFilter(sessionKey, {});

        try {
            yield sse({ event: "connected", data: filter.snapshot() });

            while (true) {
                const next = await nextServerSentEvent(sessionKey, request.signal, 25_000);
                if (next === null) break;
                if ("kind" in next && next.kind === "heartbeat") {
                    yield sse({ event: "keepalive", data: { ts: new Date().toISOString() } });
                    continue;
                }

                yield sse({ event: "pubsub", data: next });
            }
        } finally {
            // Preserve the expression filter for reconnects – only disconnect, never destroy.
            disconnectServerSentEventFilter(sessionKey);
        }
    }, {
        detail: {
            tags: ["Realtime"],
            summary: "Open an SSE stream for PubSub notifications",
            description: "Opens an authenticated SSE stream. The session key is derived server-side from the API key context. Expression filters are preserved across short disconnections so mobile clients can reconnect without re-syncing. Emits: connected, keepalive, pubsub.",
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
        response: {
            200: Type.Any({ description: "SSE stream emitting 'connected', 'keepalive', and 'pubsub' events for the authenticated session." }),
            401: Type.String({ description: "Unauthenticated. No valid session, API key, or bearer token was provided." }),
        },
    });

    /**
     * PATCH /api/server_sent_events/expressions
     *
     * Replaces the expression filter for the calling session. The browser calls this
     * whenever the local PubSub subscription set changes.
     */
    app.patch("/server_sent_events/expressions", async ({ request, tokenClaims, body }) => {
        const sessionKey = deriveSseKey(request, tokenClaims);
        if (!sessionKey) return status(401, "Could not derive session key");

        return status(200, updateServerSentEventClientExpressions(sessionKey, body.expressions));
    }, {
        body: SseExpressionsUpdateBodySchema,
        response: {
            200: SseExpressionFilterStateSchema,
            400: Type.String({ description: "Bad request. The request body or parameters failed validation." }),
            401: Type.String({ description: "Unauthenticated. No valid session, API key, or bearer token was provided." }),
        },
        detail: {
            tags: ["Realtime"],
            summary: "Update SSE expression filter for the current session",
            description: "Replaces the server-side expression filter for the calling session. The session key is derived from API key authentication context – the browser never has to manage a clientId. Uninterested events are dropped before reaching the stream.",
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

    /**
     * GET /api/server_sent_events/tags
     *
     * Returns the names of all tags that have been seen by the server-side
     * PubSub bridge since the process started. Useful for the browser to
     * discover which tags exist before constructing subscription expressions.
     */
    app.get("/server_sent_events/tags", () => {
        return { tags: getKnownTags() };
    }, {
        response: {
            200: SseKnownTagsResponseSchema,
            401: Type.String({ description: "Unauthenticated. No valid session, API key, or bearer token was provided." }),
        },
        detail: {
            tags: ["Realtime"],
            summary: "List all known PubSub tag names",
            description: "Returns all tag names that have passed through the server-side PubSub bridge since startup. This endpoint is read-only and requires authentication. The list grows monotonically and is reset on process restart.",
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
}
