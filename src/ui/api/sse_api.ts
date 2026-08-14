// noinspection JSUnusedGlobalSymbols
import { ApiError, extractErrorMessage } from "./errors.ts";
import { triggerLoginRedirect } from "./session.ts";
import type { TagExpression } from "../../types/PubSubType";

const BASE_OPTIONS: RequestInit = { credentials: "same-origin" };

/**
 * Build the SSE stream URL.
 *
 * No query parameters are used – complex TagExpression objects cannot be
 * serialized as a CSV query string. Expression seeding happens via PATCH.
 */
export function buildServerSentEventsStreamUrl(): string {
    return new URL("/api/server_sent_events/stream", window.location.origin).toString();
}

/**
 * Replace the expression filter for the current session on the server.
 * Authentication is derived from the session cookie, so no clientId is needed.
 */
export async function syncServerSentEventExpressions(expressions: readonly (TagExpression | string)[]): Promise<void> {
    // This mutation intentionally bypasses request bundling (the only sanctioned exception):
    // the SSE expression filter must apply immediately and independently of the batching queue
    // so the stream filter always matches the local subscription state.
    const response = await fetch("/api/server_sent_events/expressions", {
        ...BASE_OPTIONS,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expressions }),
    });

    let parsed: unknown = null;
    if (response.status !== 204) {
        try {
            parsed = await response.json();
        } catch {
            parsed = null;
        }
    }

    if (response.status === 401) {
        triggerLoginRedirect();
        throw new ApiError(401, extractErrorMessage(parsed, "Unauthorized"));
    }

    if (!response.ok) {
        throw new ApiError(response.status, extractErrorMessage(parsed, `HTTP ${response.status}`));
    }
}
