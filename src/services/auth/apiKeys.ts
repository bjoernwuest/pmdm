import {TTLMap} from "@/utils/TTLMap.ts";
import {type DBClient} from "@/services/DatabaseDriver.ts";
import {PubSub} from "@/services/PubSub.ts";
import {validateApiKeySecret,} from "@/repo/ApiKeyRepo.ts";
import {type FunctionalPermissionSelectType} from "@/types/FunctionalPermissionType.ts";
import {getFunctionalPermissionsOfApiKey} from "@/repo/ApiKeyRepo.ts";
import { TAG_API_KEY, TAG_UPDATE } from "@/types/PubSubType";

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

type ApiKeyPermissionCacheEntry = { permissions: FunctionalPermissionSelectType[]; expiresAt: number };
const apiKeyFunctionalPermissionsCache = new TTLMap<string, ApiKeyPermissionCacheEntry>(24 * 60 * 60);

PubSub.subscribe({ and: [TAG_API_KEY, TAG_UPDATE] }, (msg) => {
    const apiKeyIdentifier = msg.data?.identifiers?.api_key;
    if (typeof apiKeyIdentifier === "string" && apiKeyIdentifier.length > 0) {
        apiKeyFunctionalPermissionsCache.delete(apiKeyIdentifier);
    }
});

export async function getApiKeyPermissions(DBClient: DBClient, apiKeyIdentifier: string): Promise<FunctionalPermissionSelectType[]> {
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
