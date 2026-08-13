import type { ApiInstance } from "@/apps/api.ts";
import { authorize, getLoggedinUserObject } from "@/services/Auth.ts";
import {
    GroupFunctionalPermissionResponseSchema,
    GroupsResponseSchema,
    type GroupFunctionalPermissionResponseType,
    type GroupsResponse,
    ErrorSchema,
    FunctionalPermissionsListSchema,
    SuccessResponseSchema,
} from "@/types/ApiType.ts";
import { status } from "elysia";
import { Type } from "@sinclair/typebox";
import { getFunctionalPermissionsOfGroup, grantFunctionalPermissionToGroup, revokeFunctionalPermissionFromGroup } from "@/repo/FunctionalPermissionRepo.ts";
import {
    FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS,
    FP_READ_FUNCTIONAL_PERMISSIONS,
    FP_READ_GROUP_FUNCTIONAL_PERMISSIONS,
    FP_READ_GROUPS
} from "@/services/auth/FunctionalPermissions.ts";
import {getGroup, getGroups, getSystemUser, GroupCount} from "@/repo/UserRepo.ts";
import { runInTransaction } from "@/services/DatabaseDriver.ts";
import {getUserListPageSizes} from "@/services/ui_config.ts";
import { PermissionIdentifiersBodySchema } from "@/types/FunctionalPermissionType.ts";

