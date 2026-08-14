import { Type, type Static } from '@sinclair/typebox'
import { t } from 'elysia'
import {GroupSelectSchema, UserSelectSchema} from "@/types/UserType.ts";
import {FunctionalPermissionSelectSchema} from "@/types/FunctionalPermissionType.ts";

//export const FunctionalPermissionSchema = Type.Object(createSelectSchema(FunctionalPermission).properties)
export const FunctionalPermissionWithGroupsSchema = Type.Composite([
    FunctionalPermissionSelectSchema,
    Type.Object({grantedByGroups: Type.Array(GroupSelectSchema)})
])
export const FunctionalPermissionsResponseSchema = Type.Object({
    functionalPermissions: Type.Array(FunctionalPermissionSelectSchema),
    page: Type.Number({minimum: 0}),
    pageSize: Type.Number({minimum: 0}),
    total: Type.Number({minimum: 0}),
    availablePageSizes: Type.Array(Type.Number()),
}, { description: "Paged list of functional permissions with pagination metadata." });
export type FunctionalPermissionsResponse = Static<typeof FunctionalPermissionsResponseSchema>;

export const UsersResponseSchema = Type.Object({
    users: Type.Array(UserSelectSchema),
    page: Type.Number({minimum: 0}),
    pageSize: Type.Number({minimum: 0}),
    total: Type.Number({minimum: 0}),
    availablePageSizes: Type.Array(Type.Number()),
    includeInactive: Type.Boolean()
}, { description: "Paged list of users with pagination metadata and the applied includeInactive filter." });
export type UsersResponse = Static<typeof UsersResponseSchema>;

export const GroupsResponseSchema = Type.Object({
   groups: Type.Array(GroupSelectSchema),
    page: Type.Number({minimum: 0}),
    pageSize: Type.Number({minimum: 0}),
    total: Type.Number({minimum: 0}),
    availablePageSizes: Type.Array(Type.Number()),
    includeInactive: Type.Boolean()
}, { description: "Paged list of groups with pagination metadata and the applied includeInactive filter." });
export type GroupsResponse = Static<typeof GroupsResponseSchema>;

export const UserDetailsResponseSchema = Type.Object({
    user: UserSelectSchema,
    groups: Type.Array(GroupSelectSchema),
    functionalPermissions: Type.Array(FunctionalPermissionWithGroupsSchema),
    includeInactive: Type.Boolean()
}, { description: "Detailed user information with assigned groups and functional permissions." });
export type UserDetailsResponse = Static<typeof UserDetailsResponseSchema>;

export const FunctionalPermissionDetailResponseSchema = Type.Object({functionalPermission: FunctionalPermissionSelectSchema, grantedToGroups: Type.Array(GroupSelectSchema)}, { description: "Functional permission details with the groups it is granted to." });
export type FunctionalPermissionDetailResponseType = Static<typeof FunctionalPermissionDetailResponseSchema>;

export const GroupFunctionalPermissionResponseSchema = Type.Object({
   group: GroupSelectSchema,
   functionalPermissions: Type.Array(FunctionalPermissionSelectSchema)
}, { description: "Group details with its assigned functional permissions." });
export type GroupFunctionalPermissionResponseType = Static<typeof GroupFunctionalPermissionResponseSchema>;

export const ErrorSchema = Type.Object({error: Type.String(), message: Type.String()}, { description: "Error object with an error message." });

// --- Shared utility schemas ---

export const SuccessResponseSchema = Type.Object({ success: Type.Boolean() }, { description: "Generic success confirmation." });
export type SuccessResponse = Static<typeof SuccessResponseSchema>;

export const OptimisticLockBodySchema = Type.Object({ knownUpdatedAt: Type.String({ description: "Last known updatedAt timestamp of the resource for optimistic locking. The request fails with 409 if it no longer matches the stored value." }) });
export type OptimisticLockBody = Static<typeof OptimisticLockBodySchema>;

/**
 * Minimal error response — just the `error` string (no `message`).
 * This is the canonical base shape for error bodies; `ErrorSchema` extends it with `message`,
 * and `OptimisticLockConflictResponseSchema` extends it with `currentValue` for 409 conflicts.
 */
export const ErrorResponseSchema = Type.Object({ error: Type.String() }, { description: "Minimal error response containing only the error string." });
export type ErrorResponse = Static<typeof ErrorResponseSchema>;

