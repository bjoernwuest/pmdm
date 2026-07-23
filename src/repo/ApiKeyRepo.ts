import {and, asc, desc, eq, inArray, sql} from "drizzle-orm";
import {ApiKeySchema, ApiKeyFunctionalPermission} from "@/schema/ApiKeySchema.ts";
import type {FunctionalPermissionSelectType} from "@/types/FunctionalPermissionType.ts";
import {FunctionalPermission} from "@/schema/FunctionalPermissionSchema.ts";
import {type ApiKeySchemaSelectType} from "@/types/ApiKeyType.ts";
import PubSub from "@/services/PubSub.ts";
import {
    TAG_API_KEY,
    TAG_CREATE,
    TAG_UPDATE,
    TAG_DELETE,
    TAG_DISABLE,
    TAG_AFTER,
} from "@/types/PubSubType";

import type {DBClient} from "@/services/DatabaseDriver.ts";

function generateApiKeySecret(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    let out = "";
    for (let i = 0; i < values.length; i++) out += chars[values[i]! % chars.length];
    return out;
}

/**
 * Detects PostgreSQL errors that indicate `pgcrypto` functions are unavailable.
 *
 * @param error Unknown error value thrown by DB operations.
 * @returns `true` when the error matches missing `crypt`/`gen_salt` functions.
 */
export function isPgcryptoMissingError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: unknown; message?: unknown };
    const code = typeof candidate.code === "string" ? candidate.code : "";
    const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";

    // PostgreSQL: 42883 = undefined_function. We only map crypt/gen_salt lookup failures.
    return code === "42883" && (
        message.includes("gen_salt") ||
        message.includes("crypt(") ||
        message.includes("function crypt")
    );
}

/**
 * Counts API keys, optionally including disabled keys.
 *
 * @param db Database client.
 * @param includeDisabled Whether disabled keys are counted.
 * @returns Total number of matching API keys.
 */
export async function getApiKeyCount(db: DBClient, includeDisabled: boolean): Promise<number> {
    const [row] = await db
        .select({ c: sql<number>`count(*)` })
        .from(ApiKeySchema)
        .where(includeDisabled ? undefined : eq(ApiKeySchema.disabled, false));
    return Number(row?.c ?? 0);
}

/**
 * Returns paginated API keys ordered by creation time and identifier.
 *
 * @param db Database client.
 * @param page Pagination settings.
 * @param includeDisabled Whether disabled keys should be included.
 * @returns Matching API key rows.
 */
export async function getApiKeys(
    db: DBClient,
    page: { page: number; pageSize: number },
    includeDisabled: boolean,
): Promise<ApiKeySchemaSelectType[]> {
    return await db
        .select()
        .from(ApiKeySchema)
        .where(includeDisabled ? undefined : eq(ApiKeySchema.disabled, false))
        .orderBy(desc(ApiKeySchema.createdAt), asc(ApiKeySchema.identifier))
        .offset(Math.max(0, page.page) * Math.max(1, page.pageSize))
        .limit(Math.max(1, page.pageSize));
}

/**
 * Fetches a single API key by identifier.
 *
 * @param db Database client.
 * @param apiKeyIdentifier API key identifier.
 * @returns Matching API key, or `undefined` if not found.
 */
export async function getApiKey(db: DBClient, apiKeyIdentifier: string): Promise<ApiKeySchemaSelectType | undefined> {
    const [row] = await db.select().from(ApiKeySchema).where(eq(ApiKeySchema.identifier, apiKeyIdentifier)).limit(1);
    return row;
}

/**
 * Lists all functional permissions currently assigned to an API key.
 *
 * @param db Database client.
 * @param apiKeyIdentifier API key identifier.
 * @returns Functional permissions assigned to the key.
 */
export async function getApiKeyFunctionalPermissions(db: DBClient, apiKeyIdentifier: string): Promise<FunctionalPermissionSelectType[]> {
    const rows = await db
        .select({ functionalPermission: FunctionalPermission })
        .from(ApiKeyFunctionalPermission)
        .innerJoin(
            FunctionalPermission,
            eq(ApiKeyFunctionalPermission.functionalPermissionIdentifier, FunctionalPermission.identifier),
        )
        .where(eq(ApiKeyFunctionalPermission.apiKeyIdentifier, apiKeyIdentifier));
    return rows.map((row) => row.functionalPermission) as FunctionalPermissionSelectType[];
}

/**
 * Creates an API key row, hashes its secret, and stores permission assignments.
 *
 * @param db Database client.
 * @param data New API key data including owner, metadata, and permissions.
 * @returns Persisted API key row and the plaintext key shown once to the caller.
 */
