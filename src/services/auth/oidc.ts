import {TTLMap} from "@/utils/TTLMap.ts";
import {type DBClient, runInTransaction} from "@/services/DatabaseDriver.ts";
import {devMode} from "@/devmode.ts";
import * as oidcClient from "openid-client";
import {
    getGraphClient,
    fetchMemberships,
    applyMemberships
} from "@/services/EntraIDSync.ts";
import {PubSub} from "@/services/PubSub.ts";
import {upsertUsers} from "@/repo/UserRepo.ts";
import { TAG_AUTH_SESSION, TAG_LOGIN, TAG_LOGOUT, TAG_AFTER } from "@/types/PubSubType";
import type {Session} from "@/types/AuthType.ts";
import {buildDeleteCookieHeader, buildSetCookieHeader, getCookie, type CookieOptions} from "./cookies.ts";
import {loadOIDCConfig} from "./authConfig.ts";
import {deleteSession, generateSessionId, getSessionStore, getSessionTimeOut, putSession} from "./sessions.ts";

export interface AuthStartResult {
    redirectUrl: string;
    cookies: string[];
}
export interface AuthFinishResult {
    success: boolean;
    redirectUrl: string;
    cookies: string[];
    error?: string;
    session?: Session;
    sessionId?: string;
}
export interface LogoutResult {
    redirectUrl: string;
    cookies: string[];
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

/** Helper function that actually performs the session refresh.
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
        response_type: "code",
        scope: "openid profile email offline_access",
        client_id: conf.client_id,
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
        maxAge: 60 * 10, // Cookie lifetime in seconds: 10 minutes, matching the short-lived OIDC code_verifier exchange window.
    };

    const cookies = [
        buildSetCookieHeader("oidc_code_verifier", code_verifier, cookieOptions),
        buildSetCookieHeader("oidc_state", state, cookieOptions),
        buildSetCookieHeader("oidc_nonce", nonce, cookieOptions),
        buildSetCookieHeader("auth_return_to", returnTo || "/", cookieOptions),
    ];

    return {
        redirectUrl: authorizationUrl.toString(),
        cookies,
    };
}

/**
 * Completes the authentication process after the OIDC provider redirects back.
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
        const oid = typeof claims.oid === "string" ? claims.oid : "";
        const firstName = typeof claims.given_name === "string" ? claims.given_name : "";
        const lastName = typeof claims.family_name === "string" ? claims.family_name : "";
        const email = typeof claims.email === "string"
            ? claims.email
            : (typeof claims.preferred_username === "string" ? claims.preferred_username : "");

        const graphClient = getGraphClient(db);
        const { memberIdsByKey, failedKeys } = await fetchMemberships(graphClient, [{ identifier: oid }], true);
        await runInTransaction(db, async (tx) => {
            await upsertUsers(tx, [{
                identifier: oid,
                firstName,
                lastName,
                email,
                disabled: false
            }]);
            await applyMemberships(tx, [{ identifier: oid }], memberIdsByKey, true, failedKeys);
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

    // Redirect to the originally requested path with a returnTo recovery parameter
    const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/";
    const redirectUrl = `${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(safeReturnTo)}`;

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