/** Canonical 409 optimistic-lock conflict body: `{ error, currentValue? }`. */
export const OptimisticLockConflictResponseSchema = Type.Object({
    error: Type.String(),
    currentValue: Type.Optional(Type.Any()),
}, { description: "Conflict. The resource was modified concurrently; retry with the current value (optimistic locking)." });

// --- Canonical per-status error response schemas (single home; routes reference these) ---

export const UnauthenticatedErrorResponseSchema = Type.Object({
    error: Type.String(),
    message: Type.Optional(Type.String()),
}, { description: "Unauthenticated. No valid session, API key, or bearer token was provided." });

export const ForbiddenErrorResponseSchema = Type.Object({ error: Type.String() }, { description: "Forbidden. The authenticated principal lacks the required functional permission." });

export const ForbiddenHumanUserErrorResponseSchema = Type.Object({ error: Type.String() }, { description: "Forbidden. The authenticated principal lacks the required functional permission. Must be executed by a human user via browser session." });

export const NotFoundErrorResponseSchema = Type.Object({ error: Type.String() }, { description: "Not found. The requested resource does not exist." });

export const ConflictErrorResponseSchema = Type.Object({ error: Type.String() }, { description: "Conflict. The resource was modified concurrently; retry with the current value (optimistic locking)." });

export const BadRequestErrorResponseSchema = Type.Object({ error: Type.String() }, { description: "Bad request. The request body or parameters failed validation." });

export const InternalServerErrorResponseSchema = Type.Object({ error: Type.String() }, { description: "Internal server error." });

export const HealthResponseSchema = Type.Object({ status: Type.String(), ts: Type.String() }, { description: "Liveness/readiness status with the current server timestamp." });
export type HealthResponse = Static<typeof HealthResponseSchema>;

export const FunctionalPermissionsListSchema = Type.Array(FunctionalPermissionSelectSchema, { description: "Plain list of all functional permissions." });
export type FunctionalPermissionsList = Static<typeof FunctionalPermissionsListSchema>;

// --- Shared query/params schemas (single home; routes must use these) ---

/** Optional zero-based page and page-size query parameters shared by paged list endpoints. */
export const PaginationQuerySchema = Type.Object({
    page: Type.Optional(t.Integer({ minimum: 0, description: "Zero-based page number." })),
    pageSize: Type.Optional(t.Integer({ minimum: 1, description: "Number of items per page." })),
});

/** Optional `includeInactive` boolean flag, accepting the same values `parseBooleanQuery` accepts. */
export const IncludeInactiveQuerySchema = Type.Object({
    includeInactive: Type.Optional(Type.Union([
        Type.Literal("true"), Type.Literal("false"), Type.Literal("1"), Type.Literal("0"),
    ], { description: "Include disabled/inactive items. Accepts 'true'/'1' (true) or 'false'/'0' (false)." })),
});

/** Optional `includeDisabled` boolean flag, accepting the same values `parseBooleanQuery` accepts. */
export const IncludeDisabledQuerySchema = Type.Object({
    includeDisabled: Type.Optional(Type.Union([
        Type.Literal("true"), Type.Literal("false"), Type.Literal("1"), Type.Literal("0"),
    ], { description: "Include disabled API keys. Accepts 'true'/'1' (true) or 'false'/'0' (false)." })),
});

/** Path parameter schemas for the UUID-identified detail routes. */
export const UserIdParamsSchema = Type.Object({ userid: Type.String({ format: "uuid", description: "UUID of the user." }) });
export const GroupIdParamsSchema = Type.Object({ groupid: Type.String({ format: "uuid", description: "UUID of the group." }) });
export const ApiKeyIdParamsSchema = Type.Object({ apikeyid: Type.String({ format: "uuid", description: "UUID of the API key." }) });
export const FunctionalPermissionIdParamsSchema = Type.Object({ functionalpermissionid: Type.String({ format: "uuid", description: "UUID of the functional permission." }) });

/** Query parameters of the audit-log list endpoint. */
export const AuditLogQuerySchema = Type.Object({
    page: Type.Optional(t.Integer({ minimum: 0, description: "Zero-based page number (default 0)." })),
    pageSize: Type.Optional(t.Integer({ minimum: 1, description: "Number of entries per page (default 50)." })),
    jsonPathFilter: Type.Optional(Type.String({ description: "Optional JSONPath filter expression applied to the payload column (e.g., '$.key == \"value\"'). Uses PostgreSQL jsonb_path_exists." })),
    search: Type.Optional(Type.String({ description: "Optional free-text search across topic and payload." })),
});
