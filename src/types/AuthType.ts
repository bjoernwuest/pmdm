import {FunctionalPermissionSelectSchema, type FunctionalPermissionSelectType} from "./FunctionalPermissionType.ts";
import {type Static, Type} from "@sinclair/typebox";

/** Generic claim bag extracted from an ID/access token. */
export type Claims = Record<string, unknown>;

/** Authz context produced by auth middleware for request handlers. */
export type AuthorizedContext = {
    claims: Claims;
    permissions: FunctionalPermissionSelectType[];
};

/**
 * Represents an authenticated session containing various tokens and expiration details.
 *
 * @interface Session
 * @property {string} [idTokenRaw] - The raw ID token in string format, if available.
 * @property {Record<string, any>} idTokenClaims - A collection of claims extracted from the ID token.
 * @property {string} [refreshToken] - The refresh token associated with the session, if available.
 * @property {string} [accessToken] - The access token used for API authentication, if available.
 * @property {number} expiresAt - The expiration time of the session in milliseconds since the epoch.
 */
export interface Session {
    idTokenRaw?: string;
    idTokenClaims: Claims;
    refreshToken?: string;
    accessToken?: string;
    expiresAt: number;
}

// --- TypeBox schemas for route validation and OpenAPI docs ---

export const MeUserSchema = Type.Object({
    oid: Type.Union([Type.String(), Type.Null()]),
    displayName: Type.Union([Type.String(), Type.Null()]),
    preferredUsername: Type.Union([Type.String(), Type.Null()]),
});
export type MeUser = Static<typeof MeUserSchema>;

export const MeContextResponseSchema = Type.Object({
    user: MeUserSchema,
    permissionNames: Type.Array(Type.String()),
    functionalPermissions: Type.Array(FunctionalPermissionSelectSchema),
});
export type MeContextResponse = Static<typeof MeContextResponseSchema>;
