import { boolean, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { index } from "drizzle-orm/pg-core";
import { Identifier, identifierColumnType, timestamps } from "./helpers.ts";

/**
 * Represents the "users" database table.
 *
 * Contains information about users such as their first name, last name, email, and active status.
 * Includes additional identifier and timestamp fields as well as an index on the isActive column.
 */
export const User = pgTable("users", {
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    disabled: boolean("disabled").notNull().default(false),
    ...Identifier,
    ...timestamps
}, (table) =>  [
    index("user_disabled_idx").on(table.disabled),
]);

/**
 * Represents the "groups" database table.
 *
 * This table contains information about various groups, including their names,
 * activity status, and related metadata such as identifiers and timestamps.
 *
 * Table Structure:
 * - groupName: Stores the name of the group. This field is required.
 * - disabled: A boolean indicating whether the group is currently active. This field is required and defaults to false.
 * - Identifier: Includes additional fields shared across tables for unique identification.
 * - timestamps: Tracks creation and update times for entries in this table.
 *
 * Indexes:
 * - group_isactive_idx: Index created on the "isActive" field to optimize queries filtering by activity status.
 */
export const Group = pgTable("groups", {
    groupName: text("group_name").notNull(),
    disabled: boolean("disabled").notNull().default(false),
    ...Identifier,
    ...timestamps
}, (table) => [
    index("group_disabled_idx").on(table.disabled),
]);

/**
 * Represents the "user_groups" database table which establishes a many-to-many relationship
 * between users and groups. Each record links a user to a specific group.
 *
 * Table structure:
 * userIdentifier: A foreign key referencing the "identifier" column in the "User" table.
 *                 Represents the unique identifier for a user. Cannot be null.
 *                 Cascades on delete to ensure associated relationships are removed.
 * groupIdentifier: A foreign key referencing the "identifier" column in the "Group" table.
 *                  Represents the unique identifier for a group. Cannot be null.
 *                  Cascades on delete to ensure associated relationships are removed.
 *
 * Primary Key:
 * Combines userIdentifier and groupIdentifier to ensure each user-group pair
 * is unique within the table.
 */
export const UserGroup = pgTable("user_groups", {
    userIdentifier: identifierColumnType("user_identifier").references(() => User.identifier, {onDelete: "cascade"}).notNull(),
    groupIdentifier: identifierColumnType("group_identifier").references(() => Group.identifier, {onDelete: "cascade"}).notNull(),
}, (table) => [
    primaryKey({ name: "user_groups_user_identifier_group_identifier_pk", columns: [table.userIdentifier, table.groupIdentifier] }),
]);
