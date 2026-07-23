import { enqueueRequestBundledMutation, type RequestBundlingOptions } from "./_request_bundling.ts";
import { ApiError } from "./errors.ts";
import { triggerLoginRedirect } from "./session.ts";

/** Shared fetch options used for same-origin API calls from the UI. */
const BASE_OPTIONS: RequestInit = { credentials: "same-origin" };

/** Parses JSON or text response bodies while handling empty 204 responses. */
async function parseResponseBody(response: Response): Promise<unknown> {
    if (response.status === 204) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        return await response.json();
    }

    return await response.text();
}

/** Pulls a human-readable error message from known response body shapes. */
function extractErrorMessage(body: unknown, fallback: string): string {
    if (body && typeof body === "object") {
        const candidate = body as { message?: unknown; error?: unknown };
        if (typeof candidate.message === "string") return candidate.message;
        if (typeof candidate.error === "string") return candidate.error;
    }

    if (typeof body === "string" && body.length > 0) return body;
    return fallback;
}

/**
 * Executes a single request without request bundling and throws `ApiError` on failure.
 */
async function requestDirect<T>(method: string, url: string, body?: unknown): Promise<T> {
    const response = await fetch(url, {
        ...BASE_OPTIONS,
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const parsed = await parseResponseBody(response);
    if (response.status === 401) {
        triggerLoginRedirect();
        throw new ApiError(401, extractErrorMessage(parsed, "Unauthorized"));
    }

    if (!response.ok) {
        throw new ApiError(response.status, extractErrorMessage(parsed, `HTTP ${response.status}`));
    }

    return parsed as T;
}

/** Sends a GET request and returns the parsed response body. */
export async function apiGet<T>(url: string): Promise<T> {
    return requestDirect<T>("GET", url);
}

/** Enqueues a POST mutation through request bundling. */
export async function apiPost<T>(url: string, body: unknown, options?: RequestBundlingOptions): Promise<T> {
    return await enqueueRequestBundledMutation<T>("POST", url, body, options);
}

/** Enqueues a PUT mutation through request bundling. */
export async function apiPut<T>(url: string, body: unknown, options?: RequestBundlingOptions): Promise<T> {
    return await enqueueRequestBundledMutation<T>("PUT", url, body, options);
}

/** Enqueues a PATCH mutation through request bundling. */
export async function apiPatch<T>(url: string, body: unknown, options?: RequestBundlingOptions): Promise<T> {
    return await enqueueRequestBundledMutation<T>("PATCH", url, body, options);
}

/** Enqueues a DELETE mutation through request bundling. */
export async function apiDelete<T>(url: string, body?: unknown, options?: RequestBundlingOptions): Promise<T> {
    return await enqueueRequestBundledMutation<T>("DELETE", url, body ?? null, options);
}

/** Sends a QUERY request directly to the API. */
export async function apiQuery<T>(url: string, body: unknown): Promise<T> {
    return requestDirect<T>("QUERY", url, body);
}

