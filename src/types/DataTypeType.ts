// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend
// with hand-written exports (additional TypeBox schemas, types, constants, ...) —
// the generator only creates this file if it is missing; it will never
// overwrite or delete anything you add here afterwards.

import {type Static, Type} from "@sinclair/typebox";
import type {UUIDType} from "@/types/helpers.ts";
import type {ProductRequestsSelectType} from "@/types/ProductRequestType.ts";
import type {ProductsSelectType} from "@/types/ProductType.ts";
import type {LookupsValuesSelectType} from "@/types/LookupsType.ts";
import type {ConsumablesValuesSelectType} from "@/types/ConsumableType.ts";
import type {ProductTypeType} from "@/types/ProductTypeType.ts";
import {
    DataTypeSchemaSelectSchema as _DataTypeSchemaSelectSchema,
    DataTypeSchemaInsertSchema as _DataTypeSchemaInsertSchema,
    DataTypePermissionSelectSchema as _DataTypePermissionSelectSchema,
    DataTypePermissionInsertSchema as _DataTypePermissionInsertSchema,
    DataTypeGroupRoles
} from "@/types/_DataTypeType.ts";
import {TAG_CREATE, TAG_DISABLE, TAG_GRANT, TAG_REVOKE, TAG_UPDATE, type Tag} from "./PubSubType";
import {BusinessDomainsSelectSchema} from "./BusinessDomainType.ts";

export * from './_DataTypeType.ts';

/** Canonical set of supported data type kinds. */
export const DataTypeKind = {
    Calculated: "calculated" as const,
    Boolean: "boolean" as const,
    Numeric: "numeric" as const,
    String: "string" as const,
    Lookup: "lookup" as const,
    Consumable: "consumable" as const,
    Product: "product" as const,
};
/** Union type of all supported data type kind literals. */
export type DataTypeKind = typeof DataTypeKind[keyof typeof DataTypeKind];

export const YesNoScript = {
    Yes: "Yes" as const,
    No: "No" as const,
    Script: "Script" as const,
};
export type YesNoScriptType = typeof YesNoScript[keyof typeof YesNoScript];

export const CalculatedCalculationMode = {
    OnChange: "on_change" as const,
    OnExport: "on_export" as const,
};
export type CalculatedCalculationMode = typeof CalculatedCalculationMode[keyof typeof CalculatedCalculationMode];

export const DefaultValueCalculationMode = {
    OnCreate: "on_create" as const, // Calculate default value on creation of product request only
    OnChangeNoValue: "on_change_no_value" as const, // Calculate default value every time another data type value on product request changes, but only if this data type has no value assigned on the product request and the value is not approved (i.e. ProductRequestsValues.value is null and ProductRequestValues.approvedAt is null).
    OnChange: "on_change" as const, // Calculate default value every time another data type value on product request changes, even this data type as already a value assigned on the product request, unless the value is approved (i.e. ProductRequestsValues.value is <any>> and ProductRequestValues.approvedAt is null).
}
export type DefaultValueCalculationMode = typeof DefaultValueCalculationMode[keyof typeof DefaultValueCalculationMode];

/** Runtime filter extension for config objects that support constrained options. */
type Filterable<T> = {
    // JavaScript to "filter" available elements. Used for Lookup, Consumabled, and Product. To be executed on the backend.
    filter: undefined | ((d: DataTypeSchemaSelectType, p: ProductRequestsSelectType | ProductsSelectType) => T[]),
}

/** Runtime default-value extension for config objects. */
type DefaultProvider<T> = {
    // JavaScript to "calculate" default value for data type. To be executed on the backend.
    defaultProvider: undefined | ((d: DataTypeSchemaSelectType, p: ProductRequestsSelectType | ProductsSelectType) => T),
    mode: DefaultValueCalculationMode | undefined, // Must be set for DataType, may be overwritten by ProductTypesDataTypes
}

/** Runtime value validator for data type. */
type Validator = {
    // JavaScript to validate value of data type. Must be executable in the browser. To be exected in the browser (upon data entry) and on the backend.
    validate: undefined | ((d: DataTypeSchemaSelectType, p: ProductRequestsSelectType | ProductsSelectType) => boolean),
}

/** Configuration payload for calculated data types. */
export type ConfigCalculated = {
    // JavaScript that calculates the value. To be executed on the backend.
    script: undefined | (() => any),
    // When to execute the script.
    mode: CalculatedCalculationMode | undefined, // Must be set for DataType, may be overwritten by ProductTypesDataTypes
}

