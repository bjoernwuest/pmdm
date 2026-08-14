import {
    ProductTypes,
    ProductTypesDataTypes,
    ProductTypesDataTypesTargetSystems,
    ProductTypesDataTypePermission,
    ProductTypesDataTypePreviousApproval,
    ProductTypesPermission,
} from "@/schema/ProductTypeSchema.ts";
import type { DataTypeGroupRoles } from "@/schema/DataTypeSchema.ts";
import { DataTypeSchema } from "@/schema/DataTypeSchema.ts";
import { TargetSystems } from "@/schema/TargetSystemSchema.ts";
import { BusinessDomains } from "@/schema/BusinessDomainSchema.ts";
import { createConfigurationRepository } from "./_crud_Repo.ts";
import { ProductRequests, ProductRequestsValues, ProductRequestStatus } from "@/schema/ProductRequestSchema.ts";
import {
    message_CreateProductType,
    message_DisableProductType,
    message_UpdateProductType,
    message_AssignProductTypeDataType,
    message_UnassignProductTypeDataType,
    message_UpdateProductTypeDataType,
    message_AssignProductTypeDataTypeTargetSystem,
    message_UnassignProductTypeDataTypeTargetSystem,
    message_UpdateProductTypeDataTypeTargetSystem,
    message_GrantProductTypeDataTypePermission,
    message_RevokeProductTypeDataTypePermission,
    message_UpdateProductTypeDataTypePermission,
    message_GrantProductTypePermission,
    message_RevokeProductTypePermission,
    message_AddPreviousApproval,
    message_RemovePreviousApproval,
} from "@/types/ProductTypeType.ts";
import type {
    NewProductTypesDataType,
    NewProductTypesDataTypesTargetSystem,
    NewProductTypesDataTypePermissionType,
    ProductTypeDataTypeWithDetails,
    ProductTypeDataTypeTargetSystemWithDetails,
    ProductTypeDataTypePermissionWithGroup,
    ProductTypesDataType,
    ProductTypesDataTypesTargetSystem,
    ProductTypesDataTypePermissionType,
} from "@/types/ProductTypeType.ts";
import type { DBClient } from "@/services/DatabaseDriver.ts";
import type { UUIDType } from "@/types/helpers.ts";
import { and, asc, eq, or, sql } from "drizzle-orm";
import PubSub from "@/services/PubSub.ts";
import type { UserSelectType } from "@/types/UserType.ts";
import { Group } from "@/schema/UserSchema.ts";
import * as ScriptEngine from "@/services/ScriptEngine.ts";
import { ScriptCategory } from "@/types/ScriptEngineType.ts";

// ---------------------------------------------------------------------------
// ProductType CRUD (existing — DO NOT MODIFY)
// ---------------------------------------------------------------------------

const _ProductTypeRepo = createConfigurationRepository(ProductTypes, { create: message_CreateProductType, update: message_UpdateProductType, disable: message_DisableProductType, });
export const ProductTypeRepo = _ProductTypeRepo;

// ---------------------------------------------------------------------------
// ProductTypesDataTypes CRUD
// ---------------------------------------------------------------------------

/**
 * Lists all DataTypes assigned to a ProductType, joined with DataType name/kind/description and owner BusinessDomain name.
 *
 * @param db Database client instance.
 * @param productTypeIdentifier Product type identifier.
 * @param includeDisabledDataTypes When `false`, assignments referencing disabled data types are excluded. Defaults to `true` (include everything).
 */
