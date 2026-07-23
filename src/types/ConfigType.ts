// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend
// with hand-written exports (additional TypeBox schemas, types, constants, ...) —
// the generator only creates this file if it is missing; it will never
// overwrite or delete anything you add here afterwards.
import {ConfigValueTypes, type ConfigValueTypes as ConfigValueTypesType, ConfigEntrySelectSchema as _ConfigEntrySelectSchema, ConfigEntryInsertSchema as _ConfigEntryInsertSchema} from "@/types/_ConfigType.ts";
import {type Static, type TSchema, Type} from "@sinclair/typebox";

export * from './_ConfigType.ts';

export type ConfigEntryDataType = ConfigValueTypesType;

const ConfigValueTypeSchema = Type.Enum(ConfigValueTypes);

export const ConfigEntrySelectSchema = Type.Composite([
    Type.Omit(_ConfigEntrySelectSchema, ['type']),
    Type.Object({ type: ConfigValueTypeSchema }),
]);
export type ConfigEntrySelectType = Static<typeof ConfigEntrySelectSchema>;

export const ConfigEntryInsertSchema = Type.Composite([
    Type.Omit(_ConfigEntryInsertSchema, ['type']),
    Type.Object({ type: ConfigValueTypeSchema }),
]);
export type ConfigEntryInsertType = Static<typeof ConfigEntryInsertSchema>;


export type ConfigEntryUI = Pick<ConfigEntrySelectType, "domain" | "key" | "description" | "type" | "value" | "inputFormat" | "outputFormat" | "userProfile">;

export function schemaForConfigType(type: ConfigEntrySelectType["type"]): TSchema {
    switch (type) {
        case ConfigValueTypes.string:
            return Type.String();
        case ConfigValueTypes.number:
            return Type.Number();
        case ConfigValueTypes.boolean:
            return Type.Boolean();
        case ConfigValueTypes.object:
            return Type.Record(Type.String(), Type.Any());
        case ConfigValueTypes["string[]"]:
            return Type.Array(Type.String());
        case ConfigValueTypes["number[]"]:
            return Type.Array(Type.Number());
        default:
            return Type.String();
    }
}

export type ConfigDomainGroup = {
    domain: string;
    entries: ConfigEntryUI[];
};

export type ConfigListResponse = {
    domains: ConfigDomainGroup[];
};

export type ConfigUpdateRequest = {
    value: unknown;
    knownValue: unknown;
};

// --- TypeBox schemas for route validation and OpenAPI docs ---

export const ConfigEntryUiSchema = Type.Object({
    domain: Type.String(),
    key: Type.String(),
    description: Type.Optional(Type.String()),
    type: Type.Optional(Type.String()),
    value: Type.Any(),
    inputFormat: Type.String(),
    outputFormat: Type.String(),
    userProfile: Type.Boolean(),
});
export type ConfigEntryUiSchemaType = Static<typeof ConfigEntryUiSchema>;

export const ConfigDomainGroupSchema = Type.Object({
    domain: Type.String(),
    entries: Type.Array(ConfigEntryUiSchema),
});
export type ConfigDomainGroupSchemaType = Static<typeof ConfigDomainGroupSchema>;

export const ConfigDomainsResponseSchema = Type.Object({
    domains: Type.Array(ConfigDomainGroupSchema),
});
export type ConfigDomainsResponse = Static<typeof ConfigDomainsResponseSchema>;

export const ConfigUpdateBodySchema = Type.Object({
    value: Type.Any(),
    knownValue: Type.Any(),
});
export type ConfigUpdateBody = Static<typeof ConfigUpdateBodySchema>;

export const ConfigParamsSchema = Type.Object({
    domain: Type.String(),
    key: Type.String(),
});
export type ConfigParams = Static<typeof ConfigParamsSchema>;

export const ConfigUpdateConflictSchema = Type.Object({
    error: Type.String(),
    currentValue: Type.Any(),
});
export type ConfigUpdateConflict = Static<typeof ConfigUpdateConflictSchema>;
