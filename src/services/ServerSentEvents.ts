/**
 * Server-side SSE hub for forwarding PubSub events to authenticated browser clients.
 *
 * A "client" here represents the persistent filter state for one authenticated session.
 * The filter survives short disconnections so that a reconnecting mobile browser picks up
 * exactly where it left off without re-sending the expression list.
 */
import {PubSub, expressionMatches} from "./PubSub.ts";
import {devMode} from "@/devmode.ts";
import {
    DEFAULT_MAX_BUFFERED_EVENTS,
    HEARTBEAT_INTERVAL_MS,
    type ServerSentEventClientConfig,
    type ServerSentEventClientSnapshot,
    type ServerSentEventEnvelope,
    STALE_TTL_MS
} from "@/types/ServerSentEventsType.ts";
import type { Tag, TagExpression, PubSubMessage } from "../types/PubSubType";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Per-session filter / queue
// ---------------------------------------------------------------------------

class ServerSentEventFilter {
    private readonly queue: ServerSentEventEnvelope[] = [];
    private waiters: Array<(value: ServerSentEventEnvelope | null) => void> = [];
    private readonly maxBufferedEvents: number;
    private expressions: TagExpression[] = [];
    private readonly createdAt = new Date().toISOString();
    private lastSeenAt = this.createdAt;
    /** null = currently streaming; number = epoch-ms when last disconnected */
    private disconnectedAt: number | null = Date.now();
    private destroyed = false;

    constructor(public readonly sessionKey: string, config: ServerSentEventClientConfig, maxBufferedEvents = DEFAULT_MAX_BUFFERED_EVENTS) {
        this.maxBufferedEvents = maxBufferedEvents;
        if (config.expressions !== undefined) this.setExpressions(config.expressions);
    }

    setExpressions(expressions: readonly TagExpression[]): void {
        this.expressions = [...expressions];
        this.lastSeenAt = new Date().toISOString();
    }

    snapshot(): ServerSentEventClientSnapshot {
        return {
            sessionKey: this.sessionKey,
            expressions: [...this.expressions],
            createdAt: this.createdAt,
            lastSeenAt: this.lastSeenAt,
            streaming: this.disconnectedAt === null,
        };
    }

    /** Returns true if at least one stored expression matches the published tag set. */
    matches(tags: Tag[]): boolean {
        if (this.expressions.length === 0) return false;
        const tagSet = new Set(tags);
        for (const expr of this.expressions) {
            if (expressionMatches(expr, tagSet)) return true;
        }
        return false;
    }

    enqueue(event: ServerSentEventEnvelope): void {
        if (this.destroyed) return;
        this.lastSeenAt = new Date().toISOString();

        const waiter = this.waiters.shift();
        if (waiter) {
            waiter(event);
            return;
        }

        if (this.queue.length >= this.maxBufferedEvents) this.queue.shift();
        this.queue.push(event);
    }

    async next(signal?: AbortSignal, timeoutMs = HEARTBEAT_INTERVAL_MS): Promise<ServerSentEventEnvelope | { kind: "heartbeat" } | null> {
        // Mark as streaming
        this.disconnectedAt = null;

        if (this.queue.length > 0) return this.queue.shift()!;
        if (this.destroyed) return null;

        return await new Promise((resolve) => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout> | undefined;

            const cleanup = () => {
                if (timer !== undefined) clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                const index = this.waiters.indexOf(finish);
                if (index >= 0) this.waiters.splice(index, 1);
            };

            const finish = (value: ServerSentEventEnvelope | null | { kind: "heartbeat" }) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(value as ServerSentEventEnvelope | { kind: "heartbeat" } | null);
            };

            const onAbort = () => finish(null);

            if (signal?.aborted) {
                finish(null);
                return;
            }

            if (timeoutMs > 0) {
                timer = setTimeout(() => finish({ kind: "heartbeat" }), timeoutMs);
            }

            signal?.addEventListener("abort", onAbort, { once: true });
            this.waiters.push(finish);
        });
    }

    /**
     * End the current SSE stream but keep filter and queued events.
     * The filter can be reused when the browser reconnects.
     */
    disconnect(): void {
        this.disconnectedAt = Date.now();
        const pending = this.waiters.splice(0);
        for (const w of pending) w(null);
    }

    /**
     * Permanently destroy this filter. Called only by cleanup.
     */
    close(): void {
        this.destroyed = true;
        this.queue.length = 0;
        const pending = this.waiters.splice(0);
        for (const w of pending) w(null);
    }

    isStale(now: number): boolean {
        return this.disconnectedAt !== null && now - this.disconnectedAt > STALE_TTL_MS;
    }
}

