import type { ApiInstance } from "@/apps/api.ts";
import { authorize } from "@/services/Auth.ts";
import {
    FP_VIEW_PRODUCTS,
    FP_CREATE_PRODUCT,
    FP_REQUEST_PRODUCT_UPDATE,
    FP_CREATE_PRODUCT_COPY,
} from "@/services/auth/FunctionalPermissions.ts";
import {
    createProductRequest,
    getProductRequest,
    listProductRequests,
    updateProductRequestValue,
    approveProductRequestValue,
    approveAllProductRequestValues,
    cancelProductRequest,
    getProductRequestLookupValues,
    getProductRequestConsumableValues,
    getProductRequestProductValues,
} from "@/repo/ProductRequestRepo.ts";
import { getProductByNumber } from "@/repo/ProductRepo.ts";
import { runInTransaction } from "@/services/DatabaseDriver.ts";
import { getUserListPageSizes } from "@/services/ui_config.ts";
import { PermissionDeniedError, FilterScriptError } from "@/types/errors.ts";
import { LookupsValuesSelectSchema } from "@/types/LookupsType.ts";
import { ConsumablesValuesSelectSchema } from "@/types/ConsumableType.ts";
import { status, t } from "elysia";

/**
 * Registers all Product Request API routes.
 *
 * IMPORTANT: Static route segments (approve-all) must be registered
 * BEFORE parameterised segments (:id) to avoid route shadowing.
 */
// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance): void {
    // -----------------------------------------------------------------------
    // POST /api/product-requests — Create product request
    // -----------------------------------------------------------------------
    app.post("/product-requests", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const body = context.body as {
            mode: "new" | "update" | "copy";
            productTypeIdentifier?: string;
            productNumber?: string;
            sourceProductNumber?: string;
        };

        // Validate mode and check permissions
        let requiredPerm;
        switch (body.mode) {
            case "new":
                requiredPerm = FP_CREATE_PRODUCT;
                if (!body.productTypeIdentifier) {
                    return status(400, "productTypeIdentifier is required for 'new' mode");
                }
                break;
            case "update":
                requiredPerm = FP_REQUEST_PRODUCT_UPDATE;
                if (!body.sourceProductNumber) {
                    return status(400, "sourceProductNumber is required for 'update' mode");
                }
                break;
            case "copy":
                requiredPerm = FP_CREATE_PRODUCT_COPY;
                if (!body.sourceProductNumber) {
                    return status(400, "sourceProductNumber is required for 'copy' mode");
                }
                break;
            default:
                return status(400, `Invalid mode: ${(body as any).mode}. Must be 'new', 'update', or 'copy'`);
        }

        const authz = await authorize(context.dbClient, claims, [requiredPerm]);
        if (!authz.some((perm) => perm.identifier === requiredPerm.identifier)) {
            return status(403, `Permission denied. Required: ${requiredPerm.functionalPermissionName}`);
        }

        // For "update" and "copy" modes, resolve product type from source product
        let productTypeIdentifier = body.productTypeIdentifier;
        let productToUpdate: string | undefined;

        if (body.mode === "update" || body.mode === "copy") {
            const sourceProduct = await getProductByNumber(
                context.dbClient, claims, body.sourceProductNumber!,
            );
            if (!sourceProduct) {
                return status(404, `Source product not found: ${body.sourceProductNumber}`);
            }
            productTypeIdentifier = sourceProduct.productTypeIdentifier;

            if (body.mode === "update") {
                productToUpdate = body.sourceProductNumber;
            }
        }

        // If productNumber is provided and a product with that number already exists,
        // return 409 conflict for redirect/warning
        if (body.productNumber) {
            const existingProduct = await getProductByNumber(
                context.dbClient, claims, body.productNumber,
            );
            if (existingProduct) {
                return status(409, {
                    error: "Product number already exists",
                    conflict: true,
                    existingProductNumber: body.productNumber,
                });
            }
        }

        try {
            const result = await runInTransaction(context.dbClient, async (tx) => {
                return createProductRequest(tx, claims, {
                    productTypeIdentifier: productTypeIdentifier!,
                    productNumber: body.productNumber,
                    productToUpdate,
                    sourceProductNumber: body.mode === "copy" ? body.sourceProductNumber : undefined,
                });
            });

            return { productRequestId: result.identifier };
        } catch (e: any) {
            // Handle conflict from repo layer (product number already exists)
            if (e.conflictProductNumber) {
                return status(409, {
                    error: "Product number already exists",
                    conflict: true,
                    existingProductNumber: e.conflictProductNumber,
                });
            }
            return status(500, { error: e.message });
        }
    }, {
        body: t.Object({
            mode: t.Union([t.Literal("new"), t.Literal("update"), t.Literal("copy")]),
            productTypeIdentifier: t.Optional(t.String({ format: "uuid" })),
            productNumber: t.Optional(t.String()),
            sourceProductNumber: t.Optional(t.String()),
        }),
        detail: {
            tags: ["Product Requests"],
            summary: "Create product request",
            description:
                "Creates a new product request. Mode 'new' creates from scratch, 'update' creates an update request for an existing product, 'copy' creates a copy request from an existing product. Requires FP_CREATE_PRODUCT (mode=new), FP_REQUEST_PRODUCT_UPDATE (mode=update), or FP_CREATE_PRODUCT_COPY (mode=copy).",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
            ],
        },
        response: {
            200: t.Object({ productRequestId: t.String() }, { description: "Identifier of the created product request for client-side redirect." }),
            400: t.String({ description: "Invalid request – invalid mode or missing mode-specific required field." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the source product does not exist." }),
            409: t.Object({ error: t.String(), conflict: t.Boolean(), existingProductNumber: t.Optional(t.String()) }, { description: "Conflict – a product with the requested product number already exists." }),
            500: t.Object({ error: t.String() }, { description: "Internal server error." }),
        },
    });

    // -----------------------------------------------------------------------
    // GET /api/product-requests — List product requests
    // -----------------------------------------------------------------------
    app.get("/product-requests", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_VIEW_PRODUCTS]);
        if (!authz.some((perm) => perm.identifier === FP_VIEW_PRODUCTS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_VIEW_PRODUCTS.functionalPermissionName}`);
        }

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? availablePageSizes[0] ?? 20));

        const statusParam = context.query.status as string | undefined;
        const rawProductTypeIdentifier = context.query.productTypeIdentifier;
        const productTypeIdentifier = typeof rawProductTypeIdentifier === "string" && rawProductTypeIdentifier.length > 0 ? rawProductTypeIdentifier : undefined;
        const productNumberContains = context.query.productNumberContains as string | undefined;
        const actionFilter = context.query.actionFilter as string | undefined;

        const result = await listProductRequests(
            context.dbClient,
            claims,
            {
                status: statusParam ? statusParam.split(",") : undefined,
                productTypeIdentifier,
                productNumberContains,
                actionFilter: actionFilter as "provide_or_approve" | "provide_value" | "approve_value" | undefined,
            },
            page,
            pageSize,
        );

        return {
            requests: result.requests,
            page,
            pageSize,
            total: result.total,
            availablePageSizes,
        };
    }, {
        query: t.Object({
            page: t.Optional(t.Union([t.Number({ minimum: 0 }), t.String()])),
            pageSize: t.Optional(t.Union([t.Number({ minimum: 1 }), t.String()])),
            status: t.Optional(t.String()),
            productTypeIdentifier: t.Optional(t.String()),
            productNumberContains: t.Optional(t.String()),
            actionFilter: t.Optional(t.String()),
        }),
        detail: {
            tags: ["Product Requests"],
            summary: "List product requests",
            description:
                "Returns a paginated list of product requests with optional filtering by status, product type, product number search, and actionable filter. Requires FP_VIEW_PRODUCTS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "page",
                    description: "Zero-based page number for pagination. Defaults to 0.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 0, default: 0 },
                },
                {
                    name: "pageSize",
                    description: "Number of product requests per page. Must be one of the available page sizes returned by the server. Defaults to the first available size.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 1 },
                },
                {
                    name: "status",
                    description: "Comma-separated list of product request statuses to filter by.",
                    in: "query",
                    required: false,
                    schema: { type: "string" },
                },
                {
                    name: "productTypeIdentifier",
                    description: "Filters product requests by the UUID of their product type.",
                    in: "query",
                    required: false,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "productNumberContains",
                    description: "Filters product requests whose product number contains this substring (case-insensitive).",
                    in: "query",
                    required: false,
                    schema: { type: "string" },
                },
                {
                    name: "actionFilter",
                    description: "Filters product requests by pending action. One of 'provide_or_approve', 'provide_value', or 'approve_value'.",
                    in: "query",
                    required: false,
                    schema: { type: "string", enum: ["provide_or_approve", "provide_value", "approve_value"] },
                },
            ],
        },
        response: {
            200: t.Object({
                requests: t.Array(t.Any()),
                page: t.Number(),
                pageSize: t.Number(),
                total: t.Number(),
                availablePageSizes: t.Array(t.Number()),
            }, { description: "Paginated list of product requests with pagination metadata." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
        },
    });

    // -----------------------------------------------------------------------
    // POST /api/product-requests/:id/approve-all — MUST be before :id routes
    // -----------------------------------------------------------------------
    app.post("/product-requests/:id/approve-all", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const requestId = context.params.id as string;
        const body = context.body as { knownValues: Record<string, string> };

        try {
            const result = await runInTransaction(context.dbClient, async (tx) => {
                return approveAllProductRequestValues(tx, claims, requestId, body.knownValues);
            });

            return result;
        } catch (e: any) {
            return status(400, { error: e.message });
        }
    }, {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: t.Object({
            knownValues: t.Record(t.String(), t.String()),
        }),
        detail: {
            tags: ["Product Requests"],
            summary: "Approve all values on a product request",
            description:
                "Approves all unapproved data type values that the current user has Approver role for. Returns the count of approved values, identifiers of skipped data types, and whether the request progressed to importing. Values with a stale `updatedAt` (concurrent modification) are skipped. Authorization is role-based (Approver role on data types) — no functional permission required.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "id",
                    description: "UUID of the product request to approve.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({
                approvedCount: t.Number(),
                skippedDataTypeIdentifiers: t.Array(t.String()),
                allApproved: t.Boolean(),
            }, { description: "Approval result with the count of approved values, skipped data type identifiers, and whether the request progressed to importing." }),
            400: t.Object({ error: t.String() }, { description: "Invalid request – malformed payload or approval failure." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
        },
    });

    // -----------------------------------------------------------------------
    // GET /api/product-requests/:id — Product request detail
    // -----------------------------------------------------------------------
    app.get("/product-requests/:id", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_VIEW_PRODUCTS]);
        if (!authz.some((perm) => perm.identifier === FP_VIEW_PRODUCTS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_VIEW_PRODUCTS.functionalPermissionName}`);
        }

        const requestId = context.params.id as string;
        const request = await getProductRequest(context.dbClient, claims, requestId);

        if (!request) {
            return status(404, "Product request not found");
        }

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        return { ...request, availablePageSizes };
    }, {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        detail: {
            tags: ["Product Requests"],
            summary: "Get product request detail",
            description:
                "Returns a single product request with enriched data type values, filtered by the current user's view permissions. Requires FP_VIEW_PRODUCTS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "id",
                    description: "UUID of the product request to retrieve.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "The product request with enriched, viewer-filtered data type values and available page sizes." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – no product request with this identifier exists." }),
        },
    });

    // -----------------------------------------------------------------------
    // GET /api/product-requests/:id/lookup-values/:dataTypeIdentifier
    // -----------------------------------------------------------------------
    app.get("/product-requests/:id/lookup-values/:dataTypeIdentifier", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_VIEW_PRODUCTS]);
        if (!authz.some((perm) => perm.identifier === FP_VIEW_PRODUCTS.identifier)) {
            return status(403, { error: `Permission denied. Required: ${FP_VIEW_PRODUCTS.functionalPermissionName}` });
        }

        const requestId = context.params.id as string;
        const dataTypeIdentifier = context.params.dataTypeIdentifier as string;

        try {
            const values = await getProductRequestLookupValues(context.dbClient, claims, requestId, dataTypeIdentifier);
            return { values };
        } catch (e: any) {
            if (e instanceof PermissionDeniedError) {
                return status(403, { error: e.message });
            }
            if (e instanceof FilterScriptError) {
                return status(500, { error: e.message });
            }
            return status(400, { error: e.message });
        }
    }, {
        params: t.Object({
            id: t.String({ format: "uuid" }),
            dataTypeIdentifier: t.String({ format: "uuid" }),
        }),
        response: {
            200: t.Object({ values: t.Array(LookupsValuesSelectSchema) }, { description: "All lookup values backing the lookup-kind data type." }),
            400: t.Object({ error: t.String() }, { description: "Invalid request – malformed parameters or processing failure." }),
            401: t.Object({ error: t.String() }, { description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.Object({ error: t.String() }, { description: "Permission denied – the authenticated principal lacks the required functional permission or data-type role." }),
            500: t.Object({ error: t.String() }, { description: "Internal server error." }),
        },
        detail: {
            tags: ["Product Requests"],
            summary: "Get lookup values for a data type on a product request",
            description:
                "Returns all lookup values (including disabled ones) for the lookup backing a lookup-kind data type, scoped to the current user's data-type-level Viewer/Writer/Approver role on the product request. Requires FP_VIEW_PRODUCTS. Access to individual values is governed by the same role model as the product request detail endpoint — not by the Configuration-area FP_VIEW_LOOKUPS permission.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "id",
                    description: "UUID of the product request.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "dataTypeIdentifier",
                    description: "UUID of the lookup-kind data type whose values are returned.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    // -----------------------------------------------------------------------
    // GET /api/product-requests/:id/consumable-values/:dataTypeIdentifier
    // -----------------------------------------------------------------------
    app.get("/product-requests/:id/consumable-values/:dataTypeIdentifier", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_VIEW_PRODUCTS]);
        if (!authz.some((perm) => perm.identifier === FP_VIEW_PRODUCTS.identifier)) {
            return status(403, { error: `Permission denied. Required: ${FP_VIEW_PRODUCTS.functionalPermissionName}` });
        }

        const requestId = context.params.id as string;
        const dataTypeIdentifier = context.params.dataTypeIdentifier as string;

        try {
            const values = await getProductRequestConsumableValues(context.dbClient, claims, requestId, dataTypeIdentifier);
            return { values };
        } catch (e: any) {
            if (e instanceof PermissionDeniedError) {
                return status(403, { error: e.message });
            }
            if (e instanceof FilterScriptError) {
                return status(500, { error: e.message });
            }
            return status(400, { error: e.message });
        }
    }, {
        params: t.Object({
            id: t.String({ format: "uuid" }),
            dataTypeIdentifier: t.String({ format: "uuid" }),
        }),
        response: {
            200: t.Object({ values: t.Array(ConsumablesValuesSelectSchema) }, { description: "All consumable values backing the consumable-kind data type." }),
            400: t.Object({ error: t.String() }, { description: "Invalid request – malformed parameters or processing failure." }),
            401: t.Object({ error: t.String() }, { description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.Object({ error: t.String() }, { description: "Permission denied – the authenticated principal lacks the required functional permission or data-type role." }),
            500: t.Object({ error: t.String() }, { description: "Internal server error." }),
        },
        detail: {
            tags: ["Product Requests"],
            summary: "Get consumable values for a data type on a product request",
            description:
                "Returns all consumable values (including disabled and already-used ones) for the consumable backing a consumable-kind data type, scoped to the current user's data-type-level Viewer/Writer/Approver role on the product request. Requires FP_VIEW_PRODUCTS. Access to individual values is governed by the same role model as the product request detail endpoint — not by the Configuration-area FP_VIEW_CONSUMABLES permission.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "id",
                    description: "UUID of the product request.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "dataTypeIdentifier",
                    description: "UUID of the consumable-kind data type whose values are returned.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    // -----------------------------------------------------------------------
    // GET /api/product-requests/:id/product-values/:dataTypeIdentifier
    // -----------------------------------------------------------------------
    app.get("/product-requests/:id/product-values/:dataTypeIdentifier", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_VIEW_PRODUCTS]);
        if (!authz.some((perm) => perm.identifier === FP_VIEW_PRODUCTS.identifier)) {
            return status(403, { error: `Permission denied. Required: ${FP_VIEW_PRODUCTS.functionalPermissionName}` });
        }

        const requestId = context.params.id as string;
        const dataTypeIdentifier = context.params.dataTypeIdentifier as string;

        try {
            const values = await getProductRequestProductValues(context.dbClient, claims, requestId, dataTypeIdentifier);
            return { values };
        } catch (e: any) {
            if (e instanceof PermissionDeniedError) {
                return status(403, { error: e.message });
            }
            if (e instanceof FilterScriptError) {
                return status(500, { error: e.message });
            }
            return status(400, { error: e.message });
        }
    }, {
        params: t.Object({
            id: t.String({ format: "uuid" }),
            dataTypeIdentifier: t.String({ format: "uuid" }),
        }),
        response: {
            200: t.Object({
                values: t.Array(t.Object({
                    productNumber: t.String(),
                    productTypeName: t.Union([t.String(), t.Null()]),
                    disabled: t.Boolean(),
                })),
            }, { description: "Candidate products for the product-kind data type with the data type's filter script applied." }),
            400: t.Object({ error: t.String() }, { description: "Invalid request – malformed parameters or processing failure." }),
            401: t.Object({ error: t.String() }, { description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.Object({ error: t.String() }, { description: "Permission denied – the authenticated principal lacks the required functional permission or data-type role." }),
            500: t.Object({ error: t.String() }, { description: "Internal server error." }),
        },
        detail: {
            tags: ["Product Requests"],
            summary: "Get candidate products for a product-kind data type on a product request",
            description:
                "Returns the candidate products for a product-kind data type, scoped to the current user's data-type-level Viewer/Writer/Approver role on the product request, with the data type's filter script applied. Mirrors the lookup/consumable dropdown endpoints. Requires FP_VIEW_PRODUCTS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "id",
                    description: "UUID of the product request.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "dataTypeIdentifier",
                    description: "UUID of the product-kind data type whose candidate products are returned.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    // -----------------------------------------------------------------------
    // PUT /api/product-requests/:id/values/:dataTypeIdentifier — Update value
    // -----------------------------------------------------------------------
    app.put("/product-requests/:id/values/:dataTypeIdentifier", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const requestId = context.params.id as string;
        const dataTypeIdentifier = context.params.dataTypeIdentifier as string;
        const body = context.body as { value: unknown; knownUpdatedAt: string };

        try {
            const result = await runInTransaction(context.dbClient, async (tx) => {
                return updateProductRequestValue(tx, claims, requestId, dataTypeIdentifier, body.value, body.knownUpdatedAt);
            });

            if (result === null) return status(409, { error: "Value was modified by another user" });
            return {
                value: result.value,
                recalculated: result.recalculated,
                mandatory: result.mandatory,
                requestorCanEdit: result.requestorCanEdit,
            };
        } catch (e: any) {
            if (e instanceof PermissionDeniedError) {
                return status(403, { error: e.message });
            }
            return status(400, { error: e.message });
        }
    }, {
        params: t.Object({
            id: t.String({ format: "uuid" }),
            dataTypeIdentifier: t.String({ format: "uuid" }),
        }),
        body: t.Object({
            value: t.Unknown(),
            knownUpdatedAt: t.String(),
        }),
        detail: {
            tags: ["Product Requests"],
            summary: "Update a data type value on a product request",
            description:
                "Updates the value for a specific data type on an open product request. Authorization is role-based: requires Writer role or requestorCanEdit permission on the data type. Uses optimistic locking via knownUpdatedAt — returns 409 if the value was modified by another user.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "id",
                    description: "UUID of the product request to update.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "dataTypeIdentifier",
                    description: "UUID of the data type whose value is updated.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({
                value: t.Any(),
                recalculated: t.Any(),
                mandatory: t.Optional(t.Any()),
                requestorCanEdit: t.Optional(t.Any()),
            }, { description: "The updated value with recalculated data, mandatory flag, and requestorCanEdit flag." }),
            400: t.Object({ error: t.String() }, { description: "Invalid request – malformed payload or processing failure." }),
            401: t.Object({ error: t.String() }, { description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.Object({ error: t.String() }, { description: "Permission denied – the authenticated principal lacks the required data-type role." }),
            409: t.Object({ error: t.String() }, { description: "Conflict – optimistic locking failed; the value was modified by another user." }),
        },
    });

    // -----------------------------------------------------------------------
    // POST /api/product-requests/:id/approve/:dataTypeIdentifier — Approve single
    // -----------------------------------------------------------------------
    app.post("/product-requests/:id/approve/:dataTypeIdentifier", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const requestId = context.params.id as string;
        const dataTypeIdentifier = context.params.dataTypeIdentifier as string;
        const body = context.body as { knownUpdatedAt: string };

        try {
            const result = await runInTransaction(context.dbClient, async (tx) => {
                return approveProductRequestValue(tx, claims, requestId, dataTypeIdentifier, body.knownUpdatedAt);
            });

            if (result === null) return status(409, { error: "Value was modified by another user" });
            return result;
        } catch (e: any) {
            if (e instanceof PermissionDeniedError) {
                return status(403, { error: e.message });
            }
            return status(400, { error: e.message });
        }
    }, {
        params: t.Object({
            id: t.String({ format: "uuid" }),
            dataTypeIdentifier: t.String({ format: "uuid" }),
        }),
        body: t.Object({
            knownUpdatedAt: t.String(),
        }),
        detail: {
            tags: ["Product Requests"],
            summary: "Approve a single data type value",
            description:
                "Approves a specific data type value on an open product request. Authorization is role-based: requires Approver role on the data type. Uses optimistic locking via knownUpdatedAt — returns 409 if the value was modified by another user. Returns whether the request progressed to importing.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "id",
                    description: "UUID of the product request.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "dataTypeIdentifier",
                    description: "UUID of the data type whose value is approved.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "The approved data type value including whether the request progressed to importing." }),
            400: t.Object({ error: t.String() }, { description: "Invalid request – malformed payload or approval failure." }),
            401: t.Object({ error: t.String() }, { description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.Object({ error: t.String() }, { description: "Permission denied – the authenticated principal lacks the required Approver role." }),
            409: t.Object({ error: t.String() }, { description: "Conflict – optimistic locking failed; the value was modified by another user." }),
        },
    });

    // -----------------------------------------------------------------------
    // POST /api/product-requests/:id/cancel — Cancel request
    // -----------------------------------------------------------------------
    app.post("/product-requests/:id/cancel", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const requestId = context.params.id as string;

        try {
            const result = await runInTransaction(context.dbClient, async (tx) => {
                return cancelProductRequest(tx, claims, requestId);
            });

            return result;
        } catch (e: any) {
            if (e instanceof PermissionDeniedError) {
                return status(403, { error: e.message });
            }
            return status(400, { error: e.message });
        }
    }, {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        detail: {
            tags: ["Product Requests"],
            summary: "Cancel a product request",
            description:
                "Cancels an open product request. Authorization is role-based: requires cancel role permission on the product type.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "id",
                    description: "UUID of the product request to cancel.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "The cancelled product request." }),
            400: t.Object({ error: t.String() }, { description: "Invalid request – malformed payload or cancellation failure." }),
            401: t.Object({ error: t.String() }, { description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.Object({ error: t.String() }, { description: "Permission denied – the authenticated principal lacks the required cancel role permission." }),
        },
    });
}
