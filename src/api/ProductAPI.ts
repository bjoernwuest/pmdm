import type { ApiInstance } from "@/apps/api.ts";
import { runInTransaction } from "@/services/DatabaseDriver.ts";
import { getLoggedinUserObject, requirePermissions } from "@/services/Auth.ts";
import {
    FP_VIEW_PRODUCTS,
    FP_CREATE_PRODUCT,
    FP_UPDATE_PRODUCT,
    FP_DISABLE_PRODUCT,
    FP_REQUEST_PRODUCT_UPDATE,
    FP_CREATE_PRODUCT_COPY,
} from "@/services/auth/ApplicationDefinedFunctionalPermissions.ts";
import {
    countProducts,
    getProducts,
    getProductByNumber,
    createProduct,
    updateProduct,
    setProductDisabled,
    importProducts,
    getEffectiveViewerPermissions,
} from "@/repo/ProductRepo.ts";
import { createProductRequest } from "@/repo/ProductRequestRepo.ts";
import { ProductTypeRepo } from "@/repo/ProductTypeRepo.ts";
import { getSystemUser } from "@/repo/UserRepo.ts";
import { status, t } from "elysia";
import { Products } from "@/schema/ProductSchema.ts";
import { eq, and, ilike, sql } from "drizzle-orm";
import { getSheet, sheetNames } from "@office-kit/xlsx/workbook";
import { getCell, getMaxRow, getMaxCol } from "@office-kit/xlsx/worksheet";
import { loadWorkbook } from "@office-kit/xlsx/io";
import type {ImportRow} from "@/types/ProductType.ts";
import {getUserListPageSizes} from "@/services/ui_config.ts";
import { Type } from "@sinclair/typebox";
import {
    BadRequestErrorResponseSchema,
    ConflictErrorResponseSchema,
    ForbiddenErrorResponseSchema,
    InternalServerErrorResponseSchema,
    NotFoundErrorResponseSchema,
    PaginationQuerySchema,
    UnauthenticatedErrorResponseSchema,
} from "@/types/ApiType.ts";

/**
 * Registers all Product API routes.
 *
 * IMPORTANT: Static route segments (export-template, import) must be registered
 * BEFORE parameterised segments (:productNumber) to avoid route shadowing.
 */
// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance): void {
    // -----------------------------------------------------------------------
    // GET /api/products — Paginated product list
    // -----------------------------------------------------------------------
    app.get("/products", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_VIEW_PRODUCTS]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? availablePageSizes[0] ?? 20));
        const includeDisabled = context.query.includeDisabled === "true";

        const productNumberContains = context.query.productNumberContains as string | undefined;
        const productTypeIdentifier = context.query.productTypeIdentifier as string | undefined;
        const disabledFilter = context.query.disabled as string | undefined;

        const conditions: any[] = [];
        if (productNumberContains) {
            conditions.push(ilike(Products.productNumber, `%${productNumberContains}%`));
        }
        if (productTypeIdentifier) {
            conditions.push(eq(Products.productTypeIdentifier, productTypeIdentifier));
        }
        if (disabledFilter === "true") {
            conditions.push(eq(Products.disabled, true));
        } else if (disabledFilter === "false") {
            conditions.push(eq(Products.disabled, false));
        }

        const filterPayload = context.query.filter as string | undefined;
        if (filterPayload) {
            try {
                const parsed = JSON.parse(filterPayload);
                if (parsed.criteria && parsed.expression) {
                    const filterCondition = buildFilterCondition(parsed.criteria, parsed.expression);
                    if (filterCondition) conditions.push(filterCondition);
                }
            } catch (_) { /* ignore */ }
        }

        const condition = conditions.length > 0 ? and(...conditions) : undefined;
        const total = await countProducts(context.dbClient, includeDisabled, condition);
        const products = await getProducts(context.dbClient, includeDisabled, condition, page, pageSize);

        let effectivePermissions = { viewableDataTypeIdentifiers: [] as string[] };
        if (products.length > 0) {
            effectivePermissions = await getEffectiveViewerPermissions(
                context.dbClient, claims, products[0]!.productTypeIdentifier,
            );
        }

        return {
            products,
            effectivePermissions,
            page,
            pageSize,
            total,
            availablePageSizes,
            includeDisabled,
        };
    }, {
        query: Type.Composite([
            PaginationQuerySchema,
            Type.Object({
                includeDisabled: Type.Optional(Type.String()),
                productNumberContains: Type.Optional(Type.String()),
                productTypeIdentifier: Type.Optional(Type.String()),
                disabled: Type.Optional(Type.String()),
                filter: Type.Optional(Type.String()),
            }),
        ]),
        detail: {
            tags: ["Products"],
            summary: "List products",
            description: "Returns a paginated list of products with optional filtering. Requires FP_VIEW_PRODUCTS.",
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
                    description: "Number of products per page. Must be one of the available page sizes returned by the server. Defaults to the first available size.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 1 },
                },
                {
                    name: "includeDisabled",
                    description: "Include disabled products in the results. Accepts 'true'. Defaults to false.",
                    in: "query",
                    required: false,
                    schema: { type: "string", enum: ["true", "false"], default: "false" },
                },
                {
                    name: "productNumberContains",
                    description: "Filters products whose product number contains this substring (case-insensitive).",
                    in: "query",
                    required: false,
                    schema: { type: "string" },
                },
                {
                    name: "productTypeIdentifier",
                    description: "Filters products by the UUID of their product type.",
                    in: "query",
                    required: false,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "disabled",
                    description: "Filters products by disabled status. Accepts 'true' or 'false'; omitted to not filter.",
                    in: "query",
                    required: false,
                    schema: { type: "string", enum: ["true", "false"] },
                },
                {
                    name: "filter",
                    description: "JSON string with criteria and a boolean expression for advanced filtering of product values (e.g. {'criteria':[...],'expression':'1 AND 2'}).",
                    in: "query",
                    required: false,
                    schema: { type: "string" },
                },
            ],
        },
        response: {
            200: t.Object({
                products: t.Array(t.Any()),
                effectivePermissions: t.Object({ viewableDataTypeIdentifiers: t.Array(t.String()) }),
                page: t.Number(),
                pageSize: t.Number(),
                total: t.Number(),
                availablePageSizes: t.Array(t.Number()),
                includeDisabled: t.Boolean(),
            }, { description: "Paginated list of products with pagination metadata, effective viewer permissions, and disabled-inclusion flag." }),
             401: UnauthenticatedErrorResponseSchema,
             403: ForbiddenErrorResponseSchema,
        },
    });

    // -----------------------------------------------------------------------
    // GET /api/products/export-template/:productTypeIdentifier — XLSX template
    // (MUST be registered BEFORE /api/products/:productNumber)
    // -----------------------------------------------------------------------
    app.get("/products/export-template/:productTypeIdentifier", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_VIEW_PRODUCTS]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const productTypeIdentifier = context.params.productTypeIdentifier as string;

        let result: { bytes: Uint8Array; filename: string };
        try {
            result = await generateProductTemplate(context.dbClient, productTypeIdentifier);
        } catch (e: any) {
            return status(404, { error: e.message });
        }

        return new Response(new Uint8Array(result.bytes), {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${result.filename}"`,
            },
        });
    }, {
        params: t.Object({ productTypeIdentifier: t.String({ format: "uuid" }) }),
        detail: {
            tags: ["Products"],
            summary: "Download product import template",
            description: "Generates and downloads an XLSX template for importing products of the given product type. Requires FP_VIEW_PRODUCTS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "productTypeIdentifier",
                    description: "Identifier of the product type for which the XLSX import template is generated.",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "XLSX import template file (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)." }),
             401: UnauthenticatedErrorResponseSchema,
             403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
    });

    // -----------------------------------------------------------------------
    // POST /api/products/import — Import XLSX
    // (MUST be registered BEFORE /api/products/:productNumber)
    // -----------------------------------------------------------------------
    app.post("/products/import", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_CREATE_PRODUCT]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        // Use standard Web API FormData for reliable multipart file extraction
        const reqFormData = await context.request.formData();
        const file = reqFormData.get("file");

        if (!file) return status(400, { error: "No file provided" });

        // Parse workbook — productTypeIdentifier is in cell A1 (written by generateProductTemplate)
        // @office-kit/xlsx's loadWorkbook expects an XlsxSource: { toBytes(): Promise<Uint8Array> }
        let wb;
        try {
            const buf = await (file as Blob).arrayBuffer();
            wb = await loadWorkbook({ toBytes: async () => new Uint8Array(buf) });
        } catch (e: any) {
            return status(400, { error: `Failed to parse XLSX file: ${e.message}` });
        }

        const names = sheetNames(wb);
        if (names.length === 0) return status(400, { error: "XLSX file has no sheets" });
        const ws = getSheet(wb, names[0]!);
        if (!ws) return status(400, { error: "XLSX file has no sheets" });

        // Read productTypeIdentifier from cell A1
        const productTypeIdentifier = getCell(ws, 1, 1)?.value?.toString() ?? "";
        if (!productTypeIdentifier) return status(400, { error: "Cell A1 must contain the product type identifier (export the template first)" });

        const pt = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!pt) return status(404, { error: `Product type not found: ${productTypeIdentifier}` });

        // Read header row (row 2)
        const maxCol = getMaxCol(ws);
        const headers: string[] = [];
        for (let col = 1; col <= maxCol; col++) {
            headers[col - 1] = getCell(ws, 2, col)?.value?.toString() ?? "";
        }

        if (headers[0] !== "productNumber") {
            return status(400, { error: "Column A in header row must be 'productNumber'" });
        }

        const dtNames = headers.slice(1);
        const maxRow = getMaxRow(ws);
        const rows: ImportRow[] = [];
        for (let row = 3; row <= maxRow; row++) {
            const pn = getCell(ws, row, 1)?.value?.toString() ?? "";
            if (!pn) continue;

            const values: Record<string, unknown> = {};
            dtNames.forEach((name, idx) => { values[name] = getCell(ws, row, idx + 2)?.value; });
            rows.push({ productNumber: pn, values });
        }

        const result = await runInTransaction(context.dbClient, async (tx) => {
            return importProducts(tx, claims, productTypeIdentifier, rows);
        });

        return result;
    }, {
        detail: {
            tags: ["Products"],
            summary: "Import products from XLSX",
            description: "Imports products from an uploaded XLSX file. Returns created count and errors. Requires FP_CREATE_PRODUCT.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
            ],
        },
        response: {
            200: t.Any({ description: "Import result summary with counts of created and updated products and per-row errors." }),
            400: BadRequestErrorResponseSchema,
             401: UnauthenticatedErrorResponseSchema,
             403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
    });

    // -----------------------------------------------------------------------
    // GET /api/products/:productNumber — Product detail
    // -----------------------------------------------------------------------
    app.get("/products/:productNumber", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_VIEW_PRODUCTS]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const productNumber = context.params.productNumber as string;
        const product = await getProductByNumber(context.dbClient, claims, productNumber, true);

        if (!product) return status(404, { error: "Product not found" });
        return { product };
    }, {
        params: t.Object({ productNumber: t.String() }),
        detail: {
            tags: ["Products"],
            summary: "Get product detail",
            description: "Returns a single product with viewer-filtered values. Requires FP_VIEW_PRODUCTS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "productNumber",
                    description: "Product number of the product to retrieve.",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
        },
        response: {
            200: t.Object({ product: t.Any() }, { description: "A single product with viewer-filtered data type values." }),
             401: UnauthenticatedErrorResponseSchema,
             403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
    });

    // -----------------------------------------------------------------------
    // POST /api/products — Create product
    // -----------------------------------------------------------------------
    app.post("/products", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_CREATE_PRODUCT]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const body = context.body as { productNumber: string; productTypeIdentifier: string; values?: Record<string, unknown> };

        const pt = await ProductTypeRepo.getByIdentifier(context.dbClient, body.productTypeIdentifier, true);
        if (!pt) return status(404, { error: "Product type does not exist" });

        const result = await runInTransaction(context.dbClient, async (tx) => {
            return createProduct(tx, claims, body.productNumber, body.productTypeIdentifier, body.values ?? {});
        });

        if (result.length === 0) return status(500, { error: "Failed to create product" });

        const product = await getProductByNumber(context.dbClient, claims, body.productNumber, true);
        return { product };
    }, {
        body: t.Object({
            productNumber: t.String(),
            productTypeIdentifier: t.String({ format: "uuid" }),
            values: t.Optional(t.Record(t.String(), t.Any())),
        }),
        detail: {
            tags: ["Products"],
            summary: "Create product",
            description: "Creates a new product with optional data type values. Requires FP_CREATE_PRODUCT.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
            ],
        },
        response: {
            200: t.Object({ product: t.Any() }, { description: "The newly created product." }),
             401: UnauthenticatedErrorResponseSchema,
             403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
            500: InternalServerErrorResponseSchema,
        },
    });

    // -----------------------------------------------------------------------
    // PUT /api/products/:productNumber — Update product
    // -----------------------------------------------------------------------
    app.put("/products/:productNumber", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_UPDATE_PRODUCT]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const productNumber = context.params.productNumber as string;
        const body = context.body as { productTypeIdentifier?: string; values?: Record<string, unknown>; knownUpdatedAt: string };

        const result = await runInTransaction(context.dbClient, async (tx) => {
            return updateProduct(tx, claims, productNumber, { productTypeIdentifier: body.productTypeIdentifier }, body.values, body.knownUpdatedAt);
        });

        if (result.length === 0) return status(409, { error: "Product not found or timestamp conflict" });

        const product = await getProductByNumber(context.dbClient, claims, productNumber, true);
        return { product };
    }, {
        params: t.Object({ productNumber: t.String() }),
        body: t.Object({
            productTypeIdentifier: t.Optional(t.String({ format: "uuid" })),
            values: t.Optional(t.Record(t.String(), t.Any())),
            knownUpdatedAt: t.String(),
        }),
        detail: {
            tags: ["Products"],
            summary: "Update product",
            description: "Updates product fields and optionally data type values. Requires optimistic lock timestamp. Requires FP_UPDATE_PRODUCT.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "productNumber",
                    description: "Product number of the product to update.",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
        },
        response: {
            200: t.Object({ product: t.Any() }, { description: "The updated product." }),
             401: UnauthenticatedErrorResponseSchema,
             403: ForbiddenErrorResponseSchema,
            409: ConflictErrorResponseSchema,
        },
    });

    // -----------------------------------------------------------------------
    // PATCH /api/products/:productNumber/disabled — Toggle disabled
    // -----------------------------------------------------------------------
    app.patch("/products/:productNumber/disabled", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_DISABLE_PRODUCT]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const productNumber = context.params.productNumber as string;
        const body = context.body as { disabled: boolean; knownUpdatedAt: string };

        const result = await runInTransaction(context.dbClient, async (tx) => {
            const user = (await getLoggedinUserObject(tx, claims)) ?? (await getSystemUser(tx));
            return setProductDisabled(tx, user, productNumber, body.disabled, body.knownUpdatedAt);
        });

        if (result.length === 0) return status(409, { error: "Product not found or timestamp conflict" });

        const product = await getProductByNumber(context.dbClient, claims, productNumber, true);
        return { product };
    }, {
        params: t.Object({ productNumber: t.String() }),
        body: t.Object({ disabled: t.Boolean(), knownUpdatedAt: t.String() }),
        detail: {
            tags: ["Products"],
            summary: "Toggle product disabled status",
            description: "Enables or disables a product. Requires optimistic lock timestamp. Requires FP_DISABLE_PRODUCT.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "productNumber",
                    description: "Product number of the product to enable or disable.",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
        },
        response: {
            200: t.Object({ product: t.Any() }, { description: "The product with updated disabled status." }),
             401: UnauthenticatedErrorResponseSchema,
             403: ForbiddenErrorResponseSchema,
            409: ConflictErrorResponseSchema,
        },
    });

    // -----------------------------------------------------------------------
    // POST /api/products/:productNumber/request-update — Create update request
    // -----------------------------------------------------------------------
    app.post("/products/:productNumber/request-update", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_REQUEST_PRODUCT_UPDATE]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const productNumber = context.params.productNumber as string;
        const product = await getProductByNumber(context.dbClient, claims, productNumber);

        if (!product) return status(404, { error: "Product not found" });

        const result = await runInTransaction(context.dbClient, async (tx) => {
            return createProductRequest(tx, claims, {
                productTypeIdentifier: product.productTypeIdentifier,
                sourceProductNumber: productNumber,
                productToUpdate: productNumber,
            });
        });

        return { productRequestId: result.identifier };
    }, {
        params: t.Object({ productNumber: t.String() }),
        detail: {
            tags: ["Products"],
            summary: "Request product update",
            description: "Creates a product request to update an existing product. Returns the product request identifier for client-side redirect. Requires FP_REQUEST_PRODUCT_UPDATE.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "productNumber",
                    description: "Product number of the product for which an update request is created.",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
        },
        response: {
            200: t.Object({ productRequestId: t.String() }, { description: "Identifier of the created product update request for client-side redirect." }),
             401: UnauthenticatedErrorResponseSchema,
             403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
    });

    // -----------------------------------------------------------------------
    // POST /api/products/:productNumber/copy — Create copy request
    // -----------------------------------------------------------------------
    app.post("/products/:productNumber/copy", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_CREATE_PRODUCT_COPY]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const productNumber = context.params.productNumber as string;
        const body = context.body as { productNumber?: string };

        const product = await getProductByNumber(context.dbClient, claims, productNumber);
        if (!product) return status(404, { error: "Product not found" });

        const result = await runInTransaction(context.dbClient, async (tx) => {
            return createProductRequest(tx, claims, {
                productTypeIdentifier: product.productTypeIdentifier,
                sourceProductNumber: productNumber,
                productNumber: body.productNumber,
            });
        });

        return { productRequestId: result.identifier };
    }, {
        params: t.Object({ productNumber: t.String() }),
        body: t.Object({
            productNumber: t.Optional(t.String()),
        }),
        detail: {
            tags: ["Products"],
            summary: "Create product copy request",
            description: "Creates a product request to create a copy of an existing product. An optional target product number can be provided; otherwise one is auto-generated. Requires FP_CREATE_PRODUCT_COPY.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "productNumber",
                    description: "Product number of the product to copy.",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
        },
        response: {
            200: t.Object({ productRequestId: t.String() }, { description: "Identifier of the created product copy request for client-side redirect." }),
             401: UnauthenticatedErrorResponseSchema,
             403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
    });
}

