import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { Identifier, timestamps } from "./helpers.ts";

/**
 * Represents the "audit_log" table for persisting audit trail entries.
 *
 * Each row captures:
 * - An automatically generated identifier and timestamps.
 * - The `topic` of the PubSub event that triggered the log entry (e.g., "grant.x", "create.y").
 * - The full published message (`payload`) stored as JSONB for schema-less storage. No interpretation is performed; raw message is preserved.
 * - `createdAt` defaults to `now()` via the database, satisfying the requirement that the database default is used for the timestamp.
 */
export const AuditEntrySchema = pgTable("audit_log", {
    ...Identifier,
    topic: text("topic").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, any>>(),
    ...timestamps,
}, (table) => [
    // Backs the `orderBy(desc(createdAt))` + offset pagination used by every audit-log query.
    // The `topic ILIKE '%…%'` search uses leading wildcards and defeats btree indexing;
    // a trigram (pg_trgm) GIN index would be required and is not introduced here.
    index("audit_log_created_at_idx").on(table.createdAt),
]);
