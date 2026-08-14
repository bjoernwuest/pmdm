import {TTLMap} from "@/utils/TTLMap.ts";
import {type DBClient} from "@/services/DatabaseDriver.ts";
import {devMode} from "@/devmode.ts";
import {PubSub} from "@/services/PubSub.ts";
import {getConfigEntriesByKey} from "@/repo/ConfigRepo.ts";
import type {Session} from "@/types/AuthType.ts";
import { TAG_CONFIG, TAG_UPSERT } from "@/types/PubSubType";
import { config } from "./authConfig.ts";
import { refreshSession } from "./oidc.ts";

const DEFAULT_SESSION_TIMEOUT = 900;

/**
 * Generate a URL-safe base64 encoded random string.
 */
export function generateSessionId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(256));
    // Convert to base64url
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Session-expiration timeout cache. A runtime edit of SessionExpirationSeconds takes
// effect without restart: the cached timeout (and the session store built with it) is
// dropped on the config-change event. Conservative invalidation: existing sessions
// expire (users log in again).
let sessionTimeOut: undefined | number = undefined;
export async function getSessionTimeOut(db: DBClient): Promise<number> {
    if (!sessionTimeOut) {
        const resp = await getConfigEntriesByKey(db, config.cfgSessionExpirationInSeconds.domain, config.cfgSessionExpirationInSeconds.key);
        const raw = resp[0]?.value;
        if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
            sessionTimeOut = raw;
        } else {
            sessionTimeOut = DEFAULT_SESSION_TIMEOUT;
        }
    }
    return sessionTimeOut;
}

PubSub.subscribe({ and: [TAG_CONFIG, config.cfgSessionExpirationInSeconds.domain, config.cfgSessionExpirationInSeconds.key, TAG_UPSERT] }, () => {
    sessionTimeOut = undefined;
    sessionStore = undefined;
});

/**
 * Represents a session storage mechanism with a Time-To-Live (TTL) expiration policy.
 * Stores key-value pairs and automatically removes entries after the specified TTL duration.
 *
 * @variable {TTLMap} sessionStore
 * @description An instance of TTLMap configured with a TTL of `DEFAULT_SESSION_TIMEOUT`
 *              seconds (runtime-configurable via `SessionExpirationSeconds`). Used for managing
 *              temporary session data that expires after the configured time period.
 */
let sessionStore: undefined | TTLMap<string, Session> = undefined;
export async function getSessionStore(db: DBClient): Promise<TTLMap<string, Session>> {
    if (!sessionStore) { sessionStore = new TTLMap<string, Session>(await getSessionTimeOut(db)); }
    return sessionStore;
}

/**
 * Retrieves a session based on the provided session ID. If the session is expired, it will be removed from the store.
 * If the session is near expiration (within 15 minutes), an attempt will be made to refresh it.
 *
 * @param {DBClient} db - The database client instance used to fetch configuration data.
 * @param {string} sessionId - The unique identifier for the session to retrieve.
 * @return {Promise<Session | undefined>} A promise that resolves to the session object if found and valid,
 * or `undefined` if the session is expired, does not exist, or could not be refreshed.
 */
export async function getSession(db: DBClient, sessionId: string | undefined): Promise<Session | undefined> {
    if (!sessionId) return undefined;
    const session = (await getSessionStore(db)).get(sessionId);
    if (!session) return undefined;

    const now = Date.now();
    if (session.expiresAt && session.expiresAt <= now) {
        (await getSessionStore(db)).delete(sessionId);
        return undefined;
    }

    // If session will expire within next 15 minutes, attempt refresh
    const fifteenMinutesMs = 15 * 60 * 1000;
    if (session.expiresAt && (session.expiresAt - now <= fifteenMinutesMs)) {
        try {
            if (!(await refreshSession(db, sessionId))) {
                (await getSessionStore(db)).delete(sessionId);
                return undefined;
            }
            return (await getSessionStore(db)).get(sessionId);
        } catch (e) {
            if (devMode) console.error("getSession: refresh failed", e);
            (await getSessionStore(db)).delete(sessionId);
            return undefined;
        }
    }

    return session;
}

/**
 * Updates or adds a session in the session store.
 *
 * @param {DBClient} db - The database client used to resolve the backing session store.
 * @param {string} sessionId - The unique identifier for the session to be added or updated.
 * @param {Session} session - The session object containing session-specific data.
 * @return {void} No return value.
 */
export async function putSession(db: DBClient, sessionId: string, session: Session) {
    (await getSessionStore(db)).put(sessionId, session);
}

/**
 * Deletes a session from the session store.
 *
 * @param {DBClient} db - The database client used to resolve the backing session store.
 * @param {string} sessionId - The unique identifier of the session to be deleted.
 * @return {void} This method does not return a value.
 */
export async function deleteSession(db: DBClient, sessionId: string) {
    (await getSessionStore(db)).delete(sessionId);
}
