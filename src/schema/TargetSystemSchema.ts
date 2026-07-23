import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {baseColumnsNamed} from "./_base.ts";

/** Target-system master table with case-insensitive unique names. */
export const TargetSystems = pgTable(
    "target_systems",
    { ...baseColumnsNamed },
    (table) => ({
        uniqueNameCi: uniqueIndex("ux_target_systems_name_ci").on(sql`lower(${table.name})`),
    })
);
