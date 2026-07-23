import { IdentifierSchema, type IdentifierType } from "@/types/helpers.ts";
import { Value } from "@sinclair/typebox/value";
import { User, Group, UserGroup } from "@/schema/UserSchema.ts";
import type { UserSelectType, UserInsertType, GroupInsertType, GroupSelectType } from "@/types/UserType.ts";
import { Type } from "@sinclair/typebox";
import { devMode } from "@/devmode.ts";
import { and, or, eq, inArray, sql } from "drizzle-orm";
import PubSub from "@/services/PubSub.ts";
import {
    TAG_USER,
    TAG_GROUP,
    TAG_CREATE,
    TAG_UPDATE,
    TAG_DISABLE,
    TAG_AFTER,
} from "@/types/PubSubType.ts";

import type {DBClient} from "@/services/DatabaseDriver.ts";

/**
 * Represents the current system user.
 * This variable holds information about the user interacting with the system
 * or executing the current process. It may be undefined if no user is
 * currently associated with the system or process.
 *
 * @type {UserType | undefined}
 */
let _systemUser: UserSelectType | undefined;

/**
 * Retrieves or creates a system user in the database.
 *
 * @param {DBClient} db - The database client used to interact with the system.
 * @return {Promise<UserType>} A promise that resolves to the system user objecType.
 */
export async function getSystemUser(db: DBClient): Promise<UserSelectType> {
    if (_systemUser) return _systemUser;
    try {
        if (devMode) console.log("Creating system user...");
        _systemUser = (await db.insert(User).values({
            identifier: "00000000-0000-0000-0000-000000000000",
            firstName: "system",
            lastName: "system",
            email: "system@localhost",
        } satisfies UserInsertType).onConflictDoUpdate({
            target: User.identifier,
            set: { firstName: "system" }
        }).returning() satisfies UserSelectType[])[0];
        return _systemUser!;
    } catch (error) {
        if (devMode) console.error('Failed to create system user:', error);
        throw error;
    }
}

/**
 * Disables a list of users and removes their associations with user groups.
 *
 * If no UserIds are provided, all users are disabled.
 *
 * @param {DBClient} db - The database client used to execute queries.
 * @param {IdentifierType[]} UserIds - Array of user identifiers to be disabled.
 * @return {Promise<UserType[]>} A promise that resolves to an array of disabled user objects.
 */
export async function disableUsers(db: DBClient, UserIds: IdentifierType[] = []): Promise<UserSelectType[]> {
    if (devMode) console.log("Disabling users...");
    if (!Value.Check(Type.Array(IdentifierSchema), UserIds as unknown)) throw new Error(`Invalid identifier schema: ${JSON.stringify(UserIds)}`);

    const disabledUsers = (0 < UserIds.length) ? await db.update(User).set({ disabled: true }).where(inArray(User.identifier, UserIds.map(i => i.identifier))).returning() : await db.update(User).set({ disabled: true }).returning();
    for (const distabledUser of disabledUsers) await db.delete(UserGroup).where(eq(UserGroup.userIdentifier, distabledUser.identifier));
    for (const disabledUser of disabledUsers) {
        PubSub.publish([TAG_USER, disabledUser.identifier, TAG_DISABLE, TAG_AFTER], { identifier: disabledUser.identifier, disabled: true });
    }
    if (devMode) console.log("Disabled ", disabledUsers.length, " users.");
    return disabledUsers satisfies UserSelectType[];
}

/**
 * Inserts or updates a list of users in the database. If a user with the same identifier already exists, the record is updated; otherwise, a new user is inserted.
 *
 * @param {DBClient} db - The database client used to interact with the database.
 * @param {Array<UserInsert>} Users - An array of user objects to be inserted or updated.
 * @return {Promise<{inserted: UserType[], updated: UserType[]}>} An object containing two arrays: `inserted` with newly inserted users and `updated` with users that were updated.
 */
