import {timestamp, uuid} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";

/**
 * A function that generates a UUID (Universally Unique Identifier) based on the provided name.
 * Typically used to define or derive a unique identifier for a column in a database or data structure.
 *
 * @param {string} name - The name used as a seed or input to generate the UUID.
 * @returns {string} A string representing the unique identifier (UUID) derived from the input name.
 */
export const identifierColumnType = (name: string) => uuid(name);

/**
 * Represents a database column configuration for an identifier.
 *
 * - `identifier`: Configures the column as a primary key.
 * - Applies a default value generation strategy using a random value.
 *
 * The column is designed to uniquely identify records within a database table.
 */
export const Identifier = { identifier: identifierColumnType("identifier").primaryKey().default(sql`uuidv7()`) }

/**
 * Creates a string-mode timestamp column definition for Drizzle schemas.
 *
 * @param name Physical column name.
 * @returns Timestamp column builder configured with `mode: "string"`.
 */
export const timestampColumnType = (name: string) => timestamp(name, { mode: "string", withTimezone: true });

/**
 * An object representing timestamp fields for a database record.
 *
 * @property {object} createdAt - The timestamp indicating when the record was created.
 *                                This field is non-nullable and defaults to the current time.
 * @property {object} updatedAt - The timestamp indicating when the record was last updated.
 *                                This field is non-nullable, defaults to the current time,
 *                                and is automatically updated to the current date on modification.
 */
export const timestamps = {
    createdAt: timestampColumnType("created_at").notNull().defaultNow(),
    updatedAt: timestampColumnType("updated_at").notNull().defaultNow().$onUpdate(() => sql`now()`),
}
