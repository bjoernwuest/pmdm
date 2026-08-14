import { boolean, index, primaryKey, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pgTable } from "drizzle-orm/pg-core";
import {identifierColumnType, Identifier, timestampColumnType, timestamps} from "./helpers.ts";
import { User } from "./UserSchema.ts";
import { FunctionalPermission } from "./FunctionalPermissionSchema.ts";

export const ApiKeySchema = pgTable("api_keys", {
    ...Identifier, ...timestamps,
    name: text("name").notNull(),
    description: text("description"),
    keyHash: text("key_hash").notNull(),
    createdBy: identifierColumnType("created_by").notNull().references(() => User.identifier),
    expiresAt: timestampColumnType("expires_at").notNull(),
    lastProlongedAt: timestampColumnType("last_prolonged_at"),
    lastProlongedBy: identifierColumnType("last_prolonged_by").references(() => User.identifier),
    disabled: boolean("disabled").notNull().default(false),
    disabledAt: timestampColumnType("disabled_at"),
    disabledBy: identifierColumnType("disabled_by").references(() => User.identifier),
}, (table) => [
    // Serves validateApiKeySecret's `disabled = false AND expires_at > now()` pre-filter
    // (the crypt() hash comparison itself is not indexable — it must scan the remaining rows).
    index("api_keys_active_expiry_idx").on(table.expiresAt).where(sql`${table.disabled} = false`),
]);

export const ApiKeyFunctionalPermission = pgTable("api_key_functional_permissions", {
    apiKeyIdentifier: identifierColumnType("api_key_identifier").notNull().references(() => ApiKeySchema.identifier, { onDelete: "cascade" }),
    functionalPermissionIdentifier: identifierColumnType("functional_permission_identifier").notNull().references(() => FunctionalPermission.identifier, { onDelete: "cascade" }),
    grantedBy: identifierColumnType("granted_by").notNull().references(() => User.identifier),
    grantedAt: timestampColumnType("granted_at").notNull().defaultNow(),
}, (table) => [
    primaryKey({
        name: "api_key_functional_permissions_pkey",
        columns: [table.apiKeyIdentifier, table.functionalPermissionIdentifier],
    }),
]);

