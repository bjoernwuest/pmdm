import {TTLMap} from "@/utils/TTLMap.ts";
import {type DBClient, getDatabaseConnection, runInTransaction} from "@/services/DatabaseDriver.ts";
import {getConfigEntriesByKey, upsertConfigEntry} from "@/repo/ConfigRepo.ts";
import {devMode} from "@/devmode.ts";
import * as oidcClient from "openid-client";
import {
    getEntraIDClientId,
    getEntraIDClientSecret,
    getEntraIDTenantId,
    getGraphClient,
    membershipSync
} from "@/services/EntraIDSync.ts";
import {PubSub} from "./PubSub.ts";
import {type UserSelectType} from "@/types/UserType.ts";
import {getGroupIdsAssignedTo, getGroups, getSystemUser, getUsers, upsertUsers} from "@/repo/UserRepo.ts";
import {type FunctionalPermissionSelectType} from "@/types/FunctionalPermissionType.ts";
import {
    getFunctionalPermissions,
    getFunctionalPermissionsOfUser,
    grantFunctionalPermissionToGroup,
    registerFunctionalPermission,
} from "@/repo/FunctionalPermissionRepo.ts";
import {getFunctionalPermissionsOfApiKey, validateApiKeySecret,} from "@/repo/ApiKeyRepo.ts";
import {FunctionalPermissionNames} from "@/ui/auth/functional_permissions.ts";
import {type ConfigEntrySelectType, ConfigValueTypes} from "@/types/ConfigType.ts";
import { TAG_AUTH_SESSION, TAG_LOGIN, TAG_LOGOUT, TAG_API_KEY, TAG_UPDATE, TAG_AFTER } from "@/types/PubSubType";
import type {Session} from "@/types/AuthType.ts";

// ====================================================================================================================
// Elysia-compatible cookie helpers
// ====================================================================================================================

export interface CookieOptions {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
    maxAge?: number;
    domain?: string;
}

/**
 * Get a cookie value from the request.
 */
export function getCookie(request: Request, name: string): string | undefined {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return undefined;

    const cookies = cookieHeader.split(";").map(c => c.trim());
    for (const cookie of cookies) {
        const [key, ...valueParts] = cookie.split("=");
        if (key === name) {
            return decodeURIComponent(valueParts.join("="));
        }
    }
    return undefined;
}

/**
 * Build a Set-Cookie header value.
 */
export function buildSetCookieHeader(name: string, value: string, options: CookieOptions = {}): string {
    let cookie = `${name}=${encodeURIComponent(value)}`;

    if (options.path) cookie += `; Path=${options.path}`;
    if (options.maxAge !== undefined) cookie += `; Max-Age=${options.maxAge}`;
    if (options.domain) cookie += `; Domain=${options.domain}`;
    if (options.httpOnly) cookie += "; HttpOnly";
    if (options.secure) cookie += "; Secure";
    if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;

    return cookie;
}

/**
 * Build a Set-Cookie header to delete a cookie.
 */
export function buildDeleteCookieHeader(name: string, options: CookieOptions = {}): string {
    return buildSetCookieHeader(name, "", { ...options, maxAge: 0 });
}

/**
 * Generate a URL-safe base64 encoded random string.
 */
function generateSessionId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(256));
    // Convert to base64url
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}


// ====================================================================================================================
// Config
// ====================================================================================================================

const DEFAULT_SESSION_TIMEOUT = 900;
const DEFAULT_API_KEY_LENGTH = 256;
const DEFAULT_API_KEY_VALIDITY_DAYS = 90;