export async function upsertUsers(db: DBClient, Users: Array<UserInsertType | Partial<UserInsertType> & Pick<UserInsertType, 'identifier'>>): Promise<{inserted: UserSelectType[], updated: UserSelectType[]}> {
    if (devMode) console.log("Upserting users...");
    const inserted: UserSelectType[] = [];
    const updated: UserSelectType[] = [];

    for (const currentUser of Users) {
        const returningUser = (await db.insert(User).values({
            identifier: currentUser.identifier,
            firstName: currentUser.firstName ?? '',
            lastName: currentUser.lastName ?? '',
            email: currentUser.email ?? '',
        } satisfies UserInsertType).onConflictDoUpdate({
            target: User.identifier,
            set: {
                firstName: currentUser.firstName ?? sql`${User.firstName}`,
                lastName: currentUser.lastName ?? sql`${User.lastName}`,
                email: currentUser.email ?? sql`${User.email}`,
                disabled: false
            }
        }).returning() satisfies UserSelectType[])[0]!;

        if (returningUser.createdAt !== returningUser.updatedAt) {
            updated.push(returningUser);
            PubSub.publish([TAG_USER, returningUser.identifier, TAG_UPDATE, TAG_AFTER], { identifier: returningUser.identifier, firstName: returningUser.firstName, lastName: returningUser.lastName, email: returningUser.email, updatedAt: returningUser.updatedAt });
        } else {
            inserted.push(returningUser);
            PubSub.publish([TAG_USER, returningUser.identifier, TAG_CREATE, TAG_AFTER], { identifier: returningUser.identifier, firstName: returningUser.firstName, lastName: returningUser.lastName, email: returningUser.email });
        }
    }

    if (devMode) console.log("Upserted users. ", inserted.length, " inserted, ", updated.length, " updated.");
    return { inserted: inserted, updated: updated };
}

/**
 * Deletes obsolete user-group assignments based on inactive users or groups in the database.
 *
 * @param {DBClient} db - The database client used to execute queries.
 * @return {Promise<void>} A promise that resolves when the obsolete user-group assignments have been deleted.
 */
export async function deleteObsoleteUserGroupAssignments(db: DBClient) {
    if (devMode) console.log("Deleting obsolete user-group assignments...");
    const inactiveUserRows = await db.select({ identifier: User.identifier }).from(User).where(eq(User.disabled, true));
    const inactiveGroupRows = await db.select({ identifier: Group.identifier }).from(Group).where(eq(Group.disabled, true));
    const inactiveUserIds = (inactiveUserRows satisfies { identifier: string }[]).map(r => r.identifier);
    const inactiveGroupIds = (inactiveGroupRows satisfies { identifier: string }[]).map(r => r.identifier);
    const deletedAssignments = (await db.delete(UserGroup).where(or(inArray(UserGroup.userIdentifier, inactiveUserIds), inArray(UserGroup.groupIdentifier, inactiveGroupIds))).returning()).length;
    if (devMode) console.log("Deleted ", deletedAssignments, " obsolete user-group assignments.");
}

/**
 * Inserts or updates a batch of groups in the database. If a group with the same identifier exists,
 * it will be updated; otherwise, it will be inserted as a new record.
 *
 * @param {DBClient} db - The database client used to perform the upsert operations.
 * @param {Array<GroupInsert>} Groups - An array of group objects to be inserted or updated in the database.
 * @return {Promise<{ inserted: GroupType[], updated: GroupType[] }>} A promise that resolves to an object containing
 *         two arrays: `inserted`, which includes the groups that were newly inserted, and `updated`, which includes
 *         the groups that were updated.
 */
export async function upsertGroups(db: DBClient, Groups: Array<GroupInsertType>): Promise<{ inserted: GroupSelectType[], updated: GroupSelectType[] }> {
    if (devMode) console.log("Upserting groups...");
    const inserted: GroupSelectType[] = [];
    const updated: GroupSelectType[] = [];

    for (const currentGroup of Groups) {
        const returningGroup = (await db.insert(Group).values({
            identifier: currentGroup.identifier,
            groupName: currentGroup.groupName,
        } satisfies GroupInsertType).onConflictDoUpdate({
            target: Group.identifier,
            set: {
                groupName: currentGroup.groupName,
                disabled: false
            }
        }).returning() satisfies GroupSelectType[])[0]!;

        if (returningGroup.createdAt !== returningGroup.updatedAt) {
            updated.push(returningGroup);
            PubSub.publish([TAG_GROUP, returningGroup.identifier, TAG_UPDATE, TAG_AFTER], { identifier: returningGroup.identifier, groupName: returningGroup.groupName, updatedAt: returningGroup.updatedAt });
        } else {
            inserted.push(returningGroup);
            PubSub.publish([TAG_GROUP, returningGroup.identifier, TAG_CREATE, TAG_AFTER], { identifier: returningGroup.identifier, groupName: returningGroup.groupName });
        }
    }

    if (devMode) console.log("Upserted groups. ", inserted.length, " inserted, ", updated.length, " updated.");
    return { inserted: inserted, updated: updated };
}

