import {boolean, index, pgTable, uniqueIndex, uuid} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
import {baseColumnsNamedDescribed} from "./_base.ts";

/** Consumable master table with case-insensitive unique names. */
export const Consumables = pgTable(
    "consumables",
    { ...baseColumnsNamedDescribed },
    (table) => ({
        uniqueNameCi: uniqueIndex("ux_consumables_name_ci").on(sql`lower(${table.name})`),
    })
);

/** Values that belong to a consumable, including usage and enabled state. */
export const ConsumablesValues = pgTable(
    "consumables_values",
    {
        ...baseColumnsNamedDescribed,
        isUsed: boolean("is_used").notNull().default(false),
        consumableIdentifier: uuid("consumable_identifier").notNull().references(() => Consumables.identifier, { onUpdate: "cascade", onDelete: "restrict" }),
    },
    (table) => ({
        // Per consumable, each value must be unique
        uniqueConsumableValueCi: uniqueIndex("ux_unique_name_per_consumable").on(table.consumableIdentifier, sql`lower(${table.name})`),
        // Speed up to find used / non-used values
        idxConsumableUsed: index("ix_search_unused_values").on(table.consumableIdentifier, table.isUsed),
        // Speed up to find disabled values
        idxConsumableActive: index("ix_search_disabled_values").on(table.consumableIdentifier, table.disabled),
    })
);
