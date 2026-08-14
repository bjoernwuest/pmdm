/**
 * Facade over the auth service modules (`src/services/auth/*`).
 *
 * Kept so existing import paths keep working; new code should import from the
 * specific sub-modules:
 * - `auth/cookies.ts` — cookie helpers (`getCookie`, `buildSetCookieHeader`, `buildDeleteCookieHeader`, `CookieOptions`)
 * - `auth/authConfig.ts` — the auth `config` export, API-key defaults, OIDC config loading
 * - `auth/sessions.ts` — session store, `getSession`, `putSession`, `deleteSession`, `generateSessionId`
 * - `auth/oidc.ts` — `startAuth`, `finishAuth`, `logout`, `refreshSession`, `validateBearerToken`
 * - `auth/apiKeys.ts` — `validateApiKey`, `ApiKeyAuthContext`
 * - `auth/permissions.ts` — `authorize`, `requirePermissions`, `getMyFunctionalPermissions`, `init`, `getLoggedinUserObject`, `getFunctionalPermissionGrant`, `getMembershipSyncStatus`
 */

export { type CookieOptions, getCookie, buildSetCookieHeader, buildDeleteCookieHeader } from "./auth/cookies.ts";
export { config, getApiKeyLength, getApiKeyValidityDays, loadOIDCConfig } from "./auth/authConfig.ts";
export { getSession, putSession, deleteSession, generateSessionId } from "./auth/sessions.ts";
export { type AuthStartResult, type AuthFinishResult, type LogoutResult, startAuth, finishAuth, logout, refreshSession, validateBearerToken } from "./auth/oidc.ts";
export { type ApiKeyAuthContext, validateApiKey } from "./auth/apiKeys.ts";
export {
    type PermissionCheckResult,
    authorize,
    requirePermissions,
    getMyFunctionalPermissions,
    init,
    getLoggedinUserObject,
    getFunctionalPermissionGrant,
    getMembershipSyncStatus,
} from "./auth/permissions.ts";
