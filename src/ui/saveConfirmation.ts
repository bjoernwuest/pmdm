import { subscribe, unsubscribe } from "@/ui/pubsub";
import type { TagExpression, PubSubMessage } from "@/types/PubSubType";
import { ApiError } from "@/ui/api/errors";

export type SaveConfirmationWinner = "pubsub" | "server" | "timeout";

export interface SaveConfirmationOptions {
    /** PubSub expression awaited for confirmation. */
    pubsubExpression: TagExpression;
    /** Given a matching PubSub message, return the confirmed (value, updatedAt) or undefined when irrelevant. */
    confirmFromPubSub: (msg: PubSubMessage) => Promise<{ value: string; updatedAt: string } | undefined>;
    /**
     * Timeout fallback refetch. Per the preserved behavior of the extracted call sites,
     * the refetched value is never applied (the latch resolves first); the result only
     * decides which timeout outcome callback runs.
     */
    confirmFromRefetch: () => Promise<{ value: string; updatedAt: string } | undefined>;
    /** The mutation itself; resolves with the fresh value + updatedAt, or rejects (ApiError on 409). */
    mutate: () => Promise<{ value: string; updatedAt: string }>;
    /** First-stream-wins success application (guarded once by the helper). */
    onSuccess: (value: string, updatedAt: string, winner: SaveConfirmationWinner) => void;
    /** Runs after the timeout refetch produced a confirmation (value not applied — preserved behavior). */
    onTimeoutResolved?: () => void;
    /** Runs when the timeout refetch failed or produced no confirmation. */
    onTimeoutFailure?: () => void;
    /** Runs on a 409 conflict when nothing else resolved. */
    onConflict?: () => void;
    /** Runs on any other mutation error when nothing else resolved; receives the error. */
    onOtherError?: (err: unknown) => void;
    /** Timeout in milliseconds (default 1000). */
    timeoutMs?: number;
}

/**
 * The shared "three-stream race" save helper: await confirmation via PubSub event,
 * server response, or timeout-fallback refetch — first stream wins, guarded by a
 * `resolved` latch, with 409 conflict surfacing. Timeout (default 1000 ms), cleanup
 * ordering, and conflict semantics are defined once here and identical for all callers.
 *
 * Preserved behavior of the extracted call sites: the timeout stream claims the latch
 * before its refetch completes, so the refetched value is never applied — it only
 * triggers the caller's timeout outcome callbacks.
 */
export async function runSaveWithConfirmation(options: SaveConfirmationOptions): Promise<void> {
    let resolved = false;
    const timeoutMs = options.timeoutMs ?? 1000;

    let pubsubToken: string | false = false;

    const finalize = (value: string, updatedAt: string, winner: SaveConfirmationWinner): void => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timerId);
        if (pubsubToken) unsubscribe(pubsubToken);
        options.onSuccess(value, updatedAt, winner);
    };

    // Stream 1: PubSub
    pubsubToken = subscribe(options.pubsubExpression, (msg: PubSubMessage) => {
        void options.confirmFromPubSub(msg).then((confirmed) => {
            if (confirmed) finalize(confirmed.value, confirmed.updatedAt, "pubsub");
        }).catch(() => undefined);
    });

    // Stream 2: Timer (fallback re-fetch). The latch is claimed first, so the refetched
    // value is discarded by design (preserved from the extracted implementations).
    const timerId = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        if (pubsubToken) unsubscribe(pubsubToken);

        void options.confirmFromRefetch().then((confirmed) => {
            if (confirmed) {
                options.onTimeoutResolved?.();
            } else {
                options.onTimeoutFailure?.();
            }
        }).catch(() => {
            options.onTimeoutFailure?.();
        });
    }, timeoutMs);

    // Stream 3: Server
    try {
        const response = await options.mutate();
        if (!resolved) {
            finalize(response.value, response.updatedAt, "server");
        }
    } catch (err: unknown) {
        clearTimeout(timerId);
        if (pubsubToken) unsubscribe(pubsubToken);

        if (err instanceof ApiError && err.status === 409) {
            if (resolved) return;
            options.onConflict?.();
        } else if (!resolved) {
            options.onOtherError?.(err);
        }
    }
}