export async function createApiKey(
    db: DBClient,
    data: {
        createdBy: string;
        name: string;
        description?: string | null;
        expiresAt: Date;
        keyLength: number;
        permissionIdentifiers: string[];
    },
): Promise<{ apiKey: ApiKeySchemaSelectType; plainApiKey: string }> {
    const plainApiKey = generateApiKeySecret(data.keyLength);

    const [apiKey] = await db
        .insert(ApiKeySchema)
        .values({
            createdBy: data.createdBy,
            name: data.name,
            description: data.description ?? null,
            keyHash: sql`crypt(${plainApiKey}, gen_salt('bf'))` as unknown as string,
            expiresAt: data.expiresAt.toISOString(),
        })
        .returning();

    if (!apiKey) throw new Error("Could not create API key");

    if (data.permissionIdentifiers.length > 0) {
        await db.insert(ApiKeyFunctionalPermission).values(
            data.permissionIdentifiers.map((functionalPermissionIdentifier) => ({
                apiKeyIdentifier: apiKey.identifier,
                functionalPermissionIdentifier,
                grantedBy: data.createdBy,
            })),
        ).onConflictDoNothing();
    }

    PubSub.publish([TAG_API_KEY, apiKey.identifier, TAG_CREATE, TAG_AFTER], { identifier: apiKey.identifier, name: apiKey.name, expiresAt: data.expiresAt.toISOString(), description: data.description ?? null });
    return { apiKey, plainApiKey };
}

/**
 * Updates mutable API key metadata with optimistic-locking via `knownUpdatedAt`.
 *
 * @param db Database client.
 * @param data Payload containing identifier, optimistic-lock timestamp, and new metadata.
 * @returns Updated key row, or `undefined` when the lock check fails.
 */
export async function updateApiKeyMetadata(
    db: DBClient,
    data: {
        apiKeyIdentifier: string;
        knownUpdatedAt: string;
        name: string;
        description?: string | null;
    },
): Promise<ApiKeySchemaSelectType | undefined> {
    const rows = await db.update(ApiKeySchema).set({
        name: data.name,
        description: data.description ?? null,
        updatedAt: sql<string>`now()`,
    }).where(and(
        eq(ApiKeySchema.identifier, data.apiKeyIdentifier),
        sql`${ApiKeySchema.updatedAt} = ${data.knownUpdatedAt}::timestamp`,
    )).returning();

    if (rows[0]) {
        PubSub.publish([TAG_API_KEY, TAG_UPDATE, TAG_AFTER], { identifiers: { api_key: data.apiKeyIdentifier } });
        PubSub.publish([TAG_API_KEY, data.apiKeyIdentifier, TAG_UPDATE, TAG_AFTER], { identifier: data.apiKeyIdentifier, name: data.name, description: data.description });
    }
    return rows[0];
}

/**
 * Extends API key validity and records who performed the prolong operation.
 *
 * @param db Database client.
 * @param data Payload with key identifier, optimistic-lock timestamp, and new expiry data.
 * @returns Updated key row, or `undefined` when the update is rejected.
 */
export async function prolongApiKey(
    db: DBClient,
    data: {
        apiKeyIdentifier: string;
        knownUpdatedAt: string;
        prolongByUserIdentifier: string;
        expiresAt: Date;
    },
): Promise<ApiKeySchemaSelectType | undefined> {
    const rows = await db.update(ApiKeySchema).set({
        expiresAt: data.expiresAt.toISOString(),
        lastProlongedAt: sql<string>`now()`,
        lastProlongedBy: data.prolongByUserIdentifier,
        updatedAt: sql<string>`now()`,
    }).where(and(
        eq(ApiKeySchema.identifier, data.apiKeyIdentifier),
        eq(ApiKeySchema.disabled, false),
        sql`${ApiKeySchema.updatedAt} = ${data.knownUpdatedAt}::timestamp`,
    )).returning();

    if (rows[0]) {
        PubSub.publish([TAG_API_KEY, TAG_UPDATE, TAG_AFTER], { identifiers: { api_key: data.apiKeyIdentifier } });
        PubSub.publish([TAG_API_KEY, data.apiKeyIdentifier, TAG_UPDATE, TAG_AFTER], { identifier: data.apiKeyIdentifier, expiresAt: data.expiresAt.toISOString(), lastProlongedBy: data.prolongByUserIdentifier });
    }
    return rows[0];
}

/**
 * Disables an active API key with optimistic-lock protection.
 *
 * @param db Database client.
 * @param data Payload with key identifier, lock timestamp, and actor identifier.
 * @returns Updated disabled key row, or `undefined` when no row was changed.
 */
export async function disableApiKey(
    db: DBClient,
    data: {
        apiKeyIdentifier: string;
        knownUpdatedAt: string;
        disabledBy: string;
    },
): Promise<ApiKeySchemaSelectType | undefined> {
    const rows = await db.update(ApiKeySchema).set({
        disabled: true,
        disabledAt: sql<string>`now()`,
        disabledBy: data.disabledBy,
        updatedAt: sql<string>`now()`,
    }).where(and(
        eq(ApiKeySchema.identifier, data.apiKeyIdentifier),
        eq(ApiKeySchema.disabled, false),
        sql`${ApiKeySchema.updatedAt} = ${data.knownUpdatedAt}::timestamp`,
    )).returning();

    if (rows[0]) {
        PubSub.publish([TAG_API_KEY, TAG_DISABLE, TAG_AFTER], { identifiers: { api_key: data.apiKeyIdentifier } });
        PubSub.publish([TAG_API_KEY, data.apiKeyIdentifier, TAG_DISABLE, TAG_AFTER], { identifier: data.apiKeyIdentifier, disabled: true, disabledAt: rows[0].disabledAt, disabledBy: rows[0].disabledBy });
    }
    return rows[0];
}

