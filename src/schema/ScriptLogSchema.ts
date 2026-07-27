import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { Identifier, timestamps } from "./helpers.ts";

export const ScriptLogSchema = pgTable("script_log", {
    ...Identifier,
    logLevel:         text("log_level").notNull(),
    message:          text("message").notNull(),
    scriptCategory:   text("script_category").notNull(),
    dataTypeIdentifier:       uuid("data_type_identifier"),
    productRequestIdentifier: uuid("product_request_identifier"),
    principalUserId:          uuid("principal_user_id"),
    ...timestamps,
});
