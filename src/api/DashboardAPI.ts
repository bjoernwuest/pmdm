import type { ApiInstance } from "@/apps/api.ts";
import { getLoggedinUserObject, requirePermissions } from "@/services/Auth.ts";
import {
    FP_NOTIFY_INDIVIDUAL_OPEN_REQUEST,
    FP_VIEW_DASHBOARD,
} from "@/services/auth/ApplicationDefinedFunctionalPermissions.ts";
import {
    getOpenProductRequestOptions,
    getOpenRequestGapAnalysis,
    getPendingRequestsByGroup,
} from "@/services/Dashboard.ts";
import { sendProductRequestReminder } from "@/services/Notifications.ts";
import { getProductRequestStatus } from "@/repo/ProductRequestRepo.ts";
import {
    ForbiddenErrorResponseSchema,
    NotFoundErrorResponseSchema,
    UnauthenticatedErrorResponseSchema,
} from "@/types/ApiType.ts";
import {
    NotifyOpenRequestResponseSchema,
    OpenProductRequestGapAnalysisSchema,
    OpenProductRequestListResponseSchema,
    OpenProductRequestParamsSchema,
    PendingProductRequestsByGroupResponseSchema,
} from "@/types/DashboardType.ts";
import { status, t } from "elysia";

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

    app.get("/dashboard/open-product-requests", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_VIEW_DASHBOARD]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        return { requests: await getOpenProductRequestOptions(context.dbClient) };
    }, {
        detail: {
            tags: ["Dashboard"],
            summary: "List open product requests for gap analysis",
            description:
                "Returns the open product requests that can be inspected in the dashboard gap-analysis section. Requires FP_VIEW_DASHBOARD.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
            ],
        },
        response: {
            200: OpenProductRequestListResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
        },
    });

    app.get("/dashboard/open-product-requests/:identifier/gap-analysis", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_VIEW_DASHBOARD]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const user = await getLoggedinUserObject(context.dbClient, claims);
        if (!user?.identifier) return status(403, { error: "Authenticated user not found" });

        const analysis = await getOpenRequestGapAnalysis(context.dbClient, user.identifier, context.params.identifier);
        if (!analysis) return status(404, { error: "Product request not found or no longer open" });
        return analysis;
    }, {
        detail: {
            tags: ["Dashboard"],
            summary: "Gap analysis for one open product request",
            description:
                "Returns missing values and missing approvals for one open product request, together with the responsible groups. Mandatory flags are resolved for the calling viewer. Requires FP_VIEW_DASHBOARD.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                { name: "identifier", in: "path", required: true, description: "Identifier of the open product request.", schema: { type: "string", format: "uuid" } },
            ],
        },
        params: OpenProductRequestParamsSchema,
        response: {
            200: OpenProductRequestGapAnalysisSchema,
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
    });

    app.post("/dashboard/open-product-requests/:identifier/notify", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_NOTIFY_INDIVIDUAL_OPEN_REQUEST]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const requestStatus = await getProductRequestStatus(context.dbClient, context.params.identifier);
        if (requestStatus !== "open") return status(404, { error: "Product request not found or no longer open" });

        return sendProductRequestReminder(context.dbClient, context.params.identifier);
    }, {
        detail: {
            tags: ["Dashboard"],
            summary: "Send a reminder for one open product request",
            description:
                "Sends one reminder email to every user with an actionable provide or approve item on the selected open product request. Ignores per-user notification preferences and schedules. Requires FP_NOTIFY_INDIVIDUAL_OPEN_REQUEST.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                { name: "identifier", in: "path", required: true, description: "Identifier of the open product request.", schema: { type: "string", format: "uuid" } },
            ],
        },
        params: OpenProductRequestParamsSchema,
        body: t.Object({}, { description: "This endpoint takes no request body." }),
        response: {
            200: NotifyOpenRequestResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
    });
}
