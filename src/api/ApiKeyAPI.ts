import type {ApiInstance} from "@/apps/api.ts";
import {status} from "elysia";
import { Type } from "@sinclair/typebox";
import {authorize, getApiKeyLength, getApiKeyValidityDays, getLoggedinUserObject} from "@/services/Auth.ts";
import {FP_CREATE_API_KEYS, FP_PROLONG_API_KEYS, FP_VIEW_API_KEYS,} from "@/services/auth/FunctionalPermissions.ts";
import {
    createApiKey,
    deleteApiKey,
    disableApiKey,
    getApiKey,
    getApiKeyCount,
    getApiKeyFunctionalPermissions,
    getApiKeys,
    isPgcryptoMissingError,
    prolongApiKey,
    replaceApiKeyFunctionalPermissions,
    updateApiKeyMetadata,
} from "@/repo/ApiKeyRepo.ts";
import {getFunctionalPermissions} from "@/repo/FunctionalPermissionRepo.ts";
import {getUsers} from "@/repo/UserRepo.ts";
import {runInTransaction} from "@/services/DatabaseDriver.ts";
import {
    ApiKeyCreateBodySchema,
    ApiKeyCreatedResponseSchema,
    ApiKeyDetailSchema,
    ApiKeyDisableResponseSchema,
    ApiKeyPermissionsBodySchema,
    ApiKeyProlongBodySchema,
    ApiKeyProlongResponseSchema,
    ApiKeysResponseSchema,
    ApiKeyUpdateMetadataBodySchema,
    ApiKeyUpdatedAtResponseSchema,
} from "@/types/ApiKeyType.ts";
import { OptimisticLockBodySchema, SuccessResponseSchema } from "@/types/ApiType.ts";
import type { IdentifierType } from "@/types/helpers.ts";
import {getUserListPageSizes} from "@/services/ui_config.ts";

