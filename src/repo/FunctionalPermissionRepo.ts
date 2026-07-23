import { type IdentifierType } from "@/types/helpers.ts";
import type { GroupSelectType, UserSelectType } from "@/types/UserType.ts";
import { FunctionalPermission, FunctionalPermissionsOfGroup } from "@/schema/FunctionalPermissionSchema.ts";
import {Group, UserGroup} from "@/schema/UserSchema.ts";
import { devMode } from "@/devmode.ts";
import { and, eq, inArray, sql } from "drizzle-orm";
import type {FunctionalPermissionSelectType, FunctionalPermissionInsertType} from "@/types/FunctionalPermissionType.ts";
import { isFunctionalPermissionName } from "@/ui/auth/functional_permissions.ts";
import PubSub from "@/services/PubSub.ts";
import { TAG_FUNCTIONAL_PERMISSION, TAG_GRANT, TAG_REVOKE, TAG_AFTER } from "../types/PubSubType";

import type {DBClient} from "@/services/DatabaseDriver.ts";

function toValidatedFunctionalPermissionType(permission: unknown): FunctionalPermissionSelectType {
    if (!permission || typeof permission !== "object") {
        throw new Error("Invalid functional permission row: expected object");
    }

    const candidate = permission as FunctionalPermissionSelectType;
    if (!isFunctionalPermissionName(candidate.functionalPermissionName)) {
        throw new Error(`Unknown functional permission name: ${String(candidate.functionalPermissionName)}`);
    }

    return candidate;
}

/**
 * Grants functional permissions to a specified group.
 *
 * This method allows a user to grant a set of functional permissions to the given group.
 *
 * @param {DBClient} DBClient - The database client used to execute the operation. Must be a valid instance.
 * @param {UserType} userGranting - The user granting the permissions. Must include a valid identifier.
 * @param {GroupType} grantTo - The group to which functional permissions will be granted. Must include a valid identifier.
 * @param {FunctionalPermissionType[]} permissions - An array of functional permissions to be granted. Each permission must have a valid identifier.
 * @return {Promise<void>} A promise that resolves when the operation is complete or rejects if an error occurs.
 */
export async function grantFunctionalPermissionToGroup(DBClient: DBClient, userGranting: UserSelectType, grantTo: GroupSelectType | IdentifierType, permissions: FunctionalPermissionSelectType[] | IdentifierType[]) {
    try {
        if (!DBClient) throw new Error('DBClient is required');
        if (!userGranting || !userGranting.identifier) throw new Error('userGranting with identifier is required');
        if (!grantTo || !grantTo.identifier) throw new Error('grantTo with identifier is required');
        if (!Array.isArray(permissions) || permissions.length === 0) return;

        if (devMode) console.log(userGranting, " grants ", permissions, " to ", grantTo);
        await DBClient.insert(FunctionalPermissionsOfGroup).values(permissions.map(p => ({grantedBy: userGranting.identifier, grantedTo: grantTo.identifier, functionalPermissionIdentifier: p.identifier}))).onConflictDoNothing().returning();
        await PubSub.publish([TAG_FUNCTIONAL_PERMISSION, grantTo.identifier, TAG_GRANT, TAG_AFTER], { identifiers: { functional_permission: grantTo.identifier }, userGranting, grantTo, permissions });
    } catch (err) {
        if (devMode) console.error('grantFunctionalPermissionToGroup failed:', err);
        throw err;
    }
}

/**
 * Retrieves the functional permissions of a specified user from the database.
 *
 * @param {DBClient} DBClient - The database client used to interact with the functional permissions data.
 * @param {UserType} user - The user for whom the functional permissions will be retrieved. The user must have a valid identifier.
 * @return {Promise<FunctionalPermissionType[]>} A promise that resolves to an array of functional permissions assigned to the user.
 * @throws Will throw an error if the database client or user with a valid identifier is not provided, or if the query fails.
 */
