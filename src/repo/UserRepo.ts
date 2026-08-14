import { IdentifierSchema, type IdentifierType } from "@/types/helpers.ts";
import { Value } from "@sinclair/typebox/value";
import { User, Group, UserGroup } from "@/schema/UserSchema.ts";
import type { UserSelectType, UserInsertType, GroupInsertType, GroupSelectType } from "@/types/UserType.ts";
import { Type } from "@sinclair/typebox";
import { devMode } from "@/devmode.ts";
import { and, or, eq, ne, inArray, sql } from "drizzle-orm";
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
import { runInTransaction } from "@/services/DatabaseDriver.ts";

/**
 * The reserved identifier of the system user row. The system user never appears in EntraID
 * data, so sync operations must never disable or rewrite it.
 */
export const SYSTEM_USER_IDENTIFIER = "00000000-0000-0000-0000-000000000000";

/**
 * Cached DB row of the reserved system user (identifier 00000000-0000-0000-0000-000000000000).
 * It is used as the actor for system-initiated grants/mutations that have no human user.
 *
 * @type {UserSelectType | undefined}
 */
let _systemUser: UserSelectType | undefined;

/**
 * Retrieves or creates the system user in the database.
 *
 * @param {DBClient} db - The database client used to interact with the system.
 * @return {Promise<UserSelectType>} A promise that resolves to the system user object.
 */
export async function getSystemUser(db: DBClient): Promise<UserSelectType> {
    if (_systemUser) return _systemUser;
    try {
        if (devMode) console.log("Creating system user...");
        _systemUser = (await db.insert(User).values({
            identifier: SYSTEM_USER_IDENTIFIER,
            firstName: "system",
            lastName: "system",
            email: "system@localhost",
        } satisfies UserInsertType).onConflictDoUpdate({
            target: User.identifier,
            set: { firstName: "system", updatedAt: sql`now()` }
        }).returning() satisfies UserSelectType[])[0];
        return _systemUser!;
    } catch (error) {
        if (devMode) console.error('Failed to create system user:', error);
        throw error;
    }
}

/**
 * Disables a list of users and removes their user-group associations in one transaction.
 *
 * If no userIds are provided, all users are disabled.
 *
 * @param {DBClient} db - The database client used to execute queries.
 * @param {IdentifierType[]} userIds - Array of user identifiers to be disabled.
 * @return {Promise<UserSelectType[]>} A promise that resolves to an array of disabled user objects.
 */
export async function disableUsers(db: DBClient, userIds: IdentifierType[] = []): Promise<UserSelectType[]> {
    if (devMode) console.log("Disabling users...");
    if (!Value.Check(Type.Array(IdentifierSchema), userIds as unknown)) throw new Error(`Invalid identifier schema: ${JSON.stringify(userIds)}`);

    const disabledUsers = await runInTransaction(db, async (tx) => {
        const rows = (0 < userIds.length)
            ? await tx.update(User).set({ disabled: true, updatedAt: sql`now()` }).where(inArray(User.identifier, userIds.map(i => i.identifier))).returning()
            : await tx.update(User).set({ disabled: true, updatedAt: sql`now()` }).where(ne(User.identifier, SYSTEM_USER_IDENTIFIER)).returning();

        const disabledIdentifiers = rows.map(u => u.identifier);
        if (0 < disabledIdentifiers.length) {
            await tx.delete(UserGroup).where(inArray(UserGroup.userIdentifier, disabledIdentifiers));
        }
        return rows satisfies UserSelectType[];
    });

    for (const disabledUser of disabledUsers) {
        PubSub.publish([TAG_USER, disabledUser.identifier, TAG_DISABLE, TAG_AFTER], { identifier: disabledUser.identifier, disabled: true });
    }
    if (devMode) console.log("Disabled ", disabledUsers.length, " users.");
    return disabledUsers satisfies UserSelectType[];
}

/**
 * Inserts or updates a list of users in the database with a single set-based statement.
 * If a user with the same identifier already exists, the record is updated; otherwise, a new user is inserted.
 * The inserted/updated discrimination uses the `xmax` system column of the returned rows
 * (`xmax = 0` for freshly inserted rows).
 *
 * @param {DBClient} db - The database client used to interact with the database.
 * @param {Array<UserInsertType>} users - An array of user objects to be inserted or updated.
 * @return {Promise<{inserted: UserSelectType[], updated: UserSelectType[]}>} An object containing two arrays: `inserted` with newly inserted users and `updated` with users that were updated.
 */
