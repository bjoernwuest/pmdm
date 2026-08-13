import { UserProfileConfigSelectSchema as _UserProfileConfigSelectSchema, UserProfileConfigInsertSchema as _UserProfileConfigInsertSchema } from "@/types/_UserProfileConfigType.ts";
import { type Static, Type } from "@sinclair/typebox";
import { Nullable } from "./helpers.ts";

export * from './_UserProfileConfigType.ts';

export const UserProfileConfigSelectSchema = Type.Composite([
    Type.Omit(_UserProfileConfigSelectSchema, []),
]);
export type UserProfileConfigSelectType = Static<typeof UserProfileConfigSelectSchema>;

export const UserProfileConfigInsertSchema = Type.Composite([
    Type.Omit(_UserProfileConfigInsertSchema, []),
]);
export type UserProfileConfigInsertType = Static<typeof UserProfileConfigInsertSchema>;

// --- TypeBox schemas for route validation and OpenAPI docs ---

export const UserProfileConfigEntrySchema = Type.Object({
    domain: Type.String({ description: "Configuration domain of the entry." }),
    key: Type.String({ description: "Configuration key of the entry within the domain." }),
    description: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: "Human-readable description of the entry, or null." })),
    type: Type.String({ description: "Configuration value type of the entry." }),
    value: Type.Any({ description: "Global default value of the entry." }),
    userValue: Type.Any({ description: "Current user's override value, or null when not overridden." }),
    inputFormat: Type.String({ description: "Input format used to render the editor for this entry." }),
    outputFormat: Type.String({ description: "Output format used to render the current value." }),
}, { description: "One user-configurable entry with the global default and the current user's override value." });
export type UserProfileConfigEntry = Static<typeof UserProfileConfigEntrySchema>;

export const UserProfileConfigResponseSchema = Type.Object({
    entries: Type.Array(UserProfileConfigEntrySchema),
}, { description: "All user-configurable entries with the global default value and the current user's override value." });
export type UserProfileConfigResponse = Static<typeof UserProfileConfigResponseSchema>;

export const UserProfileConfigUpdateSchema = Type.Object({
    value: Type.Any({ description: "New override value for the entry. null or undefined resets the entry to the global default." }),
    knownValue: Type.Optional(Type.Any({ description: "Last known userValue of the entry for optimistic locking. Omit to skip the concurrency check." })),
});
export type UserProfileConfigUpdate = Static<typeof UserProfileConfigUpdateSchema>;

export const UserProfileConfigParamsSchema = Type.Object({
    domain: Type.String({ description: "Configuration domain, e.g. 'auth' or 'ui'." }),
    key: Type.String({ description: "Configuration key within the domain." }),
});
export type UserProfileConfigParams = Static<typeof UserProfileConfigParamsSchema>;
