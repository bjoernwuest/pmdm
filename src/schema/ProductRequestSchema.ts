import {baseColumns} from "./_base.ts";
import {boolean, jsonb, pgTable, text, uniqueIndex, uuid} from "drizzle-orm/pg-core";
import {identifierColumnType, timestampColumnType} from "./helpers.ts";
import {ProductTypes} from "./ProductTypeSchema.ts";
import {User} from "./UserSchema.ts";
import {sql} from "drizzle-orm";
import {Products} from "./ProductSchema.ts";
import {DataTypeSchema} from "./DataTypeSchema.ts";

export const ProductNumberState = pgTable("product_number_state", {
    locked: boolean("locked").primaryKey().default(false),
    // This is a sentinel value - there will only ever be one row
    // We use the id column for simplicity and use FOR UPDATE locking on it; or alternatively set the value to "true" and when releasing set the "false".
    notes: text("notes").default("Sentinel row for atomic product number generation"),
});

export const ProductRequestStatus = {
    open: "open" as const, // To be set when creating a product "from scratch" (incl. "copy of")
    importing: "importing" as const,
    done: "done" as const,
    cancelled: "cancelled" as const, // "free" consumables!
};
export type ProductRequestStatus = typeof ProductRequestStatus[keyof typeof ProductRequestStatus];

export const ProductRequests = pgTable(
    "product_requests",
    {
        ...baseColumns,
        productType: identifierColumnType("product_type").references(() => ProductTypes.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
        productNumber: text("product_number").notNull(),
        productToUpdate: text("product_to_update_from").references(() => Products.productNumber, { onDelete: "cascade", onUpdate: "cascade" }),
        status: text("status").notNull().$type<ProductRequestStatus>().default(ProductRequestStatus.open),
    },
    (table) => ({
        // Index to ensure that each productNumber is open at max once for "open" and "importing"
        uniqueActiveProductNumber: uniqueIndex("ux_product_requests_active_product_number").on(table.productNumber).where(sql`${table.status} IN ('open', 'importing')`),
        // Index to ensure that there is at max one update request for "open" and "importing"
        uniqueActiveProductToUpdate: uniqueIndex("ux_product_requests_active_product_to_update").on(table.productToUpdate).where(sql`${table.status} IN ('open', 'importing')`),
    })
);

export const ProductRequestsValues = pgTable(
    "product_requests_values",
    {
        dataType: identifierColumnType("data_type").references(() => DataTypeSchema.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
        productRequest: identifierColumnType("product_request").references(() => ProductRequests.identifier, { onDelete: "cascade", onUpdate: "cascade" }),
        ...baseColumns,
        approvedAt: timestampColumnType("approvated_at"),
        approvedBy: uuid("approved_by").references(() => User.identifier, { onUpdate: "cascade", onDelete: "restrict" }),
        defaultValue: jsonb("default_value").default("null"),
        value: jsonb("value"), // If null, then use "defaultValue"; if the value shall be null, then set '"null"'::jsonb as value
    },
    (table) => ({
        uniqueRequestDataType: uniqueIndex().on(table.productRequest, table.dataType),
    })
);