function parseBooleanQuery(value: unknown): boolean {
    return value === true || value === "true" || value === "1";
}

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/api_keys", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_VIEW_API_KEYS]);
        if (!authz.some((perm) => perm.identifier === FP_VIEW_API_KEYS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_VIEW_API_KEYS.functionalPermissionName}`);
        }

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? availablePageSizes[0] ?? 10));
        const includeDisabled = parseBooleanQuery(context.query.includeDisabled);

        const total = await getApiKeyCount(context.dbClient, includeDisabled);
        const rows = await getApiKeys(context.dbClient, { page, pageSize }, includeDisabled);
        const apiKeys = await Promise.all(rows.map(async (apiKey) => {
            const permissions = await getApiKeyFunctionalPermissions(context.dbClient, apiKey.identifier);
            return {
                identifier: apiKey.identifier,
                name: apiKey.name,
                description: apiKey.description ?? null,
                createdBy: apiKey.createdBy,
                createdAt: apiKey.createdAt,
                updatedAt: apiKey.updatedAt,
                expiresAt: apiKey.expiresAt,
                lastProlongedAt: apiKey.lastProlongedAt ?? null,
                lastProlongedBy: apiKey.lastProlongedBy ?? null,
                disabled: apiKey.disabled,
                disabledAt: apiKey.disabledAt ?? null,
                disabledBy: apiKey.disabledBy ?? null,
                permissionNames: permissions.map((perm) => perm.functionalPermissionName),
            };
        }));

        return {
            apiKeys,
            page,
            pageSize,
            total,
            availablePageSizes,
            includeDisabled,
        };
    }, {
        response: { 200: ApiKeysResponseSchema, 403: Type.String() },
        detail: {
            tags: ["API Key"],
            summary: "Get paged API key list",
            description: "Retrieve API keys with metadata and assigned permission names. Requires FP_VIEW_API_KEYS permission. Authenticate with an API key using the X-API-Key header.",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
                {
                    name: "page",
                    description: "Zero-based page number (default 0).",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 0, default: 0 },
                },
                {
                    name: "pageSize",
                    description: "Number of API keys per page.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 1 },
                },
                {
                    name: "includeDisabled",
                    description: "Whether to include disabled API keys (default false).",
                    in: "query",
                    required: false,
                    schema: { type: "boolean", default: false },
                },
            ],
        },
    });

    app.get("/api_keys/:apikeyid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_VIEW_API_KEYS]);
        if (!authz.some((perm) => perm.identifier === FP_VIEW_API_KEYS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_VIEW_API_KEYS.functionalPermissionName}`);
        }

        const apiKey = await getApiKey(context.dbClient, context.params.apikeyid);
        if (!apiKey) return status(404, "API key does not exist");

        const [permissions, allPermissions] = await Promise.all([
            getApiKeyFunctionalPermissions(context.dbClient, apiKey.identifier),
            getFunctionalPermissions(context.dbClient),
        ]);

        // Collect unique user UUIDs referenced by the API key
        const userIds = new Set<string>();
        userIds.add(apiKey.createdBy);
        if (apiKey.lastProlongedBy) userIds.add(apiKey.lastProlongedBy);
        if (apiKey.disabledBy) userIds.add(apiKey.disabledBy);
        const identifierList: IdentifierType[] = [...userIds].map((id) => ({ identifier: id }));
        const relatedUsersList = identifierList.length > 0
            ? await getUsers(context.dbClient, identifierList, undefined, true)
            : [];
        const relatedUsers: Record<string, { firstName: string; lastName: string; email: string }> = {};
        for (const user of relatedUsersList) {
            relatedUsers[user.identifier] = {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
            };
        }

        return {
            apiKey: {
                identifier: apiKey.identifier,
                name: apiKey.name,
                description: apiKey.description ?? null,
                createdBy: apiKey.createdBy,
                createdAt: apiKey.createdAt,
                updatedAt: apiKey.updatedAt,
                expiresAt: apiKey.expiresAt,
                lastProlongedAt: apiKey.lastProlongedAt ?? null,
                lastProlongedBy: apiKey.lastProlongedBy ?? null,
                disabled: apiKey.disabled,
                disabledAt: apiKey.disabledAt ?? null,
                disabledBy: apiKey.disabledBy ?? null,
                permissionNames: permissions.map((perm) => perm.functionalPermissionName),
            },
            permissionIdentifiers: permissions.map((perm) => perm.identifier),
            allPermissions,
            relatedUsers,
        };
    }, {
        response: { 200: ApiKeyDetailSchema, 403: Type.String(), 404: Type.String() },
        detail: {
            tags: ["API Key"],
            summary: "Get API key details",
            description: "Retrieve one API key with metadata and editable permission assignment context. Requires FP_VIEW_API_KEYS permission. Authenticate with an API key using the X-API-Key header.",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
                {
                    name: "apikeyid",
                    description: "UUID identifier of the API key.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    app.post("/api_keys", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_CREATE_API_KEYS]);
        if (!authz.some((perm) => perm.identifier === FP_CREATE_API_KEYS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_CREATE_API_KEYS.functionalPermissionName}`);
        }

        const user = await getLoggedinUserObject(context.dbClient, claims);
        if (!user) return status(403, 'Permission denied. Must be executed by human user');
        const keyLength = await getApiKeyLength(context.dbClient);
        const validityDays = await getApiKeyValidityDays(context.dbClient);
        const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

        let created;
        try {
            created = await runInTransaction(context.dbClient, async (tx) => {
                return await createApiKey(tx, {
                    createdBy: user.identifier,
                    name: context.body.name,
                    description: context.body.description ?? null,
                    expiresAt,
                    keyLength,
                    permissionIdentifiers: context.body.permissionIdentifiers ?? [],
                });
            });
        } catch (error) {
            if (isPgcryptoMissingError(error)) {
                return status(500, "API key could not be created because PostgreSQL extension 'pgcrypto' is not installed. Run: CREATE EXTENSION IF NOT EXISTS pgcrypto;");
            }
            throw error;
        }

        return {
            identifier: created.apiKey.identifier,
            plainApiKey: created.plainApiKey,
            expiresAt: created.apiKey.expiresAt,
            keyLength,
            validityDays,
        };
    }, {
        body: ApiKeyCreateBodySchema,
        response: {
            200: ApiKeyCreatedResponseSchema,
            403: Type.String(),
            500: Type.String(),
        },
        detail: {
            tags: ["API Key"],
            summary: "Create API key",
            description: "Create a new API key and return the plaintext key once. Requires FP_CREATE_API_KEYS permission. Must be called by a human user (not via API key). Authenticate with an API key using the X-API-Key header.",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
            ],
        },
    });

    app.put("/api_keys/:apikeyid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_PROLONG_API_KEYS]);
        if (!authz.some((perm) => perm.identifier === FP_PROLONG_API_KEYS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_PROLONG_API_KEYS.functionalPermissionName}`);
        }

        const updated = await updateApiKeyMetadata(context.dbClient, {
            apiKeyIdentifier: context.params.apikeyid,
            knownUpdatedAt: context.body.knownUpdatedAt,
            name: context.body.name,
            description: context.body.description ?? null,
        });

        if (!updated) return status(409, "API key was modified by another user");
        return { updatedAt: updated.updatedAt };
    }, {
        body: ApiKeyUpdateMetadataBodySchema,
        response: { 200: ApiKeyUpdatedAtResponseSchema, 403: Type.String(), 409: Type.String() },
        detail: {
            tags: ["API Key"],
            summary: "Update API key metadata",
            description: "Update the name and description of an API key with optimistic locking. Requires FP_PROLONG_API_KEYS permission.",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
                {
                    name: "apikeyid",
                    description: "UUID identifier of the API key to update.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    app.put("/api_keys/:apikeyid/prolong", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_PROLONG_API_KEYS]);
        if (!authz.some((perm) => perm.identifier === FP_PROLONG_API_KEYS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_PROLONG_API_KEYS.functionalPermissionName}`);
        }

        const user = await getLoggedinUserObject(context.dbClient, claims);
        if (!user) return status(403, 'Permission denied. Must be executed by human user');
        const expiresAt = new Date(Date.now() + context.body.days * 24 * 60 * 60 * 1000);

        const updated = await prolongApiKey(context.dbClient, {
            apiKeyIdentifier: context.params.apikeyid,
            knownUpdatedAt: context.body.knownUpdatedAt,
            prolongByUserIdentifier: user.identifier,
            expiresAt,
        });

        if (!updated) return status(409, "API key was modified, disabled, or no longer exists");
        return {
            updatedAt: updated.updatedAt,
            expiresAt: updated.expiresAt,
            lastProlongedAt: updated.lastProlongedAt ?? null,
            lastProlongedBy: updated.lastProlongedBy ?? null,
        };
    }, {
        body: ApiKeyProlongBodySchema,
        response: {
            200: ApiKeyProlongResponseSchema,
            403: Type.String(),
            409: Type.String(),
        },
        detail: {
            tags: ["API Key"],
            summary: "Prolong API key expiry",
            description: "Extend the expiry date of an API key by a specified number of days. Requires FP_PROLONG_API_KEYS permission. Must be called by a human user (not via API key).",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
                {
                    name: "apikeyid",
                    description: "UUID identifier of the API key to prolong.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    app.put("/api_keys/:apikeyid/disable", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_PROLONG_API_KEYS]);
        if (!authz.some((perm) => perm.identifier === FP_PROLONG_API_KEYS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_PROLONG_API_KEYS.functionalPermissionName}`);
        }

        const user = await getLoggedinUserObject(context.dbClient, claims);
        if (!user) return status(403, 'Permission denied. Must be executed by human user');
        const updated = await disableApiKey(context.dbClient, {
            apiKeyIdentifier: context.params.apikeyid,
            knownUpdatedAt: context.body.knownUpdatedAt,
            disabledBy: user.identifier,
        });
        if (!updated) return status(409, "API key was modified, already disabled, or no longer exists");
        return {
            updatedAt: updated.updatedAt,
            disabled: updated.disabled,
            disabledAt: updated.disabledAt ?? null,
            disabledBy: updated.disabledBy ?? null,
        };
    }, {
        body: OptimisticLockBodySchema,
        response: {
            200: ApiKeyDisableResponseSchema,
            403: Type.String(),
            409: Type.String(),
        },
        detail: {
            tags: ["API Key"],
            summary: "Disable an API key",
            description: "Permanently disable an API key with optimistic locking. A disabled key can no longer authenticate. Requires FP_PROLONG_API_KEYS permission. Must be called by a human user (not via API key).",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
                {
                    name: "apikeyid",
                    description: "UUID identifier of the API key to disable.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    app.put("/api_keys/:apikeyid/permissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_PROLONG_API_KEYS]);
        if (!authz.some((perm) => perm.identifier === FP_PROLONG_API_KEYS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_PROLONG_API_KEYS.functionalPermissionName}`);
        }

        const user = await getLoggedinUserObject(context.dbClient, claims);
        if (!user) return status(403, 'Permission denied. Must be executed by human user');
        const ok = await runInTransaction(context.dbClient, async (tx) => {
            return await replaceApiKeyFunctionalPermissions(tx, {
                apiKeyIdentifier: context.params.apikeyid,
                grantedBy: user.identifier,
                knownUpdatedAt: context.body.knownUpdatedAt,
                permissionIdentifiers: context.body.permissionIdentifiers,
            });
        });

        if (!ok) return status(409, "API key was modified by another user");
        return { success: true };
    }, {
        body: ApiKeyPermissionsBodySchema,
        response: { 200: SuccessResponseSchema, 403: Type.String(), 409: Type.String() },
        detail: {
            tags: ["API Key"],
            summary: "Replace API key functional permissions",
            description: "Replaces all functional permissions assigned to an API key with optimistic locking. Requires FP_PROLONG_API_KEYS permission. Must be called by a human user (not via API key).",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
                {
                    name: "apikeyid",
                    description: "UUID identifier of the API key whose permissions are being replaced.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    app.delete("/api_keys/:apikeyid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_PROLONG_API_KEYS]);
        if (!authz.some((perm) => perm.identifier === FP_PROLONG_API_KEYS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_PROLONG_API_KEYS.functionalPermissionName}`);
        }

        const deleted = await deleteApiKey(context.dbClient, {
            apiKeyIdentifier: context.params.apikeyid,
            knownUpdatedAt: context.body.knownUpdatedAt,
        });
        if (!deleted) return status(409, "API key was modified by another user");
        return { success: true };
    }, {
        body: OptimisticLockBodySchema,
        response: { 200: SuccessResponseSchema, 403: Type.String(), 409: Type.String() },
        detail: {
            tags: ["API Key"],
            summary: "Delete an API key",
            description: "Permanently delete an API key with optimistic locking. Requires FP_PROLONG_API_KEYS permission.",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
                {
                    name: "apikeyid",
                    description: "UUID identifier of the API key to delete.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });
}