/**
 * Deletes an API key using optimistic locking semantics.
 *
 * @param db Database client.
 * @param data Payload with key identifier and lock timestamp.
 * @returns `true` when a key was deleted, otherwise `false`.
 */
export async function deleteApiKey(
    db: DBClient,
    data: {
        apiKeyIdentifier: string;
        knownUpdatedAt: string;
    },
): Promise<boolean> {
    const rows = await db.delete(ApiKeySchema).where(and(
        eq(ApiKeySchema.identifier, data.apiKeyIdentifier),
        sql`${ApiKeySchema.updatedAt} = ${data.knownUpdatedAt}::timestamp`,
    )).returning();
    PubSub.publish([TAG_API_KEY, TAG_DELETE, TAG_AFTER], { identifiers: { api_key: data.apiKeyIdentifier } });
    return rows.length > 0;
}

/**
 * Replaces all functional permission assignments of an API key atomically.
 *
 * @param db Database client.
 * @param data Payload with key identifier, lock timestamp, grantor, and new permissions.
 * @returns `true` when replacement succeeded, otherwise `false` on lock mismatch.
 */
export async function replaceApiKeyFunctionalPermissions(
    db: DBClient,
    data: {
        apiKeyIdentifier: string;
        grantedBy: string;
        knownUpdatedAt: string;
        permissionIdentifiers: string[];
    },
): Promise<boolean> {
    const touched = await db
        .update(ApiKeySchema)
        .set({ updatedAt: sql<string>`now()` })
        .where(and(
            eq(ApiKeySchema.identifier, data.apiKeyIdentifier),
            sql`${ApiKeySchema.updatedAt} = ${data.knownUpdatedAt}::timestamp`,
        ))
        .returning({ identifier: ApiKeySchema.identifier });
    if (touched.length < 1) return false;

    await db.delete(ApiKeyFunctionalPermission).where(eq(ApiKeyFunctionalPermission.apiKeyIdentifier, data.apiKeyIdentifier));
    if (data.permissionIdentifiers.length > 0) {
        await db.insert(ApiKeyFunctionalPermission).values(
            data.permissionIdentifiers.map((functionalPermissionIdentifier) => ({
                apiKeyIdentifier: data.apiKeyIdentifier,
                functionalPermissionIdentifier,
                grantedBy: data.grantedBy,
            })),
        ).onConflictDoNothing();
    }

    PubSub.publish([TAG_API_KEY, data.apiKeyIdentifier, TAG_UPDATE, TAG_AFTER], { identifiers: { api_key: data.apiKeyIdentifier }, permissionIdentifiers: data.permissionIdentifiers });
    return true;
}

/**
 * Validates a presented secret against active, non-expired API keys.
 *
 * @param db Database client.
 * @param apiKeySecret Plaintext key presented by a caller.
 * @returns Matching active API key row, or `undefined` when validation fails.
 */
export async function validateApiKeySecret(db: DBClient, apiKeySecret: string): Promise<ApiKeySchemaSelectType | undefined> {
    const [row] = await db
        .select()
        .from(ApiKeySchema)
        .where(and(
            eq(ApiKeySchema.disabled, false),
            sql`${ApiKeySchema.expiresAt} > now()`,
            sql`${ApiKeySchema.keyHash} = crypt(${apiKeySecret}, ${ApiKeySchema.keyHash})`,
        ))
        .orderBy(desc(ApiKeySchema.createdAt))
        .limit(1);
    return row;
}

/**
 * Returns effective permissions for an active API key; returns empty if key is invalid.
 *
 * @param db Database client.
 * @param apiKeyIdentifier API key identifier.
 * @returns Effective functional permissions, or an empty list when key is not active.
 */
export async function getFunctionalPermissionsOfApiKey(
    db: DBClient,
    apiKeyIdentifier: string,
): Promise<FunctionalPermissionSelectType[]> {
    // CRITICAL: Must check key existence and expiry status, not just permissions
    // This prevents fetching permissions for expired or disabled keys
    const [key] = await db.select().from(ApiKeySchema).where(
        and(
            eq(ApiKeySchema.identifier, apiKeyIdentifier),
            eq(ApiKeySchema.disabled, false),
            sql`${ApiKeySchema.expiresAt} > now()`  // Only active, non-expired keys
        )
    ).limit(1);

    if (!key) return [];  // Key doesn't exist, is disabled, or expired

    const assignments = await db
        .select({ functionalPermissionIdentifier: ApiKeyFunctionalPermission.functionalPermissionIdentifier })
        .from(ApiKeyFunctionalPermission)
        .where(eq(ApiKeyFunctionalPermission.apiKeyIdentifier, apiKeyIdentifier));
    const ids = assignments.map((row) => row.functionalPermissionIdentifier);
    if (ids.length === 0) return [];
    return await db.select().from(FunctionalPermission).where(inArray(FunctionalPermission.identifier, ids)) as FunctionalPermissionSelectType[];
}
