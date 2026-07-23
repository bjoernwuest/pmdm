import { Type, type Static } from '@sinclair/typebox'
import {GroupSelectSchema, UserSelectSchema} from "@/types/UserType.ts";
import {FunctionalPermissionSelectSchema} from "@/types/FunctionalPermissionType.ts";

//export const FunctionalPermissionSchema = Type.Object(createSelectSchema(FunctionalPermission).properties)
export const FunctionalPermissionWithGroupsSchema = Type.Composite([
    FunctionalPermissionSelectSchema,
    Type.Object({grantedByGroups: Type.Array(GroupSelectSchema)})
])
/** Paginated response schema for functional permissions. */
export const FunctionalPermissionsResponseSchema = Type.Object({
    functionalPermissions: Type.Array(FunctionalPermissionSelectSchema),
    page: Type.Number({minimum: 0}),
    pageSize: Type.Number({minimum: 0}),
    total: Type.Number({minimum: 0}),
    availablePageSizes: Type.Array(Type.Number()),
});
/** Runtime type for `FunctionalPermissionsResponseSchema`. */
export type FunctionalPermissionsResponse = Static<typeof FunctionalPermissionsResponseSchema>;

/** Paginated response schema for users. */
export const UsersResponseSchema = Type.Object({
    users: Type.Array(UserSelectSchema),
    page: Type.Number({minimum: 0}),
    pageSize: Type.Number({minimum: 0}),
    total: Type.Number({minimum: 0}),
    availablePageSizes: Type.Array(Type.Number()),
    includeInactive: Type.Boolean()
});
/** Runtime type for `UsersResponseSchema`. */
export type UsersResponse = Static<typeof UsersResponseSchema>;

/** Paginated response schema for groups. */
export const GroupsResponseSchema = Type.Object({
   groups: Type.Array(GroupSelectSchema),
    page: Type.Number({minimum: 0}),
    pageSize: Type.Number({minimum: 0}),
    total: Type.Number({minimum: 0}),
    availablePageSizes: Type.Array(Type.Number()),
    includeInactive: Type.Boolean()
});
/** Runtime type for `GroupsResponseSchema`. */
export type GroupsResponse = Static<typeof GroupsResponseSchema>;

/** Detailed user response schema including groups and effective permissions. */
export const UserDetailsResponseSchema = Type.Object({
    user: UserSelectSchema,
    groups: Type.Array(GroupSelectSchema),
    functionalPermissions: Type.Array(FunctionalPermissionWithGroupsSchema),
    includeInactive: Type.Boolean()
});
/** Runtime type for `UserDetailsResponseSchema`. */
export type UserDetailsResponse = Static<typeof UserDetailsResponseSchema>;

export const FunctionalPermissionDetailResponseSchema = Type.Object({functionalPermission: FunctionalPermissionSelectSchema, grantedToGroups: Type.Array(GroupSelectSchema)});
export type FunctionalPermissionDetailResponseType = Static<typeof FunctionalPermissionDetailResponseSchema>;

/** Response schema for one group and its granted functional permissions. */
export const GroupFunctionalPermissionResponseSchema = Type.Object({
   group: GroupSelectSchema,
   functionalPermissions: Type.Array(FunctionalPermissionSelectSchema)
});
/** Runtime type for `GroupFunctionalPermissionResponseSchema`. */
export type GroupFunctionalPermissionResponseType = Static<typeof GroupFunctionalPermissionResponseSchema>;

/** Generic API error payload schema. */
export const ErrorSchema = Type.Object({error: Type.String(), message: Type.Any()});

// --- Shared utility schemas ---

export const SuccessResponseSchema = Type.Object({ success: Type.Boolean() });
export type SuccessResponse = Static<typeof SuccessResponseSchema>;

export const OptimisticLockBodySchema = Type.Object({ knownUpdatedAt: Type.String() });
export type OptimisticLockBody = Static<typeof OptimisticLockBodySchema>;

/** Minimal error response — just the `error` string (no `message`). Use `ErrorSchema` when a detail message is also included. */
export const ErrorResponseSchema = Type.Object({ error: Type.String() });
export type ErrorResponse = Static<typeof ErrorResponseSchema>;

export const HealthResponseSchema = Type.Object({ status: Type.String(), ts: Type.String() });
export type HealthResponse = Static<typeof HealthResponseSchema>;

export const FunctionalPermissionsListSchema = Type.Array(FunctionalPermissionSelectSchema);
export type FunctionalPermissionsList = Static<typeof FunctionalPermissionsListSchema>;
