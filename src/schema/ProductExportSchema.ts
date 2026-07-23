import {identifierColumnType, timestampColumnType} from "@/schema/helpers.ts";
import {ProductRequests} from "@/schema/ProductRequestSchema.ts";
import {pgTable, primaryKey, uuid} from "drizzle-orm/pg-core";
import {TargetSystems} from "@/schema/TargetSystemSchema.ts";
import {User} from "@/schema/UserSchema.ts";

export const ProductExports = pgTable(
    "product_exports",
    {
        productRequest: identifierColumnType("product_request").references(() => ProductRequests.identifier, { onDelete: "cascade", onUpdate: "cascade" }),
        targetSystem: identifierColumnType("target_system").references(() => TargetSystems.identifier, { onDelete: "cascade", onUpdate: "cascade" }),
        exportedBy: uuid("exported_by").references(() => User.identifier, { onUpdate: "cascade", onDelete: "restrict" }),
        exportedAt: timestampColumnType("exported_at"),
        importedBy: uuid("imported_by").references(() => User.identifier, { onUpdate: "cascade", onDelete: "restrict" }),
        importedAt: timestampColumnType("imported_at"),
    },
    (table) => ({
            pk: primaryKey({ columns: [table.productRequest, table.targetSystem] }),
    })
);