export async function getDataTypes(db: DBClient, productTypeIdentifier: UUIDType, includeDisabledDataTypes: boolean = true): Promise<ProductTypeDataTypeWithDetails[]> {
    const conditions = [eq(ProductTypesDataTypes.productType, productTypeIdentifier)];
    if (!includeDisabledDataTypes) {
        conditions.push(eq(DataTypeSchema.disabled, false));
    }

    const rows = await db
        .select({
            identifier: ProductTypesDataTypes.identifier,
            productType: ProductTypesDataTypes.productType,
            dataType: ProductTypesDataTypes.dataType,
            mandatory: ProductTypesDataTypes.mandatory,
            requestorCanEdit: ProductTypesDataTypes.requestorCanEdit,
            editableOnUpdate: ProductTypesDataTypes.editableOnUpdate,
            config: ProductTypesDataTypes.config,
            owner: ProductTypesDataTypes.owner,
            dataTypeName: DataTypeSchema.name,
            dataTypeKind: DataTypeSchema.kind,
            dataTypeDescription: DataTypeSchema.description,
            dataTypeConfig: DataTypeSchema.config,
            ownerBusinessDomainName: BusinessDomains.name,
        })
        .from(ProductTypesDataTypes)
        .innerJoin(DataTypeSchema, eq(ProductTypesDataTypes.dataType, DataTypeSchema.identifier))
        .leftJoin(BusinessDomains, eq(ProductTypesDataTypes.owner, BusinessDomains.identifier))
        .where(and(...conditions))
        .orderBy(asc(DataTypeSchema.name));

    return rows as ProductTypeDataTypeWithDetails[];
}

/**
 * Gets a single DataType assignment by identifier.
 */
export async function getDataTypeAssignment(db: DBClient, assignmentIdentifier: UUIDType): Promise<ProductTypesDataType | null> {
    const rows = await db
        .select()
        .from(ProductTypesDataTypes)
        .where(eq(ProductTypesDataTypes.identifier, assignmentIdentifier))
        .limit(1);
    return (rows[0] ?? null) as ProductTypesDataType | null;
}

/**
 * Assigns a DataType to a ProductType.
 */
export async function assignDataType(db: DBClient, user: UserSelectType, productTypeIdentifier: UUIDType, dataTypeIdentifier: UUIDType): Promise<ProductTypesDataType[]> {
    const result = await db
        .insert(ProductTypesDataTypes)
        .values({
            productType: productTypeIdentifier,
            dataType: dataTypeIdentifier,
            editableOnUpdate: true,
        } as any)
        .onConflictDoNothing()
        .returning();

    if (result.length === 0) {
        return result as unknown as ProductTypesDataType[];
    }

    // Load the data type to resolve default value config
    const [dataType] = await db
        .select({
            kind: DataTypeSchema.kind,
            config: DataTypeSchema.config,
        })
        .from(DataTypeSchema)
        .where(eq(DataTypeSchema.identifier, dataTypeIdentifier))
        .limit(1);

    // Resolve effective config (data type config + product type assignment override)
    const effectiveConfig = { ...(dataType?.config as Record<string, unknown> ?? {}), ...(result[0]!.config as Record<string, unknown> ?? {}) };

    // Query all open product requests for this product type
    const openRequests = await db
        .select({ identifier: ProductRequests.identifier })
        .from(ProductRequests)
        .where(and(
            eq(ProductRequests.productType, productTypeIdentifier),
            eq(ProductRequests.status, ProductRequestStatus.open),
        ));

    // Insert a default value row for each open product request. The
    // defaultProvider script executes per request so the script context carries
    // that request's identifier (cause: product_type_assign).
    for (const request of openRequests) {
        let defaultValue: unknown = null;
        if (effectiveConfig.defaultProvider) {
            const assignCtx = ScriptEngine.buildContext(db, {
                cause: "product_type_assign",
                productRequestIdentifier: request.identifier!,
                dataTypeIdentifier: dataTypeIdentifier as string,
                principal: { userId: user.identifier ?? null, apiKeyIdentifier: null, isApiKey: false },
            });
            defaultValue = await ScriptEngine.execute(
                db,
                effectiveConfig.defaultProvider as string,
                assignCtx,
                ScriptCategory.DefaultProvider,
            );
        }

        await db
            .insert(ProductRequestsValues)
            .values({
                dataType: dataTypeIdentifier,
                productRequest: request.identifier,
                value: null,
                defaultValue: defaultValue as any,
            } as any)
            .onConflictDoNothing();
    }

    PubSub.publish(message_AssignProductTypeDataType, result[0]);
    return result as unknown as ProductTypesDataType[];
}

/**
 * Unassigns a DataType from a ProductType.
 * Also cleans up dependent target-system assignments and previous-approval
 * dependencies (both directions). Permission rows auto-cascade via DB FK.
 */
