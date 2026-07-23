import type { RequestBundlingClientRuntimeConfig, RequestBundlingMethod, RequestBundlingRequestItem, RequestBundlingResponseItem } from "@/types/RequestBundlingType.ts";
import { ApiError } from "./errors.ts";
import { triggerLoginRedirect } from "./session.ts";

const FALLBACK_CLIENT_CONFIG: RequestBundlingClientRuntimeConfig = {
    maxAgeMs: 250,
    maxBytes: 1_024 * 1_024,
    maxRequests: 10,
    defaultExpectedProcessingMs: 15_000,
    defaultTimeoutMs: 45_000,
};

let clientConfig: RequestBundlingClientRuntimeConfig = FALLBACK_CLIENT_CONFIG;
let clientConfigLoadPromise: Promise<void> | null = null;

/** Promise handlers and timeout metadata tracked for one queued request. */
interface PendingEntry {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timeoutId: ReturnType<typeof setTimeout>;
    clientMayTakeUntil: string;
}

const inflightMap = new Map<string, PendingEntry>();
let queue: RequestBundlingRequestItem[] = [];
let queueBytes = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;
let requestSequence = 0;

function normalizeClientConfig(candidate: unknown): RequestBundlingClientRuntimeConfig {
    if (!candidate || typeof candidate !== "object") return FALLBACK_CLIENT_CONFIG;

    const value = candidate as Partial<RequestBundlingClientRuntimeConfig>;
    const positive = (input: unknown, fallback: number): number => {
        if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
        const rounded = Math.round(input);
        return rounded > 0 ? rounded : fallback;
    };

    return {
        maxAgeMs: positive(value.maxAgeMs, FALLBACK_CLIENT_CONFIG.maxAgeMs),
        maxBytes: positive(value.maxBytes, FALLBACK_CLIENT_CONFIG.maxBytes),
        maxRequests: positive(value.maxRequests, FALLBACK_CLIENT_CONFIG.maxRequests),
        defaultExpectedProcessingMs: positive(value.defaultExpectedProcessingMs, FALLBACK_CLIENT_CONFIG.defaultExpectedProcessingMs),
        defaultTimeoutMs: positive(value.defaultTimeoutMs, FALLBACK_CLIENT_CONFIG.defaultTimeoutMs),
    };
}

async function ensureClientConfigLoaded(): Promise<void> {
    if (clientConfigLoadPromise) {
        await clientConfigLoadPromise;
        return;
    }

    clientConfigLoadPromise = (async () => {
        try {
            const response = await fetch("/api/request_bundling/config", {
                method: "GET",
                credentials: "same-origin",
            });

            if (response.status === 401) {
                triggerLoginRedirect();
                return;
            }

            if (!response.ok) return;
            const payload = await response.json();
            clientConfig = normalizeClientConfig(payload);
        } catch {
            // Keep fallback values when the config endpoint is unavailable.
        }
    })();

    await clientConfigLoadPromise;
}

/** Creates a unique client correlation id for each queued mutation. */
function nextRequestId(): string {
    requestSequence += 1;
    return `${Date.now()}-${requestSequence}`;
}

/** Roughly estimates serialized byte size for queue-flush threshold checks. */
function estimateBytes(item: RequestBundlingRequestItem): number {
    const headersBytes = Object.entries(item.headers).reduce((sum, [key, value]) => sum + key.length + value.length, 0);
    return item.clientRequestId.length + item.url.length + (item.body?.length ?? 0) + item.clientMayTakeUntil.length + headersBytes + 64;
}

/** Clears any pending queue flush timer. */
function clearFlushTimer(): void {
    if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
}

/**
 * Clears and returns a pending request entry.
 * Also cancels its client timeout timer.
 */
function clearPendingEntry(clientRequestId: string): PendingEntry | undefined {
    const pending = inflightMap.get(clientRequestId);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    inflightMap.delete(clientRequestId);
    return pending;
}

/** Resolves or rejects one pending request based on a streamed response item. */
function resolveResponse(item: RequestBundlingResponseItem): void {
    const pending = clearPendingEntry(item.clientRequestId);
    if (!pending) return;

    if (item.status === 401) {
        triggerLoginRedirect();
        pending.reject(new ApiError(401, item.error ?? "Unauthorized", {
            signal: item.signal,
            mayHaveExecuted: item.mayHaveExecuted,
            clientMayTakeUntil: pending.clientMayTakeUntil,
            serverMayTakeUntil: item.serverMayTakeUntil,
        }));
        return;
    }

    if (item.signal === "timeout") {
        pending.reject(new ApiError(item.status, item.error ?? "Request bundling timed out", {
            signal: item.signal,
            mayHaveExecuted: item.mayHaveExecuted ?? true,
            clientMayTakeUntil: pending.clientMayTakeUntil,
            serverMayTakeUntil: item.serverMayTakeUntil,
        }));
        return;
    }

    if (item.error || item.status >= 400) {
        const message = item.error ?? `HTTP ${item.status}`;
        pending.reject(new ApiError(item.status, message, {
            signal: item.signal,
            mayHaveExecuted: item.mayHaveExecuted,
            clientMayTakeUntil: pending.clientMayTakeUntil,
            serverMayTakeUntil: item.serverMayTakeUntil,
        }));
        return;
    }

    pending.resolve(item.body);
}

