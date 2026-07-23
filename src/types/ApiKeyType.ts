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
});
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
});
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
    name: Type.String({ minLength: 1, maxLength: 255 }),
    description: Type.Optional(Type.String({ maxLength: 4000 })),
    permissionIdentifiers: Type.Optional(Type.Array(Type.String({ format: "uuid" }))),
});
export type ApiKeyCreateBody = Static<typeof ApiKeyCreateBodySchema>;

export const ApiKeyCreatedResponseSchema = Type.Object({
    identifier: Type.String({ format: "uuid" }),
    plainApiKey: Type.String(),
    expiresAt: Type.String(),
    keyLength: Type.Number(),
    validityDays: Type.Number(),
});
export type ApiKeyCreatedResponse = Static<typeof ApiKeyCreatedResponseSchema>;

export const ApiKeyUpdateMetadataBodySchema = Type.Object({
    knownUpdatedAt: Type.String(),
    name: Type.String({ minLength: 1, maxLength: 255 }),
    description: Type.Optional(Type.String({ maxLength: 4000 })),
});
export type ApiKeyUpdateMetadataBody = Static<typeof ApiKeyUpdateMetadataBodySchema>;

export const ApiKeyUpdatedAtResponseSchema = Type.Object({ updatedAt: Type.String() });
export type ApiKeyUpdatedAtResponse = Static<typeof ApiKeyUpdatedAtResponseSchema>;

export const ApiKeyProlongBodySchema = Type.Object({
    knownUpdatedAt: Type.String(),
    days: Type.Number({ minimum: 1, maximum: 730 }),
});
export type ApiKeyProlongBody = Static<typeof ApiKeyProlongBodySchema>;

export const ApiKeyProlongResponseSchema = Type.Object({
    updatedAt: Type.String(),
    expiresAt: Type.String(),
    lastProlongedAt: Nullable(Type.String()),
    lastProlongedBy: Nullable(Type.String({ format: "uuid" })),
});
export type ApiKeyProlongResponse = Static<typeof ApiKeyProlongResponseSchema>;

export const ApiKeyDisableResponseSchema = Type.Object({
    updatedAt: Type.String(),
    disabled: Type.Boolean(),
    disabledAt: Nullable(Type.String()),
    disabledBy: Nullable(Type.String({ format: "uuid" })),
});
export type ApiKeyDisableResponse = Static<typeof ApiKeyDisableResponseSchema>;

export const ApiKeyPermissionsBodySchema = Type.Object({
    knownUpdatedAt: Type.String(),
    permissionIdentifiers: Type.Array(Type.String({ format: "uuid" })),
});
export type ApiKeyPermissionsBody = Static<typeof ApiKeyPermissionsBodySchema>;
