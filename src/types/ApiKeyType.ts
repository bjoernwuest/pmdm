// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend
// with hand-written exports (additional TypeBox schemas, types, constants, ...) —
// the generator only creates this file if it is missing; it will never
// overwrite or delete anything you add here afterwards.
import {FunctionalPermissionSelectSchema} from "@/types/_FunctionalPermissionType.ts";
import {Type, type Static} from "@sinclair/typebox";
import {Nullable} from "@/types/helpers.ts";

export * from './_ApiKeyType.ts';

export const ApiKeySummarySchema = Type.Object({
    identifier: Type.String({format: "uuid"}),
    name: Type.String(),
    description: Nullable(Type.String()),
    createdBy: Type.String({format: "uuid"}),
    createdAt: Type.String(),
    updatedAt: Type.String(),
    expiresAt: Type.String(),
    lastProlongedAt: Nullable(Type.String()),
    lastProlongedBy: Nullable(Type.String({format: "uuid"})),
    disabled: Type.Boolean(),
    disabledAt: Nullable(Type.String()),
    disabledBy: Nullable(Type.String({format: "uuid"})),
    permissionNames: Type.Array(Type.String()),
});
export type ApiKeySummary = Static<typeof ApiKeySummarySchema>;


export const ApiKeysResponseSchema = Type.Object({
    apiKeys: Type.Array(ApiKeySummarySchema),
    page: Type.Number({minimum: 0}),
    pageSize: Type.Number({minimum: 1}),
    total: Type.Number({minimum: 0}),
    availablePageSizes: Type.Array(Type.Number()),
    includeDisabled: Type.Boolean(),
}, { description: "Paged list of API keys with metadata and assigned permission names." });
export type ApiKeysResponse = Static<typeof ApiKeysResponseSchema>;

export const UserDisplayInfoSchema = Type.Object({
    firstName: Type.String(),
    lastName: Type.String(),
    email: Type.String(),
});
export type UserDisplayInfo = Static<typeof UserDisplayInfoSchema>;

export const ApiKeyDetailSchema = Type.Object({
    apiKey: ApiKeySummarySchema,
    permissionIdentifiers: Type.Array(Type.String({format: "uuid"})),
    allPermissions: Type.Array(FunctionalPermissionSelectSchema),
    relatedUsers: Type.Record(Type.String({format: "uuid"}), UserDisplayInfoSchema),
}, { description: "Single API key with metadata, its permission identifiers, all known permissions, and related user display info." });
export type ApiKeyDetailResponse = Static<typeof ApiKeyDetailSchema>;

export type CreateApiKeyRequest = {
    name: string;
    description?: string | null;
    permissionIdentifiers?: string[];
};

export type CreateApiKeyResponse = {
    identifier: string;
    plainApiKey: string;
    expiresAt: string;
    keyLength: number;
    validityDays: number;
};

// --- Operation-specific request / response schemas ---

export const ApiKeyCreateBodySchema = Type.Object({
    name: Type.String({ minLength: 1, maxLength: 255, description: "Human-readable name of the API key." }),
    description: Type.Optional(Type.String({ maxLength: 4000, description: "Optional free-text note describing the purpose of the API key." })),
    permissionIdentifiers: Type.Optional(Type.Array(Type.String({ format: "uuid" }), { description: "UUIDs of the functional permissions to grant to the API key." })),
});
export type ApiKeyCreateBody = Static<typeof ApiKeyCreateBodySchema>;

export const ApiKeyCreatedResponseSchema = Type.Object({
    identifier: Type.String({ format: "uuid" }),
    plainApiKey: Type.String(),
    expiresAt: Type.String(),
    keyLength: Type.Number(),
    validityDays: Type.Number(),
}, { description: "Newly created API key including the plaintext secret, which is returned only once." });
export type ApiKeyCreatedResponse = Static<typeof ApiKeyCreatedResponseSchema>;

export const ApiKeyUpdateMetadataBodySchema = Type.Object({
    knownUpdatedAt: Type.String({ description: "Last known updatedAt timestamp of the API key for optimistic locking. The request fails with 409 if it no longer matches the stored value." }),
    name: Type.String({ minLength: 1, maxLength: 255, description: "New human-readable name of the API key." }),
    description: Type.Optional(Type.String({ maxLength: 4000, description: "Optional new free-text note describing the purpose of the API key." })),
});
export type ApiKeyUpdateMetadataBody = Static<typeof ApiKeyUpdateMetadataBodySchema>;

export const ApiKeyUpdatedAtResponseSchema = Type.Object({ updatedAt: Type.String() }, { description: "New updatedAt timestamp after the API key metadata was changed." });
export type ApiKeyUpdatedAtResponse = Static<typeof ApiKeyUpdatedAtResponseSchema>;

export const ApiKeyProlongBodySchema = Type.Object({
    knownUpdatedAt: Type.String({ description: "Last known updatedAt timestamp of the API key for optimistic locking. The request fails with 409 if it no longer matches the stored value." }),
    days: Type.Number({ minimum: 1, maximum: 730, description: "Number of days by which to extend the expiry date of the API key." }),
});
export type ApiKeyProlongBody = Static<typeof ApiKeyProlongBodySchema>;

export const ApiKeyProlongResponseSchema = Type.Object({
    updatedAt: Type.String(),
    expiresAt: Type.String(),
    lastProlongedAt: Nullable(Type.String()),
    lastProlongedBy: Nullable(Type.String({ format: "uuid" })),
}, { description: "Updated API key state after prolongation (updatedAt, expiresAt, and prolongation metadata)." });
export type ApiKeyProlongResponse = Static<typeof ApiKeyProlongResponseSchema>;

export const ApiKeyDisableResponseSchema = Type.Object({
    updatedAt: Type.String(),
    disabled: Type.Boolean(),
    disabledAt: Nullable(Type.String()),
    disabledBy: Nullable(Type.String({ format: "uuid" })),
}, { description: "Updated API key state after disabling (updatedAt, disabled flag, and disabling metadata)." });
export type ApiKeyDisableResponse = Static<typeof ApiKeyDisableResponseSchema>;

export const ApiKeyPermissionsBodySchema = Type.Object({
    knownUpdatedAt: Type.String({ description: "Last known updatedAt timestamp of the API key for optimistic locking. The request fails with 409 if it no longer matches the stored value." }),
    permissionIdentifiers: Type.Array(Type.String({ format: "uuid" }), { description: "Complete replacement list of functional permission UUIDs assigned to the API key." }),
});
export type ApiKeyPermissionsBody = Static<typeof ApiKeyPermissionsBodySchema>;
