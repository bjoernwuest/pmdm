/** Application-wide configuration values which must not import application modules. */
export const devMode: boolean = process.env.DEV_MODE === "1";

export const sqlLogging: boolean = process.env.SQL_LOGGING === "1";

/** Enables client-side debug console logging when set to "1". Exposed via /api/me/context. */
export const debugFrontend: boolean = process.env.DEBUG_FRONTEND === "1";