/** Rejects pending promises for the provided request items with a generated error. */
function rejectPendingByIds(
    requestItems: RequestBundlingRequestItem[],
    createError: (item: RequestBundlingRequestItem, pending: PendingEntry) => unknown,
): void {
    for (const item of requestItems) {
        const pending = clearPendingEntry(item.clientRequestId);
        if (!pending) continue;
        pending.reject(createError(item, pending));
    }
}

/** Sends one batch to `/api/request_bundling` and resolves streamed sub-responses. */
async function sendRequestBundling(requests: RequestBundlingRequestItem[]): Promise<void> {
    const requestIds = requests.map((item) => item.clientRequestId);

    try {
        const response = await fetch("/api/request_bundling", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requests }),
        });

        if (!response.ok || !response.body) {
            rejectPendingByIds(requests, (item, pending) => new ApiError(response.status, `Request bundling failed: HTTP ${response.status}`, {
                mayHaveExecuted: response.status >= 500,
                clientMayTakeUntil: pending.clientMayTakeUntil,
            }));
            return;
        }

        const respondedIds = new Set<string>();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIdx = buffer.indexOf("\n");
            while (newlineIdx !== -1) {
                let line = buffer.slice(0, newlineIdx);
                buffer = buffer.slice(newlineIdx + 1);

                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (line.length > 0) {
                    try {
                        const item = JSON.parse(line) as RequestBundlingResponseItem;
                        respondedIds.add(item.clientRequestId);
                        resolveResponse(item);
                    } catch {
                        // Keep malformed frames isolated to a single line.
                    }
                }

                newlineIdx = buffer.indexOf("\n");
            }
        }

        buffer += decoder.decode();
        let trailing = buffer;
        if (trailing.endsWith("\r")) trailing = trailing.slice(0, -1);

        if (trailing.length > 0) {
            try {
                const item = JSON.parse(trailing) as RequestBundlingResponseItem;
                respondedIds.add(item.clientRequestId);
                resolveResponse(item);
            } catch {
                // Ignore one malformed trailing frame.
            }
        }

        for (const id of requestIds) {
            if (respondedIds.has(id)) continue;
            const pending = clearPendingEntry(id);
            if (!pending) continue;
            pending.reject(new ApiError(502, `Missing request bundling response for request ${id}`, {
                clientMayTakeUntil: pending.clientMayTakeUntil,
            }));
        }
    } catch (error) {
        rejectPendingByIds(requests, () => error);
    }
}

/** Flushes the queue and sends requests in FIFO batches while avoiding re-entrancy. */
async function flushQueue(): Promise<void> {
    clearFlushTimer();
    if (isFlushing) return;
    if (queue.length === 0) return;

    isFlushing = true;
    try {
        while (queue.length > 0) {
            const requests = queue.splice(0, queue.length);
            queueBytes = 0;
            await sendRequestBundling(requests);
        }
    } finally {
        isFlushing = false;
    }
}

/** Schedules queue flush based on age, size, and count thresholds. */
function scheduleFlush(): void {
    if (queue.length >= clientConfig.maxRequests || queueBytes >= clientConfig.maxBytes) {
        void flushQueue();
        return;
    }

    if (flushTimer === null) {
        flushTimer = setTimeout(() => {
            void flushQueue();
        }, clientConfig.maxAgeMs);
    }
}

/** Optional controls for request bundling behavior per mutation call. */
export interface RequestBundlingOptions {
    /** Extra headers merged into the bundled sub-request headers. */
    extraHeaders?: Record<string, string>;
    /** Client processing-time hint sent to the server in milliseconds. */
    expectedProcessingMs?: number;
    /** Client timeout in milliseconds for waiting on the bundled sub-response. */
    timeoutMs?: number;
}

/**
 * Enqueues a mutating request into the request-bundling queue.
 * Returns a promise that resolves when its streamed response frame arrives.
 */
export function enqueueRequestBundledMutation<T>(
    method: RequestBundlingMethod,
    url: string,
    body: unknown,
    options: RequestBundlingOptions = {},
): Promise<T> {
    return ensureClientConfigLoaded().then(() => {
        const bodyString = body === undefined || body === null ? null : JSON.stringify(body);
        const clientExpectedProcessingMs = Math.max(1, Math.round(options.expectedProcessingMs ?? clientConfig.defaultExpectedProcessingMs));
        const clientTimeoutMs = Math.max(1, Math.round(options.timeoutMs ?? clientConfig.defaultTimeoutMs));
        const clientMayTakeUntil = new Date(Date.now() + clientTimeoutMs).toISOString();

        const item: RequestBundlingRequestItem = {
            clientRequestId: nextRequestId(),
            method,
            url,
            body: bodyString,
            headers: {
                "Content-Type": "application/json",
                ...(options.extraHeaders ?? {}),
            },
            clientExpectedProcessingMs,
            clientTimeoutMs,
            clientMayTakeUntil,
        };

        return new Promise<T>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                const pending = clearPendingEntry(item.clientRequestId);
                if (!pending) return;

                pending.reject(new ApiError(504, `Request timed out on the client after ${clientTimeoutMs} ms`, {
                    signal: "timeout",
                    mayHaveExecuted: true,
                    clientMayTakeUntil: pending.clientMayTakeUntil,
                }));
            }, clientTimeoutMs);

            inflightMap.set(item.clientRequestId, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timeoutId,
                clientMayTakeUntil,
            });

            queue.push(item);
            queueBytes += estimateBytes(item);
            scheduleFlush();
        });
    });
}