// ---------------------------------------------------------------------------
// Filter Condition Builder
// ---------------------------------------------------------------------------

function buildFilterCondition(criteria: any[], expression: string): any | null {
    if (!criteria.length || !expression) return null;
    try {
        const parts = expression.match(/(\d+|AND|OR|NOT|\(|\))/gi);
        if (!parts) return null;

        let sqlExpr = "";
        for (const part of parts) {
            const num = parseInt(part, 10);
            if (!isNaN(num) && num > 0 && num <= criteria.length) {
                const criterion = criteria[num - 1];
                sqlExpr += criterion ? `(${buildCriterionCondition(criterion) ?? "TRUE"})` : "TRUE";
            } else {
                sqlExpr += ` ${part} `;
            }
        }
        return sql`${sql.raw(sqlExpr)}`;
    } catch (_) {
        return null;
    }
}

function buildCriterionCondition(criterion: any): string | null {
    if (!criterion.dataTypeIdentifier || !criterion.operator) return null;

    const dtId = escapeSql(criterion.dataTypeIdentifier);
    const op = criterion.operator.toUpperCase();
    const val = criterion.value;
    const vals = criterion.values;
    const ci = criterion.caseInsensitive === true;

    if (dtId === "__pseudo_productNumber") {
        return buildProductColumnCondition("product_number", op, val, vals, ci);
    }
    if (dtId === "__pseudo_productType") {
        return buildProductColumnCondition("product_type_identifier", op, val, vals, ci);
    }
    return buildProductValueCondition(dtId, op, val, vals, ci);
}