/**
 * Disables a list of groups by updating their status to inactive and removing associated user-group relationships.
 *
 * If no GroupIds are provided, all groups are disabled.
 *
 * @param {DBClient} db - The database client used to perform the operations.
 * @param {IdentifierType[]} GroupIds - An array of group identifiers to be disabled.
 * @return {Promise<GroupType[]>} A promise that resolves to an array of group objects that were disabled.
 */
export async function disableGroups(db: DBClient, GroupIds: IdentifierType[] = []): Promise<GroupSelectType[]> {
    if (devMode) console.log("Disabling groups...");
    if (!Value.Check(Type.Array(IdentifierSchema), GroupIds as unknown)) throw new Error("Invalid group identifiers provided.");
    const disabledGroups = (0 < GroupIds.length) ? await db.update(Group).set({ disabled: true }).where(inArray(Group.identifier, GroupIds.map(i => i.identifier))).returning() : await db.update(Group).set({ disabled: true }).returning();
    for (const disabledGroup of disabledGroups) await db.delete(UserGroup).where(eq(UserGroup.groupIdentifier, disabledGroup.identifier));
    for (const disabledGroup of disabledGroups) {
        PubSub.publish([TAG_GROUP, disabledGroup.identifier, TAG_DISABLE, TAG_AFTER], { identifier: disabledGroup.identifier, disabled: true });
    }
    if (devMode) console.log("Disabled ", disabledGroups.length, " groups.");
    return disabledGroups satisfies GroupSelectType[];
}

/**
 * Sets the memberships of a user by updating the associations between the user and groups.
 *
 * @param {DBClient} db - The database client instance used to perform the operations.
 * @param {IdentifierType} UserId - The identifier of the user whose memberships need to be updated.
 * @param {IdentifierType[]} GroupIds - An array of group identifiers to associate with the user.
 * @return {Promise<void>} A promise that resolves when the operation is completed.
 */
export async function setUserMemberships(db: DBClient, UserId: IdentifierType, GroupIds: IdentifierType[]) {
    if (devMode) console.log("Set user/group memberships:", UserId, GroupIds);
    if (!Value.Check(IdentifierSchema, UserId as unknown)) throw new Error("Invalid user identifier provided.");
    if (!Value.Check(Type.Array(IdentifierSchema), GroupIds as unknown)) throw new Error("Invalid group identifiers provided.");
    await db.delete(UserGroup).where(eq(UserGroup.userIdentifier, UserId.identifier));
    if (0 < GroupIds.length) await db.insert(UserGroup).values(GroupIds.map(g => ({ userIdentifier: UserId.identifier, groupIdentifier: g.identifier })));
    PubSub.publish([TAG_USER, UserId.identifier, TAG_UPDATE, TAG_AFTER], { userIdentifier: UserId.identifier, groupIdentifiers: GroupIds.map(g => g.identifier) });
    if (devMode) console.log("Set user/group memberships complete.");
}

/**
 * Updates the membership associations between a group and a list of users in the database.
 *
 * @param {DBClient} db - The database client used to execute the operations.
 * @param {IdentifierType} GroupId - The identifier for the group whose memberships should be updated.
 * @param {IdentifierType[]} UserIds - An array of user identifiers to associate with the specified group.
 * @return {Promise<void>} A promise that resolves when the group memberships are successfully updated.
 */
export async function setGroupMemberships(db: DBClient, GroupId: IdentifierType, UserIds: IdentifierType[]) {
    if (devMode) console.log("Set user/group memberships:", GroupId);
    if (!Value.Check(IdentifierSchema, GroupId as unknown)) throw new Error("Invalid group identifier provided.");
    if (!Value.Check(Type.Array(IdentifierSchema), UserIds as unknown)) throw new Error("Invalid user identifiers provided.");
    await db.delete(UserGroup).where(eq(UserGroup.groupIdentifier, GroupId.identifier));
    if (0 < UserIds.length) await db.insert(UserGroup).values(UserIds.map(g => ({ groupIdentifier: GroupId.identifier, userIdentifier: g.identifier })));
    PubSub.publish([TAG_GROUP, GroupId.identifier, TAG_UPDATE, TAG_AFTER], { identifier: GroupId.identifier, userIdentifiers: UserIds.map(u => u.identifier) });
    for (const userId of UserIds) {
        PubSub.publish([TAG_USER, userId.identifier, TAG_UPDATE, TAG_AFTER], { userIdentifier: userId.identifier });
    }
    if (devMode) console.log("Set user/group memberships complete.");
}

/**
 * Counts the number of users and groups in the database, optionally including inactive entries.
 *
 * @param {DBClient} db - The database client used to perform the queries.
 * @param {boolean} [includeInactive=false] - Determines whether to include inactive users and groups in the counType.
 * @return {Promise<{users: number, groups: number}>} A promise that resolves to an object containing the counts of users and groups.
 */
