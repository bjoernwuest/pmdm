import {boolean, jsonb, pgTable, text, uniqueIndex} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
import {baseColumnsNamedDescribed} from "./_base.ts";
import {Identifier, identifierColumnType, timestampColumnType} from "./helpers.ts";
import {BusinessDomains} from "./BusinessDomainSchema.ts";
import {DataTypeSchema, type DataTypeGroupRoles} from "./DataTypeSchema.ts";
import {Group, User} from "./UserSchema.ts";
import {TargetSystems} from "./TargetSystemSchema.ts";
import type {
    ConfigBoolean, ConfigCalculated, ConfigConsumable, ConfigLookup, ConfigProduct, ConfigString,
    YesNoScriptType
} from "@/types/DataTypeType.ts";

export const ProductTypes = pgTable(
    "product_types",
    {
        ...baseColumnsNamedDescribed,
        requestorCanCancel: boolean("requestor_can_cancel").notNull().default(false), // If true, the user 'createdBy' has permission to issue cancel of product request
    },
    (table) => ({
        uniqueNameCi: uniqueIndex("ux_product_types_name_ci").on(sql`lower(${table.name})`),
    })
);

export const ProductTypesPermission = pgTable(
    "product_types_permissions",
    {
        productTypeIdentifier: identifierColumnType("product_type_identifier").notNull().references(() => ProductTypes.identifier, { onDelete: "cascade", onUpdate: "cascade" }),
        groupIdentifier: identifierColumnType("group_identifier").notNull().references(() => Group.identifier, { onDelete: "cascade", onUpdate: "cascade" }),
        role: text("role").notNull().default("cancel"),
        createdAt: timestampColumnType("created_at").notNull().default(sql`now()`),
        createdBy: identifierColumnType("created_by").notNull().references(() => User.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
    }
);

export const ProductTypesDataTypes = pgTable(
    "product_types_data_types",
    {
        ...Identifier,
        productType: identifierColumnType("product_type").notNull().references(() => ProductTypes.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
        dataType: identifierColumnType("data_type").notNull().references(() => DataTypeSchema.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
//        mandatory: boolean("mandatory"), // If 'null', use the information from the referenced data type
        mandatory: text("mandatory").$type<YesNoScriptType>(), // If 'null', use the information from the referenced data type
        mandatory_script: text("mandatory_script"),
//        requestorCanEdit: boolean("requestor_can_edit"), // If 'null', use the information from the referenced data type
        requestorCanEdit: text("requestor_can_edit").$type<YesNoScriptType>(), // If 'null', use the information from the referenced data type
        requestorCanEdit_script: text("requestor_can_edit_script"),
        config: jsonb("config").$type<ConfigCalculated | ConfigBoolean | ConfigString | ConfigLookup | ConfigConsumable | ConfigProduct>(), // If 'null', use the information from the referenced data type. If any config value is null, use the information from the referenced data type.
        owner: identifierColumnType("owner").references(() => BusinessDomains.identifier, { onDelete: "restrict", onUpdate: "cascade" }), // If 'null', use the information from the referenced data type
        editableOnUpdate: boolean("editable_on_update").notNull().default(true),
    },
    (table => ({
        uniqueDataType: uniqueIndex("ux_product_types_data_types_ci").on(table.productType, table.dataType),
    })),
);

export const ProductTypesDataTypesTargetSystems = pgTable(
    "product_types_data_types_target_systems",
    {
        productType: identifierColumnType("product_type").notNull().references(() => ProductTypes.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
        dataType: identifierColumnType("data_type").notNull().references(() => DataTypeSchema.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
        targetSystem: identifierColumnType("target_system").notNull().references(() => TargetSystems.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
        name: text("name"), // If 'null' then use the name from the referenced data type
    },
    (table => ({
        uniqueTargetSystem: uniqueIndex("ux_product_types_data_types_target_systems").on(table.productType, table.dataType, table.targetSystem),
    })),
);

export const ProductTypesDataTypePermission = pgTable(
    "product_types_data_types_permissions",
    {
        productTypeDataTypeIdentifier: identifierColumnType("product_type_data_type_identifier").notNull().references(() => ProductTypesDataTypes.identifier, { onDelete: "cascade", onUpdate: "cascade" }),
        groupIdentifier: identifierColumnType("group_identifier").notNull().references(() => Group.identifier, { onDelete: "cascade", onUpdate: "cascade" }),
        role: text("role").$type<DataTypeGroupRoles>().notNull(),
        createdAt: timestampColumnType("created_at").notNull().default(sql`now()`),
        createdBy: identifierColumnType("created_by").notNull().references(() => User.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
        // This is for role "viewer" only: if set to `true`, then this data type is shown to members of the group by default in the UI. If set to `false`, then the user must toggle to view.
        showByDefault: boolean("show_by_default").notNull().default(true),
    },
    (table => ({
        uniquePermission: uniqueIndex("ux_product_types_data_types_permissions").on(table.productTypeDataTypeIdentifier, table.groupIdentifier, table.role),
    })),
);

export const ProductTypesDataTypePreviousApproval = pgTable(
    "product_types_data_types_previous_approval",
    {
        productType: identifierColumnType("product_type").notNull().references(() => ProductTypes.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
        dataType: identifierColumnType("data_type").notNull().references(() => DataTypeSchema.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
        dependsOnDataType: identifierColumnType("depends_on_data_type").notNull().references(() => DataTypeSchema.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
    },
    (table => ({
        uniqueDependency: uniqueIndex("ux_product_types_data_types_previous_approval").on(table.productType, table.dataType, table.dependsOnDataType),
    }))
);