function buildProductColumnCondition(col: string, op: string, val: unknown, vals: unknown[], ci: boolean): string | null {
    const likeOp = ci ? "ILIKE" : "LIKE";
    switch (op) {
        case "=":
            return ci ? `products.${col}::text ILIKE '${escapeSql(val)}'` : `products.${col} = '${escapeSql(val)}'`;
        case "!=":
            return ci ? `products.${col}::text NOT ILIKE '${escapeSql(val)}'` : `products.${col} != '${escapeSql(val)}'`;
        case "CONTAINS":
            return `products.${col}::text ${likeOp} '%${escapeSql(val)}%'`;
        case "NOT CONTAINS":
            return `products.${col}::text NOT ${likeOp} '%${escapeSql(val)}%'`;
        case "STARTS WITH":
            return `products.${col}::text ${likeOp} '${escapeSql(val)}%'`;
        case "ENDS WITH":
            return `products.${col}::text ${likeOp} '%${escapeSql(val)}'`;
        case "REGEX":
            return ci ? `products.${col}::text ~* '${escapeSql(val)}'` : `products.${col}::text ~ '${escapeSql(val)}'`;
        case "NOT REGEX":
            return ci ? `products.${col}::text !~* '${escapeSql(val)}'` : `products.${col}::text !~ '${escapeSql(val)}'`;
        case "IN":
            if (!vals || vals.length === 0) return null;
            const escIn = vals.map((v: any) => `'${escapeSql(v)}'`).join(", ");
            return ci ? `products.${col}::text ILIKE ANY(ARRAY[${escIn}])` : `products.${col}::text IN (${escIn})`;
        case "NOT IN":
            if (!vals || vals.length === 0) return null;
            const escNotIn = vals.map((v: any) => `'${escapeSql(v)}'`).join(", ");
            return ci ? `NOT (products.${col}::text ILIKE ANY(ARRAY[${escNotIn}]))` : `products.${col}::text NOT IN (${escNotIn})`;
        case "EMPTY": return `(products.${col} IS NULL OR products.${col}::text = '')`;
        case "NOT EMPTY": return `(products.${col} IS NOT NULL AND products.${col}::text != '')`;
        default: return null;
    }
}

