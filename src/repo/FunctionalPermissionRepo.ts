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
export async function grantFunctionalPermissionToGroup(db: DBClient, userGranting: UserSelectType, grantTo: GroupSelectType | IdentifierType, permissions: FunctionalPermissionSelectType[] | IdentifierType[]) {
    try {
        if (!db) throw new Error('db is required');
        if (!userGranting || !userGranting.identifier) throw new Error('userGranting with identifier is required');
        if (!grantTo || !grantTo.identifier) throw new Error('grantTo with identifier is required');
        if (!Array.isArray(permissions) || permissions.length === 0) return;

        if (devMode) console.log(userGranting, " grants ", permissions, " to ", grantTo);
        await db.insert(FunctionalPermissionsOfGroup).values(permissions.map(p => ({grantedBy: userGranting.identifier, grantedTo: grantTo.identifier, functionalPermissionIdentifier: p.identifier}))).onConflictDoNothing().returning();
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
export async function getFunctionalPermissionsOfUser(db: DBClient, user: UserSelectType | IdentifierType): Promise<FunctionalPermissionSelectType[]> {
    try {
        if (!db) throw new Error('db is required');
        if (!user || !user.identifier) throw new Error('user with identifier is required');

        // Fetch group identifiers for the user
        const groupIds = (await db.select({ groupIdentifier: UserGroup.groupIdentifier }).from(UserGroup).where(eq(UserGroup.userIdentifier, user.identifier))).map(r => r.groupIdentifier).filter(Boolean);
        if (groupIds.length === 0) return [] as FunctionalPermissionSelectType[];

        // Fetch functional_permission identifiers granted to those groups
        const permIds = Array.from(new Set((await db.select({ functionalPermissionIdentifier: FunctionalPermissionsOfGroup.functionalPermissionIdentifier }).from(FunctionalPermissionsOfGroup).where(inArray(FunctionalPermissionsOfGroup.grantedTo, groupIds))).map(r => r.functionalPermissionIdentifier).filter(Boolean)));
        if (permIds.length === 0) return [] as FunctionalPermissionSelectType[];

        // Finally fetch distinct functional permissions by identifier
        return await db.select().from(FunctionalPermission).where(inArray(FunctionalPermission.identifier, permIds));
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
export async function getFunctionalPermissionsOfGroup(db: DBClient, group: GroupSelectType | IdentifierType): Promise<FunctionalPermissionSelectType[]> {
    try {
        if (!db) throw new Error('db is required');
        return (await db
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

/**
 * Retrieves the functional permissions assigned to each of the given groups in one set-based query.
 *
 * @param {DBClient} DBClient - The database client used to execute the query.
 * @param {string[]} groupIdentifiers - Group identifiers to fetch permissions for.
 * @return {Promise<Map<string, FunctionalPermissionSelectType[]>>} A map from group identifier to its assigned functional permissions.
 */
export async function getFunctionalPermissionsOfGroups(db: DBClient, groupIdentifiers: string[]): Promise<Map<string, FunctionalPermissionSelectType[]>> {
    try {
        if (!db) throw new Error('db is required');
        const result = new Map<string, FunctionalPermissionSelectType[]>();
        if (groupIdentifiers.length === 0) return result;
        const rows = (await db
            .select({ grantedTo: FunctionalPermissionsOfGroup.grantedTo, functionalPermission: FunctionalPermission })
            .from(FunctionalPermissionsOfGroup)
            .innerJoin(FunctionalPermission, eq(FunctionalPermissionsOfGroup.functionalPermissionIdentifier, FunctionalPermission.identifier))
            .where(inArray(FunctionalPermissionsOfGroup.grantedTo, groupIdentifiers)))
            .map(r => ({ grantedTo: r.grantedTo, functionalPermission: toValidatedFunctionalPermissionType(r.functionalPermission) }));
        for (const row of rows) {
            const existing = result.get(row.grantedTo);
            if (existing) existing.push(row.functionalPermission);
            else result.set(row.grantedTo, [row.functionalPermission]);
        }
        return result;
    } catch (err) {
        if (devMode) console.error('getFunctionalPermissionsOfGroups failed:', err);
        throw err;
    }
}

/**
 * Retrieves the groups that grant each of the given functional permissions in one set-based query.
 *
 * @param {DBClient} DBClient - The database client used to execute the query.
 * @param {string[]} permissionIdentifiers - Functional permission identifiers to fetch granting groups for.
 * @return {Promise<Map<string, GroupSelectType[]>>} A map from functional permission identifier to the groups granting it.
 */
export async function getGroupsAssignedToFunctionalPermissions(db: DBClient, permissionIdentifiers: string[]): Promise<Map<string, GroupSelectType[]>> {
    try {
        if (!db) throw new Error('db is required');
        const result = new Map<string, GroupSelectType[]>();
        if (permissionIdentifiers.length === 0) return result;
        const rows = await db
            .select({ functionalPermissionIdentifier: FunctionalPermissionsOfGroup.functionalPermissionIdentifier, group: Group })
            .from(FunctionalPermissionsOfGroup)
            .innerJoin(Group, eq(FunctionalPermissionsOfGroup.grantedTo, Group.identifier))
            .where(inArray(FunctionalPermissionsOfGroup.functionalPermissionIdentifier, permissionIdentifiers));
        for (const row of rows) {
            const existing = result.get(row.functionalPermissionIdentifier);
            if (existing) existing.push(row.group);
            else result.set(row.functionalPermissionIdentifier, [row.group]);
        }
        return result;
    } catch (err) {
        if (devMode) console.error('getGroupsAssignedToFunctionalPermissions failed:', err);
        throw err;
    }
}

export async function getFunctionalPermissionCount(db: DBClient): Promise<number> {
    try {
        if (!db) throw new Error('db is required');
        const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(FunctionalPermission);
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
export async function revokeFunctionalPermissionFromGroup(db: DBClient, userRevoking: UserSelectType, revokeFrom: GroupSelectType | IdentifierType, permissions: FunctionalPermissionSelectType[] | IdentifierType[]): Promise<number> {
    try {
        if (!db) throw new Error('db is required');
        if (!revokeFrom || !revokeFrom.identifier) throw new Error('revokeFrom with identifier is required');
        if (!Array.isArray(permissions) || permissions.length === 0) return 0;

        const revoked = (await db.delete(FunctionalPermissionsOfGroup).where(and(eq(FunctionalPermissionsOfGroup.grantedTo, revokeFrom.identifier), inArray(FunctionalPermissionsOfGroup.functionalPermissionIdentifier, permissions.map(p => p.identifier)))).returning()).length;
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
export async function registerFunctionalPermission(db: DBClient, permission: FunctionalPermissionInsertType): Promise<FunctionalPermissionSelectType> {
    try {
        if (!db) throw new Error('db is required');
        if (!permission || typeof permission.functionalPermissionName !== 'string') throw new Error('permission with functionalPermissionName is required');

        const [registered] = await db.insert(FunctionalPermission).values(permission)
            .onConflictDoUpdate({
                target: FunctionalPermission.functionalPermissionName,
                set: {
                    description: permission.description ?? sql`${FunctionalPermission.description}`,
                    group: permission.group ?? sql`${FunctionalPermission.group}`,
                    updatedAt: sql`now()`,
                }
            }).returning();
        if (!registered) throw new Error("registerFunctionalPermission returned no row");
        return registered;
    } catch (err) {
        if (devMode) console.error('registerFunctionalPermission failed:', err);
        throw err;
    }
}

/**
 * Asynchronously retrieves details of a single functional permission from the database and returns
 * them sorted by the functional permission name.
 *
 * @param {DBClient} db - An instance of the database client used to query the functional permissions.
 * @param {IdentifierType} fpIdentifier - The identifier of the functional permission to retrieve. Must be a valid identifier corresponding to an existing functional permission.
 * @return {Promise<FunctionalPermissionType>} A promise that resolves to the functional permission object.
 * @throws {Error} Throws an error if the database client is not provided or the query fails.
 */
export async function getFunctionalPermission(db: DBClient, fpIdentifier: IdentifierType): Promise<FunctionalPermissionSelectType[]> {
    try {
        if (!db) throw new Error('db is required');
        if (devMode) console.log('Fetching all functional permissions...');
        return (await db.select().from(FunctionalPermission).where(eq(FunctionalPermission.identifier, fpIdentifier.identifier)).limit(1))
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
 * @param {DBClient} db - An instance of the database client used to query the functional permissions.
 * @return {Promise<FunctionalPermissionType[]>} A promise that resolves to an array of functional permission objects.
 * @throws {Error} Throws an error if the database client is not provided or the query fails.
 */
export async function getFunctionalPermissions(db: DBClient): Promise<FunctionalPermissionSelectType[]> {
    try {
        if (!db) throw new Error('db is required');
        if (devMode) console.log('Fetching all functional permissions...');
        return (await db.select().from(FunctionalPermission).orderBy(FunctionalPermission.functionalPermissionName))
            .map(toValidatedFunctionalPermissionType);
    } catch (err) {
        if (devMode) console.error('getFunctionalPermissions failed:', err);
        throw err;
    }
}

/**
 * Retrieves a page of functional permissions ordered by name.
 *
 * @param {DBClient} db - The database client used to execute the query.
 * @param {{page: number, pageSize: number}} pagination - Zero-based page and page size.
 * @return {Promise<FunctionalPermissionSelectType[]>} The functional permissions on the requested page.
 */
export async function getFunctionalPermissionsPage(db: DBClient, pagination: { page: number; pageSize: number }): Promise<FunctionalPermissionSelectType[]> {
    try {
        if (!db) throw new Error('db is required');
        return (await db
            .select()
            .from(FunctionalPermission)
            .orderBy(FunctionalPermission.functionalPermissionName)
            .offset(Math.max(0, pagination.page) * Math.max(1, pagination.pageSize))
            .limit(Math.max(1, pagination.pageSize)))
            .map(toValidatedFunctionalPermissionType);
    } catch (err) {
        if (devMode) console.error('getFunctionalPermissionsPage failed:', err);
        throw err;
    }
}

export async function getGroupsAssignedToFunctionalPermission(db: DBClient, fpIdentifier: IdentifierType): Promise<GroupSelectType[]> {
    try {
        if (!db) throw new Error('db is required');
        if (devMode) console.log('Fetching groups assigned to functional permission ', fpIdentifier);
        return (await db
            .select({ group: Group })
            .from(FunctionalPermissionsOfGroup)
            .innerJoin(Group, eq(FunctionalPermissionsOfGroup.grantedTo, Group.identifier))
            .where(eq(FunctionalPermissionsOfGroup.functionalPermissionIdentifier, fpIdentifier.identifier)))
            .map(g => g.group);
    } catch (err) {
        if (devMode) console.error('getGroupsAssignedToFunctionalPermission failed:', err);
        throw err;
    }
}