export async function countUsersAndGroups(db: DBClient, includeInactive: boolean = false): Promise<{users: number, groups: number}> {
    if (devMode) console.log("Counting users and groups, includeInactive=", includeInactive);

    // Build and run count queries. Use SQL COUNT(*) so we don't fetch full rows.
    const userCountQuery = includeInactive
        ? db.select({ c: sql.raw('count(*)') }).from(User)
        : db.select({ c: sql.raw('count(*)') }).from(User).where(eq(User.disabled, false));

    const groupCountQuery = includeInactive
        ? db.select({ c: sql.raw('count(*)') }).from(Group)
        : db.select({ c: sql.raw('count(*)') }).from(Group).where(eq(Group.disabled, false));

    const [userRow] = await userCountQuery;
    const [groupRow] = await groupCountQuery;

    // COUNT(*) is often returned as string by Postgres drivers; coerce safely to number.
    const uRow = userRow as unknown as Record<string, unknown> | undefined;
    const gRow = groupRow as unknown as Record<string, unknown> | undefined;
    const uVal = uRow && typeof uRow.c !== 'undefined' ? uRow.c : undefined;
    const gVal = gRow && typeof gRow.c !== 'undefined' ? gRow.c : undefined;
    const users = (typeof uVal === 'string' || typeof uVal === 'number') ? Number(uVal) : 0;
    const groups = (typeof gVal === 'string' || typeof gVal === 'number') ? Number(gVal) : 0;

    return { users: Number.isFinite(users) ? users : 0, groups: Number.isFinite(groups) ? groups : 0 };
}

/**
 * Retrieves a list of users based on the provided user identifiers.
 *
 * @param {DBClient} db - The database client instance used for querying the users.
 * @param {IdentifierType[]} UserIds - An array of user identifiers to fetch the associated users.
 * @param {{page: number, pageSize: number}} page - Request specific result page. Only works if UserIds is not given.
 * @return {Promise<UserType[]>} A promise that resolves to an array of user objects matching the provided identifiers.
 */
export async function getUsers(db: DBClient, UserIds: IdentifierType[] = [], page: {page: number, pageSize: number} | undefined = undefined, includeInactive: boolean = false): Promise<UserSelectType[]> {
    if (devMode) console.log("Fetching users by identifiers...");
    if (!Value.Check(Type.Array(IdentifierSchema), UserIds as unknown)) throw new Error("Invalid user identifiers provided.");

    // If specific IDs provided, filter by those; also apply active-filter only when includeInactive is false
    if (0 < UserIds.length) {
        const ids = UserIds.map(i => i.identifier);
        if (includeInactive) return (await db.select().from(User).where(inArray(User.identifier, ids))) satisfies UserSelectType[];
        return (await db.select().from(User).where(and(eq(User.disabled, false), inArray(User.identifier, ids)))) satisfies UserSelectType[];
    }

    // If paging is given
    if (page) {
        if (includeInactive) return (await db.select().from(User).orderBy(User.identifier).offset(Math.max(0, page.page) * Math.max(0, page.pageSize)).limit(Math.max(0, page.pageSize))) satisfies UserSelectType[];
        return (await db.select().from(User).where(eq(User.disabled, false)).orderBy(User.identifier).offset(Math.max(0, page.page) * Math.max(0, page.pageSize)).limit(Math.max(0, page.pageSize))) satisfies UserInsertType[];
    }

    // No specific IDs: return all or only active depending on includeInactive
    if (includeInactive) return (await db.select().from(User)) satisfies UserSelectType[];
    return (await db.select().from(User).where(eq(User.disabled, false))) satisfies UserSelectType[];
}

export async function getUserCount(db: DBClient, includeInactive: boolean = false): Promise<number> {
    const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(User).where(includeInactive ? undefined : eq(User.disabled, false));
    return Number(countRow?.c ?? 0);
}

export async function getGroup(db: DBClient, GroupId: IdentifierType) { return await db.select().from(Group).where(eq(Group.identifier, GroupId.identifier)).limit(1); }

/**
 * Retrieves a list of groups based on the provided group identifiers.
 *
 * @param {DBClient} db - The database client used to execute the query.
 * @param {IdentifierType[]} GroupIds - An array of group identifiers to fetch.
 * @param {{page: number, pageSize: number}} page - Request specific result page. Only works if GroupIds is not given.
 * @return {Promise<GroupType[]>} A promise that resolves to an array of groups matching the provided identifiers.
 * @throws {Error} If the provided group identifiers are invalid.
 */
