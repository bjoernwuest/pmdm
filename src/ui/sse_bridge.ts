import { buildServerSentEventsStreamUrl } from "@/ui/api/index.ts";
import { publishSync } from "./pubsub.ts";

let eventSource: EventSource | null = null;
let unloadListenerRegistered = false;

function parseEnvelope(raw: string): { tags: string[]; data: unknown } | null {
    try {
        const parsed = JSON.parse(raw) as { tags?: unknown; data?: unknown };
        if (!Array.isArray(parsed.tags)) return null;
        return { tags: parsed.tags as string[], data: parsed.data };
    } catch {
        return null;
    }
}

function handlePubSubEvent(event: MessageEvent<string>): void {
    const envelope = parseEnvelope(event.data);
    if (!envelope) return;
    publishSync(envelope.tags, envelope.data);
}

export function startServerSentEventsBridge(): EventSource {
    if (eventSource) return eventSource;

    // The URL no longer includes ?topics= – expressions are synced via PATCH.
    const url = buildServerSentEventsStreamUrl();
    eventSource = new EventSource(url);

    eventSource.addEventListener("pubsub", handlePubSubEvent as EventListener);
    eventSource.addEventListener("connected", () => undefined);
    eventSource.addEventListener("keepalive", () => undefined);

    if (!unloadListenerRegistered && typeof window !== "undefined") {
        unloadListenerRegistered = true;
        window.addEventListener("beforeunload", () => {
            stopServerSentEventsBridge();
        });
    }

    return eventSource;
}

export function stopServerSentEventsBridge(): void {
    if (!eventSource) return;
    eventSource.close();
    eventSource = null;
}
