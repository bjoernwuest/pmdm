import { status } from "elysia";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { ApiInstance } from "@/apps/api.ts";
import { getConfigEntriesByKey, getAllConfigEntries } from "@/repo/ConfigRepo.ts";
import { getUserProfileConfigEntry, getUserProfileConfigEntries, upsertUserProfileConfigEntry, updateUserProfileConfigEntry, deleteUserProfileConfigEntry } from "@/repo/UserProfileConfigRepo.ts";
import { parseConfigValue, validateConfigInputFormat } from "@/services/Config.ts";
import { type ConfigEntrySelectType, schemaForConfigType } from "@/types/ConfigType.ts";
import {
    UserProfileConfigEntrySchema,
    UserProfileConfigParamsSchema,
    UserProfileConfigResponseSchema,
    UserProfileConfigUpdateSchema,
} from "@/types/UserProfileConfigType.ts";
import {
    BadRequestErrorResponseSchema,
    NotFoundErrorResponseSchema,
    OptimisticLockConflictResponseSchema,
    UnauthenticatedErrorResponseSchema,
} from "@/types/ApiType.ts";

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/me/config", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const oid = typeof claims.oid === "string" ? claims.oid : undefined;
        if (!oid) return status(401, { error: "Not authenticated" });

        const allEntries = await getAllConfigEntries(context.dbClient, true);
        const userProfileEntries = allEntries.filter((entry) => entry.userProfile === true);
        const userOverrides = oid ? await getUserProfileConfigEntries(context.dbClient, oid) : [];

        const userOverrideMap = new Map<string, unknown>();
        for (const override of userOverrides) {
            userOverrideMap.set(`${override.domain}::${override.key}`, override.value);
        }

        const entries = userProfileEntries.map((entry) => ({
            domain: entry.domain,
            key: entry.key,
            description: entry.description ?? null,
            type: entry.type as string,
            value: entry.value,
            userValue: userOverrideMap.get(`${entry.domain}::${entry.key}`) ?? null,
            inputFormat: entry.inputFormat,
            outputFormat: entry.outputFormat,
            updatedAt: userOverrides.find((o) => o.domain === entry.domain && o.key === entry.key)?.updatedAt ?? null,
        }));

        return { entries };
    }, {
        detail: {
            tags: ["User Profile"],
            summary: "Get user profile configuration entries",
            description: "Returns all configuration entries where userProfile=true, with both the global default and the current user's override value.",
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
        response: {
            200: UserProfileConfigResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
        },
    });

    app.put("/me/config/:domain/:key", async (context) => {
        if (!context.session?.idTokenClaims) {
            return status(403, { error: "Profile configuration can only be modified via browser session" });
        }

        const claims = context.session.idTokenClaims;
        const oid = typeof claims.oid === "string" ? claims.oid : undefined;
        if (!oid) return status(401, { error: "Not authenticated" });

        const [entry] = await getConfigEntriesByKey(context.dbClient, context.params.domain, context.params.key, { limit: 1 });
        if (!entry || !entry.userProfile) return status(404, { error: "Configuration entry not found or not user-configurable" });

        const existingOverride = await getUserProfileConfigEntry(context.dbClient, oid, context.params.domain, context.params.key);

        if (context.body.value === null || context.body.value === undefined) {
            await deleteUserProfileConfigEntry(context.dbClient, oid, context.params.domain, context.params.key);
            return {
                domain: entry.domain,
                key: entry.key,
                description: entry.description ?? null,
                type: entry.type as string,
                value: entry.value,
                userValue: null,
                inputFormat: entry.inputFormat,
                outputFormat: entry.outputFormat,
                updatedAt: null,
            };
        }

        const parsed = parseConfigValue(entry.type, context.body.value);
        if (!parsed.ok) return status(400, { error: parsed.error });

        const formatValidation = validateConfigInputFormat(entry, parsed.value);
        if (!formatValidation.ok) return status(400, { error: formatValidation.error });

        const schema = schemaForConfigType(entry.type);
        if (!Value.Check(schema, parsed.value)) return status(400, { error: "Type validation failed" });

        let updated;
        if (context.body.knownUpdatedAt !== undefined) {
            // Compare-and-swap on the override's updatedAt: the write becomes a no-op on mismatch.
            [updated] = await updateUserProfileConfigEntry(context.dbClient, oid, context.params.domain, context.params.key, parsed.value, context.body.knownUpdatedAt);
            if (!updated) {
                return status(409, {
                    error: "Profile entry was modified in another tab",
                    currentValue: existingOverride?.value ?? null,
                });
            }
        } else {
            [updated] = await upsertUserProfileConfigEntry(context.dbClient, {
                domain: context.params.domain,
                key: context.params.key,
                userIdentifier: oid,
                value: parsed.value,
            });
        }

        return {
            domain: entry.domain,
            key: entry.key,
            description: entry.description ?? null,
            type: entry.type as string,
            value: entry.value,
            userValue: updated!.value,
            inputFormat: entry.inputFormat,
            outputFormat: entry.outputFormat,
            updatedAt: updated!.updatedAt,
        };
    }, {
        body: UserProfileConfigUpdateSchema,
        params: UserProfileConfigParamsSchema,
        detail: {
            tags: ["User Profile"],
            summary: "Update user profile configuration entry",
            description: "Upserts the current user's override for a specific user-configurable entry. Session-only. Send value=null to reset to default.",
            parameters: [
                {
                    name: "domain",
                    description: "The configuration domain.",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
                {
                    name: "key",
                    description: "The configuration key within the domain.",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
        },
        response: {
            200: UserProfileConfigEntrySchema,
            400: BadRequestErrorResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            403: Type.Object({ error: Type.String() }, { description: "Forbidden. Profile configuration can only be modified via browser session." }),
            404: NotFoundErrorResponseSchema,
            409: OptimisticLockConflictResponseSchema,
        },
    });
}