export async function getFunctionalPermissionsOfUser(DBClient: DBClient, user: UserSelectType | IdentifierType): Promise<FunctionalPermissionSelectType[]> {
    try {
        if (!DBClient) throw new Error('DBClient is required');
        if (!user || !user.identifier) throw new Error('user with identifier is required');

        // Fetch group identifiers for the user
        const groupIds = (await DBClient.select({ groupIdentifier: UserGroup.groupIdentifier }).from(UserGroup).where(eq(UserGroup.userIdentifier, user.identifier))).map(r => r.groupIdentifier).filter(Boolean);
        if (groupIds.length === 0) return [] as FunctionalPermissionSelectType[];

        // Fetch functional_permission identifiers granted to those groups
        const permIds = Array.from(new Set((await DBClient.select({ functionalPermissionIdentifier: FunctionalPermissionsOfGroup.functionalPermissionIdentifier }).from(FunctionalPermissionsOfGroup).where(inArray(FunctionalPermissionsOfGroup.grantedTo, groupIds))).map(r => r.functionalPermissionIdentifier).filter(Boolean)));
        if (permIds.length === 0) return [] as FunctionalPermissionSelectType[];

        // Finally fetch distinct functional permissions by identifier
        return (await DBClient.select().from(FunctionalPermission).where(inArray(FunctionalPermission.identifier, permIds))) as unknown as FunctionalPermissionSelectType[];
    } catch (err) {
        if (devMode) console.error('getFunctionalPermissionsOfUser failed:', err);
        throw err;
    }
}

/**
 * Retrieves the functional permissions assigned to a specific group.
 *
 * @param {DBClient} DBClient - The database client used to execute queries.
 * @param {GroupType | IdentifierType} group - The group or identifier for which permissions are to be fetched.
 * @return {Promise<FunctionalPermissionType[]>} A promise that resolves to an array of functional permissions associated with the specified group.
 */
export async function getFunctionalPermissionsOfGroup(DBClient: DBClient, group: GroupSelectType | IdentifierType): Promise<FunctionalPermissionSelectType[]> {
    try {
        if (!DBClient) throw new Error('DBClient is required');
        return (await DBClient
            .select({ functionalPermission: FunctionalPermission })
            .from(FunctionalPermissionsOfGroup)
            .innerJoin(FunctionalPermission, eq(FunctionalPermissionsOfGroup.functionalPermissionIdentifier, FunctionalPermission.identifier))
            .where(eq(FunctionalPermissionsOfGroup.grantedTo, group.identifier)))
            .map(r => toValidatedFunctionalPermissionType(r.functionalPermission));
    } catch (err) {
        if (devMode) console.error('getFunctionalPermissionsOfGroup failed:', err);
        throw err;
    }
}

export async function getFunctionalPermissionCount(DBClient: DBClient): Promise<number> {
    try {
        if (!DBClient) throw new Error('DBClient is required');
        const [countRow] = await DBClient.select({ c: sql<number>`count(*)` }).from(FunctionalPermission);
        return Number(countRow?.c ?? 0);
    } catch (err) {
        if (devMode) console.error('getFunctionalPermissionCount failed:', err);
        throw err;
    }
}

/**
 * Revokes specified functional permissions from a given group.
 * Removes the permissions from the database and returns the number of permissions successfully removed.
 *
 * @param {DBClient} DBClient - The database client used to execute the revocation operation. Must not be null or undefined.
 * @param {UserType} userRevoking - The user revoking the permissions. Must include a valid identifier.
 * @param {GroupType} revokeFrom - The group from which the permissions will be revoked. Must include a valid 'identifier' property.
 * @param {FunctionalPermissionType[]} permissions - An array of functional permission objects to be revoked. Each permission must include a valid 'identifier' property.
 * @return {Promise<number>} A promise that resolves to the number of permissions successfully revoked.
 * @throws Will throw an error if the `DBClient` is not provided, if `revokeFrom` or its `identifier` is missing, or if the operation encounters any unexpected issues.
 */
export async function revokeFunctionalPermissionFromGroup(DBClient: DBClient, userRevoking: UserSelectType, revokeFrom: GroupSelectType | IdentifierType, permissions: FunctionalPermissionSelectType[] | IdentifierType[]): Promise<number> {
    try {
        if (!DBClient) throw new Error('DBClient is required');
        if (!revokeFrom || !revokeFrom.identifier) throw new Error('revokeFrom with identifier is required');
        if (!Array.isArray(permissions) || permissions.length === 0) return 0;

        const revoked = (await DBClient.delete(FunctionalPermissionsOfGroup).where(and(eq(FunctionalPermissionsOfGroup.grantedTo, revokeFrom.identifier), inArray(FunctionalPermissionsOfGroup.functionalPermissionIdentifier, permissions.map(p => p.identifier)))).returning()).length;
        if (revoked > 0) {
            PubSub.publish([TAG_FUNCTIONAL_PERMISSION, revokeFrom.identifier, TAG_REVOKE, TAG_AFTER], { identifiers: { functional_permission: revokeFrom.identifier }, userRevoking, revokeFrom, permissions });
        }
        return revoked;
    } catch (err) {
        if (devMode) console.error('revokeFunctionalPermissionFromGroup failed:', err);
        throw err;
    }
}

