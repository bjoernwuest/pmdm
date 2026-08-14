import { index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { foreignKey } from "drizzle-orm/pg-core";
import { Identifier, timestamps } from "./helpers";
import { Group, User } from "./UserSchema.ts";

/**
 * Represents a table definition for "functional_permissions" in the database.
 *
 * This variable defines the structure of the "functional_permissions" table,
 * including its columns, constraints, and default values. It uses a mix of
 * predefined identifiers and custom fields to represent functional permissions
 * available within the system.
 *
 * Structure:
 * - Includes common identifier fields from the `Identifier` object.
 * - Columns:
 *   - functionalPermissionName: A unique and non-null column representing the name of the functional permission.
 *   - description: A non-null column that provides a description of the functional permission.
 *   - group: A non-null column (default: "General") indicating the category or grouping of the functional permission.
 * - Timestamps: Includes standard timestamp fields (createdAt, updatedAt) defined in `timestamps`.
 *
 * This table is integral for defining and categorizing functional permissions within the system.
 */
export const FunctionalPermission = pgTable("functional_permissions", {
    ...Identifier,
    functionalPermissionName: text("functional_permission_name").notNull().unique(),
    description: text("description").notNull(),
    group: text("group").notNull().default("General"),
    ...timestamps
});

/**
 * Represents the "functional_permissions_of_group" table in the database.
 * This table is used to define the functional permissions granted to specific groups.
 *
 * Fields:
 * - `functionalPermissionIdentifier`: A UUID representing the unique identifier of the functional permission. This field is required.
 * - `grantedTo`: A UUID representing the unique identifier of the group to which the functional permission is granted. This field is required.
 * - `grantedBy`: A UUID representing the unique identifier of the user who granted the permission. This field is required.
 *
 * Primary Key:
 * - Combines `functionalPermissionIdentifier` and `grantedTo` to form a composite primary key named "functional_permissions_of_group_pkey".
 *
 * Foreign Keys:
 * - `func_perms_of_group_permission_fkey`: Links `functionalPermissionIdentifier` to the `identifier` field of the `FunctionalPermission` table. Cascades on delete.
 * - `func_perms_of_group_granted_to_fkey`: Links `grantedTo` to the `identifier` field of the `Group` table. Cascades on delete.
 * - `func_perms_of_group_granted_by_fkey`: Links `grantedBy` to the `identifier` field of the `User` table. Cascades on delete.
 */
export const FunctionalPermissionsOfGroup = pgTable("functional_permissions_of_group", {
    functionalPermissionIdentifier: uuid("functional_permission_identifier").notNull(),
    grantedTo: uuid("granted_to").notNull(),
    grantedBy: uuid("granted_by").notNull(),
}, (table) => [
    primaryKey({name: "functional_permissions_of_group_pkey", columns: [table.functionalPermissionIdentifier, table.grantedTo]}),
    foreignKey({name: "func_perms_of_group_permission_fkey", columns: [table.functionalPermissionIdentifier], foreignColumns: [FunctionalPermission.identifier]}).onDelete("cascade"),
    foreignKey({name: "func_perms_of_group_granted_to_fkey", columns: [table.grantedTo], foreignColumns: [Group.identifier]}).onDelete("cascade"),
    foreignKey({name: "func_perms_of_group_granted_by_fkey", columns: [table.grantedBy], foreignColumns: [User.identifier]}).onDelete("cascade"),
    // Serves the `grantedTo in (...)` filters (getFunctionalPermissionsOfUser/getFunctionalPermissionsOfGroups);
    // the composite PK order (functionalPermissionIdentifier, grantedTo) does not.
    index("functional_permissions_of_group_granted_to_idx").on(table.grantedTo),
]);
