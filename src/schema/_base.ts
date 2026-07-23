import {boolean, type pgTable, text, uuid} from "drizzle-orm/pg-core";
import { Identifier, timestamps } from "./helpers";
import {User} from "./UserSchema.ts";
import type {InferInsertModel, InferSelectModel } from "drizzle-orm";

export const baseColumns = {
    ...Identifier,
    ...timestamps,
    createdBy: uuid("created_by").references(() => User.identifier, { onUpdate: "cascade", onDelete: "restrict" }),
    updatedBy: uuid("updated_by").references(() => User.identifier, { onUpdate: "cascade", onDelete: "restrict" }),
};

export const baseColumnsNamed = {
    ...baseColumns,
    name: text("name").notNull(),
    disabled: boolean("disabled").notNull().default(false),
};

type baseColumnNamedTable = ReturnType<typeof pgTable<"dummy", typeof baseColumnsNamed>>;
export type BaseColumnsNamedSelectType = InferSelectModel<baseColumnNamedTable>;
export type BaseColumnsNamedInsertType = InferInsertModel<baseColumnNamedTable>;

export const baseColumnsNamedDescribed = {
    ...baseColumnsNamed,
    description: text("description"),
}

type baseColumnNamedDescribedTable = ReturnType<typeof pgTable<"dummy", typeof baseColumnsNamedDescribed>>;
export type BaseColumnsNamedDescribedSelectType = InferSelectModel<baseColumnNamedDescribedTable>;
export type BaseColumnsNamedDescribedInsertType = InferInsertModel<baseColumnNamedDescribedTable>;
