import type { ApiInstance } from "@/apps/api.ts";
import { requirePermissions } from "@/services/Auth.ts";
import { FP_VIEW_DASHBOARD } from "@/services/auth/ApplicationDefinedFunctionalPermissions.ts";
import { getPendingRequestsByGroup } from "@/services/Dashboard.ts";
import {
    ForbiddenErrorResponseSchema,
    UnauthenticatedErrorResponseSchema,
} from "@/types/ApiType.ts";
import { PendingProductRequestsByGroupResponseSchema } from "@/types/DashboardType.ts";

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance): void {
    app.get("/dashboard/pending-product-requests-by-group", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_VIEW_DASHBOARD]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        return { groups: await getPendingRequestsByGroup(context.dbClient) };
    }, {
        detail: {
            tags: ["Dashboard"],
            summary: "Pending product requests by group",
            description:
                "Returns open product requests with pending approval or pending data value entry, counted once per group and action bucket. Requires FP_VIEW_DASHBOARD.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
            ],
        },
        response: {
            200: PendingProductRequestsByGroupResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
        },
    });
}
