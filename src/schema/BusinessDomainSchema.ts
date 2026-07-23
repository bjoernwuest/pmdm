import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {baseColumnsNamed} from "./_base.ts";

/** Business-domain master table with case-insensitive unique names. */
export const BusinessDomains = pgTable(
    "business_domains",
    { ...baseColumnsNamed },
    (table) => ({
        uniqueNameCi: uniqueIndex("ux_business_domain_name_ci").on(sql`lower(${table.name})`),
    })
);