export async function unassignDataType(db: DBClient, assignmentIdentifier: UUIDType): Promise<ProductTypesDataType[]> {
    // 1. Load the assignment row to get productType + dataType
    const [assignment] = await db
        .select({ productType: ProductTypesDataTypes.productType, dataType: ProductTypesDataTypes.dataType })
        .from(ProductTypesDataTypes)
        .where(eq(ProductTypesDataTypes.identifier, assignmentIdentifier))
        .limit(1);
    if (!assignment) return [];

    // 2. Delete target system assignments (no FK cascade)
    const deletedTargetSystems = await db
        .delete(ProductTypesDataTypesTargetSystems)
        .where(and(
            eq(ProductTypesDataTypesTargetSystems.productType, assignment.productType),
            eq(ProductTypesDataTypesTargetSystems.dataType, assignment.dataType),
        ))
        .returning();
    deletedTargetSystems.forEach(row =>
        PubSub.publish(message_UnassignProductTypeDataTypeTargetSystem, row));

    // 3. Delete previous-approval rows where this data type appears as either
    //    the dependent (dataType) or the prerequisite (dependsOnDataType)
    const deletedPrevApprovals = await db
        .delete(ProductTypesDataTypePreviousApproval)
        .where(and(
            eq(ProductTypesDataTypePreviousApproval.productType, assignment.productType),
            or(
                eq(ProductTypesDataTypePreviousApproval.dataType, assignment.dataType),
                eq(ProductTypesDataTypePreviousApproval.dependsOnDataType, assignment.dataType),
            ),
        ))
        .returning();
    for (const row of deletedPrevApprovals) {
        PubSub.publish(message_RemovePreviousApproval, row);
    }

    // 4. Delete the assignment itself (permission rows cascade via DB FK)
    const existing = await db
        .delete(ProductTypesDataTypes)
        .where(eq(ProductTypesDataTypes.identifier, assignmentIdentifier))
        .returning();

    existing.forEach(row => PubSub.publish(message_UnassignProductTypeDataType, row));
    return existing as unknown as ProductTypesDataType[];
}

/**
 * Updates fields on a ProductType-DataType assignment.
 */
export async function updateDataTypeAssignment(
    db: DBClient,
    user: UserSelectType,
    assignmentIdentifier: UUIDType,
    fields: Partial<Omit<NewProductTypesDataType, "identifier" | "productType" | "dataType">>,
): Promise<ProductTypesDataType[]> {
    const result = await db
        .update(ProductTypesDataTypes)
        .set({ ...fields, updatedAt: sql`now()` } as any)
        .where(eq(ProductTypesDataTypes.identifier, assignmentIdentifier))
        .returning();

    result.forEach(row => PubSub.publish(message_UpdateProductTypeDataType, row));
    return result as unknown as ProductTypesDataType[];
}

// ---------------------------------------------------------------------------
// ProductTypesDataTypesTargetSystems CRUD
// ---------------------------------------------------------------------------

/**
 * Lists all TargetSystems assigned to a ProductType+DataType assignment, joined with TargetSystem name.
 */
export async function getTargetSystems(
    db: DBClient,
    productTypeIdentifier: UUIDType,
    dataTypeIdentifier: UUIDType,
): Promise<ProductTypeDataTypeTargetSystemWithDetails[]> {
    const rows = await db
        .select({
            productType: ProductTypesDataTypesTargetSystems.productType,
            dataType: ProductTypesDataTypesTargetSystems.dataType,
            targetSystem: ProductTypesDataTypesTargetSystems.targetSystem,
            name: ProductTypesDataTypesTargetSystems.name,
            targetSystemName: TargetSystems.name,
        })
        .from(ProductTypesDataTypesTargetSystems)
        .innerJoin(TargetSystems, eq(ProductTypesDataTypesTargetSystems.targetSystem, TargetSystems.identifier))
        .where(and(
            eq(ProductTypesDataTypesTargetSystems.productType, productTypeIdentifier),
            eq(ProductTypesDataTypesTargetSystems.dataType, dataTypeIdentifier),
        ));

    return rows as ProductTypeDataTypeTargetSystemWithDetails[];
}

/**
 * Assigns a TargetSystem to a ProductType+DataType assignment.
 */
