import {status} from "elysia";
import { Type } from "@sinclair/typebox";
import type {ApiInstance} from "@/apps/api.ts";
import {runInTransaction} from "@/services/DatabaseDriver.ts";
import {getUserListPageSizes} from "@/services/ui_config.ts";
import {
    type UserDetailsResponse,
    UserDetailsResponseSchema,
    type UsersResponse,
    UsersResponseSchema
} from "@/types/ApiType.ts";
import {authorize} from "@/services/Auth.ts";
import {FP_READ_FUNCTIONAL_PERMISSIONS, FP_READ_GROUPS, FP_READ_USERS} from "@/services/auth/FunctionalPermissions.ts";
import {getGroupIdsAssignedTo, getGroups, getUserCount, getUsers} from "@/repo/UserRepo.ts";
import {
    getFunctionalPermissionsOfGroup,
    getFunctionalPermissionsOfUser,
    getGroupsAssignedToFunctionalPermission
} from "@/repo/FunctionalPermissionRepo.ts";

function parseBooleanQuery(value: unknown): boolean {
    return value === true || value === "true" || value === "1";
}

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/users", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_READ_USERS]);
        if (!authz.some(p => p.identifier === FP_READ_USERS.identifier)) return status(403, `Permission denied. Required: ${FP_READ_USERS.functionalPermissionName}`);

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
        response: {200: UsersResponseSchema, 401: Type.String(), 403: Type.String()},
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
        const authz = await authorize(context.dbClient, claims, [FP_READ_USERS, FP_READ_GROUPS, FP_READ_FUNCTIONAL_PERMISSIONS]);
        if (!authz.some(p => p.identifier === FP_READ_USERS.identifier)) return status(403, `Permission denied. Required: ${FP_READ_USERS.functionalPermissionName}`);

        return await runInTransaction(context.dbClient, async (_tx) => {
            const [user] = await getUsers(context.dbClient, [{identifier: context.params.userid}]);

            if (!user) return status(404, "User does not exists");

            const includeInactive = parseBooleanQuery(context.query.includeInactive);
            const groups = authz.some(p => p.identifier === FP_READ_GROUPS.identifier) ? await getGroups(context.dbClient, (await getGroupIdsAssignedTo(context.dbClient, [{ identifier: user.identifier }])).get(user.identifier) ?? [], undefined, includeInactive) : [];

            const functionalPermissions = [FP_READ_GROUPS, FP_READ_FUNCTIONAL_PERMISSIONS].every(p => authz.some(ap => ap.identifier === p.identifier))
                ? await (async () => {
                    const perms = includeInactive
                        ? [...new Map((await Promise.all(groups.map((grp) => getFunctionalPermissionsOfGroup(context.dbClient, grp)))).flat().map((perm) => [perm.identifier, perm])).values()]
                        : await getFunctionalPermissionsOfUser(context.dbClient, user);
                    return await Promise.all(perms.map(async (perm) => ({
                        ...perm,
                        grantedByGroups: await getGroupsAssignedToFunctionalPermission(context.dbClient, perm)
                    })));
                })()
                : [];

            return {
                user: user,
                groups: groups,
                functionalPermissions: functionalPermissions,
                includeInactive: includeInactive
            } satisfies UserDetailsResponse;
        });
    }, {
        response: {200: UserDetailsResponseSchema, 401: Type.String(), 403: Type.String(), 404: Type.String()},
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

