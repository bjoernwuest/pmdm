import type { RequestBundlingSignal } from "@/types/RequestBundlingType.ts";

/** Additional metadata attached to `ApiError` instances. */
export interface ApiErrorOptions {
    /** Non-HTTP signal associated with the failure, such as timeout. */
    signal?: RequestBundlingSignal;
    /** Whether the mutation may still have been executed server-side. */
    mayHaveExecuted?: boolean;
    /** Client-side timeout deadline represented as an ISO timestamp. */
    clientMayTakeUntil?: string;
    /** Server-side timeout deadline represented as an ISO timestamp. */
    serverMayTakeUntil?: string;
}

/**
 * Error type thrown by UI API helpers for HTTP and request-bundling failures.
 */
export class ApiError extends Error {
    /** HTTP status code (or HTTP-like status) associated with this error. */
    readonly status: number;
    /** Optional non-HTTP signal that further qualifies the failure. */
    readonly signal?: RequestBundlingSignal;
    /** Indicates whether the request may have executed despite failure. */
    readonly mayHaveExecuted: boolean;
    /** Client timeout deadline for this request, if available. */
    readonly clientMayTakeUntil?: string;
    /** Server timeout deadline for this request, if available. */
    readonly serverMayTakeUntil?: string;

    /** Creates an API error with status, message, and optional request metadata. */
    constructor(status: number, message: string, options: ApiErrorOptions = {}) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.signal = options.signal;
        this.mayHaveExecuted = options.mayHaveExecuted ?? false;
        this.clientMayTakeUntil = options.clientMayTakeUntil;
        this.serverMayTakeUntil = options.serverMayTakeUntil;
    }
}

