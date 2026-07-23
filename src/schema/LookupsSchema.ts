import {pgTable, text, uniqueIndex, uuid} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
import {baseColumnsNamedDescribed} from "@/schema/_base.ts";

/** Source marker used for manually maintained lookup values. */
export const LOOKUP_SOURCE_SYSTEM_MANUAL = "manual" as const;

/** Lookup-type master table with case-insensitive unique names. */
export const LookupsSchema = pgTable("lookup",
    {
        ...baseColumnsNamedDescribed,
        sourceSystem: text("source_system").notNull().default(LOOKUP_SOURCE_SYSTEM_MANUAL),
    },
    (table) => ({
        uniqueNameCi: uniqueIndex("ux_lookup_name_ci").on(sql`lower(${table.name})`),
    })
);

/** Value rows belonging to a lookup type. */
export const LookupsValues = pgTable("lookup_values",
    {
        ...baseColumnsNamedDescribed,
        sourceSystemIdentifier: text("source_system_identifier"), // Source system identifier
        lookupIdentifier: uuid("lookup_identifier").notNull().references(() => LookupsSchema.identifier, { onDelete: "cascade", onUpdate: "restrict" }),
    },
    (table) => ({
        uniqueTypeNameCi: uniqueIndex("ux_lookup_values_type_name_ci").on(table.lookupIdentifier, sql`lower(${table.name})`),
    })
);
