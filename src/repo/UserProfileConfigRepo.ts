import { and, eq } from "drizzle-orm";
import { UserProfileConfig } from "@/schema/UserProfileConfigSchema.ts";
import type { UserProfileConfigSelectType, UserProfileConfigInsertType } from "@/types/UserProfileConfigType.ts";
import PubSub from "@/services/PubSub.ts";
import type { DBClient } from "@/services/DatabaseDriver.ts";
import { TAG_AFTER, TAG_UPSERT, TAG_USER_PROFILE_CONFIG } from "@/types/PubSubType.ts";

export async function getUserProfileConfigEntries(db: DBClient, userIdentifier: string): Promise<UserProfileConfigSelectType[]> {
    const rows = await db.select().from(UserProfileConfig).where(eq(UserProfileConfig.userIdentifier, userIdentifier));
    return rows as UserProfileConfigSelectType[];
}

export async function getUserProfileConfigEntry(db: DBClient, userIdentifier: string, domain: string, key: string): Promise<UserProfileConfigSelectType | undefined> {
    const rows = await db.select().from(UserProfileConfig).where(
        and(
            eq(UserProfileConfig.userIdentifier, userIdentifier),
            eq(UserProfileConfig.domain, domain),
            eq(UserProfileConfig.key, key),
        )
    ).limit(1);
    return rows[0] as UserProfileConfigSelectType | undefined;
}

export async function upsertUserProfileConfigEntry(
    db: DBClient,
    entry: UserProfileConfigInsertType,
): Promise<UserProfileConfigSelectType[]> {
    const rows = await db.insert(UserProfileConfig).values(entry).onConflictDoUpdate({
        target: [UserProfileConfig.domain, UserProfileConfig.key, UserProfileConfig.userIdentifier],
        set: {
            value: entry.value,
        }
    }).returning();

    const updated = rows[0];
    if (updated) {
        PubSub.publish([
            TAG_USER_PROFILE_CONFIG,
            updated.domain,
            updated.key,
            TAG_UPSERT,
            TAG_AFTER,
        ], {
            domain: updated.domain,
            key: updated.key,
            value: updated.value,
            userIdentifier: updated.userIdentifier,
            updatedAt: new Date().toISOString(),
        });
    }

    return rows as UserProfileConfigSelectType[];
}

export async function deleteUserProfileConfigEntry(db: DBClient, userIdentifier: string, domain: string, key: string): Promise<void> {
    await db.delete(UserProfileConfig).where(
        and(
            eq(UserProfileConfig.userIdentifier, userIdentifier),
            eq(UserProfileConfig.domain, domain),
            eq(UserProfileConfig.key, key),
        )
    );
}