export async function assignTargetSystem(
    db: DBClient,
    productTypeIdentifier: UUIDType,
    dataTypeIdentifier: UUIDType,
    targetSystemIdentifier: UUIDType,
): Promise<ProductTypesDataTypesTargetSystem[]> {
    const result = await db
        .insert(ProductTypesDataTypesTargetSystems)
        .values({
            productType: productTypeIdentifier,
            dataType: dataTypeIdentifier,
            targetSystem: targetSystemIdentifier,
        } as any)
        .onConflictDoNothing()
        .returning();

    if (result.length > 0) PubSub.publish(message_AssignProductTypeDataTypeTargetSystem, result[0]);
    return result as unknown as ProductTypesDataTypesTargetSystem[];
}

/**
 * Unassigns a TargetSystem from a ProductType+DataType assignment.
 */
export async function unassignTargetSystem(
    db: DBClient,
    productTypeIdentifier: UUIDType,
    dataTypeIdentifier: UUIDType,
    targetSystemIdentifier: UUIDType,
): Promise<ProductTypesDataTypesTargetSystem[]> {
    const existing = await db
        .delete(ProductTypesDataTypesTargetSystems)
        .where(and(
            eq(ProductTypesDataTypesTargetSystems.productType, productTypeIdentifier),
            eq(ProductTypesDataTypesTargetSystems.dataType, dataTypeIdentifier),
            eq(ProductTypesDataTypesTargetSystems.targetSystem, targetSystemIdentifier),
        ))
        .returning();

    existing.forEach(row => PubSub.publish(message_UnassignProductTypeDataTypeTargetSystem, row));
    return existing as unknown as ProductTypesDataTypesTargetSystem[];
}

/**
 * Updates mutable fields on a TargetSystem assignment (currently only `name`).
 */
export async function updateTargetSystemAssignment(
    db: DBClient,
    productTypeIdentifier: UUIDType,
    dataTypeIdentifier: UUIDType,
    targetSystemIdentifier: UUIDType,
    fields: Partial<Omit<NewProductTypesDataTypesTargetSystem, "productType" | "dataType" | "targetSystem">>,
): Promise<ProductTypesDataTypesTargetSystem[]> {
    const result = await db
        .update(ProductTypesDataTypesTargetSystems)
        .set({ ...fields, updatedAt: sql`now()` } as any)
        .where(and(
            eq(ProductTypesDataTypesTargetSystems.productType, productTypeIdentifier),
            eq(ProductTypesDataTypesTargetSystems.dataType, dataTypeIdentifier),
            eq(ProductTypesDataTypesTargetSystems.targetSystem, targetSystemIdentifier),
        ))
        .returning();

    result.forEach(row => PubSub.publish(message_UpdateProductTypeDataTypeTargetSystem, row));
    return result as unknown as ProductTypesDataTypesTargetSystem[];
}

// ---------------------------------------------------------------------------
// ProductTypesDataTypePermission CRUD
// ---------------------------------------------------------------------------

/**
 * Returns all permissions for a ProductType+DataType assignment, including the group name.
 */
export async function getPermissions(db: DBClient, assignmentIdentifier: UUIDType): Promise<ProductTypeDataTypePermissionWithGroup[]> {
    const rows = await db
        .select({
            productTypeDataTypeIdentifier: ProductTypesDataTypePermission.productTypeDataTypeIdentifier,
            groupIdentifier: ProductTypesDataTypePermission.groupIdentifier,
            role: ProductTypesDataTypePermission.role,
            createdAt: ProductTypesDataTypePermission.createdAt,
            createdBy: ProductTypesDataTypePermission.createdBy,
            showByDefault: ProductTypesDataTypePermission.showByDefault,
            groupName: Group.groupName,
        })
        .from(ProductTypesDataTypePermission)
        .innerJoin(Group, eq(ProductTypesDataTypePermission.groupIdentifier, Group.identifier))
        .where(eq(ProductTypesDataTypePermission.productTypeDataTypeIdentifier, assignmentIdentifier));

    return rows as ProductTypeDataTypePermissionWithGroup[];
}

/**
 * Grants a permission to a group for a ProductType+DataType assignment (upsert).
 */
