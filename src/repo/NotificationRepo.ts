import type { DBClient } from "@/services/DatabaseDriver.ts";
import { ProductRequests, ProductRequestsValues } from "@/schema/ProductRequestSchema.ts";
import { ProductTypes, ProductTypesDataTypes, ProductTypesDataTypePermission } from "@/schema/ProductTypeSchema.ts";
import { DataTypeSchema, DataTypePermission } from "@/schema/DataTypeSchema.ts";
import { DataTypeKind } from "@/types/DataTypeType.ts";
import { User, UserGroup, Group } from "@/schema/UserSchema.ts";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";

export type AwaitingItem = {
    requestId: string;
    productNumber: string;
    productTypeName: string;
};

export type TransitionItem = {
    requestId: string;
    productNumber: string;
    newStatus: string;
    productTypeName: string;
};

/**
 * Queries product requests in importing/done/cancelled status that were updated since lastDigestAt.
 */
export async function getTransitionedProductRequests(
    db: DBClient,
    lastDigestAt: string | null,
): Promise<TransitionItem[]> {
    const rows = await db
        .select({
            requestId: ProductRequests.identifier,
            productNumber: ProductRequests.productNumber,
            status: ProductRequests.status,
            productType: ProductRequests.productType,
            productTypeName: ProductTypes.name,
        })
        .from(ProductRequests)
        .leftJoin(ProductTypes, eq(ProductRequests.productType, ProductTypes.identifier))
        .where(
            and(
                inArray(ProductRequests.status, ["importing", "done", "cancelled"]),
                lastDigestAt
                    ? sql`${ProductRequests.updatedAt} > ${lastDigestAt}::timestamptz`
                    : undefined,
            ),
        )
        .orderBy(sql`${ProductRequests.updatedAt} ASC`);

    return rows.map((r) => ({
        requestId: r.requestId!,
        productNumber: r.productNumber,
        newStatus: r.status,
        productTypeName: r.productTypeName ?? "",
    }));
}

/**
 * Returns a map from userId to their awaiting items.
 * Uses bulk group-based permission resolution for efficiency.
 */
export async function getAwaitingPerUser(
    db: DBClient,
): Promise<Map<string, { awaitingProvide: AwaitingItem[]; awaitingApprove: AwaitingItem[] }>> {
    const result = new Map<string, { awaitingProvide: AwaitingItem[]; awaitingApprove: AwaitingItem[] }>();

    const openPRs = await db
        .select({
            requestId: ProductRequests.identifier,
            productNumber: ProductRequests.productNumber,
            productType: ProductRequests.productType,
            productToUpdate: ProductRequests.productToUpdate,
            productTypeName: ProductTypes.name,
        })
        .from(ProductRequests)
        .leftJoin(ProductTypes, eq(ProductRequests.productType, ProductTypes.identifier))
        .where(eq(ProductRequests.status, "open"));

    if (openPRs.length === 0) return result;

    const productTypes = [...new Set(openPRs.map((p) => p.productType!))];

    for (const pr of openPRs) {
        const values = await db
            .select({
                dataType: ProductRequestsValues.dataType,
                value: ProductRequestsValues.value,
                approvedBy: ProductRequestsValues.approvedBy,
                dataTypeKind: DataTypeSchema.kind,
            })
            .from(ProductRequestsValues)
            .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
            .where(eq(ProductRequestsValues.productRequest, pr.requestId!));

        const isUpdateRequest = !!pr.productToUpdate;

        for (const v of values) {
            const dtId = v.dataType!;

            const writerUserIds = await resolveUsersWithRole(db, pr.productType!, dtId, "writer");
            const approverUserIds = await resolveUsersWithRole(db, pr.productType!, dtId, "approver");

            const isTriStateBoolean =
                v.dataTypeKind === DataTypeKind.Boolean &&
                v.value === null;

            for (const userId of writerUserIds) {
                if (v.value === null && !isTriStateBoolean) {
                    addToResult(result, userId, "awaitingProvide", {
                        requestId: pr.requestId!,
                        productNumber: pr.productNumber,
                        productTypeName: pr.productTypeName ?? "",
                    });
                }
            }

            for (const userId of approverUserIds) {
                if (v.approvedBy === null && v.dataTypeKind !== DataTypeKind.Calculated) {
                    addToResult(result, userId, "awaitingApprove", {
                        requestId: pr.requestId!,
                        productNumber: pr.productNumber,
                        productTypeName: pr.productTypeName ?? "",
                    });
                }
            }
        }
    }

    return result;
}