// ---------------------------------------------------------------------------
// Module-level registry
// ---------------------------------------------------------------------------

/** Session-keyed filter registry. Key is derived from auth context by the API layer. */
const clients = new Map<string, ServerSentEventFilter>();

/** Set of every tag string that has ever passed through the PubSub bridge. */
const knownTags = new Set<string>();

let pubsubToken: string | false | undefined;

function ensurePubSubBridge(): void {
    if (pubsubToken !== undefined) return;

    pubsubToken = PubSub.subscribeAll((msg: PubSubMessage) => {
        void Promise.resolve().then(() => {
            for (const tag of msg.tags) {
                knownTags.add(tag);
            }

            const envelope: ServerSentEventEnvelope = {
                tags: msg.tags,
                data: msg.data,
                receivedAt: msg.timestamp,
            };

            for (const filter of clients.values()) {
                if (filter.matches(msg.tags)) filter.enqueue(envelope);
            }
        });
    });

    if (devMode) console.log("SSE: ✅ PubSub bridge subscribed to all server events");
}

ensurePubSubBridge();

// Periodically remove stale disconnected filters.
setInterval(() => {
    const now = Date.now();
    for (const [key, filter] of clients) {
        if (filter.isStale(now)) {
            filter.close();
            clients.delete(key);
            if (devMode) console.log(`SSE: 🧹 Removed stale session filter for ${key}`);
        }
    }
}, 5 * 60 * 1_000).unref();

// ---------------------------------------------------------------------------
// Public API
// noinspection JSUnusedGlobalSymbols
// ---------------------------------------------------------------------------

export function upsertServerSentEventFilter(sessionKey: string, config: ServerSentEventClientConfig): ServerSentEventFilter {
    const existing = clients.get(sessionKey);
    if (existing) {
        if (config.expressions !== undefined) existing.setExpressions(config.expressions);
        return existing;
    }

    const created = new ServerSentEventFilter(sessionKey, config);
    clients.set(sessionKey, created);
    return created;
}

export function updateServerSentEventClientExpressions(sessionKey: string, expressions: readonly TagExpression[]): ServerSentEventClientSnapshot {
    const filter = upsertServerSentEventFilter(sessionKey, { expressions });
    filter.setExpressions(expressions);
    return filter.snapshot();
}

export function getServerSentEventClientSnapshot(sessionKey: string): ServerSentEventClientSnapshot | undefined {
    return clients.get(sessionKey)?.snapshot();
}

/** Gracefully end the stream for this session while preserving the expression filter. */
export function disconnectServerSentEventFilter(sessionKey: string): void {
    clients.get(sessionKey)?.disconnect();
}

/** Permanently destroy the filter for this session (e.g. logout). */
export function removeServerSentEventClient(sessionKey: string): void {
    const filter = clients.get(sessionKey);
    if (!filter) return;
    filter.close();
    clients.delete(sessionKey);
}

export async function nextServerSentEvent(sessionKey: string, signal?: AbortSignal, timeoutMs = HEARTBEAT_INTERVAL_MS): Promise<ServerSentEventEnvelope | { kind: "heartbeat" } | null> {
    const filter = clients.get(sessionKey);
    if (!filter) return null;
    return await filter.next(signal, timeoutMs);
}

/** Returns all tag names that have been seen by the PubSub bridge since startup. */
export function getKnownTags(): string[] {
    return [...knownTags].sort();
}
