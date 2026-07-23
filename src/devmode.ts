/** Application-wide configuration values which must not import application modules. */
export const devMode: boolean = process.env.DEV_MODE === "1";

export const sqlLogging: boolean = process.env.SQL_LOGGING === "1";