import { type Static, Type } from '@sinclair/typebox';
import type { Tag, TagExpression } from './PubSubType';

export interface ServerSentEventEnvelope {
    tags: Tag[];
    data: unknown;
    receivedAt: string;
}

export interface ServerSentEventClientConfig {
    expressions?: readonly TagExpression[];
}

export interface ServerSentEventClientSnapshot {
    /** Session-derived key, opaque to the browser. */
    sessionKey: string;
    expressions: TagExpression[];
    createdAt: string;
    lastSeenAt: string;
    streaming: boolean;
}

export const DEFAULT_MAX_BUFFERED_EVENTS = 100;
export const HEARTBEAT_INTERVAL_MS = 25_000;
/** Stale disconnected filters are removed after this duration (30 min). */
export const STALE_TTL_MS = 30 * 60 * 1_000;

// --- TypeBox schemas for route validation and OpenAPI docs ---

export const SseExpressionsUpdateBodySchema = Type.Object({
    expressions: Type.Array(Type.Any(), { description: "Expression filter entries. An empty array clears the filter for the session." }),
});
export type SseExpressionsUpdateBody = Static<typeof SseExpressionsUpdateBodySchema>;

export const SseExpressionFilterStateSchema = Type.Object({
    sessionKey: Type.String(),
    expressions: Type.Array(Type.Any()),
    createdAt: Type.String(),
    lastSeenAt: Type.String(),
    streaming: Type.Boolean(),
}, { description: "Current SSE expression filter state for the session." });
export type SseExpressionFilterState = Static<typeof SseExpressionFilterStateSchema>;

export const SseKnownTagsResponseSchema = Type.Object({
    tags: Type.Array(Type.String()),
}, { description: "All PubSub tag names seen by the server since process start." });
export type SseKnownTagsResponse = Static<typeof SseKnownTagsResponseSchema>;
