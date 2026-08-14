/**
 * Central environment-variable parsing for the server.
 *
 * This module is the single place where `Bun.env` is read for process configuration.
 * Every parsed accessor below preserves the exact parse semantics (defaults, `"1"`-means-true
 * flags, throw-on-missing `DATABASE_URL`) that the previously scattered `process.env` reads had.
 *
 * Modules must import from here instead of reading `Bun.env`/`process.env` directly.
 */

const envValue = (name: string): string | undefined => {
    const value = Bun.env[name];
    return value === undefined || value === "" ? undefined : value;
};

/** Port the HTTP server binds to. Defaults to `8000`. */
export const port: number = Number(envValue("PORT")) || 8000;

/** PostgreSQL connection string. Throws at module load when missing (same as before the centralization). */
export const databaseUrl: string = (() => {
    const value = envValue("DATABASE_URL");
    if (!value) throw Error("DATABASE_URL environment variable is not set. Shutting down.");
    return value;
})();

/** Single source for the advisory-lock default; parsed as `BigInt` when the env var is set. */
export const defaultAdvisoryLockId: bigint = -7482650123549836421n;

/** Advisory lock id used by `initDatabase()`. Defaults to `defaultAdvisoryLockId`. */
export const advisoryLockId: bigint = (() => {
    const value = envValue("ADVISORY_LOCK");
    return value ? BigInt(value) : defaultAdvisoryLockId;
})();

/** Base URL used by the request-bundling endpoint for internal loopback calls; falls back to `http://localhost:${port}` at the call site. */
export const internalApiBaseUrl: string | undefined = envValue("INTERNAL_API_BASE_URL");

/** Enables extra request-bundling debug output when set to `"1"`. */
export const bundlingDebug: boolean = envValue("BUNDLING_DEBUG") === "1";

/** Development mode flag; opt-in via `DEV_MODE=1`. */
export const devMode: boolean = envValue("DEV_MODE") === "1";

/** Canonical production-mode determination: production is the default, dev is opt-in via `DEV_MODE=1`. */
export const isProduction: boolean = !devMode;

/** Enables Drizzle SQL logging when set to `"1"`. */
export const sqlLogging: boolean = envValue("SQL_LOGGING") === "1";

/** Raw `NODE_ENV` value; not load-bearing inside application code. */
export const nodeEnv: string | undefined = envValue("NODE_ENV");

/**
 * Whether `X-Forwarded-Proto`/`X-Forwarded-Host` are trusted (default off).
 * Only enable behind a reverse proxy that terminates TLS and overwrites both headers;
 * see the trusted-proxy configuration section in README.md.
 */
export const trustProxy: boolean = envValue("TRUST_PROXY") === "1";
