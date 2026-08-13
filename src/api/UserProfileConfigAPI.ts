import { status } from "elysia";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { ApiInstance } from "@/apps/api.ts";
import { getConfigEntriesByKey, getAllConfigEntries } from "@/repo/ConfigRepo.ts";
import { getUserProfileConfigEntry, getUserProfileConfigEntries, upsertUserProfileConfigEntry, deleteUserProfileConfigEntry } from "@/repo/UserProfileConfigRepo.ts";
import { parseConfigValue, validateConfigInputFormat } from "@/services/Config.ts";
import { type ConfigEntrySelectType, schemaForConfigType } from "@/types/ConfigType.ts";
import {
    UserProfileConfigEntrySchema,
    UserProfileConfigParamsSchema,
    UserProfileConfigResponseSchema,
    UserProfileConfigUpdateSchema,
} from "@/types/UserProfileConfigType.ts";
import { ErrorResponseSchema } from "@/types/ApiType.ts";

function canonicalizeJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item));
    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        return Object.keys(obj).sort().reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = canonicalizeJson(obj[key]);
            return acc;
        }, {});
    }
    return value;
}

function equalsJson(a: unknown, b: unknown): boolean {
    return JSON.stringify(canonicalizeJson(a)) === JSON.stringify(canonicalizeJson(b));
}

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/me/config", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const oid = typeof claims.oid === "string" ? claims.oid : undefined;
        if (!oid) return status(401, "Not authenticated");

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
            401: Type.String({ description: "Unauthenticated. No valid session, API key, or bearer token was provided." }),
        },
    });

    app.put("/me/config/:domain/:key", async (context) => {
        if (!context.session?.idTokenClaims) {
            return status(403, "Profile configuration can only be modified via browser session");
        }

        const claims = context.session.idTokenClaims;
        const oid = typeof claims.oid === "string" ? claims.oid : undefined;
        if (!oid) return status(401, "Not authenticated");

        const [entry] = await getConfigEntriesByKey(context.dbClient, context.params.domain, context.params.key, { limit: 1 });
        if (!entry || !entry.userProfile) return status(404, "Configuration entry not found or not user-configurable");

        const existingOverride = await getUserProfileConfigEntry(context.dbClient, oid, context.params.domain, context.params.key);

        if (context.body.knownValue !== undefined && !equalsJson(context.body.knownValue, existingOverride?.value ?? null)) {
            return status(409, {
                error: "Profile entry was modified in another tab",
                currentValue: existingOverride?.value ?? null,
            });
        }

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
            };
        }

        const parsed = parseConfigValue(entry.type, context.body.value);
        if (!parsed.ok) return status(400, parsed.error);

        const formatValidation = validateConfigInputFormat(entry, parsed.value);
        if (!formatValidation.ok) return status(400, formatValidation.error);

        const schema = schemaForConfigType(entry.type);
        if (!Value.Check(schema, parsed.value)) return status(400, "Type validation failed");

        const [updated] = await upsertUserProfileConfigEntry(context.dbClient, {
            domain: context.params.domain,
            key: context.params.key,
            userIdentifier: oid,
            value: parsed.value,
        });

        return {
            domain: entry.domain,
            key: entry.key,
            description: entry.description ?? null,
            type: entry.type as string,
            value: entry.value,
            userValue: updated!.value,
            inputFormat: entry.inputFormat,
            outputFormat: entry.outputFormat,
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
            400: Type.Union([Type.String(), ErrorResponseSchema], { description: "Bad request. The request body or parameters failed validation." }),
            401: Type.String({ description: "Unauthenticated. No valid session, API key, or bearer token was provided." }),
            403: Type.String({ description: "Forbidden. Profile configuration can only be modified via browser session." }),
            404: Type.String({ description: "Not found. The requested resource does not exist." }),
            409: Type.Object({
                error: Type.String(),
                currentValue: Type.Any(),
            }, { description: "Conflict. The profile entry was modified concurrently; currentValue contains the latest stored override value." }),
        },
    });
}
