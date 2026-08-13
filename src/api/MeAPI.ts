import type { ApiInstance } from "@/apps/api.ts";
import { getMyFunctionalPermissions } from "@/services/Auth.ts";
import { Type } from "@sinclair/typebox";
import { MeContextResponseSchema } from "@/types/AuthType.ts";

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get("/me/context", async ({ dbClient, session, tokenClaims }) => {
        const claims = (session?.idTokenClaims ?? tokenClaims ?? {}) as Record<string, unknown>;

        const functionalPermissions = await getMyFunctionalPermissions(dbClient, claims as Record<string, any>).catch(() => []);

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
            401: Type.String({ description: "Unauthenticated. No valid session, API key, or bearer token was provided." }),
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
}