function parseBooleanQuery(value: unknown): boolean {
    return value === true || value === "true" || value === "1";
}

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/groups", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_READ_GROUPS]);
        if (!authz.some(p => p.identifier === FP_READ_GROUPS.identifier)) return status(403, `Permission denied. Required: ${FP_READ_GROUPS.functionalPermissionName}`);

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(0, Number(context.query.pageSize ?? availablePageSizes[0] ?? 1));
        const includeInactive = parseBooleanQuery(context.query.includeInactive);
        const total = await GroupCount(context.dbClient, includeInactive);

        const groups = await getGroups(context.dbClient, undefined, {page: page, pageSize: pageSize}, includeInactive);

        return {
            groups,
            page,
            pageSize: pageSize,
            total,
            availablePageSizes,
            includeInactive,
        } satisfies GroupsResponse;
    }, {
        query: Type.Object({
            page: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.String()])),
            pageSize: Type.Optional(Type.Union([Type.Number({ minimum: 1 }), Type.String()])),
            includeInactive: Type.Optional(Type.Union([Type.Boolean(), Type.String()])),
        }),
        response: {
            200: {...GroupsResponseSchema, description: "Paginated list of groups with pagination metadata and inactive-inclusion flag."},
            401: Type.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: Type.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
        },
        detail: {
            tags: ["Users & Groups"],
            summary: "Get paged group list",
            description: "Retrieve a paginated list of groups with their core information. Supports filtering by active/inactive status. Requires 'FP_READ_GROUPS' permission.",
            parameters: [
                {
                    name: "page",
                    description: "Zero-based page number for pagination. Defaults to 0.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 0, default: 0 },
                },
                {
                    name: "pageSize",
                    description: "Number of groups per page. Must be one of the available page sizes returned by the server. Defaults to the first available size.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 1 },
                },
                {
                    name: "includeInactive",
                    description: "Include disabled/inactive groups in the results. Accepts 'true', '1', true (boolean). Defaults to false.",
                    in: "query",
                    required: false,
                    schema: { type: "string", enum: ["true", "1", "false", "0"], default: "false" },
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

    app.get("/groups/:groupid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_READ_GROUPS, FP_READ_GROUP_FUNCTIONAL_PERMISSIONS]);
        if (!authz.some(p => p.identifier === FP_READ_GROUPS.identifier)) return status(403, `Permission denied. Required: ${FP_READ_GROUPS.functionalPermissionName}`);

        return await runInTransaction(context.dbClient, async (_tx) => {
            const groups = await getGroup(_tx, {identifier: context.params.groupid});

            if (0 < groups.length) {
                const group = groups[0]!;
                const functionalPermissions = authz.some(p => p.identifier === FP_READ_GROUP_FUNCTIONAL_PERMISSIONS.identifier) ? await getFunctionalPermissionsOfGroup(_tx, group) : [];

                return {
                    group: group,
                    functionalPermissions: functionalPermissions,
                } satisfies GroupFunctionalPermissionResponseType;
            } else return status(404, "Group does not exists");
        });
    }, {
        response: {
            200: {...GroupFunctionalPermissionResponseSchema, description: "A single group with its assigned functional permissions (included only with the required permission)."},
            401: Type.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: Type.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: Type.String({ description: "Not found – no group with this identifier exists." }),
        },
        detail: {
            tags: ["Users & Groups"],
            summary: "Get group details",
            description: "Retrieve detailed information about a specific group including its assigned functional permissions. Requires 'FP_READ_GROUPS' permission. Functional permissions are included only if the user also has 'FP_READ_GROUP_FUNCTIONAL_PERMISSIONS' permission.",
            parameters: [
                {
                    name: "groupid",
                    description: "UUID of the group to retrieve. Must be a valid UUID identifier.",
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

    app.get("/groups/:groupid/functionalpermissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const requiredPermissions = [FP_READ_GROUPS, FP_READ_FUNCTIONAL_PERMISSIONS, FP_READ_GROUP_FUNCTIONAL_PERMISSIONS];
        const authz = await authorize(context.dbClient, claims, requiredPermissions);
        if (!requiredPermissions.every(p => authz.some(ap => ap.identifier === p.identifier))) return status(403, `Permission denied. Required: ${requiredPermissions.map(p => p.functionalPermissionName).join(", ")}`);

        return await getFunctionalPermissionsOfGroup(context.dbClient, {identifier: context.params.groupid});
    }, {
        response: {
            200: {...FunctionalPermissionsListSchema, description: "All functional permissions granted to the group."},
            401: Type.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: Type.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
        },
        detail: {
            tags: ["Users & Groups"],
            summary: "Get functional permissions assigned to a group",
            description: "List all functional permissions that have been granted to a specific group. Requires 'FP_READ_GROUPS', 'FP_READ_FUNCTIONAL_PERMISSIONS', and 'FP_READ_GROUP_FUNCTIONAL_PERMISSIONS' permissions.",
            parameters: [
                {
                    name: "groupid",
                    description: "UUID of the group to retrieve functional permissions for. Must be a valid UUID identifier.",
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

    app.post("/groups/:groupid/functionalpermissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS]);
        if (!authz.some(p => p.identifier === FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS.identifier)) return status(403, `Permission denied. Required: ${FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS.functionalPermissionName}`);

        let user;
        try {
            user = await getLoggedinUserObject(context.dbClient, claims) ?? await getSystemUser(context.dbClient);
        } catch (_err) {
            return status(500, {error: "Could not resolve user", message: _err});
        }
        try { await runInTransaction(context.dbClient, async (_tx) => { await grantFunctionalPermissionToGroup(_tx, user, {identifier: context.params.groupid}, context.body.permissionIdentifiers.map(id => ({identifier: id}))); }); }
        catch (_err) { return status(404, {error: "Could not grant", message: _err}); }
        return { success: true };
    }, {
        response: {
            200: {...SuccessResponseSchema, description: "Generic success confirmation for the grant operation."},
            401: Type.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: Type.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: {...ErrorSchema, description: "Not found – the group could not be resolved or the grant failed."},
            500: {...ErrorSchema, description: "Internal server error."},
        },
        body: PermissionIdentifiersBodySchema,
        detail: {
            tags: ["Users & Groups"],
            summary: "Grant functional permissions to group",
            description: "Grant one or more functional permissions to a group. All users who are members of this group will inherit these permissions. Requires 'FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS' permission. The current user must be authenticated and their identity is recorded as the 'grantedBy' for audit purposes.",
            parameters: [
                {
                    name: "groupid",
                    description: "UUID of the group to grant permissions to. Must be a valid UUID identifier.",
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

    app.delete("/groups/:groupid/functionalpermissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS]);
        if (!authz.some(p => p.identifier === FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS.identifier)) return status(403, `Permission denied. Required: ${FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS.functionalPermissionName}`);

        const user = await getLoggedinUserObject(context.dbClient, claims) ?? await getSystemUser(context.dbClient);
        try { await runInTransaction(context.dbClient, async (_tx) => { await revokeFunctionalPermissionFromGroup(_tx, user, {identifier: context.params.groupid}, context.body.permissionIdentifiers.map(id => ({identifier: id}))); }); }
        catch (_err) { return status(404, {error: "Could not revoke", message: _err}); }
        return { success: true };
    }, {
        response: {
            200: {...SuccessResponseSchema, description: "Generic success confirmation for the revoke operation."},
            401: Type.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: Type.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: {...ErrorSchema, description: "Not found – the group could not be resolved or the revoke failed."},
        },
        body: PermissionIdentifiersBodySchema,
        detail: {
            tags: ["Users & Groups"],
            summary: "Revoke functional permissions from group",
            description: "Revoke one or more functional permissions from a group. Users who are members of this group will lose these permissions (unless they have received them through other group memberships). Requires 'FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS' permission.",
            parameters: [
                {
                    name: "groupid",
                    description: "UUID of the group to revoke permissions from. Must be a valid UUID identifier.",
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
