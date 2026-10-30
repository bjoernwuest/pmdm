import type { ApiInstance } from "@/apps/api.ts";
import { getMyFunctionalPermissions } from "@/services/Auth.ts";
import { getMyEffectivePermissions } from "@/services/EffectivePermissions.ts";
import { MeContextResponseSchema } from "@/types/AuthType.ts";
import { EffectivePermissionsResponseSchema } from "@/types/EffectivePermissionsType.ts";
import { InternalServerErrorResponseSchema, UnauthenticatedErrorResponseSchema } from "@/types/ApiType.ts";

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/me/context", async ({ dbClient, session, tokenClaims }) => {
        const claims = (session?.idTokenClaims ?? tokenClaims ?? {}) as Record<string, unknown>;

        // Failures propagate: a DB/permission-layer fault must surface as an error
        // (Elysia maps it to 500), not as a legitimate-looking empty permission set.
        const functionalPermissions = await getMyFunctionalPermissions(dbClient, claims as Record<string, any>);

        return {
            user: {
                oid: typeof claims.oid === "string" ? claims.oid : null,
                displayName: typeof claims.name === "string" ? claims.name : null,
                preferredUsername: typeof claims.preferred_username === "string" ? claims.preferred_username : null,
            },
            permissionNames: functionalPermissions.map((permission) => permission.functionalPermissionName),
            functionalPermissions,
        };
    }, {
        response: {
            200: MeContextResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            500: InternalServerErrorResponseSchema,
        },
        detail: {
            tags: ["Auth"],
            summary: "Get current user context and functional permissions",
            description: "Retrieve the currently authenticated user's identity information and list of functional permissions. Authenticate with an API key using the X-API-Key header.",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
            ],
        },
    });

    app.get("/me/effective-permissions", async ({ dbClient, session, tokenClaims }) => {
        const claims = (session?.idTokenClaims ?? tokenClaims ?? {}) as Record<string, any>;
        return await getMyEffectivePermissions(dbClient, claims);
    }, {
        response: {
            200: EffectivePermissionsResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            500: InternalServerErrorResponseSchema,
        },
        detail: {
            tags: ["Auth"],
            summary: "Get current user's effective permissions",
            description: "Retrieve the logged-in user's functional permissions and effective product-type capabilities, including a read/write/approve matrix for every active product type. Product-type roles come from actual group assignments; the root-group bypass applies to functional permissions only. Any authenticated principal may call this endpoint. Authenticate with an API key using the X-API-Key header.",
            parameters: [
                {
                    name: "X-API-Key",
                    description: "API key used for authentication.",
                    in: "header",
                    required: false,
                    schema: { type: "string", example: "your-api-key" },
                },
            ],
        },
    });
}
