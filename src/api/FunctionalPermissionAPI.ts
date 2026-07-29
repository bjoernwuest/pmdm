import type { ApiInstance } from "@/apps/api.ts";
import { authorize } from "@/services/Auth.ts";
import { getLoggedinUserObject } from "@/services/Auth.ts";
import {status} from "elysia";
import { Type } from "@sinclair/typebox";
import { FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS, FP_READ_FUNCTIONAL_PERMISSIONS, FP_READ_GROUP_FUNCTIONAL_PERMISSIONS, FP_READ_GROUPS } from "@/services/auth/FunctionalPermissions.ts";
import { getFunctionalPermission, getFunctionalPermissionCount, getFunctionalPermissions, getGroupsAssignedToFunctionalPermission, grantFunctionalPermissionToGroup, revokeFunctionalPermissionFromGroup } from "@/repo/FunctionalPermissionRepo.ts";
import {getGroups, getSystemUser} from "@/repo/UserRepo.ts";
import { runInTransaction } from "@/services/DatabaseDriver.ts";
import {
    ErrorSchema, FunctionalPermissionDetailResponseSchema, FunctionalPermissionsResponseSchema,
    type FunctionalPermissionDetailResponseType, type FunctionalPermissionsResponse,
    FunctionalPermissionsListSchema,
    SuccessResponseSchema,
} from "@/types/ApiType.ts";
import { FunctionalPermission as FunctionalPermissionTable } from "@/schema/FunctionalPermissionSchema.ts";
import {getUserListPageSizes} from "@/services/ui_config.ts";
import { GroupIdentifiersBodySchema } from "@/types/FunctionalPermissionType.ts";


// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/functionalpermissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_READ_FUNCTIONAL_PERMISSIONS]);
        if (!authz.some(p => p.identifier === FP_READ_FUNCTIONAL_PERMISSIONS.identifier)) return status(403, `Permission denied. Required: ${FP_READ_FUNCTIONAL_PERMISSIONS.functionalPermissionName}`);

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const hasPaging = context.query.page !== undefined || context.query.pageSize !== undefined;
        if (!hasPaging) return await getFunctionalPermissions(context.dbClient);

        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? availablePageSizes[0] ?? 10));
        const total = await getFunctionalPermissionCount(context.dbClient);
        const functionalPermissions = await context.dbClient.select().from(FunctionalPermissionTable).orderBy(FunctionalPermissionTable.functionalPermissionName).offset(page * pageSize).limit(pageSize);

        return {
            functionalPermissions,
            page,
            pageSize,
            total,
            availablePageSizes,
        } satisfies FunctionalPermissionsResponse;
    }, {
        query: Type.Object({
            page: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.String()])),
            pageSize: Type.Optional(Type.Union([Type.Number({ minimum: 1 }), Type.String()])),
        }),
        response: {200: Type.Union([FunctionalPermissionsListSchema, FunctionalPermissionsResponseSchema]), 401: Type.String(), 403: Type.String()},
        detail: {
            tags: ["Auth"],
            summary: "Get functional permissions",
            description: "Retrieve a list of all functional permissions in the system. When no pagination parameters are provided, returns all permissions as a simple array. When pagination parameters (page/pageSize) are provided, returns a paginated response with metadata. Requires 'FP_READ_FUNCTIONAL_PERMISSIONS' permission.",
            parameters: [
                {
                    name: "page",
                    description: "Zero-based page number for pagination. When provided together with pageSize, enables paginated response mode. Defaults to 0.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 0, default: 0 },
                },
                {
                    name: "pageSize",
                    description: "Number of permissions per page. When provided together with page, enables paginated response mode. Defaults to the first available size.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 1 },
                },
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

    app.get("/functionalpermissions/:functionalpermissionid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const requiredPermissions = [FP_READ_FUNCTIONAL_PERMISSIONS, FP_READ_GROUP_FUNCTIONAL_PERMISSIONS, FP_READ_GROUPS];
        const authz = await authorize(context.dbClient, claims, requiredPermissions);
        if (!requiredPermissions.every(p => authz.some(ap => ap.identifier === p.identifier))) return status(403, `Permission denied. Required: ${requiredPermissions.map(p => p.functionalPermissionName).join(", ")}`);

        const [functionalPermission] = await getFunctionalPermission(context.dbClient, {identifier: context.params.functionalpermissionid});
        if (!functionalPermission) return status(404, "Functional permission does not exist");

        const groups = (await getGroupsAssignedToFunctionalPermission(context.dbClient, functionalPermission));

        return {
            functionalPermission: functionalPermission,
            grantedToGroups: groups
        } satisfies FunctionalPermissionDetailResponseType;
    }, {
        params: Type.Object({ functionalpermissionid: Type.String({ format: "uuid" }) }),
        response: {200: FunctionalPermissionDetailResponseSchema, 401: Type.String(), 403: Type.String(), 404: Type.String()},
        detail: {
            tags: ["Auth"],
            summary: "Get functional permission details including groups assigned",
            description: "Retrieve detailed information about a specific functional permission including all groups that have been granted this permission. Requires 'FP_READ_FUNCTIONAL_PERMISSIONS', 'FP_READ_GROUP_FUNCTIONAL_PERMISSIONS', and 'FP_READ_GROUPS' permissions.",
            parameters: [
                {
                    name: "functionalpermissionid",
                    description: "UUID of the functional permission to retrieve. Must be a valid UUID identifier.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
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

    app.post("/functionalpermissions/:functionalpermissionid/groups", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS]);
        if (!authz.some(p => p.identifier === FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS.identifier)) return status(403, `Permission denied. Required: ${FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS.functionalPermissionName}`);

        let user;
        try {
            user = await getLoggedinUserObject(context.dbClient, claims) ?? await getSystemUser(context.dbClient);
        } catch (_err) {
            return status(500, {error: "Could not resolve user", message: _err});
        }
        const result = await runInTransaction(context.dbClient, async (_tx) => {
            const groups = await getGroups(_tx, context.body.groupIdentifiers.map(id => ({identifier: id})));
            for (const group of groups) {
                try { await grantFunctionalPermissionToGroup(_tx, user, group, [{identifier: context.params.functionalpermissionid}]); }
                catch (_err) { return status(404, {error: "Could not grant", message: _err}); }
            }
        });
        if (result && typeof result === "object" && "status" in result) return result;
        return { success: true };
    }, {
        response: {200: SuccessResponseSchema, 401: Type.String(), 403: Type.String(), 404: ErrorSchema, 500: ErrorSchema},
        body: GroupIdentifiersBodySchema,
        detail: {
            tags: ["Auth"],
            summary: "Assign groups to a functional permission",
            description: "Grant a specific functional permission to one or more groups. All members of these groups will inherit this permission. Requires 'FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS' permission. The current user's identity is recorded for audit purposes.",
            parameters: [
                {
                    name: "functionalpermissionid",
                    description: "UUID of the functional permission to grant. Must be a valid UUID identifier.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
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

    app.delete("/functionalpermissions/:functionalpermissionid/groups", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS]);
        if (!authz.some(p => p.identifier === FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS.identifier)) return status(403, `Permission denied. Required: ${FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS.functionalPermissionName}`);

        let user;
        try {
            user = await getLoggedinUserObject(context.dbClient, claims) ?? await getSystemUser(context.dbClient);
        } catch (_err) {
            return status(500, {error: "Could not resolve user", message: _err});
        }
        const result = await runInTransaction(context.dbClient, async (_tx) => {
            const groups = await getGroups(_tx, context.body.groupIdentifiers.map(id => ({identifier: id})));
            for (const group of groups) {
                try { await revokeFunctionalPermissionFromGroup(_tx, user, group, [{identifier: context.params.functionalpermissionid}]); }
                catch (_err) { return status(404, {error: "Could not revoke", message: _err}); }
            }
        });
        if (result && typeof result === "object" && "status" in result) return result;
        return { success: true };
    }, {
        response: {200: SuccessResponseSchema, 401: Type.String(), 403: Type.String(), 404: ErrorSchema, 500: ErrorSchema},
        params: Type.Object({ functionalpermissionid: Type.String({ format: "uuid" }) }),
        body: GroupIdentifiersBodySchema,
        detail: {
            tags: ["Auth"],
            summary: "Remove groups to a functional permission",
            description: "Revoke a specific functional permission from one or more groups. Members of these groups will lose this permission (unless they have received it through other group memberships). Requires 'FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS' permission.",
            parameters: [
                {
                    name: "functionalpermissionid",
                    description: "UUID of the functional permission to revoke. Must be a valid UUID identifier.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
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
}
