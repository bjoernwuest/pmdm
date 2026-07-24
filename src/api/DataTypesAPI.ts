import type { ApiInstance } from "@/apps/api.ts";
import { authorize, getLoggedinUserObject } from "@/services/Auth.ts";
import { FP_MANAGE_DATA_TYPES, FP_VIEW_DATA_TYPES } from "@/services/auth/FunctionalPermissions.ts";
import {
    DataTypeRepo,
    getPermissions,
    grantPermission,
    revokePermission,
    updatePermission,
} from "@/repo/DataTypeRepo.ts";
import { runInTransaction } from "@/services/DatabaseDriver.ts";
import { getSystemUser } from "@/repo/UserRepo.ts";
import { status, t } from "elysia";
import { eq } from "drizzle-orm";
import { registerConfigurationEntityRoutes } from "@/api/_crud_API.ts";
import {Group} from "@/schema/UserSchema.ts";
import {
    type DataTypeGroupRoles,
    type DataTypeKind, DataTypeSchemaInsertSchema, DataTypeSchemaSelectSchema, type DataTypeSchemaInsertType,
    DataTypeListEntitySchema,
    message_CreateDataType,
    message_DisableDataType,
    message_UpdateDataType, UpdateDataTypeBodySchema
} from "@/types/DataTypeType.ts";

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers CRUD and permission-management endpoints for data types.
 *
 * Standard CRUD routes (GET list, GET by identifier, POST, PUT, PATCH disabled)
 * are generated via {@link registerConfigurationEntityRoutes}. Custom overrides
 * add business-domain-name joins on detail/creation/update responses. Mutating
 * routes trigger PubSub messages through repository methods.
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
        basePath: "/data_types",
        routeParam: "datatypeid",
        entityLabel: "Data type",
        listResponseKey: "dataTypes",
        detailResponseKey: "dataType",
        entitySchema: DataTypeSchemaSelectSchema,
        listEntitySchema: DataTypeListEntitySchema,
        detailEntitySchema: DataTypeListEntitySchema,
        viewPermission: FP_VIEW_DATA_TYPES,
        managePermission: FP_MANAGE_DATA_TYPES,
        repo: DataTypeRepo as any,
        pubSubTags: [message_CreateDataType, message_UpdateDataType, message_DisableDataType],
        createBodySchema: DataTypeSchemaInsertSchema,
        updateBodySchema: UpdateDataTypeBodySchema,
        mapCreateBody: (body): DataTypeSchemaInsertType => ({
            name: body.name.trim(),
            kind: body.kind as DataTypeKind,
            owner: body.owner,
            config: body.config as any,
            description: body.description ?? undefined,
            mandatory: typeof body.mandatory === "boolean" ? (body.mandatory ? "Yes" : "No") : (body.mandatory ?? "No"),
            mandatory_script: body.mandatory_script,
            requestorCanEdit: typeof body.requestorCanEdit === "boolean" ? (body.requestorCanEdit ? "Yes" : "No") : (body.requestorCanEdit ?? "Yes"),
            requestorCanEdit_script: body.requestorCanEdit_script,
        }),
        mapUpdateBody: (body) => {
            const input: Record<string, unknown> = {};
            if (body.name !== undefined) input.name = String(body.name).trim();
            if (body.description !== undefined) input.description = body.description;
            if (body.mandatory !== undefined) input.mandatory = typeof body.mandatory === "boolean" ? (body.mandatory ? "Yes" : "No") : body.mandatory;
            if (body.requestorCanEdit !== undefined) input.requestorCanEdit = typeof body.requestorCanEdit === "boolean" ? (body.requestorCanEdit ? "Yes" : "No") : body.requestorCanEdit;
            if (body.mandatory_script !== undefined) input.mandatory_script = body.mandatory_script;
            if (body.requestorCanEdit_script !== undefined) input.requestorCanEdit_script = body.requestorCanEdit_script;
            if (body.owner !== undefined) input.owner = String(body.owner);
            if (body.config !== undefined) input.config = body.config;
            return { input, knownUpdatedAt: body.knownUpdatedAt };
        },
    });

    // -----------------------------------------------------------------------
    // GET /data_types/:datatypeid/permissions – List current permissions
    // -----------------------------------------------------------------------
    app.get("/data_types/:datatypeid/permissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_VIEW_DATA_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_VIEW_DATA_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_VIEW_DATA_TYPES.functionalPermissionName}`);
        }

        const identifier = context.params.datatypeid as string;
        const existing = await DataTypeRepo.getByIdentifier(context.dbClient, identifier, true);
        if (!existing) return status(404, "Data type does not exist");

        const permissions = await getPermissions(context.dbClient, identifier);
        return { permissions };
    }, {
        params: t.Object({ datatypeid: t.String({ format: "uuid" }) }),
        detail: {
            tags: ["Data type"],
            summary: "Get data type permissions",
            description: "Returns all group-role assignments for a data type, including group names.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
        response: {
            200: t.Object({ permissions: t.Array(t.Any()) }),
            401: t.String(),
            403: t.String(),
            404: t.String(),
        },
    });

    // -----------------------------------------------------------------------
    // POST /data_types/:datatypeid/permissions – Grant group+role
    // -----------------------------------------------------------------------
    app.post("/data_types/:datatypeid/permissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_MANAGE_DATA_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_DATA_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_DATA_TYPES.functionalPermissionName}`);
        }

        const identifier = context.params.datatypeid as string;
        const created = await runInTransaction(context.dbClient, async (tx) => {
            const user = (await getLoggedinUserObject(tx, claims)) ?? (await getSystemUser(tx));
            const existing = await DataTypeRepo.getByIdentifier(tx, identifier, true);
            if (!existing) return null;
            return grantPermission(tx, user, identifier, context.body.groupIdentifier, context.body.role as DataTypeGroupRoles, context.body.showByDefault ?? true);
        });

        if (created === null) return status(404, "Data type does not exist");
        if (created.length === 0) return status(500, "Failed to grant permission");

        // Join group name
        const groupName = await context.dbClient
            .select({ name: Group.groupName })
            .from(Group)
            .where(eq(Group.identifier, context.body.groupIdentifier))
            .limit(1);

        return {
            permission: {
                ...created[0]!,
                groupName: groupName[0]?.name ?? context.body.groupIdentifier,
            },
        };
    }, {
        params: t.Object({ datatypeid: t.String({ format: "uuid" }) }),
        body: t.Object({
            groupIdentifier: t.String({ format: "uuid" }),
            role: t.String(),
            showByDefault: t.Optional(t.Boolean()),
        }),
        detail: {
            tags: ["Data type"],
            summary: "Grant data type permission",
            description: "Grants a role (viewer/writer/approver) to a group for a data type.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
        response: {
            200: t.Object({ permission: t.Any() }),
            401: t.String(),
            403: t.String(),
            404: t.String(),
            500: t.String(),
        },
    });

    // -----------------------------------------------------------------------
    // DELETE /data_types/:datatypeid/permissions – Revoke group+role
    // -----------------------------------------------------------------------
    app.delete("/data_types/:datatypeid/permissions", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_MANAGE_DATA_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_DATA_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_DATA_TYPES.functionalPermissionName}`);
        }

        const identifier = context.params.datatypeid as string;
        const existing = await DataTypeRepo.getByIdentifier(context.dbClient, identifier, true);
        if (!existing) return status(404, "Data type does not exist");

        const result = await revokePermission(
            context.dbClient,
            identifier,
            context.body.groupIdentifier,
            context.body.role,
        );

        if (result.length === 0) return status(404, "Permission assignment not found");
        return status(200);


    }, {
        params: t.Object({ datatypeid: t.String({ format: "uuid" }) }),
        body: t.Object({
            groupIdentifier: t.String({ format: "uuid" }),
            role: t.String(),
        }),
        detail: {
            tags: ["Data type"],
            summary: "Revoke data type permission",
            description: "Revokes a role assignment from a group for a data type.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
        response: {
            200: t.Any(),
            401: t.String(),
            403: t.String(),
            404: t.String(),
        },
    });

    // -----------------------------------------------------------------------
    // PATCH /data_types/:datatypeid/permissions/:permid – Update showByDefault
    // -----------------------------------------------------------------------
    app.patch("/data_types/:datatypeid/permissions/:permid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_MANAGE_DATA_TYPES]);
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_DATA_TYPES.identifier)) {
            return status(403, `Permission denied. Required: ${FP_MANAGE_DATA_TYPES.functionalPermissionName}`);
        }

        const dataTypeIdentifier = context.params.datatypeid as string;
        const permId = context.params.permid as string;

        // permId encodes groupIdentifier+role: we split on the first "__" separator
        const sepIndex = permId.indexOf("__");
        if (sepIndex === -1) return status(400, "Invalid permission identifier format");

        const groupIdentifier = permId.slice(0, sepIndex);
        const role = permId.slice(sepIndex + 2);

        const existing = await DataTypeRepo.getByIdentifier(context.dbClient, dataTypeIdentifier, true);
        if (!existing) return status(404, "Data type does not exist");

        const result = await updatePermission(
            context.dbClient,
            dataTypeIdentifier,
            groupIdentifier,
            role as DataTypeGroupRoles,
            context.body.showByDefault,
            context.body.knownUpdatedAt,
        );

        if (result.length === 0) return status(409, "Permission assignment was modified or not found");
        return { permission: result[0] };
    }, {
        params: t.Object({
            datatypeid: t.String({ format: "uuid" }),
            permid: t.String(),
        }),
        body: t.Object({
            showByDefault: t.Boolean(),
            knownUpdatedAt: t.String(),
        }),
        detail: {
            tags: ["Data type"],
            summary: "Update data type permission",
            description: "Updates the showByDefault flag on a data type permission.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
        response: {
            200: t.Object({ permission: t.Any() }),
            400: t.String(),
            401: t.String(),
            403: t.String(),
            404: t.String(),
            409: t.String(),
        },
    });
}