/**
 * Registers or updates a functional permission in the database.
 *
 * @param {DBClient} DBClient - The database client used to perform the operation. This is required.
 * @param {FunctionalPermissionType} permission - The functional permission object containing permission details. Must include the `functionalPermissionName` field as a string.
 * @return {Promise<FunctionalPermissionType>} A promise that resolves to the registered or updated functional permission object.
 * @throws {Error} Throws an error if `DBClient` is missing, or `permission` does not contain a valid `functionalPermissionName` field.
 */
export async function registerFunctionalPermission(DBClient: DBClient, permission: FunctionalPermissionInsertType): Promise<FunctionalPermissionSelectType> {
    try {
        if (!DBClient) throw new Error('DBClient is required');
        if (!permission || typeof permission.functionalPermissionName !== 'string') throw new Error('permission with functionalPermissionName is required');

        // Use a targeted any-cast on DBClient to avoid strict Drizzle overload checks in TS
        return (await (DBClient as any).insert(FunctionalPermission).values(permission)
            .onConflictDoUpdate({
                target: FunctionalPermission.functionalPermissionName,
                set: {
                    description: permission.description ?? sql`${FunctionalPermission.description}`,
                    group: (permission as any).group ?? sql`${FunctionalPermission.group}`,
                }
            }).returning())[0];
    } catch (err) {
        if (devMode) console.error('registerFunctionalPermission failed:', err);
        throw err;
    }
}

/**
 * Asynchronously retrieves details of a single functional permission from the database and returns
 * them sorted by the functional permission name.
 *
 * @param {DBClient} DBClient - An instance of the database client used to query the functional permissions.
 * @param {IdentifierType} FPIdentifier - The identifier of the functional permission to retrieve. Must be a valid identifier corresponding to an existing functional permission.
 * @return {Promise<FunctionalPermissionType>} A promise that resolves to the functional permission object.
 * @throws {Error} Throws an error if the database client is not provided or the query fails.
 */
export async function getFunctionalPermission(DBClient: DBClient, FPIdentifier: IdentifierType): Promise<FunctionalPermissionSelectType[]> {
    try {
        if (!DBClient) throw new Error('DBClient is required');
        if (devMode) console.log('Fetching all functional permissions...');
        return (await DBClient.select().from(FunctionalPermission).where(eq(FunctionalPermission.identifier, FPIdentifier.identifier)).limit(1))
            .map(toValidatedFunctionalPermissionType);
    } catch (err) {
        if (devMode) console.error('getFunctionalPermissions failed:', err);
        throw err;
    }
}

/**
 * Asynchronously retrieves a list of functional permissions from the database and returns
 * them sorted by the functional permission name.
 *
 * @param {DBClient} DBClient - An instance of the database client used to query the functional permissions.
 * @return {Promise<FunctionalPermissionType[]>} A promise that resolves to an array of functional permission objects.
 * @throws {Error} Throws an error if the database client is not provided or the query fails.
 */
export async function getFunctionalPermissions(DBClient: DBClient): Promise<FunctionalPermissionSelectType[]> {
    try {
        if (!DBClient) throw new Error('DBClient is required');
        if (devMode) console.log('Fetching all functional permissions...');
        return (await DBClient.select().from(FunctionalPermission).orderBy(FunctionalPermission.functionalPermissionName))
            .map(toValidatedFunctionalPermissionType);
    } catch (err) {
        if (devMode) console.error('getFunctionalPermissions failed:', err);
        throw err;
    }
}

export async function getGroupsAssignedToFunctionalPermission(DBClient: DBClient, FPIndentifier: IdentifierType): Promise<GroupSelectType[]> {
    try {
        if (!DBClient) throw new Error('DBClient is required');
        if (devMode) console.log('Fetching groups assigned to functional permission ', FPIndentifier);
        return (await DBClient
            .select({ group: Group })
            .from(FunctionalPermissionsOfGroup)
            .innerJoin(Group, eq(FunctionalPermissionsOfGroup.grantedTo, Group.identifier))
            .where(eq(FunctionalPermissionsOfGroup.functionalPermissionIdentifier, FPIndentifier.identifier)))
            .map(g => g.group);
    } catch (err) {
        if (devMode) console.error('getGroupsAssignedToFunctionalPermission failed:', err);
        throw err;
    }
}