export async function upsertUsers(db: DBClient, users: Array<UserInsertType | Partial<UserInsertType> & Pick<UserInsertType, 'identifier'>>): Promise<{inserted: UserSelectType[], updated: UserSelectType[]}> {
    if (devMode) console.log("Upserting users...");

    const inserted: UserSelectType[] = [];
    const updated: UserSelectType[] = [];

    if (users.length === 0) {
        if (devMode) console.log("Upserted users. ", inserted.length, " inserted, ", updated.length, " updated.");
        return { inserted, updated };
    }

    const rows = await db.insert(User).values(users.map((currentUser) => ({
        identifier: currentUser.identifier,
        firstName: currentUser.firstName ?? '',
        lastName: currentUser.lastName ?? '',
        email: currentUser.email ?? '',
    }) satisfies UserInsertType)).onConflictDoUpdate({
        target: User.identifier,
        set: {
            firstName: sql`excluded.first_name`,
            lastName: sql`excluded.last_name`,
            email: sql`excluded.email`,
            disabled: false,
            updatedAt: sql`now()`
        }
    }).returning({
        identifier: User.identifier,
        firstName: User.firstName,
        lastName: User.lastName,
        email: User.email,
        disabled: User.disabled,
        createdAt: User.createdAt,
        updatedAt: User.updatedAt,
        wasInserted: sql<boolean>`(xmax = 0)`,
    }) satisfies (UserSelectType & { wasInserted: boolean })[];

    for (const returningUser of rows) {
        if (returningUser.wasInserted) {
            inserted.push(returningUser);
            PubSub.publish([TAG_USER, returningUser.identifier, TAG_CREATE, TAG_AFTER], { identifier: returningUser.identifier, firstName: returningUser.firstName, lastName: returningUser.lastName, email: returningUser.email });
        } else {
            updated.push(returningUser);
            PubSub.publish([TAG_USER, returningUser.identifier, TAG_UPDATE, TAG_AFTER], { identifier: returningUser.identifier, firstName: returningUser.firstName, lastName: returningUser.lastName, email: returningUser.email, updatedAt: returningUser.updatedAt });
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
 * Inserts or updates a batch of groups in the database with a single set-based statement.
 * If a group with the same identifier exists, it will be updated; otherwise, it will be inserted as a new record.
 * The inserted/updated discrimination uses the `xmax` system column of the returned rows.
 *
 * @param {DBClient} db - The database client used to perform the upsert operations.
 * @param {Array<GroupInsertType>} groups - An array of group objects to be inserted or updated in the database.
 * @return {Promise<{ inserted: GroupSelectType[], updated: GroupSelectType[] }>} A promise that resolves to an object containing
 *         two arrays: `inserted`, which includes the groups that were newly inserted, and `updated`, which includes
 *         the groups that were updated.
 */
export async function upsertGroups(db: DBClient, groups: Array<GroupInsertType>): Promise<{ inserted: GroupSelectType[], updated: GroupSelectType[] }> {
    if (devMode) console.log("Upserting groups...");
    const inserted: GroupSelectType[] = [];
    const updated: GroupSelectType[] = [];

    if (groups.length === 0) {
        if (devMode) console.log("Upserted groups. ", inserted.length, " inserted, ", updated.length, " updated.");
        return { inserted, updated };
    }

    const rows = await db.insert(Group).values(groups.map((currentGroup) => ({
        identifier: currentGroup.identifier,
        groupName: currentGroup.groupName,
    }) satisfies GroupInsertType)).onConflictDoUpdate({
        target: Group.identifier,
        set: {
            groupName: sql`excluded.group_name`,
            disabled: false,
            updatedAt: sql`now()`
        }
    }).returning({
        identifier: Group.identifier,
        groupName: Group.groupName,
        disabled: Group.disabled,
        createdAt: Group.createdAt,
        updatedAt: Group.updatedAt,
        wasInserted: sql<boolean>`(xmax = 0)`,
    }) satisfies (GroupSelectType & { wasInserted: boolean })[];

    for (const returningGroup of rows) {
        if (returningGroup.wasInserted) {
            inserted.push(returningGroup);
            PubSub.publish([TAG_GROUP, returningGroup.identifier, TAG_CREATE, TAG_AFTER], { identifier: returningGroup.identifier, groupName: returningGroup.groupName });
        } else {
            updated.push(returningGroup);
            PubSub.publish([TAG_GROUP, returningGroup.identifier, TAG_UPDATE, TAG_AFTER], { identifier: returningGroup.identifier, groupName: returningGroup.groupName, updatedAt: returningGroup.updatedAt });
        }
    }

    if (devMode) console.log("Upserted groups. ", inserted.length, " inserted, ", updated.length, " updated.");
    return { inserted: inserted, updated: updated };
}

/**
 * Disables a list of groups by updating their status to inactive and removing associated user-group
 * relationships in one transaction.
 *
 * If no groupIds are provided, all groups are disabled.
 *
 * @param {DBClient} db - The database client used to perform the operations.
 * @param {IdentifierType[]} groupIds - An array of group identifiers to be disabled.
 * @return {Promise<GroupSelectType[]>} A promise that resolves to an array of group objects that were disabled.
 */
export async function disableGroups(db: DBClient, groupIds: IdentifierType[] = []): Promise<GroupSelectType[]> {
    if (devMode) console.log("Disabling groups...");
    if (!Value.Check(Type.Array(IdentifierSchema), groupIds as unknown)) throw new Error("Invalid group identifiers provided.");

    const disabledGroups = await runInTransaction(db, async (tx) => {
        const rows = (0 < groupIds.length)
            ? await tx.update(Group).set({ disabled: true, updatedAt: sql`now()` }).where(inArray(Group.identifier, groupIds.map(i => i.identifier))).returning()
            : await tx.update(Group).set({ disabled: true, updatedAt: sql`now()` }).returning();

        const disabledIdentifiers = rows.map(g => g.identifier);
        if (0 < disabledIdentifiers.length) {
            await tx.delete(UserGroup).where(inArray(UserGroup.groupIdentifier, disabledIdentifiers));
        }
        return rows satisfies GroupSelectType[];
    });

    for (const disabledGroup of disabledGroups) {
        PubSub.publish([TAG_GROUP, disabledGroup.identifier, TAG_DISABLE, TAG_AFTER], { identifier: disabledGroup.identifier, disabled: true });
    }
    if (devMode) console.log("Disabled ", disabledGroups.length, " groups.");
    return disabledGroups satisfies GroupSelectType[];
}

/**
 * Sets the memberships of a user by replacing the associations between the user and groups in one transaction.
 *
 * @param {DBClient} db - The database client instance used to perform the operations.
 * @param {IdentifierType} userId - The identifier of the user whose memberships need to be updated.
 * @param {IdentifierType[]} groupIds - An array of group identifiers to associate with the user.
 * @return {Promise<void>} A promise that resolves when the operation is completed.
 */
export async function setUserMemberships(db: DBClient, userId: IdentifierType, groupIds: IdentifierType[]) {
    if (devMode) console.log("Set user/group memberships:", userId, groupIds);
    if (!Value.Check(IdentifierSchema, userId as unknown)) throw new Error("Invalid user identifier provided.");
    if (!Value.Check(Type.Array(IdentifierSchema), groupIds as unknown)) throw new Error("Invalid group identifiers provided.");
    await runInTransaction(db, async (tx) => {
        await tx.delete(UserGroup).where(eq(UserGroup.userIdentifier, userId.identifier));
        if (0 < groupIds.length) await tx.insert(UserGroup).values(groupIds.map(g => ({ userIdentifier: userId.identifier, groupIdentifier: g.identifier })));
    });
    PubSub.publish([TAG_USER, userId.identifier, TAG_UPDATE, TAG_AFTER], { userIdentifier: userId.identifier, groupIdentifiers: groupIds.map(g => g.identifier) });
    if (devMode) console.log("Set user/group memberships complete.");
}

/**
 * Replaces the membership associations between a group and a list of users in one transaction.
 *
 * @param {DBClient} db - The database client used to execute the operations.
 * @param {IdentifierType} groupId - The identifier for the group whose memberships should be updated.
 * @param {IdentifierType[]} userIds - An array of user identifiers to associate with the specified group.
 * @return {Promise<void>} A promise that resolves when the group memberships are successfully updated.
 */
export async function setGroupMemberships(db: DBClient, groupId: IdentifierType, userIds: IdentifierType[]) {
    if (devMode) console.log("Set user/group memberships:", groupId);
    if (!Value.Check(IdentifierSchema, groupId as unknown)) throw new Error("Invalid group identifier provided.");
    if (!Value.Check(Type.Array(IdentifierSchema), userIds as unknown)) throw new Error("Invalid user identifiers provided.");
    await runInTransaction(db, async (tx) => {
        await tx.delete(UserGroup).where(eq(UserGroup.groupIdentifier, groupId.identifier));
        if (0 < userIds.length) await tx.insert(UserGroup).values(userIds.map(u => ({ groupIdentifier: groupId.identifier, userIdentifier: u.identifier })));
    });
    PubSub.publish([TAG_GROUP, groupId.identifier, TAG_UPDATE, TAG_AFTER], { identifier: groupId.identifier, userIdentifiers: userIds.map(u => u.identifier) });
    for (const userId of userIds) {
        PubSub.publish([TAG_USER, userId.identifier, TAG_UPDATE, TAG_AFTER], { userIdentifier: userId.identifier });
    }
    if (devMode) console.log("Set user/group memberships complete.");
}

/**
 * Counts the number of users and groups in the database, optionally including inactive entries.
 *
 * @param {DBClient} db - The database client used to perform the queries.
 * @param {boolean} [includeInactive=false] - Determines whether to include inactive users and groups in the count.
 * @return {Promise<{users: number, groups: number}>} A promise that resolves to an object containing the counts of users and groups.
 */
export async function countUsersAndGroups(db: DBClient, includeInactive: boolean = false): Promise<{users: number, groups: number}> {
    if (devMode) console.log("Counting users and groups, includeInactive=", includeInactive);

    // Build and run count queries. Use SQL COUNT(*) so we don't fetch full rows.
    const [userRow] = await (includeInactive
        ? db.select({ c: sql<number>`count(*)` }).from(User)
        : db.select({ c: sql<number>`count(*)` }).from(User).where(eq(User.disabled, false)));

    const [groupRow] = await (includeInactive
        ? db.select({ c: sql<number>`count(*)` }).from(Group)
        : db.select({ c: sql<number>`count(*)` }).from(Group).where(eq(Group.disabled, false)));

    const users = Number(userRow?.c ?? 0);
    const groups = Number(groupRow?.c ?? 0);

    return { users: Number.isFinite(users) ? users : 0, groups: Number.isFinite(groups) ? groups : 0 };
}

/**
 * Retrieves a list of users based on the provided user identifiers.
 *
 * @param {DBClient} db - The database client instance used for querying the users.
 * @param {IdentifierType[]} userIds - An array of user identifiers to fetch the associated users.
 * @param {{page: number, pageSize: number}} page - Request specific result page. Only works if userIds is not given.
 * @return {Promise<UserSelectType[]>} A promise that resolves to an array of user objects matching the provided identifiers.
 */
export async function getUsers(db: DBClient, userIds: IdentifierType[] = [], page: {page: number, pageSize: number} | undefined = undefined, includeInactive: boolean = false): Promise<UserSelectType[]> {
    if (devMode) console.log("Fetching users by identifiers...");
    if (!Value.Check(Type.Array(IdentifierSchema), userIds as unknown)) throw new Error("Invalid user identifiers provided.");

    // If specific IDs provided, filter by those; also apply active-filter only when includeInactive is false
    if (0 < userIds.length) {
        const ids = userIds.map(i => i.identifier);
        if (includeInactive) return (await db.select().from(User).where(inArray(User.identifier, ids))) satisfies UserSelectType[];
        return (await db.select().from(User).where(and(eq(User.disabled, false), inArray(User.identifier, ids)))) satisfies UserSelectType[];
    }

    // If paging is given
    if (page) {
        if (includeInactive) return (await db.select().from(User).orderBy(User.identifier).offset(Math.max(0, page.page) * Math.max(0, page.pageSize)).limit(Math.max(0, page.pageSize))) satisfies UserSelectType[];
        return (await db.select().from(User).where(eq(User.disabled, false)).orderBy(User.identifier).offset(Math.max(0, page.page) * Math.max(0, page.pageSize)).limit(Math.max(0, page.pageSize))) satisfies UserSelectType[];
    }

    // No specific IDs: return all or only active depending on includeInactive
    if (includeInactive) return (await db.select().from(User)) satisfies UserSelectType[];
    return (await db.select().from(User).where(eq(User.disabled, false))) satisfies UserSelectType[];
}

/**
 * Counts users, excluding disabled users unless `includeInactive` is true.
 *
 * @param db Database client.
 * @param includeInactive Whether disabled users should be included.
 * @returns Total number of matching users.
 */
export async function getUserCount(db: DBClient, includeInactive: boolean = false): Promise<number> {
    const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(User).where(includeInactive ? undefined : eq(User.disabled, false));
    return Number(countRow?.c ?? 0);
}

/**
 * Fetches a single group by identifier.
 *
 * @param db Database client.
 * @param GroupId Group identifier.
 * @returns Array containing up to one matching group row.
 */
export async function getGroup(db: DBClient, groupId: IdentifierType) { return await db.select().from(Group).where(eq(Group.identifier, groupId.identifier)).limit(1); }

/**
 * Retrieves a list of groups based on the provided group identifiers.
 *
 * @param {DBClient} db - The database client used to execute the query.
 * @param {IdentifierType[]} groupIds - An array of group identifiers to fetch.
 * @param {{page: number, pageSize: number}} page - Request specific result page. Only works if groupIds is not given.
 * @return {Promise<GroupSelectType[]>} A promise that resolves to an array of groups matching the provided identifiers.
 * @throws {Error} If the provided group identifiers are invalid.
 */
export async function getGroups(db: DBClient, groupIds: IdentifierType[] = [], page: {page: number, pageSize: number} | undefined = undefined, includeInactive: boolean = false): Promise<GroupSelectType[]> {
    if (devMode) console.log("Fetching groups by identifiers...");
    if (!Value.Check(Type.Array(IdentifierSchema), groupIds as unknown)) throw new Error("Invalid group identifiers provided.");

    if (0 < groupIds.length) {
        const ids = groupIds.map(i => i.identifier);
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

/**
 * Counts groups, excluding disabled groups unless `includeInactive` is true.
 *
 * @param db Database client.
 * @param includeInactive Whether disabled groups should be included.
 * @returns Total number of matching groups.
 */
export async function getGroupCount(db: DBClient, includeInactive: boolean = false): Promise<number> {
    const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(Group).where(includeInactive ? undefined : eq(Group.disabled, false));
    return Number(countRow?.c ?? 0);
}

/**
 * Retrieves a mapping of user identifiers to their assigned group identifiers.
 *
 * @param db The DBClient instance used to query the database.
 * @param userIds An array of user identifiers for which the group assignments are to be fetched.
 * @return A Promise resolving to a Map where each key is a user identifier and the corresponding value is an array of group identifiers assigned to that user.
 */
export async function getGroupIdsAssignedTo(db: DBClient, userIds: IdentifierType[]): Promise<Map<string, IdentifierType[]>> {
    if (1 > userIds.length) return new Map<string, IdentifierType[]>();
    if (devMode) console.log("Fetching groups assigned to users...");
    if (!Value.Check(Type.Array(IdentifierSchema), userIds as unknown)) throw new Error("Invalid user identifiers provided.");

    const rows = await db.select({ userIdentifier: UserGroup.userIdentifier, groupIdentifier: UserGroup.groupIdentifier }).from(UserGroup).where(inArray(UserGroup.userIdentifier, userIds.map(i => i.identifier)));
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
 * @param {IdentifierType[]} groupIds - An array of group identifiers to fetch user assignments for.
 * @return {Promise<Map<string, IdentifierType[]>>} A Promise that resolves to a Map where each key is a group identifier and the corresponding value is an array of user identifiers assigned to that group.
 */
export async function getUserIdsAssignedTo(db: DBClient, groupIds: IdentifierType[]): Promise<Map<string, IdentifierType[]>> {
    if (1 > groupIds.length) return new Map<string, IdentifierType[]>();
    if (devMode) console.log("Fetching users assigned to groups...");
    if (!Value.Check(Type.Array(IdentifierSchema), groupIds as unknown)) throw new Error("Invalid group identifiers provided.");

    const rows = await db.select({ groupIdentifier: UserGroup.groupIdentifier, userIdentifier: UserGroup.userIdentifier }).from(UserGroup).where(inArray(UserGroup.groupIdentifier, groupIds.map(i => i.identifier)));
    return rows.reduce((acc, r) => {
        const key = r.groupIdentifier;
        if (!acc.has(key)) acc.set(key, []);
        acc.get(key)!.push({ identifier: r.userIdentifier });
        return acc;
    }, new Map<string, IdentifierType[]>());
}