/**
 * Resolves user IDs that have a given role on a data type within a product type context.
 * Checks ProductTypesDataTypePermission first, falls back to DataTypePermission.
 */
async function resolveUsersWithRole(
    db: DBClient,
    productTypeIdentifier: string,
    dataTypeIdentifier: string,
    role: string,
): Promise<string[]> {
    const assignment = await db
        .select({ identifier: ProductTypesDataTypes.identifier })
        .from(ProductTypesDataTypes)
        .where(
            and(
                eq(ProductTypesDataTypes.productType, productTypeIdentifier),
                eq(ProductTypesDataTypes.dataType, dataTypeIdentifier),
            ),
        )
        .limit(1);

    let groupIds: string[] = [];

    if (assignment.length > 0) {
        const ptPerms = await db
            .select({ groupIdentifier: ProductTypesDataTypePermission.groupIdentifier })
            .from(ProductTypesDataTypePermission)
            .where(
                and(
                    eq(ProductTypesDataTypePermission.productTypeDataTypeIdentifier, assignment[0]!.identifier!),
                    eq(ProductTypesDataTypePermission.role, role as any),
                ),
            );
        groupIds = ptPerms.map((p) => p.groupIdentifier);
    }

    if (groupIds.length === 0) {
        const dtPerms = await db
            .select({ groupIdentifier: DataTypePermission.groupIdentifier })
            .from(DataTypePermission)
            .where(
                and(
                    eq(DataTypePermission.dataTypeIdentifier, dataTypeIdentifier),
                    eq(DataTypePermission.role, role as any),
                ),
            );
        groupIds = dtPerms.map((p) => p.groupIdentifier);
    }

    if (groupIds.length === 0) return [];

    const userRows = await db
        .select({ userId: UserGroup.userIdentifier })
        .from(UserGroup)
        .innerJoin(User, and(eq(UserGroup.userIdentifier, User.identifier), eq(User.disabled, false)))
        .where(inArray(UserGroup.groupIdentifier, groupIds));

    return [...new Set(userRows.map((u) => u.userId))];
}

function addToResult(
    map: Map<string, { awaitingProvide: AwaitingItem[]; awaitingApprove: AwaitingItem[] }>,
    userId: string,
    kind: "awaitingProvide" | "awaitingApprove",
    item: AwaitingItem,
) {
    if (!map.has(userId)) {
        map.set(userId, { awaitingProvide: [], awaitingApprove: [] });
    }
    const entry = map.get(userId)!;
    const list = entry[kind];
    if (!list.some((e) => e.requestId === item.requestId)) {
        list.push(item);
    }
}

/**
 * Given transitioned PRs, determines which users should be notified about each.
 * Includes users with ANY permission (viewer, writer, or approver).
 */
export async function getTransitionsPerUser(
    db: DBClient,
    transitions: TransitionItem[],
): Promise<Map<string, TransitionItem[]>> {
    const result = new Map<string, TransitionItem[]>();

    for (const t of transitions) {
        const values = await db
            .select({ dataType: ProductRequestsValues.dataType })
            .from(ProductRequestsValues)
            .where(eq(ProductRequestsValues.productRequest, t.requestId));

        for (const v of values) {
            const dtId = v.dataType!;

            const viewerIds = await resolveUsersWithRole(db, t.productTypeName ? "" : "", dtId, "viewer");
            const writerIds = await resolveUsersWithRole(db, t.productTypeName ? "" : "", dtId, "writer");
            const approverIds = await resolveUsersWithRole(db, t.productTypeName ? "" : "", dtId, "approver");
            const allUserIds = new Set([...viewerIds, ...writerIds, ...approverIds]);

            for (const userId of allUserIds) {
                if (!result.has(userId)) result.set(userId, []);
                const list = result.get(userId)!;
                if (!list.some((e) => e.requestId === t.requestId && e.newStatus === t.newStatus)) {
                    list.push(t);
                }
            }
        }
    }

    return result;
}

/**
 * Returns users who belong to at least one group that has any permission on any data type.
 */
export async function getUsersWithRelevantGroups(db: DBClient): Promise<{ identifier: string; email: string | null; firstName: string; lastName: string }[]> {
    const rows = await db
        .selectDistinct({
            identifier: User.identifier,
            email: User.email,
            firstName: User.firstName,
            lastName: User.lastName,
        })
        .from(User)
        .innerJoin(UserGroup, eq(User.identifier, UserGroup.userIdentifier))
        .where(eq(User.disabled, false));

    return rows.map((r) => ({
        identifier: r.identifier!,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
    }));
}
