import type { ApiInstance } from "@/apps/api.ts";
import { authorize } from "@/services/Auth.ts";
import { FP_MANAGE_DATA_TYPES } from "@/services/auth/FunctionalPermissions.ts";
import { clearScriptLogs, getScriptLogs } from "@/repo/ScriptLogRepo.ts";
import { status } from "elysia";
import { Type } from "@sinclair/typebox";

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/script-log", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_MANAGE_DATA_TYPES]);
        if (!authz.some((p) => p.identifier === FP_MANAGE_DATA_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_DATA_TYPES.functionalPermissionName}`);
        }

        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? 50));

        const logLevelRaw = context.query.logLevel as string | undefined;
        const scriptCategoryRaw = context.query.scriptCategory as string | undefined;

        const result = await getScriptLogs(
            context.dbClient,
            {
                logLevel: logLevelRaw ? logLevelRaw.split(",").filter(Boolean) : undefined,
                scriptCategory: scriptCategoryRaw ? scriptCategoryRaw.split(",").filter(Boolean) : undefined,
                dataTypeIdentifier: (context.query.dataTypeIdentifier as string) || undefined,
                productRequestIdentifier: (context.query.productRequestIdentifier as string) || undefined,
            },
            page,
            pageSize,
        );

        return {
            rows: result.rows,
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
        };
    }, {
        query: Type.Object({
            page: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.String()])),
            pageSize: Type.Optional(Type.Union([Type.Number({ minimum: 1 }), Type.String()])),
            logLevel: Type.Optional(Type.String()),
            scriptCategory: Type.Optional(Type.String()),
            dataTypeIdentifier: Type.Optional(Type.String()),
            productRequestIdentifier: Type.Optional(Type.String()),
        }),
        response: {
            200: Type.Object({
                rows: Type.Array(Type.Any()),
                total: Type.Number(),
                page: Type.Number(),
                pageSize: Type.Number(),
            }, { description: "Paginated script log entries with pagination metadata." }),
            401: Type.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: Type.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
        },
        detail: {
            tags: ["Script Log"],
            summary: "Get script log entries",
            description:
                "Retrieve paginated script log entries with optional filters for log level, script category, data type, and product request. Requires 'manage_data_types' permission.",
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
                    description: "Number of entries per page (default 50).",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 1, default: 50 },
                },
                {
                    name: "logLevel",
                    description: "Comma-separated list of log levels to filter by (debug, info, warn, error).",
                    in: "query",
                    required: false,
                    schema: { type: "string" },
                },
                {
                    name: "scriptCategory",
                    description: "Comma-separated list of script categories to filter by.",
                    in: "query",
                    required: false,
                    schema: { type: "string" },
                },
                {
                    name: "dataTypeIdentifier",
                    description: "Filter by data type UUID.",
                    in: "query",
                    required: false,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "productRequestIdentifier",
                    description: "Filter by product request UUID.",
                    in: "query",
                    required: false,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    app.delete("/script-log", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_MANAGE_DATA_TYPES]);
        if (!authz.some((p) => p.identifier === FP_MANAGE_DATA_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_DATA_TYPES.functionalPermissionName}`);
        }
        const deletedCount = await clearScriptLogs(context.dbClient);
        return { success: true, deletedCount };
    }, {
        detail: {
            tags: ["Script Log"],
            summary: "Clear script log",
            description: "Deletes all script log entries. Requires 'manage_data_types' permission.",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string" },
                },
            ],
        },
        response: {
            200: Type.Object({ success: Type.Boolean(), deletedCount: Type.Number() }, { description: "Confirmation of the cleared script log with the number of deleted entries." }),
            401: Type.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: Type.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
        },
    });
}
