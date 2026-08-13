import type { ApiInstance } from "@/apps/api.ts";
import { authorize, getLoggedinUserObject } from "@/services/Auth.ts";
import { FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES, FP_VIEW_PRODUCT_TYPES } from "@/services/auth/FunctionalPermissions.ts";
import {
    message_CreateProductType,
    message_DisableProductType,
    message_UpdateProductType,
    ProductTypeSchema,
    UpdateProductTypeDataTypeBodySchema,
    UpdateProductTypeDataTypeTargetSystemBodySchema,
    GrantProductTypeDataTypePermissionBodySchema,
    RevokeProductTypeDataTypePermissionBodySchema,
    UpdateProductTypeDataTypePermissionBodySchema,
    AddProductTypeDataTypePreviousApprovalBodySchema,
} from "@/types/ProductTypeType.ts";
import type { DataTypeGroupRoles } from "@/types/DataTypeType.ts";
import { registerConfigurationEntityRoutes } from "@/api/_crud_API.ts";
import { ProductTypeRepo } from "@/repo/ProductTypeRepo.ts";
import {
    getDataTypes,
    getDataTypeAssignment,
    assignDataType,
    unassignDataType,
    updateDataTypeAssignment,
    getTargetSystems,
    assignTargetSystem,
    unassignTargetSystem,
    updateTargetSystemAssignment,
    getPermissions,
    grantPermission,
    revokePermission,
    updatePermission,
    getProductTypePermissions,
    grantProductTypePermission,
    revokeProductTypePermission,
    getPreviousApprovals,
    addPreviousApproval,
    removePreviousApproval,
} from "@/repo/ProductTypeRepo.ts";
import { runInTransaction } from "@/services/DatabaseDriver.ts";
import { getSystemUser } from "@/repo/UserRepo.ts";
import { status, t } from "elysia";
import { Group } from "@/schema/UserSchema.ts";
import { getUserListPageSizes } from "@/services/ui_config.ts";
import { eq } from "drizzle-orm";

/**
 * Registers CRUD and sub-resource endpoints for product types.
 *
 * Standard CRUD routes for the main ProductTypes table are generated via
 * {@link registerConfigurationEntityRoutes}. Custom handlers are added for:
 * - DataType assignments (ProductTypesDataTypes)
 * - TargetSystem assignments per DataType (ProductTypesDataTypesTargetSystems)
 * - Permissions per DataType assignment (ProductTypesDataTypePermission)
 *
 * @param app API application instance.
 * @returns Nothing. Routes are attached directly to `app`.
 */
// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance): void {
    // -----------------------------------------------------------------------
    // Standard CRUD routes via generic configuration entity registrar
    // -----------------------------------------------------------------------
    registerConfigurationEntityRoutes(app, {
        basePath: "/product_types",
        routeParam: "producttypeid",
        entityLabel: "Product type",
        listResponseKey: "productTypes",
        detailResponseKey: "productType",
        entitySchema: ProductTypeSchema,
        viewPermission: FP_VIEW_PRODUCT_TYPES,
        managePermission: FP_MANAGE_PRODUCT_TYPES,
        gatekeeperPermission: FP_DO_CONFIGURATION,
        repo: ProductTypeRepo,
        pubSubTags: [ message_CreateProductType, message_UpdateProductType, message_DisableProductType, ],
        updateBodySchema: t.Object({
            name: t.String({ minLength: 1, maxLength: 255 }),
            description: t.Optional(t.Nullable(t.String())),
            requestorCanCancel: t.Optional(t.Boolean()),
            knownUpdatedAt: t.String(),
        }),
        mapUpdateBody: (body) => {
            const input: Record<string, unknown> = { name: String(body.name).trim() };
            if (body.description !== undefined) input.description = body.description;
            if (body.requestorCanCancel !== undefined) input.requestorCanCancel = body.requestorCanCancel;
            return { input, knownUpdatedAt: body.knownUpdatedAt } as { input: any; knownUpdatedAt: string };
        },
    });

    // -----------------------------------------------------------------------
    // ProductTypesDataTypes endpoints
    // -----------------------------------------------------------------------

    // GET /product_types/:producttypeid/datatypes — List assigned DataTypes
    app.get("/product_types/:producttypeid/datatypes", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_VIEW_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_VIEW_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_VIEW_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;
        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? availablePageSizes[0] ?? 10));
        const includeDisabledDataTypes = !(context.query.includeDisabledDataTypes === false || context.query.includeDisabledDataTypes === "false" || context.query.includeDisabledDataTypes === "0");

        const allRows = await getDataTypes(context.dbClient, productTypeIdentifier, includeDisabledDataTypes);
        const total = allRows.length;
        const rows = allRows.slice(page * pageSize, (page + 1) * pageSize);

        return {
            page,
            pageSize,
            total,
            availablePageSizes,
            dataTypeAssignments: rows,
        };
    }, {
        params: t.Object({ producttypeid: t.String({ format: "uuid" }) }),
        query: t.Object({
            page: t.Optional(t.Union([t.Number({ minimum: 0 }), t.String()])),
            pageSize: t.Optional(t.Union([t.Number({ minimum: 1 }), t.String()])),
            includeDisabledDataTypes: t.Optional(t.Union([t.Boolean(), t.String()])),
        }),
        detail: {
            tags: ["Product type"],
            summary: "List assigned data types for a product type",
            description: "Returns all DataType assignments for a product type, joined with DataType name/kind/description and owner BusinessDomain name. Requires FP_DO_CONFIGURATION AND FP_VIEW_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type whose data type assignments are listed.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "page",
                    description: "Zero-based page number for pagination. Defaults to 0.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 0, default: 0 },
                },
                {
                    name: "pageSize",
                    description: "Number of data type assignments per page. Must be one of the available page sizes returned by the server. Defaults to the first available size.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 1 },
                },
                {
                    name: "includeDisabledDataTypes",
                    description: "Include assignments of disabled data types in the results. Accepts 'false' or '0' to exclude them. Defaults to true.",
                    in: "query",
                    required: false,
                    schema: { type: "string", enum: ["true", "1", "false", "0"], default: "true" },
                },
            ],
        },
        response: {
            200: t.Object({
                page: t.Number(),
                pageSize: t.Number(),
                total: t.Number(),
                availablePageSizes: t.Array(t.Number()),
                dataTypeAssignments: t.Array(t.Any()),
            }, { description: "Paged data type assignments of the product type with pagination metadata." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – no product type with this identifier exists." }),
        },
    });

    // POST /product_types/:producttypeid/datatypes — Assign a DataType
    app.post("/product_types/:producttypeid/datatypes", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;
        const created = await runInTransaction(context.dbClient, async (tx) => {
            const user = (await getLoggedinUserObject(tx, claims)) ?? (await getSystemUser(tx));
            const existing = await ProductTypeRepo.getByIdentifier(tx, productTypeIdentifier, true);
            if (!existing) return null;
            return assignDataType(tx, user, productTypeIdentifier, context.body.dataTypeIdentifier);
        });

        if (created === null) return status(404, "Product type does not exist");
        if (created.length === 0) return status(409, "Data type already assigned to this product type");
        return { assignment: created[0] };
    }, {
        params: t.Object({ producttypeid: t.String({ format: "uuid" }) }),
        body: t.Object({
            dataTypeIdentifier: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product type"],
            summary: "Assign a data type to a product type",
            description: "Creates a ProductTypesDataTypes row linking a DataType to a ProductType. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type the data type is assigned to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ assignment: t.Any() }, { description: "The newly created data type assignment." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – no product type with this identifier exists." }),
            409: t.String({ description: "Conflict – the data type is already assigned to this product type." }),
        },
    });

    // DELETE /product_types/:producttypeid/datatypes/:datatypeassignmentid — Unassign a DataType
    app.delete("/product_types/:producttypeid/datatypes/:datatypeassignmentid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;
        const assignmentIdentifier = context.params.datatypeassignmentid as string;

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const result = await unassignDataType(context.dbClient, assignmentIdentifier);
        if (result.length === 0) return status(404, "Data type assignment not found");
        return status(200);
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product type"],
            summary: "Unassign a data type from a product type",
            description: "Deletes a ProductTypesDataTypes row. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type the assignment belongs to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment to delete.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "Empty success response after removing the data type assignment." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type or data type assignment does not exist." }),
        },
    });

    // PATCH /product_types/:producttypeid/datatypes/:datatypeassignmentid — Update assignment fields
    app.patch("/product_types/:producttypeid/datatypes/:datatypeassignmentid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;
        const assignmentIdentifier = context.params.datatypeassignmentid as string;

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const assignment = await getDataTypeAssignment(context.dbClient, assignmentIdentifier);
        if (!assignment) return status(404, "Data type assignment not found");

        const updated = await runInTransaction(context.dbClient, async (tx) => {
            const user = (await getLoggedinUserObject(tx, claims)) ?? (await getSystemUser(tx));
            return updateDataTypeAssignment(tx, user, assignmentIdentifier, context.body as any);
        });

        if (updated.length === 0) return status(500, "Failed to update data type assignment");
        return { assignment: updated[0] };
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
        }),
        body: UpdateProductTypeDataTypeBodySchema as any,
        detail: {
            tags: ["Product type"],
            summary: "Update a data type assignment",
            description: "Updates mutable fields on a ProductTypesDataTypes row (owner, mandatory, editableOnUpdate, requestorCanEdit, config). Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type the assignment belongs to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment to update.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ assignment: t.Any() }, { description: "The updated data type assignment." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type or data type assignment does not exist." }),
            500: t.String({ description: "Internal server error." }),
        },
    });

    // -----------------------------------------------------------------------
    // ProductTypesDataTypesTargetSystems endpoints
    // -----------------------------------------------------------------------

    // GET /product_types/:producttypeid/datatypes/:datatypeassignmentid/targetsystems
    app.get("/product_types/:producttypeid/datatypes/:datatypeassignmentid/targetsystems", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_VIEW_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_VIEW_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_VIEW_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const assignment = await getDataTypeAssignment(context.dbClient, context.params.datatypeassignmentid as string);
        if (!assignment) return status(404, "Data type assignment not found");

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? availablePageSizes[0] ?? 10));

        const allRows = await getTargetSystems(context.dbClient, productTypeIdentifier, assignment.dataType);
        const total = allRows.length;
        const rows = allRows.slice(page * pageSize, (page + 1) * pageSize);

        return {
            page,
            pageSize,
            total,
            availablePageSizes,
            targetSystems: rows,
        };
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
        }),
        query: t.Object({
            page: t.Optional(t.Union([t.Number({ minimum: 0 }), t.String()])),
            pageSize: t.Optional(t.Union([t.Number({ minimum: 1 }), t.String()])),
        }),
        detail: {
            tags: ["Product type"],
            summary: "List assigned target systems for a product type data type assignment",
            description: "Returns all TargetSystem assignments for a ProductType+DataType pair, joined with TargetSystem name. Requires FP_DO_CONFIGURATION AND FP_VIEW_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment whose target systems are listed.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "page",
                    description: "Zero-based page number for pagination. Defaults to 0.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 0, default: 0 },
                },
                {
                    name: "pageSize",
                    description: "Number of target systems per page. Must be one of the available page sizes returned by the server. Defaults to the first available size.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 1 },
                },
            ],
        },
        response: {
            200: t.Object({
                page: t.Number(),
                pageSize: t.Number(),
                total: t.Number(),
                availablePageSizes: t.Array(t.Number()),
                targetSystems: t.Array(t.Any()),
            }, { description: "Paged target system assignments of the product type data type with pagination metadata." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type or data type assignment does not exist." }),
        },
    });

    // POST /product_types/:producttypeid/datatypes/:datatypeassignmentid/targetsystems
    app.post("/product_types/:producttypeid/datatypes/:datatypeassignmentid/targetsystems", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const assignment = await getDataTypeAssignment(context.dbClient, context.params.datatypeassignmentid as string);
        if (!assignment) return status(404, "Data type assignment not found");

        const result = await assignTargetSystem(
            context.dbClient,
            productTypeIdentifier,
            assignment.dataType,
            context.body.targetSystemIdentifier,
        );

        if (result.length === 0) return status(409, "Target system already assigned");
        return { targetSystem: result[0] };
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
        }),
        body: t.Object({
            targetSystemIdentifier: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product type"],
            summary: "Assign a target system to a product type data type",
            description: "Creates a ProductTypesDataTypesTargetSystems row linking a TargetSystem. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment the target system is linked to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ targetSystem: t.Any() }, { description: "The newly created target system assignment." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type or data type assignment does not exist." }),
            409: t.String({ description: "Conflict – the target system is already assigned." }),
        },
    });

    // DELETE /product_types/:producttypeid/datatypes/:datatypeassignmentid/targetsystems/:targetsystemid
    app.delete("/product_types/:producttypeid/datatypes/:datatypeassignmentid/targetsystems/:targetsystemid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const assignment = await getDataTypeAssignment(context.dbClient, context.params.datatypeassignmentid as string);
        if (!assignment) return status(404, "Data type assignment not found");

        const result = await unassignTargetSystem(
            context.dbClient,
            productTypeIdentifier,
            assignment.dataType,
            context.params.targetsystemid as string,
        );

        if (result.length === 0) return status(404, "Target system assignment not found");
        return status(200);
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
            targetsystemid: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product type"],
            summary: "Unassign a target system from a product type data type",
            description: "Deletes a ProductTypesDataTypesTargetSystems row. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "targetsystemid",
                    description: "UUID of the target system assignment to delete.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "Empty success response after removing the target system assignment." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type, data type assignment, or target system assignment does not exist." }),
        },
    });

    // PATCH /product_types/:producttypeid/datatypes/:datatypeassignmentid/targetsystems/:targetsystemid
    app.patch("/product_types/:producttypeid/datatypes/:datatypeassignmentid/targetsystems/:targetsystemid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const assignment = await getDataTypeAssignment(context.dbClient, context.params.datatypeassignmentid as string);
        if (!assignment) return status(404, "Data type assignment not found");

        const result = await updateTargetSystemAssignment(
            context.dbClient,
            productTypeIdentifier,
            assignment.dataType,
            context.params.targetsystemid as string,
            context.body as any,
        );

        if (result.length === 0) return status(404, "Target system assignment not found");
        return { targetSystem: result[0] };
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
            targetsystemid: t.String({ format: "uuid" }),
        }),
        body: UpdateProductTypeDataTypeTargetSystemBodySchema as any,
        detail: {
            tags: ["Product type"],
            summary: "Update a target system assignment name",
            description: "Updates the name override on a ProductTypesDataTypesTargetSystems row. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "targetsystemid",
                    description: "UUID of the target system assignment to update.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ targetSystem: t.Any() }, { description: "The updated target system assignment." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type, data type assignment, or target system assignment does not exist." }),
        },
    });

    // -----------------------------------------------------------------------
    // ProductTypesDataTypePermission endpoints
    // -----------------------------------------------------------------------

    // GET /product_types/:producttypeid/datatypes/:datatypeassignmentid/permissions
    app.get("/product_types/:producttypeid/datatypes/:datatypeassignmentid/permissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_VIEW_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_VIEW_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_VIEW_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const assignment = await getDataTypeAssignment(context.dbClient, context.params.datatypeassignmentid as string);
        if (!assignment) return status(404, "Data type assignment not found");

        const permissions = await getPermissions(context.dbClient, assignment.identifier);
        return { permissions };
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product type"],
            summary: "Get product type data type permissions",
            description: "Returns all group-role assignments for a ProductType+DataType assignment, including group names. Requires FP_DO_CONFIGURATION AND FP_VIEW_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment whose permissions are listed.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ permissions: t.Array(t.Any()) }, { description: "All group-role assignments for the product type data type assignment." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type or data type assignment does not exist." }),
        },
    });

    // POST /product_types/:producttypeid/datatypes/:datatypeassignmentid/permissions — Grant group+role
    app.post("/product_types/:producttypeid/datatypes/:datatypeassignmentid/permissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;
        const body = context.body as any;

        const created = await runInTransaction(context.dbClient, async (tx) => {
            const user = (await getLoggedinUserObject(tx, claims)) ?? (await getSystemUser(tx));
            const existing = await ProductTypeRepo.getByIdentifier(tx, productTypeIdentifier, true);
            if (!existing) return null;

            const assignment = await getDataTypeAssignment(tx, context.params.datatypeassignmentid as string);
            if (!assignment) return null;

            return grantPermission(
                tx,
                user,
                assignment.identifier,
                body.groupIdentifier,
                body.role as DataTypeGroupRoles,
                body.showByDefault ?? true,
            );
        });

        if (created === null) return status(404, "Product type or data type assignment does not exist");
        if (created.length === 0) return status(500, "Failed to grant permission");

        const groupName = await context.dbClient
            .select({ name: Group.groupName })
            .from(Group)
            .where(eq(Group.identifier, body.groupIdentifier))
            .limit(1);

        return {
            permission: {
                ...created[0]!,
                groupName: groupName[0]?.name ?? body.groupIdentifier,
            },
        };
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
        }),
        body: GrantProductTypeDataTypePermissionBodySchema as any,
        detail: {
            tags: ["Product type"],
            summary: "Grant product type data type permission",
            description: "Grants a role (viewer/writer/approver) to a group for a ProductType+DataType assignment. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment the permission is granted for.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ permission: t.Any() }, { description: "The newly created permission assignment including the group name." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type or data type assignment does not exist." }),
            500: t.String({ description: "Internal server error." }),
        },
    });

    // DELETE /product_types/:producttypeid/datatypes/:datatypeassignmentid/permissions — Revoke group+role
    app.delete("/product_types/:producttypeid/datatypes/:datatypeassignmentid/permissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;
        const body = context.body as any;

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const assignment = await getDataTypeAssignment(context.dbClient, context.params.datatypeassignmentid as string);
        if (!assignment) return status(404, "Data type assignment not found");

        const result = await revokePermission(
            context.dbClient,
            assignment.identifier,
            body.groupIdentifier,
            body.role,
        );

        if (result.length === 0) return status(404, "Permission assignment not found");
        return status(200);
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
        }),
        body: RevokeProductTypeDataTypePermissionBodySchema as any,
        detail: {
            tags: ["Product type"],
            summary: "Revoke product type data type permission",
            description: "Revokes a role assignment from a group for a ProductType+DataType assignment. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment the permission is revoked from.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "Empty success response after revoking the permission assignment." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type, data type assignment, or permission assignment does not exist." }),
        },
    });

    // PATCH /product_types/:producttypeid/datatypes/:datatypeassignmentid/permissions/:permid — Update showByDefault
    app.patch("/product_types/:producttypeid/datatypes/:datatypeassignmentid/permissions/:permid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;
        const permId = context.params.permid as string;

        const sepIndex = permId.indexOf("__");
        if (sepIndex === -1) return status(400, "Invalid permission identifier format");

        const groupIdentifier = permId.slice(0, sepIndex);
        const role = permId.slice(sepIndex + 2);

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const assignment = await getDataTypeAssignment(context.dbClient, context.params.datatypeassignmentid as string);
        if (!assignment) return status(404, "Data type assignment not found");

        const result = await updatePermission(
            context.dbClient,
            assignment.identifier,
            groupIdentifier,
            role as DataTypeGroupRoles,
            context.body as any,
        );

        if (result.length === 0) return status(409, "Permission assignment was modified or not found");
        return { permission: result[0] };
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
            permid: t.String(),
        }),
        body: UpdateProductTypeDataTypePermissionBodySchema as any,
        detail: {
            tags: ["Product type"],
            summary: "Update product type data type permission",
            description: "Updates the showByDefault flag on a ProductType+DataType permission. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment the permission belongs to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "permid",
                    description: "Permission identifier encoding the group UUID and role, separated by '__'.",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
        },
        response: {
            200: t.Object({ permission: t.Any() }, { description: "The updated permission assignment." }),
            400: t.String({ description: "Invalid request – the permission identifier format is invalid." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type or data type assignment does not exist." }),
            409: t.String({ description: "Conflict – optimistic locking failed; the permission assignment was modified by another user." }),
        },
    });

    // -----------------------------------------------------------------------
    // ProductTypesDataTypePreviousApproval endpoints
    // -----------------------------------------------------------------------

    // GET /product_types/:producttypeid/datatypes/:datatypeassignmentid/previous-approvals
    app.get("/product_types/:producttypeid/datatypes/:datatypeassignmentid/previous-approvals", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_VIEW_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_VIEW_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_VIEW_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const assignment = await getDataTypeAssignment(context.dbClient, context.params.datatypeassignmentid as string);
        if (!assignment) return status(404, "Data type assignment not found");

        const previousApprovals = await getPreviousApprovals(context.dbClient, productTypeIdentifier, assignment.dataType);
        return { previousApprovals };
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product type"],
            summary: "Get previous approval dependencies",
            description: "Returns all previous-approval dependencies for a ProductType+DataType assignment, including depends-on data type names. Requires FP_DO_CONFIGURATION AND FP_VIEW_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment whose previous approvals are listed.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ previousApprovals: t.Array(t.Any()) }, { description: "All previous-approval dependencies of the product type data type assignment." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type or data type assignment does not exist." }),
        },
    });

    // POST /product_types/:producttypeid/datatypes/:datatypeassignmentid/previous-approvals
    app.post("/product_types/:producttypeid/datatypes/:datatypeassignmentid/previous-approvals", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;
        const body = context.body as any;

        const created = await runInTransaction(context.dbClient, async (tx) => {
            const existing = await ProductTypeRepo.getByIdentifier(tx, productTypeIdentifier, true);
            if (!existing) return null;

            const assignment = await getDataTypeAssignment(tx, context.params.datatypeassignmentid as string);
            if (!assignment) return null;

            return addPreviousApproval(tx, productTypeIdentifier, assignment.dataType, body.dependsOnDataType);
        });

        if (created === null) return status(404, "Product type or data type assignment does not exist");
        if (!created) return status(409, "Previous approval dependency already exists or would create a cycle");

        return { previousApproval: created };
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
        }),
        body: AddProductTypeDataTypePreviousApprovalBodySchema as any,
        detail: {
            tags: ["Product type"],
            summary: "Add previous approval dependency",
            description: "Adds a previous-approval dependency: the assigned data type requires the given depends-on data type to be approved first. Rejects self-dependencies and cycles. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment the dependency is added to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ previousApproval: t.Any() }, { description: "The newly created previous-approval dependency." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type or data type assignment does not exist." }),
            409: t.String({ description: "Conflict – the previous approval dependency already exists or would create a cycle." }),
        },
    });

    // DELETE /product_types/:producttypeid/datatypes/:datatypeassignmentid/previous-approvals/:dependsonid
    app.delete("/product_types/:producttypeid/datatypes/:datatypeassignmentid/previous-approvals/:dependsonid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const assignment = await getDataTypeAssignment(context.dbClient, context.params.datatypeassignmentid as string);
        if (!assignment) return status(404, "Data type assignment not found");

        await removePreviousApproval(context.dbClient, productTypeIdentifier, assignment.dataType, context.params.dependsonid as string);
        return status(200);
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
            datatypeassignmentid: t.String({ format: "uuid" }),
            dependsonid: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product type"],
            summary: "Remove previous approval dependency",
            description: "Removes a previous-approval dependency for a ProductType+DataType assignment. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "datatypeassignmentid",
                    description: "UUID of the data type assignment.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "dependsonid",
                    description: "UUID of the previous-approval dependency to remove.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "Empty success response after removing the previous-approval dependency." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type or data type assignment does not exist." }),
        },
    });

    // -----------------------------------------------------------------------
    // ProductTypesPermission endpoints (product-type-level, role "cancel")
    // -----------------------------------------------------------------------

    // GET /product_types/:producttypeid/permissions — List product-type-level permissions
    app.get("/product_types/:producttypeid/permissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_VIEW_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_VIEW_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_VIEW_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const permissions = await getProductTypePermissions(context.dbClient, productTypeIdentifier);
        return { permissions };
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product type"],
            summary: "Get product type permissions",
            description: "Returns all group-role assignments for a product type, including group names. Requires FP_DO_CONFIGURATION AND FP_VIEW_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type whose permissions are listed.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ permissions: t.Array(t.Any()) }, { description: "All group-role assignments for the product type." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – no product type with this identifier exists." }),
        },
    });

    // POST /product_types/:producttypeid/permissions — Grant product-type-level permission
    app.post("/product_types/:producttypeid/permissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;
        const body = context.body as { groupIdentifier: string };

        const created = await runInTransaction(context.dbClient, async (tx) => {
            const user = (await getLoggedinUserObject(tx, claims)) ?? (await getSystemUser(tx));
            const existing = await ProductTypeRepo.getByIdentifier(tx, productTypeIdentifier, true);
            if (!existing) return null;

            return grantProductTypePermission(tx, user, productTypeIdentifier, body.groupIdentifier);
        });

        if (created === null) return status(404, "Product type does not exist");
        if (created.length === 0) return status(200, { permission: null });

        const groupName = await context.dbClient
            .select({ name: Group.groupName })
            .from(Group)
            .where(eq(Group.identifier, body.groupIdentifier))
            .limit(1);

        return {
            permission: {
                ...created[0]!,
                groupName: groupName[0]?.name ?? body.groupIdentifier,
            },
        };
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
        }),
        body: t.Object({
            groupIdentifier: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product type"],
            summary: "Grant product type permission",
            description: "Grants the cancel role to a group for a product type. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type the permission is granted for.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ permission: t.Any() }, { description: "The newly created product-type permission assignment including the group name." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – no product type with this identifier exists." }),
        },
    });

    // DELETE /product_types/:producttypeid/permissions — Revoke product-type-level permission
    app.delete("/product_types/:producttypeid/permissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_PRODUCT_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_PRODUCT_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_PRODUCT_TYPES.functionalPermissionName}`);
        }

        const productTypeIdentifier = context.params.producttypeid as string;
        const body = context.body as { groupIdentifier: string };

        const existing = await ProductTypeRepo.getByIdentifier(context.dbClient, productTypeIdentifier, true);
        if (!existing) return status(404, "Product type does not exist");

        const result = await revokeProductTypePermission(
            context.dbClient,
            productTypeIdentifier,
            body.groupIdentifier,
        );

        if (result.length === 0) return status(404, "Permission assignment not found");
        return status(200);
    }, {
        params: t.Object({
            producttypeid: t.String({ format: "uuid" }),
        }),
        body: t.Object({
            groupIdentifier: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product type"],
            summary: "Revoke product type permission",
            description: "Revokes the cancel role from a group for a product type. Requires FP_DO_CONFIGURATION AND FP_MANAGE_PRODUCT_TYPES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "producttypeid",
                    description: "UUID of the product type the permission is revoked from.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "Empty success response after revoking the product-type permission assignment." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the product type or permission assignment does not exist." }),
        },
    });
}
