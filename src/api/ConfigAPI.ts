import {status} from "elysia";
import {Value} from "@sinclair/typebox/value";
import type {ApiInstance} from "@/apps/api.ts";
import {requirePermissions} from "@/services/Auth.ts";
import {FP_MANAGE_CONFIGURATION} from "@/services/auth/FunctionalPermissions.ts";
import {getAllConfigEntries, getConfigEntriesByKey, updateConfigEntry, upsertConfigEntry} from "@/repo/ConfigRepo.ts";
import {parseConfigValue, validateConfigInputFormat} from "@/services/Config.ts";
import {
    type ConfigEntrySelectType,
    schemaForConfigType,
    ConfigDomainsResponseSchema,
    ConfigEntryUiSchema,
    ConfigUpdateBodySchema,
    ConfigParamsSchema,
} from "@/types/ConfigType.ts";
import {
    BadRequestErrorResponseSchema,
    ForbiddenErrorResponseSchema,
    NotFoundErrorResponseSchema,
    OptimisticLockConflictResponseSchema,
    UnauthenticatedErrorResponseSchema,
} from "@/types/ApiType.ts";

function toUiEntry(entry: ConfigEntrySelectType): {
    domain: string;
    key: string;
    description?: string;
    type?: string;
    value: unknown;
    inputFormat: string;
    outputFormat: string;
    userProfile: boolean;
    updatedAt: string;
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
        updatedAt: entry.updatedAt,
    };
}

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/config", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_MANAGE_CONFIGURATION]);
        if (!permissionCheck.ok) return permissionCheck.denial;

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
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
        },
    });

    app.put("/config/:domain/:key", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_MANAGE_CONFIGURATION]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const [entry] = await getConfigEntriesByKey(context.dbClient, context.params.domain, context.params.key, { limit: 1 });
        if (!entry || !entry.editInUI) return status(404, { error: "Configuration entry not found" });

        const parsed = parseConfigValue(entry.type, context.body.value);
        if (!parsed.ok) return status(400, { error: parsed.error });

        const formatValidation = validateConfigInputFormat(entry, parsed.value);
        if (!formatValidation.ok) return status(400, { error: formatValidation.error });

        const schema = schemaForConfigType(entry.type);
        if (!Value.Check(schema, parsed.value)) return status(400, { error: "Type validation failed" });

        const [updated] = await updateConfigEntry(context.dbClient, context.params.domain, context.params.key, parsed.value, context.body.knownUpdatedAt);
        if (!updated) {
            const [current] = await getConfigEntriesByKey(context.dbClient, context.params.domain, context.params.key, { limit: 1 });
            return status(409, {
                error: "Config entry was modified by another user",
                currentValue: current?.value ?? null,
            });
        }

        return toUiEntry(updated);
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
            400: BadRequestErrorResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
            409: OptimisticLockConflictResponseSchema,
        },
    });
}

