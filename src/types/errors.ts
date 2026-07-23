/**
 * Custom error classes for structured error handling.
 *
 * These replace fragile string-based error classification (e.g.,
 * `e.message?.includes("Permission denied")`) with `instanceof` checks,
 * decoupling the API layer from exact repo-layer error strings.
 */

export class PermissionDeniedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PermissionDeniedError";
    }
}

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
    }
}
