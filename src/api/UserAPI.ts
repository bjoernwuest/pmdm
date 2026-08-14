import {status} from "elysia";
import { Type } from "@sinclair/typebox";
import type {ApiInstance} from "@/apps/api.ts";
import {runInTransaction} from "@/services/DatabaseDriver.ts";
import {getUserListPageSizes} from "@/services/ui_config.ts";
import {parseBooleanQuery} from "@/utils/parseBooleanQuery.ts";
import {
    ForbiddenErrorResponseSchema,
    IncludeInactiveQuerySchema,
    NotFoundErrorResponseSchema,
    PaginationQuerySchema,
    type UserDetailsResponse,
    UserDetailsResponseSchema,
    UnauthenticatedErrorResponseSchema,
    UserIdParamsSchema,
    type UsersResponse,
    UsersResponseSchema
} from "@/types/ApiType.ts";
import {requirePermissions} from "@/services/Auth.ts";
import {FP_READ_FUNCTIONAL_PERMISSIONS, FP_READ_GROUPS, FP_READ_USERS} from "@/services/auth/FunctionalPermissions.ts";
import {getGroupIdsAssignedTo, getGroups, getUserCount, getUsers} from "@/repo/UserRepo.ts";
import {
    getFunctionalPermissionsOfGroups,
    getFunctionalPermissionsOfUser,
    getGroupsAssignedToFunctionalPermissions
} from "@/repo/FunctionalPermissionRepo.ts";

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/users", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_READ_USERS]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(0, Number(context.query.pageSize ?? availablePageSizes[0] ?? 1));
        const includeInactive = parseBooleanQuery(context.query.includeInactive);
        const total = await getUserCount(context.dbClient, includeInactive);

        const users = await getUsers(context.dbClient, undefined, {page: page, pageSize: pageSize}, includeInactive);

        return {
            users,
            page,
            pageSize: pageSize,
            total,
            availablePageSizes,
            includeInactive,
        } satisfies UsersResponse;
    }, {
        query: Type.Composite([PaginationQuerySchema, IncludeInactiveQuerySchema]),
        response: {
            200: UsersResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
        },
        detail: {
            tags: ["Users & Groups"],
            summary: "Get paged user list",
            description: "Retrieve a paginated list of users with their core information. Supports filtering by active/inactive status. Requires 'FP_READ_USERS' permission.",
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
                    description: "Number of users per page. Must be one of the available page sizes returned by the server. Defaults to the first available size.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 1 },
                },
                {
                    name: "includeInactive",
                    description: "Include disabled/inactive users in the results. Accepts 'true', '1', true (boolean). Defaults to false.",
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

    app.get("/users/:userid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_READ_USERS], [FP_READ_GROUPS, FP_READ_FUNCTIONAL_PERMISSIONS]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const [user] = await getUsers(context.dbClient, [{identifier: context.params.userid}]);

        if (!user) return status(404, { error: "User does not exists" });

        const includeInactive = parseBooleanQuery(context.query.includeInactive);
        const groups = permissionCheck.authz.some(p => p.identifier === FP_READ_GROUPS.identifier) ? await getGroups(context.dbClient, (await getGroupIdsAssignedTo(context.dbClient, [{ identifier: user.identifier }])).get(user.identifier) ?? [], undefined, includeInactive) : [];

        const functionalPermissions = [FP_READ_GROUPS, FP_READ_FUNCTIONAL_PERMISSIONS].every(p => permissionCheck.authz.some(ap => ap.identifier === p.identifier))
            ? await (async () => {
                const perms = includeInactive
                    ? [...new Map([...(await getFunctionalPermissionsOfGroups(context.dbClient, groups.map((grp) => grp.identifier))).values()].flat().map((perm) => [perm.identifier, perm])).values()]
                    : await getFunctionalPermissionsOfUser(context.dbClient, user);
                const grantingGroupsByPermission = await getGroupsAssignedToFunctionalPermissions(context.dbClient, perms.map((perm) => perm.identifier));
                return perms.map((perm) => ({
                    ...perm,
                    grantedByGroups: grantingGroupsByPermission.get(perm.identifier) ?? []
                }));
            })()
            : [];

        return {
            user: user,
            groups: groups,
            functionalPermissions: functionalPermissions,
            includeInactive: includeInactive
        } satisfies UserDetailsResponse;
    }, {
        params: UserIdParamsSchema,
        query: IncludeInactiveQuerySchema,
        response: {
            200: UserDetailsResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
        detail: {
            tags: ["Users & Groups"],
            summary: "Get user details",
            description: "Retrieve detailed information about a specific user including their assigned groups and functional permissions. Requires 'FP_READ_USERS' permission. Additional data (groups, functional permissions) is included only if the user has 'FP_READ_GROUPS' and 'FP_READ_FUNCTIONAL_PERMISSIONS' permissions respectively.",
            parameters: [
                {
                    name: "userid",
                    description: "UUID of the user to retrieve. Must be a valid UUID identifier.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "includeInactive",
                    description: "When retrieving group and permission information, include disabled/inactive items. Accepts 'true', '1', true (boolean). Defaults to false.",
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
}

