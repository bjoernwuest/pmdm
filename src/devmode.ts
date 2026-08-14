/**
 * Re-export of the central env module (`src/services/Env.ts`), kept so existing
 * import sites of `devMode`/`sqlLogging` stay valid. `Env.ts` itself has no
 * application-module imports, so this re-export cannot create a circular dependency.
 */
export { devMode, sqlLogging } from "@/services/Env.ts";

export const sqlLogging: boolean = process.env.SQL_LOGGING === "1";

/** Enables client-side debug console logging when set to "1". Exposed via /api/me/context. */
export const debugFrontend: boolean = process.env.DEBUG_FRONTEND === "1";