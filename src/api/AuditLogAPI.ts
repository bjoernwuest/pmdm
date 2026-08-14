import type { ApiInstance } from "@/apps/api.ts";
import { getLoggedinUserObject, requirePermissions } from "@/services/Auth.ts";
import { FP_CLEAR_AUDIT_LOG, FP_READ_AUDIT_LOG } from "@/services/auth/FunctionalPermissions.ts";
import { getAuditEntries, insertAuditEntries, clearAuditEntries } from "@/repo/AuditRepo.ts";
import { status } from "elysia";
import { getSystemUser } from "@/repo/UserRepo.ts";
import { runInTransaction } from "@/services/DatabaseDriver.ts";
import { AuditLogClearResponseSchema, AuditLogResponseSchema } from "@/types/AuditEntryType.ts";
import { AuditLogQuerySchema, ForbiddenErrorResponseSchema, InternalServerErrorResponseSchema, UnauthenticatedErrorResponseSchema } from "@/types/ApiType.ts";

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/audit-log", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_READ_AUDIT_LOG]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const page = Math.max(0, context.query.page ?? 0);
        const pageSize = Math.max(1, context.query.pageSize ?? 50);
        const jsonPathFilter = context.query.jsonPathFilter;
        const search = context.query.search;

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
        query: AuditLogQuerySchema,
        response: {
            200: AuditLogResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
        },
        detail: {
            tags: ["Audit"],
            summary: "Get audit log entries",
            description:
                "Retrieve paginated audit log entries. Supports optional filtering via JSONPath (`jsonPathFilter`) and free-text search (`search`). Requires 'FP_READ_AUDIT_LOG' permission.",
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
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_CLEAR_AUDIT_LOG]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        // Get user info for the "cleared by" entry
        const user = await getLoggedinUserObject(context.dbClient, claims) ?? await getSystemUser(context.dbClient);

        // Clear and record in one transaction so the "cleared by" entry cannot be lost
        // if the insert fails after a successful delete.
        const deletedCount = await runInTransaction(context.dbClient, async (tx) => {
            const count = await clearAuditEntries(tx);

            // Insert a new entry recording the clear action
            await insertAuditEntries(tx, [
                {
                    topic: "delete.audit_log_cleared",
                    payload: {
                        action: "clear",
                        clearedBy: user,
                        entriesDeleted: count,
                    },
                },
            ]);

            return count;
        });

        return { success: true, deletedCount };
    }, {
        detail: {
            tags: ["Audit"],
            summary: "Clear audit log",
            description:
                "Deletes all existing audit log entries and adds a new entry recording who cleared the log. Requires 'FP_CLEAR_AUDIT_LOG' permission.",
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
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            500: InternalServerErrorResponseSchema,
        },
    });
}