function buildProductValueCondition(dtId: string, op: string, val: unknown, vals: unknown[], ci: boolean): string | null {
    const likeOp = ci ? "ILIKE" : "LIKE";
    switch (op) {
        case "=":
            return ci
                ? `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text ILIKE '${escapeSql(val)}')`
                : `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text = '${escapeSql(val)}')`;
        case "!=":
            return ci
                ? `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text NOT ILIKE '${escapeSql(val)}')`
                : `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text != '${escapeSql(val)}')`;
        case ">":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND (pv.value::text)::numeric > ${Number(val)})`;
        case ">=":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND (pv.value::text)::numeric >= ${Number(val)})`;
        case "<":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND (pv.value::text)::numeric < ${Number(val)})`;
        case "<=":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND (pv.value::text)::numeric <= ${Number(val)})`;
        case "CONTAINS":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text ${likeOp} '%${escapeSql(val)}%')`;
        case "NOT CONTAINS":
            return `NOT EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text ${likeOp} '%${escapeSql(val)}%')`;
        case "STARTS WITH":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text ${likeOp} '${escapeSql(val)}%')`;
        case "ENDS WITH":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text ${likeOp} '%${escapeSql(val)}')`;
        case "REGEX":
            return ci
                ? `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text ~* '${escapeSql(val)}')`
                : `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text ~ '${escapeSql(val)}')`;
        case "NOT REGEX":
            return ci
                ? `NOT EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text ~* '${escapeSql(val)}')`
                : `NOT EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text ~ '${escapeSql(val)}')`;
        case "TRUE":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text = 'true')`;
        case "FALSE":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text = 'false')`;
        case "NOT TRUE":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND (pv.value::text != 'true' OR pv.value IS NULL))`;
        case "NOT FALSE":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND (pv.value::text != 'false' OR pv.value IS NULL))`;
        case "EMPTY":
            return `NOT EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value IS NOT NULL)`;
        case "NOT EMPTY":
            return `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value IS NOT NULL)`;
        case "IN":
            if (!vals || vals.length === 0) return null;
            const escIn = vals.map((v: any) => `'${escapeSql(v)}'`).join(", ");
            return ci
                ? `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text ILIKE ANY(ARRAY[${escIn}]))`
                : `EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text IN (${escIn}))`;
        case "NOT IN":
            if (!vals || vals.length === 0) return null;
            const escNotIn = vals.map((v: any) => `'${escapeSql(v)}'`).join(", ");
            return ci
                ? `NOT EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text ILIKE ANY(ARRAY[${escNotIn}]))`
                : `NOT EXISTS (SELECT 1 FROM products_values pv WHERE pv.product_number = products.product_number AND pv.data_type_identifier = '${dtId}' AND pv.value::text IN (${escNotIn}))`;
        default: return null;
    }
}

function escapeSql(val: any): string {
    if (val === null || val === undefined) return "";
    return String(val).replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Standalone template generation (not exposed as HTTP endpoint)
// ---------------------------------------------------------------------------

/**
 * Generates an XLSX import template for a ProductType.
 *
 * Usage from a script or REPL:
 * ```typescript
 * import { generateProductTemplate } from "@/api/ProductAPI.ts";
 * import { getDatabaseConnection } from "@/services/database.ts";
 *
 * const db = getDatabaseConnection();
 * const result = await generateProductTemplate(db, "019f0057-...");
 * await Bun.write("template.xlsx", result.bytes);
 * ```
 */
export async function generateProductTemplate(
    db: any,
    productTypeIdentifier: string,
): Promise<{ bytes: Uint8Array; filename: string }> {
    const { ProductTypeRepo } = await import("@/repo/ProductTypeRepo.ts");
    const { getDataTypes } = await import("@/repo/ProductTypeRepo.ts");
    const { createWorkbook, addWorksheet } = await import("@office-kit/xlsx/workbook");
    const { writeRange } = await import("@office-kit/xlsx/worksheet");
    const { workbookToBytes } = await import("@office-kit/xlsx/io");

    const pt = await ProductTypeRepo.getByIdentifier(db, productTypeIdentifier, true);
    if (!pt) throw new Error(`Product type not found: ${productTypeIdentifier}`);

    const dataTypes = await getDataTypes(db, productTypeIdentifier);
    const dtNames = dataTypes.map((d: any) => d.dataTypeName!).sort();

    const wb = createWorkbook();
    const ws = addWorksheet(wb, "Template");

    writeRange(ws, "A1", [[productTypeIdentifier]]);
    writeRange(ws, "A2", [["productNumber", ...dtNames]]);

    const bytes = await workbookToBytes(wb);
    const safeName = pt.name.replace(/[<>:"/\\|?*]/g, "_");

    return { bytes, filename: `product_template_${safeName}.xlsx` };
}
