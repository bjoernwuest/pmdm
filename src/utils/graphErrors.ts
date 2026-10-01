/**
 * Stringifies a Graph error body of unknown shape. Graph errors expose `body` either as an
 * object or as a raw JSON string (as returned by the Graph SDK), so both must be handleable.
 */
function stringifyBody(body: unknown): string {
    if (body == null) return "";
    if (typeof body === "string") return body;
    try {
        return JSON.stringify(body);
    } catch {
        return "";
    }
}

/**
 * Returns true when a Microsoft Graph error means the stored delta token (deltaLink) can no
 * longer be used and a full synchronization is required.
 *
 * Covers:
 *  - 410 Gone / SyncStateNotFound — invalidated delta token
 *  - 400 Bad Request / Request_UnsupportedQuery with "DeltaLink older than 30 days" —
 *    Graph discards delta tokens after 30 days
 *
 * @param error The error thrown by the Microsoft Graph client.
 * @return True when the stored delta token has expired and a full sync must be performed.
 */
export function isDeltaTokenExpiredError(error: unknown): boolean {
    if (error == null || typeof error !== "object") return false;
    const e = error as { statusCode?: unknown; code?: unknown; message?: unknown; body?: unknown };
    const statusCode = typeof e.statusCode === "number" ? e.statusCode : undefined;
    const code = typeof e.code === "string" ? e.code : undefined;

    if (statusCode === 410 && code === "SyncStateNotFound") return true;

    if (statusCode === 400 && code === "Request_UnsupportedQuery") {
        const message = typeof e.message === "string" ? e.message : "";
        const text = `${message} ${stringifyBody(e.body)}`.toLowerCase();
        return text.includes("deltalink older than 30 days");
    }

    return false;
}
