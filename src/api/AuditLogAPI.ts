import type { ApiInstance } from "@/apps/api.ts";
import { authorize, getLoggedinUserObject } from "@/services/Auth.ts";
import { FP_CLEAR_AUDIT_LOG, FP_READ_AUDIT_LOG } from "@/services/auth/FunctionalPermissions.ts";
import { getAuditEntries, insertAuditEntries, clearAuditEntries } from "@/repo/AuditRepo.ts";
import { status } from "elysia";
import { Type } from "@sinclair/typebox";
import { getSystemUser } from "@/repo/UserRepo.ts";
import { AuditLogClearResponseSchema, AuditLogResponseSchema } from "@/types/AuditEntryType.ts";

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/audit-log", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_READ_AUDIT_LOG]);
        if (!authz.some((p) => p.identifier === FP_READ_AUDIT_LOG.identifier)) {
            return status(403, `Permission denied. Required: ${FP_READ_AUDIT_LOG.functionalPermissionName}`);
        }

        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? 50));
        const jsonPathFilter = context.query.jsonPathFilter as string | undefined;
        const search = context.query.search as string | undefined;

        const result = await getAuditEntries(context.dbClient, {
            jsonPathFilter: jsonPathFilter || undefined,
            search: search || undefined,
            page,
            pageSize,
        });

        return {
            entries: result.entries,
            page,
            pageSize,
            total: result.total,
        };
    }, {
        query: Type.Object({
            page: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.String()])),
            pageSize: Type.Optional(Type.Union([Type.Number({ minimum: 1 }), Type.String()])),
            jsonPathFilter: Type.Optional(Type.String()),
            search: Type.Optional(Type.String()),
        }),
        response: {
            200: AuditLogResponseSchema,
            401: Type.String(),
            403: Type.String(),
        },
        detail: {
            tags: ["Audit"],
            summary: "Get audit log entries",
            description:
                "Retrieve paginated audit log entries. Supports optional filtering via JSONPath (`jsonPathFilter`) and free-text search (`search`). Requires 'read_audit_log' permission.",
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
                    name: "jsonPathFilter",
                    description: 'Optional JSONPath filter expression applied to the payload column (e.g., \'$.key == "value"\'). Uses PostgreSQL jsonb_path_exists.',
                    in: "query",
                    required: false,
                    schema: { type: "string" },
                },
                {
                    name: "search",
                    description: "Optional free-text search across topic and payload.",
                    in: "query",
                    required: false,
                    schema: { type: "string" },
                },
            ],
        },
    });

    app.delete("/audit-log", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_CLEAR_AUDIT_LOG]);
        if (!authz.some((p) => p.identifier === FP_CLEAR_AUDIT_LOG.identifier)) {
            return status(403, `Permission denied. Required: ${FP_CLEAR_AUDIT_LOG.functionalPermissionName}`);
        }

        // Get user info for the "cleared by" entry
        const user = await getLoggedinUserObject(context.dbClient, claims) ?? await getSystemUser(context.dbClient);

        const deletedCount = await clearAuditEntries(context.dbClient);

        // Insert a new entry recording the clear action
        await insertAuditEntries(context.dbClient, [
            {
                topic: "delete.audit_log_cleared",
                payload: {
                    action: "clear",
                    clearedBy: user,
                    entriesDeleted: deletedCount,
                },
            },
        ]);

        return { success: true, deletedCount };
    }, {
        detail: {
            tags: ["Audit"],
            summary: "Clear audit log",
            description:
                "Deletes all existing audit log entries and adds a new entry recording who cleared the log. Requires 'clear_audit_log' permission.",
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
            200: AuditLogClearResponseSchema,
            401: Type.String(),
            403: Type.String(),
        },
    });
}
