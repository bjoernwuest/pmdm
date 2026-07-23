import {boolean, jsonb, pgTable, text, uniqueIndex, uuid} from "drizzle-orm/pg-core";
import {ProductTypes} from "./ProductTypeSchema.ts";
import {sql} from "drizzle-orm";
import {DataTypeSchema} from "./DataTypeSchema.ts";
import {timestampColumnType} from "./helpers.ts";

export const Products = pgTable(
    "products",
    {
        productTypeIdentifier: uuid("product_type_identifier").notNull().references(() => ProductTypes.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
        productNumber: text("product_number").primaryKey(),
        updatedAt: timestampColumnType("updated_at").notNull().default(sql`now()`),
        disabled: boolean("disabled").notNull().default(false),
    },
    (table) => ({
        uniqueIdentifierCi: uniqueIndex("ux_alt_number_ci").on(sql`lower(${table.productNumber})`),
    }),
);


export const ProductsValues = pgTable(
    "products_values",
    {
        productNumber: text("product_number").notNull().references(() => Products.productNumber, { onDelete: "cascade", onUpdate: "cascade" }),
        dataTypeIdentifier: uuid("data_type_identifier").notNull().references(() => DataTypeSchema.identifier, { onDelete: "cascade", onUpdate: "cascade" }),
        value: jsonb("value"),
    },
    (table => ({
        uniqueIndex: uniqueIndex("ux_product_data").on(table.productNumber, table.dataTypeIdentifier),
    })),
);
