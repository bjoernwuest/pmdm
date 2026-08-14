import {type DBClient} from "@/services/DatabaseDriver.ts";
import {devMode} from "@/devmode.ts";
import {PubSub} from "@/services/PubSub.ts";
import {type UserSelectType} from "@/types/UserType.ts";
import {getGroupIdsAssignedTo, getGroups, getSystemUser, getUsers} from "@/repo/UserRepo.ts";
import {type FunctionalPermissionSelectType} from "@/types/FunctionalPermissionType.ts";
import {
    getFunctionalPermissions,
    getFunctionalPermissionsOfUser,
    grantFunctionalPermissionToGroup,
    registerFunctionalPermission,
} from "@/repo/FunctionalPermissionRepo.ts";
import {getConfigEntriesByKey, upsertConfigEntry} from "@/repo/ConfigRepo.ts";
import {FunctionalPermissionNames} from "@/ui/auth/functional_permissions.ts";
import { TAG_CONFIG, TAG_UPSERT } from "@/types/PubSubType";
import { config } from "./authConfig.ts";
import { getApiKeyPermissions } from "./apiKeys.ts";
import { status } from "elysia";
import type { ElysiaCustomStatusResponse } from "elysia";

/**
 * Retrieves the logged-in user's object from the database using their ID token claims.
 *
 * @param {DBClient} db - The database client used to retrieve the user information.
 * @param {Record<string, any>} idTokenClaims - The set of claims from the user's ID token, including the user identifier (OID).
 * @return {Promise<UserSelectType | undefined>} A promise that resolves to the user object if found, otherwise throws an error.
 * @throws {Error} Throws an error if the OID is missing or invalid in the token claims or if the user is not found.
 */
export async function getLoggedinUserObject(db: DBClient, idTokenClaims: Record<string, any>): Promise<UserSelectType | undefined> {
    const oid = idTokenClaims?.oid;
    if (!oid || typeof oid !== "string") return undefined;
    const users = await getUsers(db, [{ identifier: oid }]);
    if (users.length < 1) throw new Error(`User not found for OID ${oid}`);
    return users[0]!;
}

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
    const { getApiKeyLength, getApiKeyValidityDays } = await import("./authConfig.ts");
    await getApiKeyLength(DBClient);
    await getApiKeyValidityDays(DBClient);
}

const membershipSyncStatus = new Map<string, {succeeded: boolean; lastAttempt: Date; error?: string}>();
export function getMembershipSyncStatus(userId: string): {succeeded: boolean; lastAttempt: Date; error?: string} | undefined {
    return membershipSyncStatus.get(userId);
}

export async function getFunctionalPermissionGrant(db: DBClient): Promise<FunctionalPermissionSelectType> {
    if (!functionalPermission_Grant) await init(db);
    return functionalPermission_Grant!;
}

let cachedRootGroupIdentifier: string | undefined = undefined;

// A runtime edit of RootUserGroup takes effect without restart via config-change invalidation.
PubSub.subscribe({ and: [TAG_CONFIG, config.cfgRootUserGroup.domain, config.cfgRootUserGroup.key, TAG_UPSERT] }, () => {
    cachedRootGroupIdentifier = undefined;
});

async function isMemberOfRootUserGroup(DBClient: DBClient, user: UserSelectType): Promise<boolean> {
    if (cachedRootGroupIdentifier === undefined) {
        const rootUserGroup = await getConfigEntriesByKey(DBClient, config.cfgRootUserGroup.domain, config.cfgRootUserGroup.key, { limit: 1 });
        const rootGroupIdentifier = rootUserGroup[0]?.value;
        cachedRootGroupIdentifier = typeof rootGroupIdentifier === "string" && rootGroupIdentifier.length > 0 ? rootGroupIdentifier : "";
    }
    if (cachedRootGroupIdentifier.length === 0) return false;

    const memberships = await getGroupIdsAssignedTo(DBClient, [{ identifier: user.identifier }]);
    const assignedGroupIds = memberships.get(user.identifier) ?? [];
    return assignedGroupIds.some((group) => group.identifier === cachedRootGroupIdentifier);
}

/**
 * Retrieves the functional permissions of the currently logged-in user based on the provided tokens.
 *
 * @param {DBClient} DBClient - The database client to execute queries.
 * @param {Record<string, any>} tokens - A record containing authentication tokens, including the user's OAUTH token.
 * @return {Promise<FunctionalPermissionSelectType[]>} A promise that resolves to an array of functional permissions for the user.
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
        // Bearer-token requests carry no group claims; permission resolution for bearer
        // tokens is intentionally not supported (see SPEC-001). Returning no permissions.
        return [];
    }
}

/**
 * Validates and filters a list of functional permissions based on the user's actual permissions.
 *
 * @param {DBClient} DBClient - The database client used to fetch the user's permissions.
 * @param {Record<string, any>} tokens - A collection of tokens or identifiers associated with the user.
 * @param {FunctionalPermissionSelectType[] | FunctionalPermissionSelectType} permissions - A single permission or a list of permissions to validate against the user's permissions.
 * @return {Promise<FunctionalPermissionSelectType[]>} A promise that resolves to an array of validated functional permissions that match the provided permissions.
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

export type PermissionCheckResult =
    | { ok: true; authz: FunctionalPermissionSelectType[] }
    | { ok: false; denial: ElysiaCustomStatusResponse<403, { error: string }, 403> };

/**
 * Shared "resolve claims → authorize() → deny with 403" sequence for route handlers.
 *
 * Authorizes against `requiredPermissions` (all must be granted); `additionalGrantedPermissions`,
 * if given, are also requested from `authorize` but not required — their granted subset is
 * available in the result's `authz` for conditional response shaping.
 *
 * @return An `ok: true` result carrying the granted permissions, or an `ok: false` result
 *         carrying a ready-to-return 403 response naming the required permissions.
 */
export async function requirePermissions(
    dbClient: DBClient,
    claims: Record<string, any>,
    requiredPermissions: FunctionalPermissionSelectType[],
    additionalGrantedPermissions?: FunctionalPermissionSelectType[],
): Promise<PermissionCheckResult> {
    const authz = await authorize(dbClient, claims, [
        ...requiredPermissions,
        ...(additionalGrantedPermissions ?? []),
    ]);
    const granted = requiredPermissions.every((required) => authz.some((p) => p.identifier === required.identifier));
    if (!granted) {
        return {
            ok: false,
            denial: status(403, { error: `Permission denied. Required: ${requiredPermissions.map((p) => p.functionalPermissionName).join(", ")}` }),
        };
    }
    return { ok: true, authz };
}