export async function grantPermission(
    db: DBClient,
    user: UserSelectType,
    assignmentIdentifier: UUIDType,
    groupIdentifier: UUIDType,
    role: DataTypeGroupRoles,
    showByDefault: boolean = true,
): Promise<ProductTypesDataTypePermissionType[]> {
    const result = await db
        .insert(ProductTypesDataTypePermission)
        .values({
            productTypeDataTypeIdentifier: assignmentIdentifier,
            groupIdentifier: groupIdentifier,
            role: role,
            showByDefault: showByDefault,
            createdBy: user.identifier,
        } as any)
        .onConflictDoUpdate({
            target: [
                ProductTypesDataTypePermission.productTypeDataTypeIdentifier,
                ProductTypesDataTypePermission.groupIdentifier,
                ProductTypesDataTypePermission.role,
            ],
            set: { showByDefault: showByDefault, createdBy: user.identifier, createdAt: sql`now()` } as any,
        })
        .returning();

    if (result.length > 0) PubSub.publish(message_GrantProductTypeDataTypePermission, result[0]);
    return result as unknown as ProductTypesDataTypePermissionType[];
}

/**
 * Revokes (deletes) a permission assignment.
 */
export async function revokePermission(
    db: DBClient,
    assignmentIdentifier: UUIDType,
    groupIdentifier: UUIDType,
    role: string,
): Promise<ProductTypesDataTypePermissionType[]> {
    const existing = await db
        .delete(ProductTypesDataTypePermission)
        .where(and(
            eq(ProductTypesDataTypePermission.productTypeDataTypeIdentifier, assignmentIdentifier),
            eq(ProductTypesDataTypePermission.groupIdentifier, groupIdentifier),
            eq(ProductTypesDataTypePermission.role, role as any),
        ))
        .returning();

    existing.forEach(row => PubSub.publish(message_RevokeProductTypeDataTypePermission, row));
    return existing as unknown as ProductTypesDataTypePermissionType[];
}

/**
 * Updates the showByDefault flag on a permission.
 */
export async function updatePermission(
    db: DBClient,
    assignmentIdentifier: UUIDType,
    groupIdentifier: UUIDType,
    role: DataTypeGroupRoles,
    fields: Partial<Omit<NewProductTypesDataTypePermissionType, "productTypeDataTypeIdentifier" | "groupIdentifier" | "role" | "createdAt" | "createdBy">>,
): Promise<ProductTypesDataTypePermissionType[]> {
    const result = await db
        .update(ProductTypesDataTypePermission)
        .set({ ...fields, updatedAt: sql`now()` } as any)
        .where(and(
            eq(ProductTypesDataTypePermission.productTypeDataTypeIdentifier, assignmentIdentifier),
            eq(ProductTypesDataTypePermission.groupIdentifier, groupIdentifier),
            eq(ProductTypesDataTypePermission.role, role as any),
        ))
        .returning();

    result.forEach(row => PubSub.publish(message_UpdateProductTypeDataTypePermission, row));
    return result as unknown as ProductTypesDataTypePermissionType[];
}

// ---------------------------------------------------------------------------
// ProductTypesPermission CRUD (product-type-level, role "cancel")
// ---------------------------------------------------------------------------

/** ProductTypesPermission joined with Group name. */
export type ProductTypePermissionWithGroup = {
    productTypeIdentifier: string;
    groupIdentifier: string;
    role: string;
    createdAt: string;
    createdBy: string;
    groupName: string;
};

/**
 * Returns all product-type-level permissions for a product type, including the group name.
 */
export async function getProductTypePermissions(db: DBClient, productTypeIdentifier: UUIDType): Promise<ProductTypePermissionWithGroup[]> {
    const rows = await db
        .select({
            productTypeIdentifier: ProductTypesPermission.productTypeIdentifier,
            groupIdentifier: ProductTypesPermission.groupIdentifier,
            role: ProductTypesPermission.role,
            createdAt: ProductTypesPermission.createdAt,
            createdBy: ProductTypesPermission.createdBy,
            groupName: Group.groupName,
        })
        .from(ProductTypesPermission)
        .innerJoin(Group, eq(ProductTypesPermission.groupIdentifier, Group.identifier))
        .where(eq(ProductTypesPermission.productTypeIdentifier, productTypeIdentifier));

    return rows as ProductTypePermissionWithGroup[];
}

