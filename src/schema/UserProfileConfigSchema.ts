import { jsonb, pgTable, primaryKey, uuid, varchar } from "drizzle-orm/pg-core";
import { User } from "./UserSchema.ts";

export const UserProfileConfig = pgTable("user_profile_config", {
    domain: varchar("domain", { length: 255 }).notNull(),
    key: varchar("key", { length: 255 }).notNull(),
    userIdentifier: uuid("user_identifier").notNull()
        .references(() => User.identifier, { onDelete: "cascade" }),
    value: jsonb("value"),
}, (table) => [
    primaryKey({
        name: "user_profile_config_pk",
        columns: [table.domain, table.key, table.userIdentifier],
    }),
]);