/** Configuration payload for boolean data types. */
export type ConfigBoolean = DefaultProvider<boolean> & Validator & {
    // When set to `true`, the value of the boolean data type can be empty (null/undefined). Defaults to `false`.
    permitEmpty: boolean | undefined, // Must be set for DataType, may be overwritten by ProductTypesDataTypes
}

/** Configuration payload for numeric data types. */
export type ConfigNumeric = DefaultProvider<number> & Validator & {
    // Number of decimals. Defaults to 0.
    decimals: number | undefined, // Must be set for DataType, may be overwritten by ProductTypesDataTypes
    // Minimum value permitted. Defaults to "-infinite". At most `max`.
    min: number | undefined, // Must be set for DataType, may be overwritten by ProductTypesDataTypes
    // Maximum value permitted. Defaults to "+infinite". At least `min`.
    max: number | undefined,
}

/** Configuration payload for string data types. */
export type ConfigString = DefaultProvider<string> & Validator & {
    // Minimum number of characters in the string. Defaults to 0. At least 0. At most `max`.
    min: number | undefined,
    // Maximum number of characters in the string. Defaults to "infinite", At least `min`.
    max: number | undefined,
    // Defaults to `false`. When set to `true` then multi-line text is supported (i.e. use TextArea instead of Input)
    multi: boolean | undefined, // Must be set for DataType, may be overwritten by ProductTypesDataTypes
}

/** Configuration payload for lookup-backed data types. */
export type ConfigLookup = DefaultProvider<LookupsValuesSelectType[]> & Filterable<LookupsValuesSelectType> & Validator & {
    // Identifier of the Lookup from which values are selectable
    source: UUIDType | undefined, // Must be set for DataType, must not be be overwritten by ProductTypesDataTypes (i.e. there it must be `undefined`)
    // Defaults to `false`. When set to `true` then multiple lookup values can be selected.
    multi: boolean | undefined, // Must be set for DataType, may be overwritten by ProductTypesDataTypes
}

/** Configuration payload for consumable-backed data types. */
export type ConfigConsumable = DefaultProvider<ConsumablesValuesSelectType[]> & Filterable<ConsumablesValuesSelectType> & Validator & {
    // Identifier of the Consumable from which values are selectable
    source: UUIDType | undefined, // Must be set for DataType, must not be be overwritten by ProductTypesDataTypes (i.e. there it must be `undefined`)
    // Defaults to `false`. When set to `true` then multiple consumable values can be selected.
    multi: boolean | undefined, // Must be set for DataType, may be overwritten by ProductTypesDataTypes
}

export type ConfigProduct = DefaultProvider<ProductTypeType[]> & Filterable<ProductTypeType> & Validator & {
    // Defaults to `false`. When set to `true` then multiple consumable values can be selected.
    multi: boolean | undefined, // Must be set for DataType, may be overwritten by ProductTypesDataTypes
}

export const CalculatedCalculationModeSchema = Type.Enum(CalculatedCalculationMode);

export const ConfigCalculatedSchema = Type.Object({
    script: Type.Optional(Type.String()),
    mode: Type.Optional(CalculatedCalculationModeSchema),
}, { additionalProperties: false });

