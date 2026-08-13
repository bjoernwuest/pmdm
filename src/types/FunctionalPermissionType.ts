// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend
// with hand-written exports (additional TypeBox schemas, types, constants, ...) —
// the generator only creates this file if it is missing; it will never
// overwrite or delete anything you add here afterwards.
import { Type, type Static } from '@sinclair/typebox';

export * from './_FunctionalPermissionType.ts';

// --- TypeBox schemas for route validation and OpenAPI docs ---

/** Body for assigning groups to a functional permission. */
export const GroupIdentifiersBodySchema = Type.Object({
    groupIdentifiers: Type.Array(Type.String({ format: "uuid" }), { description: "UUIDs of the groups to grant the functional permission to." }),
});
export type GroupIdentifiersBody = Static<typeof GroupIdentifiersBodySchema>;

/** Body for granting/revoking functional permissions on a group. */
export const PermissionIdentifiersBodySchema = Type.Object({
    permissionIdentifiers: Type.Array(Type.String({ format: "uuid" }), { description: "UUIDs of the functional permissions to grant to the group." }),
});
export type PermissionIdentifiersBody = Static<typeof PermissionIdentifiersBodySchema>;