export async function getGroups(db: DBClient, GroupIds: IdentifierType[] = [], page: {page: number, pageSize: number} | undefined = undefined, includeInactive: boolean = false): Promise<GroupSelectType[]> {
    if (devMode) console.log("Fetching groups by identifiers...");
    if (!Value.Check(Type.Array(IdentifierSchema), GroupIds as unknown)) throw new Error("Invalid group identifiers provided.");

    if (0 < GroupIds.length) {
        const ids = GroupIds.map(i => i.identifier);
        if (includeInactive) return (await db.select().from(Group).where(inArray(Group.identifier, ids))) satisfies GroupSelectType[];
        return (await db.select().from(Group).where(and(eq(Group.disabled, false), inArray(Group.identifier, ids)))) satisfies GroupSelectType[];
    }

    // If paging is given
    if (page) {
        if (includeInactive) return (await db.select().from(Group).orderBy(Group.identifier).offset(Math.max(0, page.page) * Math.max(0, page.pageSize)).limit(Math.max(0, page.pageSize))) satisfies GroupSelectType[];
        return (await db.select().from(Group).where(eq(Group.disabled, false)).orderBy(Group.identifier).offset(Math.max(0, page.page) * Math.max(0, page.pageSize)).limit(Math.max(0, page.pageSize))) satisfies GroupSelectType[];
    }

    if (includeInactive) return (await db.select().from(Group)) satisfies GroupSelectType[];
    return (await db.select().from(Group).where(eq(Group.disabled, false))) satisfies GroupSelectType[];
}

export async function GroupCount(db: DBClient, includeInactive: boolean = false): Promise<number> {
    const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(Group).where(includeInactive ? undefined : eq(Group.disabled, false));
    return Number(countRow?.c ?? 0);
}

/**
 * Retrieves a mapping of user identifiers to their assigned group identifiers.
 *
 * @param db The DBClient instance used to query the database.
 * @param UserIds An array of user identifiers for which the group assignments are to be fetched.
 * @return A Promise resolving to a Map where each key is a user identifier and the corresponding value is an array of group identifiers assigned to that user.
 */
export async function getGroupIdsAssignedTo(db: DBClient, UserIds: IdentifierType[]): Promise<Map<string, IdentifierType[]>> {
    if (1 > UserIds.length) return new Map<string, IdentifierType[]>();
    if (devMode) console.log("Fetching groups assigned to users...");
    if (!Value.Check(Type.Array(IdentifierSchema), UserIds as unknown)) throw new Error("Invalid user identifiers provided.");

    const rows = await db.select({ userIdentifier: UserGroup.userIdentifier, groupIdentifier: UserGroup.groupIdentifier }).from(UserGroup).where(inArray(UserGroup.userIdentifier, UserIds.map(i => i.identifier)));
    return rows.reduce((acc, r) => {
        const key = r.userIdentifier;
        if (!acc.has(key)) acc.set(key, []);
        acc.get(key)!.push({ identifier: r.groupIdentifier });
        return acc;
    }, new Map<string, IdentifierType[]>());
}

/**
 * Retrieves a mapping of group identifiers to lists of user identifiers assigned to those groups from the database.
 *
 * @param {DBClient} db - The database client instance used to perform the query.
 * @param {IdentifierType[]} GroupIds - An array of group identifiers to fetch user assignments for.
 * @return {Promise<Map<string, IdentifierType[]>>} A Promise that resolves to a Map where each key is a group identifier and the corresponding value is an array of user identifiers assigned to that group.
 */
export async function getUserIdsAssignedTo(db: DBClient, GroupIds: IdentifierType[]): Promise<Map<string, IdentifierType[]>> {
    if (1 > GroupIds.length) return new Map<string, IdentifierType[]>();
    if (devMode) console.log("Fetching users assigned to groups...");
    if (!Value.Check(Type.Array(IdentifierSchema), GroupIds as unknown)) throw new Error("Invalid group identifiers provided.");

    const rows = await db.select({ groupIdentifier: UserGroup.groupIdentifier, userIdentifier: UserGroup.userIdentifier }).from(UserGroup).where(inArray(UserGroup.groupIdentifier, GroupIds.map(i => i.identifier)));
    return rows.reduce((acc, r) => {
        const key = r.groupIdentifier;
        if (!acc.has(key)) acc.set(key, []);
        acc.get(key)!.push({ identifier: r.userIdentifier });
        return acc;
    }, new Map<string, IdentifierType[]>());
}
