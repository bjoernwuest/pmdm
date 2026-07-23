import {status} from "elysia";
import { Type } from "@sinclair/typebox";
import {Value} from "@sinclair/typebox/value";
import type {ApiInstance} from "@/apps/api.ts";
import {authorize} from "@/services/Auth.ts";
import {FP_MANAGE_CONFIGURATION} from "@/services/auth/FunctionalPermissions.ts";
import {getAllConfigEntries, getConfigEntriesByKey, upsertConfigEntry} from "@/repo/ConfigRepo.ts";
import {parseConfigValue, validateConfigInputFormat} from "@/services/Config.ts";
import {
    type ConfigEntrySelectType,
    schemaForConfigType,
    ConfigDomainsResponseSchema,
    ConfigEntryUiSchema,
    ConfigUpdateBodySchema,
    ConfigParamsSchema,
    ConfigUpdateConflictSchema,
} from "@/types/ConfigType.ts";
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

function toUiEntry(entry: ConfigEntrySelectType): {
    domain: string;
    key: string;
    description?: string;
    type?: string;
    value: unknown;
    inputFormat: string;
    outputFormat: string;
    userProfile: boolean;
} {
    return {
        domain: entry.domain,
        key: entry.key,
        description: entry.description ?? undefined,
        type: entry.type as string,
        value: entry.value,
        inputFormat: entry.inputFormat,
        outputFormat: entry.outputFormat,
        userProfile: entry.userProfile,
    };
}

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/config", async (context) => {
        const authz = await authorize(context.dbClient, context.session?.idTokenClaims ?? context.tokenClaims ?? {}, [FP_MANAGE_CONFIGURATION]);
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_CONFIGURATION.functionalPermissionName}`);
        }

        const entries = await getAllConfigEntries(context.dbClient, true);
        const grouped = entries.reduce<Map<string, ReturnType<typeof toUiEntry>[]>>((acc, entry) => {
            if (!acc.has(entry.domain)) acc.set(entry.domain, []);
            acc.get(entry.domain)!.push(toUiEntry(entry));
            return acc;
        }, new Map());

        const domains = [...grouped.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([domain, domainEntries]) => ({
                domain,
                entries: domainEntries.sort((a, b) => a.key.localeCompare(b.key)),
            }));

        return { domains };
    }, {
        detail: {
            tags: ["Admin"],
            summary: "Get editable application configuration entries",
            description: "Returns all application configuration entries that are flagged with editInUI=true, grouped by domain. Requires FP_MANAGE_CONFIGURATION.",
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
            200: ConfigDomainsResponseSchema,
            403: Type.String(),
        },
    });

    app.put("/config/:domain/:key", async (context) => {
        const authz = await authorize(context.dbClient, context.session?.idTokenClaims ?? context.tokenClaims ?? {}, [FP_MANAGE_CONFIGURATION]);
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_CONFIGURATION.functionalPermissionName}`);
        }

        const [entry] = await getConfigEntriesByKey(context.dbClient, context.params.domain, context.params.key, { limit: 1 });
        if (!entry || !entry.editInUI) return status(404, "Configuration entry not found");

        if (!equalsJson(context.body.knownValue, entry.value)) {
            return status(409, {
                error: "Config entry was modified by another user",
                currentValue: entry.value,
            });
        }

        const parsed = parseConfigValue(entry.type, context.body.value);
        if (!parsed.ok) return status(400, parsed.error);

        const formatValidation = validateConfigInputFormat(entry, parsed.value);
        if (!formatValidation.ok) return status(400, formatValidation.error);

        const schema = schemaForConfigType(entry.type);
        if (!Value.Check(schema, parsed.value)) return status(400, "Type validation failed");

        const [updated] = await upsertConfigEntry(context.dbClient, {
            ...entry,
            value: parsed.value,
        });

        return toUiEntry(updated!);
    }, {
        body: ConfigUpdateBodySchema,
        params: ConfigParamsSchema,
        detail: {
            tags: ["Admin"],
            summary: "Update one configuration entry",
            description: "Updates a single configuration entry with optimistic locking. Requires FP_MANAGE_CONFIGURATION.",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
                {
                    name: "domain",
                    description: "The configuration domain (e.g., 'auth', 'ui').",
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
            200: ConfigEntryUiSchema,
            400: Type.Union([Type.String(), ErrorResponseSchema]),
            403: Type.String(),
            404: Type.String(),
            409: ConfigUpdateConflictSchema,
        },
    });
}

