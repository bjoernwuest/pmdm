import {sql} from "drizzle-orm";
import {boolean, jsonb, pgTable, text, uniqueIndex} from "drizzle-orm/pg-core";
import {identifierColumnType, timestampColumnType} from "./helpers.ts";
import {baseColumnsNamedDescribed} from "./_base.ts";
import {Group, User} from "./UserSchema.ts";
import {BusinessDomains} from "@/schema/BusinessDomainSchema.ts";
import type {
    ConfigBoolean,
    ConfigCalculated,
    ConfigConsumable,
    ConfigLookup,
    ConfigNumeric,
    ConfigProduct,
    ConfigString,
    DataTypeKind, YesNoScriptType
} from "@/types/DataTypeType.ts";


/** Data-type master table with JSON configuration payloads per kind. */
export const DataTypeSchema = pgTable(
    "data_types",
    {
        ...baseColumnsNamedDescribed,
        kind: text("kind").notNull().$type<DataTypeKind>(),
        mandatory: text("mandatory").notNull().$type<YesNoScriptType>(),
        mandatory_script: text("mandatory_script"),
//        mandatory: boolean("mandatory").notNull().default(false),
        requestorCanEdit: text("requestor_can_edit").notNull().$type<YesNoScriptType>(),
        requestorCanEdit_script: text("requestor_can_edit_script"),
//        requestorCanEdit: boolean("requestor_can_edit").notNull().default(true),
        config: jsonb("config").$type<ConfigCalculated | ConfigBoolean | ConfigNumeric | ConfigString | ConfigLookup | ConfigConsumable | ConfigProduct>().notNull(),
        owner: identifierColumnType("owner").notNull().references(() => BusinessDomains.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
    },
    (table) => ({
        uniqueNameCi: uniqueIndex("ux_datatype_name_ci").on(sql`lower(${table.name})`),
    })
);

export const DataTypeGroupRoles = {
    Viewer: "viewer" as const,
    Writer: "writer" as const,
    Approver: "approver" as const,
};
export type DataTypeGroupRoles = typeof DataTypeGroupRoles[keyof typeof DataTypeGroupRoles];

export const DataTypePermission = pgTable(
    "data_types_permissions",
    {
        dataTypeIdentifier: identifierColumnType("data_type_identifier").notNull().references(() => DataTypeSchema.identifier, { onDelete: "cascade", onUpdate: "cascade" }),
        groupIdentifier: identifierColumnType("group_identifier").notNull().references(() => Group.identifier, { onDelete: "cascade", onUpdate: "cascade" }),
        role: text("role").$type<DataTypeGroupRoles>().notNull(),
        createdAt: timestampColumnType("created_at").notNull().default(sql`now()`),
        createdBy: identifierColumnType("created_by").notNull().references(() => User.identifier, { onDelete: "restrict", onUpdate: "cascade" }),
        // This is for role "viewer" only: if set to `true`, then this data type is shown to members of the group by default in the UI. If set to `false`, then the user must toggle to view.
        showByDefault: boolean("show_by_default").notNull().default(true),
    },
    (table) => ({
        uniqueAssignment: uniqueIndex("ux_datatype_permission_assignment").on(
            table.dataTypeIdentifier,
            table.groupIdentifier,
            table.role,
        ),
    }),
);