/**
 * Grants a product-type-level permission to a group (default role "cancel").
 * Checks for existing rows first since there is no unique constraint on the table.
 */
export async function grantProductTypePermission(
    db: DBClient,
    user: UserSelectType,
    productTypeIdentifier: UUIDType,
    groupIdentifier: UUIDType,
): Promise<ProductTypePermissionWithGroup[]> {
    const [existing] = await db
        .select({ groupIdentifier: ProductTypesPermission.groupIdentifier })
        .from(ProductTypesPermission)
        .where(and(
            eq(ProductTypesPermission.productTypeIdentifier, productTypeIdentifier),
            eq(ProductTypesPermission.groupIdentifier, groupIdentifier),
        ))
        .limit(1);

    if (existing) return [];

    const result = await db
        .insert(ProductTypesPermission)
        .values({
            productTypeIdentifier,
            groupIdentifier,
            role: "cancel",
            createdBy: user.identifier,
        } as any)
        .returning();

    if (result.length > 0) PubSub.publish(message_GrantProductTypePermission, result[0]);
    return result as unknown as ProductTypePermissionWithGroup[];
}

/**
 * Revokes (deletes) a product-type-level permission for a group.
 */
export async function revokeProductTypePermission(
    db: DBClient,
    productTypeIdentifier: UUIDType,
    groupIdentifier: UUIDType,
): Promise<ProductTypePermissionWithGroup[]> {
    const existing = await db
        .delete(ProductTypesPermission)
        .where(and(
            eq(ProductTypesPermission.productTypeIdentifier, productTypeIdentifier),
            eq(ProductTypesPermission.groupIdentifier, groupIdentifier),
        ))
        .returning();

    existing.forEach(row => PubSub.publish(message_RevokeProductTypePermission, row));
    return existing as unknown as ProductTypePermissionWithGroup[];
}

// ---------------------------------------------------------------------------
// ProductTypesDataTypePreviousApproval CRUD
// ---------------------------------------------------------------------------

/**
 * Lists all previous-approval dependencies for a ProductType+DataType assignment,
 * joined with the depends-on data type name.
 */
export async function getPreviousApprovals(
    db: DBClient,
    productTypeIdentifier: UUIDType,
    dataTypeIdentifier: UUIDType,
): Promise<{ dependsOnDataType: string; dependsOnDataTypeName: string }[]> {
    const rows = await db
        .select({
            dependsOnDataType: ProductTypesDataTypePreviousApproval.dependsOnDataType,
            dependsOnDataTypeName: DataTypeSchema.name,
        })
        .from(ProductTypesDataTypePreviousApproval)
        .innerJoin(DataTypeSchema, eq(ProductTypesDataTypePreviousApproval.dependsOnDataType, DataTypeSchema.identifier))
        .where(and(
            eq(ProductTypesDataTypePreviousApproval.productType, productTypeIdentifier),
            eq(ProductTypesDataTypePreviousApproval.dataType, dataTypeIdentifier),
        ));

    return rows;
}

/**
 * Builds a forward adjacency map from all previous-approval rows for a product type.
 * Maps dataType → dependsOnDataType[] (what does X depend on?).
 */
async function buildAdjacencyMap(
    db: DBClient,
    productTypeIdentifier: UUIDType,
): Promise<Map<string, string[]>> {
    const rows = await db
        .select({
            dataType: ProductTypesDataTypePreviousApproval.dataType,
            dependsOnDataType: ProductTypesDataTypePreviousApproval.dependsOnDataType,
        })
        .from(ProductTypesDataTypePreviousApproval)
        .where(eq(ProductTypesDataTypePreviousApproval.productType, productTypeIdentifier));

    const adj = new Map<string, string[]>();
    for (const row of rows) {
        const deps = adj.get(row.dataType) ?? [];
        deps.push(row.dependsOnDataType);
        adj.set(row.dataType, deps);
    }
    return adj;
}