export const ConfigBooleanSchema = Type.Object({
    defaultProvider: Type.Optional(Type.String()),
    mode: Type.Optional(Type.Unknown()),
    validate: Type.Optional(Type.String()),
    permitEmpty: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

export const ConfigNumericSchema = Type.Object({
    defaultProvider: Type.Optional(Type.String()),
    mode: Type.Optional(Type.Unknown()),
    validate: Type.Optional(Type.String()),
    decimals: Type.Optional(Type.Number()),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
}, { additionalProperties: false });

export const ConfigStringSchema = Type.Object({
    defaultProvider: Type.Optional(Type.String()),
    mode: Type.Optional(Type.Unknown()),
    validate: Type.Optional(Type.String()),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
    multi: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

export const ConfigLookupSchema = Type.Object({
    defaultProvider: Type.Optional(Type.String()),
    mode: Type.Optional(Type.Unknown()),
    filter: Type.Optional(Type.String()),
    validate: Type.Optional(Type.String()),
    source: Type.Optional(Type.String({ format: 'uuid' })),
    multi: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

export const ConfigConsumableSchema = Type.Object({
    defaultProvider: Type.Optional(Type.String()),
    mode: Type.Optional(Type.Unknown()),
    filter: Type.Optional(Type.String()),
    validate: Type.Optional(Type.String()),
    source: Type.Optional(Type.String({ format: 'uuid' })),
    multi: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

export const ConfigProductSchema = Type.Object({
    defaultProvider: Type.Optional(Type.String()),
    mode: Type.Optional(Type.Unknown()),
    filter: Type.Optional(Type.String()),
    validate: Type.Optional(Type.String()),
    multi: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

// Refined re-export for data type schema
const configSchema = Type.Optional(Type.Union([
    ConfigCalculatedSchema,
    ConfigBooleanSchema,
    ConfigNumericSchema,
    ConfigStringSchema,
    ConfigLookupSchema,
    ConfigConsumableSchema,
    ConfigProductSchema,
]));
export const DataTypeSchemaSelectSchema = Type.Composite([
    Type.Omit(_DataTypeSchemaSelectSchema, ['config']),
    Type.Object({ config: configSchema }),
]);
export type DataTypeSchemaSelectType = Static<typeof DataTypeSchemaSelectSchema>;

/** Wrapper schema for list and detail endpoints that return data type with joined owner. */
export const DataTypeListEntitySchema = Type.Object({
    dataType: DataTypeSchemaSelectSchema,
    owner: Type.Optional(BusinessDomainsSelectSchema),
});
export type DataTypeListEntityType = Static<typeof DataTypeListEntitySchema>;

export const DataTypeSchemaInsertSchema = Type.Composite([
    Type.Omit(_DataTypeSchemaInsertSchema, ['config', 'mandatory', 'requestorCanEdit']),
    Type.Object({
        config: configSchema,
        mandatory: Type.Optional(Type.String()),
        requestorCanEdit: Type.Optional(Type.String()),
    }),
]);
export type DataTypeSchemaInsertType = Static<typeof DataTypeSchemaInsertSchema>;

// Refined re-export for permissions
export const DataTypeGroupRolesSchema = Type.Enum(DataTypeGroupRoles);
export const DataTypePermissionSelectSchema = Type.Composite([
    Type.Omit(_DataTypePermissionSelectSchema, ['config']),
    Type.Object({ config: configSchema }),
]);
export type DataTypePermissionSelectType = Static<typeof DataTypePermissionSelectSchema>;

export const DataTypePermissionInsertSchema = Type.Composite([
    Type.Omit(_DataTypePermissionInsertSchema, ['config']),
    Type.Object({ config: configSchema }),
]);
export type DataTypePermissionInsertType = Static<typeof DataTypePermissionInsertSchema>;


/** Resource tag for DataType. */
export const TAG_DATA_TYPE = "data_type" as const;
/** Resource tag for DataTypePermission. */
export const TAG_DATA_TYPE_PERMISSION = "data_type_permission" as const;

/** PubSub topic for data type disable events. */
export const message_DisableDataType: Tag[] = [TAG_DATA_TYPE, TAG_DISABLE];
/** PubSub topic for data type update events. */
export const message_UpdateDataType: Tag[] = [TAG_DATA_TYPE, TAG_UPDATE];
/** PubSub topic for data type create events. */
export const message_CreateDataType: Tag[] = [TAG_DATA_TYPE, TAG_CREATE];

/** PubSub topic for data type permission grant events. */
export const message_DataTypePermission_Grant: Tag[] = [TAG_DATA_TYPE_PERMISSION, TAG_GRANT];
/** PubSub topic for data type permission revoke events. */
export const message_DataTypePermission_Revoke: Tag[] = [TAG_DATA_TYPE_PERMISSION, TAG_REVOKE];
/** PubSub topic for data type permission update events. */
export const message_DataTypePermission_Update: Tag[] = [TAG_DATA_TYPE_PERMISSION, TAG_UPDATE];

/** TypeBox schema for the update (PUT) request body of a data type.
 *  All data fields are optional; only `knownUpdatedAt` is required. */
export const UpdateDataTypeBodySchema = Type.Object({
    knownUpdatedAt: Type.String(),
    ...Type.Partial(DataTypeSchemaInsertSchema).properties
});

/** DataTypePermission joined with group name. */
export type DataTypePermissionWithGroup = DataTypePermissionSelectType & { groupName: string; };