export const config = {
    cfgRootUserGroup: { domain: "Authentication and Authorization", key: "RootUserGroup", description: "The object identifier of the user group whose members shall have superuser permissions. Superusers have the permission to grant permissions. They do not get any other permission, unless configured otherwise. Other user groups can be granted permissions if required. Thus, this group is meant to bootstrap the permission system.", type: ConfigValueTypes.string, value: undefined, formatRegex: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", inputFormat: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", outputFormat: "", editInUI: true, mandatoryForStart: true, userProfile: false},
    cfgSessionExpirationInSeconds: { domain: "Authentication and Authorization", key: "SessionExpirationSeconds", description: "The idle lifetime of an interactive session in seconds. Any user interaction resets this timer; once exceeded the user is logged out (default 900).", type: ConfigValueTypes.number, value: DEFAULT_SESSION_TIMEOUT, formatRegex: "^[1-9][0-9]*$", inputFormat: "^[1-9][0-9]*$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false},
    cfgApiKeyLength: { domain: "Authentication and Authorization", key: "ApiKeyLength", description: "Length of newly generated API keys. Minimum 32, maximum 256. Default 256.", type: ConfigValueTypes.number, value: DEFAULT_API_KEY_LENGTH, formatRegex: "^(3[2-9]|[4-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-6])$", inputFormat: "^(3[2-9]|[4-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-6])$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false},
    cfgApiKeyValidityDays: { domain: "Authentication and Authorization", key: "ApiKeyValidityDays", description: "Default API key validity in days. Minimum 1, maximum 730. Default 90.", type: ConfigValueTypes.number, value: DEFAULT_API_KEY_VALIDITY_DAYS, formatRegex: "^([1-9]|[1-9][0-9]|[1-6][0-9]{2}|7[0-2][0-9]|730)$", inputFormat: "^([1-9]|[1-9][0-9]|[1-6][0-9]{2}|7[0-2][0-9]|730)$", outputFormat: "", editInUI: true, mandatoryForStart: false, userProfile: false},
} satisfies Record<string, ConfigEntrySelectType>;

let sessionTimeOut : undefined | number = undefined;
async function getSessionTimeOut(db: DBClient): Promise<number> {
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

export async function getApiKeyLength(db: DBClient): Promise<number> {
    const resp = await getConfigEntriesByKey(db, config.cfgApiKeyLength.domain, config.cfgApiKeyLength.key, { limit: 1 });
    if (resp.length < 1) {
        await upsertConfigEntry(db, { ...config.cfgApiKeyLength, value: DEFAULT_API_KEY_LENGTH });
        return DEFAULT_API_KEY_LENGTH;
    }
    const candidate = Number(resp[0]?.value ?? DEFAULT_API_KEY_LENGTH);
    if (!Number.isFinite(candidate)) return DEFAULT_API_KEY_LENGTH;
    return Math.min(256, Math.max(32, Math.floor(candidate)));
}

export async function getApiKeyValidityDays(db: DBClient): Promise<number> {
    const resp = await getConfigEntriesByKey(db, config.cfgApiKeyValidityDays.domain, config.cfgApiKeyValidityDays.key, { limit: 1 });
    if (resp.length < 1) {
        await upsertConfigEntry(db, { ...config.cfgApiKeyValidityDays, value: DEFAULT_API_KEY_VALIDITY_DAYS });
        return DEFAULT_API_KEY_VALIDITY_DAYS;
    }
    const candidate = Number(resp[0]?.value ?? DEFAULT_API_KEY_VALIDITY_DAYS);
    if (!Number.isFinite(candidate)) return DEFAULT_API_KEY_VALIDITY_DAYS;
    return Math.min(730, Math.max(1, Math.floor(candidate)));
}

// ====================================================================================================================
// Session management
// ====================================================================================================================

/**
 * Represents a session storage mechanism with a Time-To-Live (TTL) expiration policy.
 * Stores key-value pairs and automatically removes entries after the specified TTL duration.
 *
 * @variable {TTLMap} sessionStore
 * @description An instance of TTLMap configured with a TTL of 900 seconds. Used for managing
 *              temporary session data that expires after the specified time period.
 */
let sessionStore: undefined | TTLMap<string, Session> = undefined;
async function getSessionStore(db: DBClient): Promise<TTLMap<string, Session>> {
    if (!sessionStore) { sessionStore = new TTLMap<string, Session>(await getSessionTimeOut(db)); }
    return sessionStore;
}

/**
 * Retrieves a session based on the provided session ID. If the session is expired, it will be removed from the store.
 * If the session is near expiration (within 15 minutes), an attempt will be made to refresh it.
 *
 * @param {DBClient} db - The database client instance used to fetch configuration data.
 * @param {string} sessionId - The unique identifier for the session to retrieve.
 * @return {Promise<Session | undefined>} A promise that resolves to the session object if it exists and is valid,
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
async function putSession(db: DBClient, sessionId: string, session: Session) {
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


// ====================================================================================================================
// OIDC Auth Flow Functions (Elysia-compatible)
// ====================================================================================================================


/**
 * Represents the configuration object for OpenID Connect (OIDC) authentication.
 *
 * This variable is typically used to store configuration settings such as client ID,
 * client secret, issuer URL, and other parameters required for initializing and
 * managing OIDC authentication.
 *
 * The specific structure and content of `oidcConfig` depend on the requirements
 * of the OIDC provider and the library or framework being used.
 *
 * By default, the value is set to `undefined` and must be assigned a valid
 * configuration object before use.
 */
let oidcConfig: {
    issuer: URL;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
} | undefined = undefined;

/**
 * Loads and returns the configuration object for OIDC (OpenID Connect) authentication.
 * This method fetches data such as the issuer, client ID, client secret, and redirect URI from a database,
 * and constructs the OIDC configuration only if it has not already been initialized.
 *
 * @param {DBClient} db - The database client instance used to fetch configuration data.
 * @return {Promise<Object>} Resolves to an object containing the OIDC configuration, including keys such as
 *         `issuer`, `client_id`, `client_secret`, and `redirect_uri`.
 */
async function loadOIDCConfig(db: DBClient) {
    if (!oidcConfig) {
        oidcConfig = {
            issuer: new URL(`https://login.microsoftonline.com/${await getEntraIDTenantId(db)}/v2.0`),
            client_id: await getEntraIDClientId(db),
            client_secret: await getEntraIDClientSecret(db),
            redirect_uri: "/login/oauth2/code/entraid",
        };
    }
    return oidcConfig;
}

/** Tracks in-flight refresh operations keyed by session id (see refreshSession). */
let inFlightRefreshes: undefined | TTLMap<string, Promise<boolean>> = undefined;
async function getInFlightRefreshes(db: DBClient): Promise<TTLMap<string, Promise<boolean>>> {
    if (!inFlightRefreshes) inFlightRefreshes = new TTLMap<string, Promise<boolean>>(await getSessionTimeOut(db) * 4);
    return inFlightRefreshes;
}

/**
 * Refreshes the session associated with the given session ID by attempting to use the refresh token.
 * Updates the session with new token information if successful, or deletes the session if the refresh fails.
 *
 * @param {DBClient} db - The database client instance used to fetch configuration data.
 * @param {string} sessionID - The unique identifier for the session to be refreshed.
 * @return {Promise<boolean>} A Promise that resolves to `true` if the session was successfully refreshed, or `false` otherwise.
 */
export async function refreshSession(db: DBClient, sessionID: string): Promise<boolean> {
    const existing = (await getInFlightRefreshes(db)).get(sessionID);
    if (existing) return existing;
    const p = doRefreshSession(db, sessionID).finally(async () => (await getInFlightRefreshes(db)).delete(sessionID));
    (await getInFlightRefreshes(db)).put(sessionID, p);
    return p;
}

/** Helper function to actually do the refresh sessin
 *
 * @param db
 * @param sessionID
 */
async function doRefreshSession(db: DBClient, sessionID: string): Promise<boolean> {
    const session = (await getSessionStore(db)).get(sessionID);
    if (!session || !session.refreshToken) return false;

    const conf = await loadOIDCConfig(db);
    const discovered = await oidcClient.discovery(conf.issuer, conf.client_id, conf.client_secret);
    try {
        const tokens = await oidcClient.refreshTokenGrant(discovered, session.refreshToken, { client_secret: conf.client_secret });
        const newClaims = tokens.id_token ? tokens.claims() : undefined;
        const newSession: Session = {
            ...session,
            idTokenRaw: tokens.id_token || session.idTokenRaw,
            idTokenClaims: newClaims || session.idTokenClaims,
            refreshToken: tokens.refresh_token || session.refreshToken,
            expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
        };

        await putSession(db, sessionID, newSession);
        return true;
    } catch (e) {
        if (devMode) console.error("Session refresh failed", e);
        return false;
    }
}

/**
 * Validates a bearer token (JWT) from EntraID using openid-client.
 * Also checks token expiry to prevent use of expired tokens.
 *
 * @param {DBClient} db - The database client instance used to fetch configuration data.
 * @param {string} token - The bearer token to validate.
 * @return {Promise<Record<string, any> | undefined>} A promise that resolves to the token claims if valid, or undefined if invalid.
 */
export async function validateBearerToken(db: DBClient, token: string): Promise<Record<string, any> | undefined> {
    try {
        const conf = await loadOIDCConfig(db);
        const discovered = await oidcClient.discovery(conf.issuer, conf.client_id, conf.client_secret);

        // Validate the token using token introspection endpoint
        const result = await oidcClient.tokenIntrospection(discovered, token);

        // Check if token is active
        // TokenIntrospection endpoint will return active: false if token is expired
        if (result.active) {
            return result as Record<string, any>;
        }

        if (devMode) console.warn("Bearer token is inactive (expired or revoked)");
        return undefined;
    } catch (error) {
        if (devMode) console.error("Bearer token validation failed:", error);
        return undefined;
    }
}

export interface ApiKeyAuthContext {
    apiKeyIdentifier: string;
    createdBy: string;
    claims: Record<string, any>;
}

export async function validateApiKey(db: DBClient, apiKeySecret: string): Promise<ApiKeyAuthContext | undefined> {
    const apiKey = await validateApiKeySecret(db, apiKeySecret);
    if (!apiKey) return undefined;
    return {
        apiKeyIdentifier: apiKey.identifier,
        createdBy: apiKey.createdBy,
        claims: {
            oid: apiKey.createdBy,
            apiKeyIdentifier: apiKey.identifier,
            authType: "apiKey",
        },
    };
}

interface AuthStartResult {
    redirectUrl: string;
    cookies: string[];
}
/**
 * Initiates the authentication process using OIDC (OpenID Connect).
 *
 * This method prepares the necessary parameters (e.g., state, nonce, PKCE code challenge)
 * and builds the authorization URL to trigger user authorization. It also generates cookies
 * to store intermediate session data for the authentication flow.
 *
 * @param {DBClient} db - The database client instance used to fetch configuration data.
 * @param {string} requestUrl - The base URL of the request, used to resolve the redirect URI.
 * @param {string} [returnTo] - Optional URL to redirect to after the authentication process is completed.
 * @return {Promise<AuthStartResult>} A promise that resolves to an object containing the authorization URL and cookies to be set.
 */
export async function startAuth(db: DBClient, requestUrl: string, returnTo?: string): Promise<AuthStartResult> {
    const conf = await loadOIDCConfig(db);
    const discovered = await oidcClient.discovery(conf.issuer, conf.client_id, conf.client_secret);

    // Resolve redirect_uri to absolute URL
    const redirect_uri = new URL(conf.redirect_uri, requestUrl).toString();

    const code_verifier = oidcClient.randomPKCECodeVerifier();
    const code_challenge = await oidcClient.calculatePKCECodeChallenge(code_verifier);
    const state = oidcClient.randomState();
    const nonce = oidcClient.randomNonce();

    const authorizationUrl = oidcClient.buildAuthorizationUrl(discovered, {
        redirect_uri,
        scope: "openid profile email offline_access",
        code_challenge,
        code_challenge_method: "S256",
        state,
        nonce,
    });

    const cookieOptions: CookieOptions = {
        httpOnly: true,
        secure: !devMode,
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 10, // FIXME: review meaning (I think it means 10 minutes lifetime?
    };

    const cookies = [
        buildSetCookieHeader("oidc_code_verifier", code_verifier, cookieOptions),
        buildSetCookieHeader("oidc_state", state, cookieOptions),
        buildSetCookieHeader("oidc_nonce", nonce, cookieOptions),
        buildSetCookieHeader("auth_return_to", returnTo || "/", cookieOptions),
    ];

    return {
        redirectUrl: authorizationUrl.href,
        cookies,
    };
}

interface AuthFinishResult {
    success: boolean;
    redirectUrl: string;
    cookies: string[];
    session?: Session;
    sessionId?: string;
    error?: string;
}
/**
 * Completes the authentication process by handling OpenID Connect (OIDC) authorization code flow.
 * Validates necessary cookies, exchanges authorization code for tokens, and establishes a session.
 *
 * @param {DBClient} db - The database client instance used to fetch configuration data.
 * @param {Request} request - The HTTP request object containing the OIDC callback and cookies.
 * @param {string} _redirectPage - Reserved for future redirect customization.
 * @return {Promise<AuthFinishResult>} A promise that resolves to an object indicating the success or failure
 * of the authentication process, the redirect URL, associated cookies, and session details if successful.
 */
export async function finishAuth(db: DBClient, request: Request, _redirectPage: string): Promise<AuthFinishResult> {
    const code_verifier = getCookie(request, "oidc_code_verifier");
    const state = getCookie(request, "oidc_state");
    const nonce = getCookie(request, "oidc_nonce");

    if (!code_verifier || !state || !nonce) {
        if (devMode) console.error("Missing OIDC cookies");
        return {
            success: false,
            redirectUrl: "/login?error=missing_cookies",
            cookies: [],
            error: "missing_cookies",
        };
    }

    const conf = await loadOIDCConfig(db);
    const discovered = await oidcClient.discovery(conf.issuer, conf.client_id, conf.client_secret);

    let tokens: oidcClient.TokenEndpointResponse & oidcClient.TokenEndpointResponseHelpers;
    try {
        tokens = await oidcClient.authorizationCodeGrant(discovered, new URL(request.url), {
            pkceCodeVerifier: code_verifier,
            expectedState: state,
            expectedNonce: nonce,
            idTokenExpected: true,
        });
    } catch (e) {
        if (devMode) console.error("OIDC Authorization Code Grant failed", e);
        return {
            success: false,
            redirectUrl: "/login?error=grant_failed",
            cookies: [],
            error: "grant_failed",
        };
    }

    const claims = tokens.id_token ? tokens.claims() : undefined;

    if (!claims) {
        if (devMode) console.error("No claims in ID Token");
        return {
            success: false,
            redirectUrl: "/login?error=no_claims",
            cookies: [],
            error: "no_claims",
        };
    }

    // CRITICAL: 'oid' is required. 'groups' claim is optional because:
    // - Microsoft Graph may not include it (not configured in Optional Claims)
    // - EntraIDSync will fetch groups via Graph API on login (more reliable)
    // - Fallback: if groups are in token, they can be used for faster sync
    if (!claims.oid || typeof claims.oid !== "string") {
        if (devMode) console.error("Missing or invalid 'oid' claim");
        return {
            success: false,
            redirectUrl: "/login?error=missing_oid_claim",
            cookies: [],
            error: "missing_oid_claim",
        };
    }

    const sessionId = generateSessionId();
    const session: Session = {
        idTokenRaw: tokens.id_token || undefined,
        idTokenClaims: claims,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    };

    await putSession(db, sessionId, session);

    const returnTo = getCookie(request, "auth_return_to") || "/";

    // CRITICAL: Synchronize user and group memberships BEFORE returning the session.
    // This ensures that:
    // 1. The user exists in the database when getLoggedinUserObject() is called later
    // 2. Group memberships are synced so Root User Group checks work correctly
    // 3. Authorization checks have the correct data immediately after login
    // If sync fails, we fail the login completely rather than proceeding with an incomplete user record.
    try {
        await runInTransaction(db, async (tx) => {
            const oid = typeof claims.oid === "string" ? claims.oid : "";
            const firstName = typeof claims.given_name === "string" ? claims.given_name : "";
            const lastName = typeof claims.family_name === "string" ? claims.family_name : "";
            const email = typeof claims.email === "string"
                ? claims.email
                : (typeof claims.preferred_username === "string" ? claims.preferred_username : "");

            const graphClient = getGraphClient(tx);
            await upsertUsers(tx, [{
                identifier: oid,
                firstName,
                lastName,
                email,
                disabled: false
            }]);
            await membershipSync(graphClient, tx, [{ identifier: oid }], true);
        });
    } catch (syncError) {
        if (devMode) console.error("Failed to synchronize user and memberships on login:", syncError);
        // CRITICAL: Fail the login if sync fails. The user must be in the database
        // for authorization checks to work correctly. Without this, root group membership
        // checks will silently fail and users without explicit permissions won't have access.
        return {
            success: false,
            redirectUrl: "/login?error=sync_failed",
            cookies: [],
            error: "sync_failed",
        };
    }

    // Redirect to loading page with target path parameter
    const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/";
    const redirectUrl = `${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}target=${encodeURIComponent(safeReturnTo)}`;

    const cookies = [
        buildDeleteCookieHeader("oidc_code_verifier", { path: "/" }),
        buildDeleteCookieHeader("oidc_state", { path: "/" }),
        buildDeleteCookieHeader("oidc_nonce", { path: "/" }),
        buildDeleteCookieHeader("auth_return_to", { path: "/" }),
        buildSetCookieHeader("SessionID", sessionId, {
            httpOnly: true,
            secure: !devMode,
            sameSite: "Lax",
            path: "/",
        }),
    ];

    PubSub.publish([TAG_AUTH_SESSION, TAG_LOGIN, TAG_AFTER], { session });

    return {
        success: true,
        redirectUrl: redirectUrl,
        cookies,
        session,
        sessionId,
    };
}

interface LogoutResult {
    redirectUrl: string;
    cookies: string[];
}
/**
 * Logs out the user by terminating the current session, removing the session cookie, and redirecting to the appropriate logout URL.
 *
 * @param {DBClient} db The database client instance used to fetch configuration data.
 * @param {Request} request The HTTP request object containing the session details and the URL context for processing the logout.
 * @return {Promise<LogoutResult>} A promise that resolves to an object containing the logout redirect URL and the headers for deleting cookies.
 */
export async function logout(db: DBClient, request: Request): Promise<LogoutResult> {
    const sessionId = getCookie(request, "SessionID");
    let logoutUrl = "/";

    if (sessionId) {
        const session = (await getSessionStore(db)).get(sessionId);
        if (session) {
            try {
                const conf = await loadOIDCConfig(db);
                const discovered = await oidcClient.discovery(conf.issuer, conf.client_id, conf.client_secret);

                if (discovered.serverMetadata().end_session_endpoint) {
                    const url = new URL(discovered.serverMetadata().end_session_endpoint!);
                    const logoutRedirect = new URL("/", conf.redirect_uri ?? request.url).origin.toString();
                    url.searchParams.set("post_logout_redirect_uri", logoutRedirect);
                    if (session.idTokenRaw) url.searchParams.set("id_token_hint", session.idTokenRaw);
                    logoutUrl = url.toString();
                }
            } catch (e) { if (devMode) console.error("Logout: failed to build logout URL", e); }
        }
        await deleteSession(db, sessionId);

        PubSub.publish([TAG_AUTH_SESSION, TAG_LOGOUT, TAG_AFTER], { session });
    }

    return {
        redirectUrl: logoutUrl,
        cookies: [buildDeleteCookieHeader("SessionID", { path: "/" })],
    };
}


// ====================================================================================================================
// User and Permission helpers
// ====================================================================================================================

/**
 * Retrieves the logged-in user's object from the database using their ID token claims.
 *
 * @param {DBClient} db - The database client used to retrieve the user information.
 * @param {Record<string, any>} idTokenClaims - The set of claims from the user's ID token, including the user identifier (OID).
 * @return {Promise<UserType>} A promise that resolves to the user object if found, otherwise throws an error.
 * @throws {Error} Throws an error if the OID is missing or invalid in the token claims or if the user is not found.
 */
export async function getLoggedinUserObject(db: DBClient, idTokenClaims: Record<string, any>): Promise<UserSelectType | undefined> {
    const oid = idTokenClaims?.oid;
    if (!oid || typeof oid !== "string") return undefined;
    const users = await getUsers(db, [{ identifier: oid }]);
    if (users.length < 1) throw new Error(`User not found for OID ${oid}`);
    return users[0]!;
}


// ====================================================================================================================
// Functional permissions - register functional permissions in /src/services/auth/functional_perms.ts
// ====================================================================================================================

// In-memory cache for user functional permissions.
const userFunctionalPermissionsCache = new TTLMap<string, Set<FunctionalPermissionSelectType>>(900);
type ApiKeyPermissionCacheEntry = { permissions: FunctionalPermissionSelectType[]; expiresAt: number };
const apiKeyFunctionalPermissionsCache = new TTLMap<string, ApiKeyPermissionCacheEntry>(24 * 60 * 60);
// Functional permission for granting permissions to other groups.
let functionalPermission_Grant: FunctionalPermissionSelectType | undefined = undefined;

export async function init(DBClient: DBClient): Promise<void> {
    // Ensure config rows exist (seed with defaults on first run)
    for (const entry of Object.values(config)) {
        const existing = await getConfigEntriesByKey(DBClient, entry.domain, entry.key, { limit: 1 });
        if (existing.length < 1) await upsertConfigEntry(DBClient, entry);
    }

    // Register a functional permission for granting permissions to other groups.
    functionalPermission_Grant = await registerFunctionalPermission(DBClient, { functionalPermissionName: FunctionalPermissionNames.GRANT_FUNCTIONAL_PERMISSIONS, description: "Users with this privilege can grant functional permissions to groups.", group: "System" });
    // Get user group permitted to grant permissions.
    const rootUserGroup = await getConfigEntriesByKey(DBClient, config.cfgRootUserGroup.domain, config.cfgRootUserGroup.key);
    if (0 < rootUserGroup?.length) {
        // If root user group exists, grant superuser permissions to it.
        const groups = await getGroups(DBClient, [{identifier: rootUserGroup[0]!.value as string}]);
        if (0 < groups?.length) await grantFunctionalPermissionToGroup(DBClient, await getSystemUser(DBClient), groups[0]!, [functionalPermission_Grant]);
    }

    // Ensure optional API key runtime settings are persisted for UI editing.
    await getApiKeyLength(DBClient);
    await getApiKeyValidityDays(DBClient);
}

/**
 * Helper to track membership synchronization status during login.
 * Used for debugging and reporting when sync fails silently.
 * @type {Map<string, {succeeded: boolean; lastAttempt: Date; error?: string}>}
 * @private
 */
const membershipSyncStatus = new Map<string, {succeeded: boolean; lastAttempt: Date; error?: string}>();

export function getMembershipSyncStatus(userId: string): {succeeded: boolean; lastAttempt: Date; error?: string} | undefined {
    return membershipSyncStatus.get(userId);
}

/**
 * Retrieves the functional permission grant; if it does not exist yet, initializes it using the database connection.
 *
 * @param {DBClient} db - The database connection to use for initialization.
 * @return {Promise<FunctionalPermissionType>} A promise that resolves to the functional permission grant.
 */
export async function getFunctionalPermissionGrant(db?: DBClient): Promise<FunctionalPermissionSelectType> {
    if (!functionalPermission_Grant) await init(db ? db : getDatabaseConnection());
    return functionalPermission_Grant!;
}

async function isMemberOfRootUserGroup(DBClient: DBClient, user: UserSelectType): Promise<boolean> {
    const rootUserGroup = await getConfigEntriesByKey(DBClient, config.cfgRootUserGroup.domain, config.cfgRootUserGroup.key, { limit: 1 });
    const rootGroupIdentifier = rootUserGroup[0]?.value;
    if (typeof rootGroupIdentifier !== "string" || rootGroupIdentifier.length === 0) return false;

    const memberships = await getGroupIdsAssignedTo(DBClient, [{ identifier: user.identifier }]);
    const assignedGroupIds = memberships.get(user.identifier) ?? [];
    return assignedGroupIds.some((group) => group.identifier === rootGroupIdentifier);
}

// Clear cached functional permissions when user logs out
PubSub.subscribe({ and: [TAG_AUTH_SESSION, TAG_LOGOUT] }, (msg) => {
    const session = msg.data;
    if (session?.idTokenClaims?.oid) userFunctionalPermissionsCache.delete(session.idTokenClaims.oid);
});
PubSub.subscribe({ and: [TAG_API_KEY, TAG_UPDATE] }, (msg) => {
    const apiKeyIdentifier = msg.data?.identifiers?.api_key;
    if (typeof apiKeyIdentifier === "string" && apiKeyIdentifier.length > 0) {
        apiKeyFunctionalPermissionsCache.delete(apiKeyIdentifier);
    }
});

async function getApiKeyPermissions(DBClient: DBClient, apiKeyIdentifier: string): Promise<FunctionalPermissionSelectType[]> {
    const now = Date.now();
    const cached = apiKeyFunctionalPermissionsCache.get(apiKeyIdentifier);
    if (cached && cached.expiresAt > now) return cached.permissions;

    const permissions = await getFunctionalPermissionsOfApiKey(DBClient, apiKeyIdentifier);
    apiKeyFunctionalPermissionsCache.put(apiKeyIdentifier, {
        permissions,
        expiresAt: now + 24 * 60 * 60 * 1000,
    });
    return permissions;
}

/**
 * Retrieves the functional permissions of the currently logged-in user based on the provided tokens.
 *
 * @param {DBClient} DBClient - The database client to execute queries.
 * @param {Record<string, any>} tokens - A record containing authentication tokens, including the user's OAUTH token.
 * @return {Promise<FunctionalPermissionType[]>} A promise that resolves to an array of functional permissions for the user.
 */
export async function getMyFunctionalPermissions(DBClient: DBClient, tokens: Record<string, any>): Promise<FunctionalPermissionSelectType[]> {
    if (typeof tokens.apiKeyIdentifier === "string" && tokens.apiKeyIdentifier.length > 0) {
        return await getApiKeyPermissions(DBClient, tokens.apiKeyIdentifier);
    }
    if (tokens.oid) {
        const user = await getLoggedinUserObject(DBClient, tokens);
        if (user) {
            if (await isMemberOfRootUserGroup(DBClient, user)) {
                await getFunctionalPermissionGrant(DBClient);
                return await getFunctionalPermissions(DBClient);
            }
            return await getFunctionalPermissionsOfUser(DBClient, user);
        } else return [];
    }
    else {
        // FIXME: get groups from OAUTH token
        return [];
    }
}

/**
 * Validates and filters a list of functional permissions based on the user's actual permissions.
 *
 * @param {DBClient} DBClient - The database client used to fetch the user's permissions.
 * @param {Record<string, any>} tokens - A collection of tokens or identifiers associated with the user.
 * @param {FunctionalPermissionType[] | FunctionalPermissionType} permissions - A single permission or a list of permissions to validate against the user's permissions.
 * @return {Promise<FunctionalPermissionType[]>} A promise that resolves to an array of validated functional permissions that match the provided permissions.
 */
export async function authorize(DBClient: DBClient, tokens: Record<string, any>, permissions: FunctionalPermissionSelectType[] | FunctionalPermissionSelectType): Promise<FunctionalPermissionSelectType[]> {
    if (!permissions || (Array.isArray(permissions) && 0 === permissions.length)) return [];
    const isApiKeyAuth = typeof tokens.apiKeyIdentifier === "string" && tokens.apiKeyIdentifier.length > 0;
    // Short cut: if user is root user then simply return the requested permissions!
    if (!isApiKeyAuth) {
        try {
            const user = await getLoggedinUserObject(DBClient, tokens);
            if (user && await isMemberOfRootUserGroup(DBClient, user)) return Array.isArray(permissions) ? permissions : [permissions];
        } catch (_) { /* user not found or no OID — fall through to normal check */ }
    }
    const mine = await getMyFunctionalPermissions(DBClient, tokens);
    let result: FunctionalPermissionSelectType[];
    if (Array.isArray(permissions)) {
        const wantedIds = new Set(permissions.map(p => p.identifier));
        result = mine.filter(p => p && wantedIds.has(p.identifier));
    } else result = mine.filter(p => p && p.identifier === permissions.identifier);
    if (devMode) console.log("authorize\n\tRequested:\n", permissions, "\n\tToken:\n", tokens, "\n\tResult:\n", result);
    return result;
}