/**
 * Checks whether adding dependency `searchFor → startAt` (i.e. dataType=searchFor,
 * dependsOnDataType=startAt) would create a cycle in the dependency graph.
 *
 * BFS forward from `startAt` along dependsOnDataType edges — if `searchFor` is
 * reachable, a cycle would be created.
 */
async function previousApprovalHasCycle(
    db: DBClient,
    productTypeIdentifier: UUIDType,
    startAt: UUIDType,
    searchFor: UUIDType,
): Promise<boolean> {
    const adj = await buildAdjacencyMap(db, productTypeIdentifier);

    const visited = new Set<string>();
    const queue = [startAt as string];
    visited.add(startAt as string);

    while (queue.length > 0) {
        const current = queue.shift()!;
        const deps = adj.get(current) ?? [];
        for (const dep of deps) {
            if (dep === (searchFor as string)) return true;
            if (!visited.has(dep)) {
                visited.add(dep);
                queue.push(dep);
            }
        }
    }

    return false;
}

/**
 * Adds a previous-approval dependency: dataType depends on dependsOnDataType.
 * Rejects self-dependencies and cycles.
 */
export async function addPreviousApproval(
    db: DBClient,
    productTypeIdentifier: UUIDType,
    dataTypeIdentifier: UUIDType,
    dependsOnDataTypeIdentifier: UUIDType,
): Promise<{ dependsOnDataType: string; dependsOnDataTypeName: string }> {
    if (dataTypeIdentifier === dependsOnDataTypeIdentifier) {
        throw new Error("A data type cannot depend on itself");
    }

    const hasCycle = await previousApprovalHasCycle(
        db, productTypeIdentifier, dependsOnDataTypeIdentifier, dataTypeIdentifier,
    );
    if (hasCycle) {
        throw new Error("Adding this dependency would create a cycle");
    }

    const result = await db
        .insert(ProductTypesDataTypePreviousApproval)
        .values({
            productType: productTypeIdentifier,
            dataType: dataTypeIdentifier,
            dependsOnDataType: dependsOnDataTypeIdentifier,
        } as any)
        .onConflictDoNothing()
        .returning();

    if (result.length === 0) {
        throw new Error("This previous approval dependency already exists");
    }

    // Load the data type name for the response
    const [dt] = await db
        .select({ name: DataTypeSchema.name })
        .from(DataTypeSchema)
        .where(eq(DataTypeSchema.identifier, dependsOnDataTypeIdentifier))
        .limit(1);

    PubSub.publish(message_AddPreviousApproval, result[0]);

    return {
        dependsOnDataType: dependsOnDataTypeIdentifier as string,
        dependsOnDataTypeName: dt?.name ?? (dependsOnDataTypeIdentifier as string),
    };
}

/**
 * Removes a previous-approval dependency.
 */
export async function removePreviousApproval(
    db: DBClient,
    productTypeIdentifier: UUIDType,
    dataTypeIdentifier: UUIDType,
    dependsOnDataTypeIdentifier: UUIDType,
): Promise<void> {
    const existing = await db
        .delete(ProductTypesDataTypePreviousApproval)
        .where(and(
            eq(ProductTypesDataTypePreviousApproval.productType, productTypeIdentifier),
            eq(ProductTypesDataTypePreviousApproval.dataType, dataTypeIdentifier),
            eq(ProductTypesDataTypePreviousApproval.dependsOnDataType, dependsOnDataTypeIdentifier),
        ))
        .returning();

    for (const row of existing) {
        PubSub.publish(message_RemovePreviousApproval, row);
    }
}

/**
 * Returns all data types that depend on a given data type (reverse lookup).
 * "Which data types have dependsOnDataType == Z?"
 */
export async function getDependants(
    db: DBClient,
    productTypeIdentifier: UUIDType,
    dependsOnDataTypeIdentifier: UUIDType,
): Promise<{ dataType: string }[]> {
    return db
        .select({ dataType: ProductTypesDataTypePreviousApproval.dataType })
        .from(ProductTypesDataTypePreviousApproval)
        .where(and(
            eq(ProductTypesDataTypePreviousApproval.productType, productTypeIdentifier),
            eq(ProductTypesDataTypePreviousApproval.dependsOnDataType, dependsOnDataTypeIdentifier),
        ));
}

