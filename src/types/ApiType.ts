import { Type, type Static } from '@sinclair/typebox'
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

export const ErrorSchema = Type.Object({error: Type.String(), message: Type.Any()}, { description: "Error object with an error message and optional details." });

// --- Shared utility schemas ---

export const SuccessResponseSchema = Type.Object({ success: Type.Boolean() }, { description: "Generic success confirmation." });
export type SuccessResponse = Static<typeof SuccessResponseSchema>;

export const OptimisticLockBodySchema = Type.Object({ knownUpdatedAt: Type.String({ description: "Last known updatedAt timestamp of the resource for optimistic locking. The request fails with 409 if it no longer matches the stored value." }) });
export type OptimisticLockBody = Static<typeof OptimisticLockBodySchema>;

/** Minimal error response — just the `error` string (no `message`). Use `ErrorSchema` when a detail message is also included. */
export const ErrorResponseSchema = Type.Object({ error: Type.String() }, { description: "Minimal error response containing only the error string." });
export type ErrorResponse = Static<typeof ErrorResponseSchema>;

export const HealthResponseSchema = Type.Object({ status: Type.String(), ts: Type.String() }, { description: "Liveness/readiness status with the current server timestamp." });
export type HealthResponse = Static<typeof HealthResponseSchema>;

export const FunctionalPermissionsListSchema = Type.Array(FunctionalPermissionSelectSchema, { description: "Plain list of all functional permissions." });
export type FunctionalPermissionsList = Static<typeof FunctionalPermissionsListSchema>;
