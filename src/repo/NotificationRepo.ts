import type { DBClient } from "@/services/DatabaseDriver.ts";
import { ProductRequests, ProductRequestsValues } from "@/schema/ProductRequestSchema.ts";
import { ProductTypes, ProductTypesDataTypes, ProductTypesDataTypePermission } from "@/schema/ProductTypeSchema.ts";
import { DataTypeSchema, DataTypePermission } from "@/schema/DataTypeSchema.ts";
import { User, UserGroup, Group } from "@/schema/UserSchema.ts";
import { eq, and, inArray, sql } from "drizzle-orm";

import {
    isEmptyValue,
    resolveRequestorCanEdit,
    resolveMandatory,
    canApproveProductRequestValue,
} from "@/services/ProductRequestActions.ts";
import * as ScriptEngine from "@/services/ScriptEngine.ts";

export type AwaitingItem = {
    requestId: string;
    productNumber: string;
    productTypeName: string;
};

export type TransitionItem = {
    requestId: string;
    productNumber: string;
    newStatus: string;
    productType: string;
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
        productType: r.productType!,
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

    // Per-run cache for resolved mandatory flags used by the approver branch,
    // keyed by `${requestId}:${dataType}:${userId}` (the script principal is
    // the candidate approver, so results differ per user).
    const mandatoryCache = new Map<string, boolean>();

    const openPRs = await db
        .select({
            requestId: ProductRequests.identifier,
            productNumber: ProductRequests.productNumber,
            productType: ProductRequests.productType,
            productToUpdate: ProductRequests.productToUpdate,
            productTypeName: ProductTypes.name,
            createdBy: ProductRequests.createdBy,
            creatorDisabled: User.disabled,
        })
        .from(ProductRequests)
        .leftJoin(ProductTypes, eq(ProductRequests.productType, ProductTypes.identifier))
        .leftJoin(User, eq(ProductRequests.createdBy, User.identifier))
        .where(eq(ProductRequests.status, "open"));

    if (openPRs.length === 0) return result;

    for (const pr of openPRs) {
        const values = await db
            .select({
                dataType: ProductRequestsValues.dataType,
                value: ProductRequestsValues.value,
                defaultValue: ProductRequestsValues.defaultValue,
                approvedBy: ProductRequestsValues.approvedBy,
                dataTypeKind: DataTypeSchema.kind,
                dataTypeConfig: DataTypeSchema.config,
                dataTypeDisabled: DataTypeSchema.disabled,
                requestorCanEdit: DataTypeSchema.requestorCanEdit,
                requestorCanEditScript: DataTypeSchema.requestorCanEdit_script,
                dataTypeMandatory: DataTypeSchema.mandatory,
                dataTypeMandatoryScript: DataTypeSchema.mandatory_script,
                ptConfig: ProductTypesDataTypes.config,
                ptRequestorCanEdit: ProductTypesDataTypes.requestorCanEdit,
                ptRequestorCanEditScript: ProductTypesDataTypes.requestorCanEdit_script,
                ptEditableOnUpdate: ProductTypesDataTypes.editableOnUpdate,
                ptMandatory: ProductTypesDataTypes.mandatory,
                ptMandatoryScript: ProductTypesDataTypes.mandatory_script,
            })
            .from(ProductRequestsValues)
            .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
            .leftJoin(ProductTypesDataTypes, and(
                eq(ProductTypesDataTypes.productType, pr.productType!),
                eq(ProductTypesDataTypes.dataType, ProductRequestsValues.dataType),
            ))
            .where(eq(ProductRequestsValues.productRequest, pr.requestId!));

        const isUpdateRequest = !!pr.productToUpdate;

        // Script context for requestorCanEdit evaluations of the request
        // creator (built once per PR; resolveRequestorCanEdit scopes per data type).
        const creatorActive = pr.createdBy != null && pr.creatorDisabled !== true;
        const creatorCtx = creatorActive
            ? ScriptEngine.buildContext(db, {
                cause: "product_request_update",
                productRequestIdentifier: pr.requestId!,
                principal: { userId: pr.createdBy, apiKeyIdentifier: null, isApiKey: false },
            })
            : null;

        for (const v of values) {
            const dtId = v.dataType!;

            // Disabled data types never contribute action items (mirrors the
            // list/detail filters).
            if (v.dataTypeDisabled) continue;

            const writerUserIds = await resolveUsersWithRole(db, pr.productType!, dtId, "writer");
            const approverUserIds = await resolveUsersWithRole(db, pr.productType!, dtId, "approver");

            const resolvedConfig = { ...((v.dataTypeConfig ?? {}) as Record<string, unknown>), ...((v.ptConfig ?? {}) as Record<string, unknown>) };
            const isEmpty = isEmptyValue(v.value, v.dataTypeKind!, resolvedConfig);
            // For update requests, values not editable on update never need input
            const provideGateOpen = !isUpdateRequest || (v.ptEditableOnUpdate ?? true);

            for (const userId of writerUserIds) {
                if (provideGateOpen && isEmpty) {
                    addToResult(result, userId, "awaitingProvide", {
                        requestId: pr.requestId!,
                        productNumber: pr.productNumber,
                        productTypeName: pr.productTypeName ?? "",
                    });
                }
            }

            // The request creator may provide values without writer role when
            // requestorCanEdit resolves to true and they hold at least one role
            // on the data type. This is the `canEdit` clause of
            // `canEditProductRequestValue` (hasWriterRole handled above;
            // requestorCanEdit && isRequestCreator && userRoles.length > 0 here).
            if (provideGateOpen && isEmpty && creatorCtx && pr.createdBy) {
                const viewerUserIds = await resolveUsersWithRole(db, pr.productType!, dtId, "viewer");
                const creatorHasAnyRole = writerUserIds.includes(pr.createdBy)
                    || approverUserIds.includes(pr.createdBy)
                    || viewerUserIds.includes(pr.createdBy);
                const reqEdit = creatorHasAnyRole && await resolveRequestorCanEdit(
                    db,
                    v.requestorCanEdit, v.requestorCanEditScript,
                    v.ptRequestorCanEdit ?? null, v.ptRequestorCanEditScript ?? null,
                    creatorCtx, dtId,
                );
                if (reqEdit) {
                    addToResult(result, pr.createdBy, "awaitingProvide", {
                        requestId: pr.requestId!,
                        productNumber: pr.productNumber,
                        productTypeName: pr.productTypeName ?? "",
                    });
                }
            }

            // Approve actionability. For non-empty values mandatory is
            // irrelevant, so every eligible approver is included. For empty
            // values the mandatory flag is resolved per candidate approver
            // (principal = approver) and cached for this run.
            for (const userId of approverUserIds) {
                let mandatory = false;
                if (isEmpty) {
                    const cacheKey = `${pr.requestId!}:${dtId}:${userId}`;
                    const cached = mandatoryCache.get(cacheKey);
                    if (cached !== undefined) {
                        mandatory = cached;
                    } else {
                        const approverCtx = ScriptEngine.buildContext(db, {
                            cause: "product_request_approve",
                            productRequestIdentifier: pr.requestId!,
                            principal: { userId, apiKeyIdentifier: null, isApiKey: false },
                        });
                        mandatory = await resolveMandatory(
                            db,
                            v.dataTypeMandatory, v.dataTypeMandatoryScript,
                            v.ptMandatory ?? null, v.ptMandatoryScript ?? null,
                            approverCtx, dtId,
                        );
                        mandatoryCache.set(cacheKey, mandatory);
                    }
                }
                if (canApproveProductRequestValue({
                    hasApproverRole: true,
                    approvedBy: v.approvedBy ?? null,
                    kind: v.dataTypeKind!,
                    mandatory,
                    value: v.value,
                    defaultValue: v.defaultValue,
                    config: resolvedConfig,
                })) {
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
 * Uses the same union semantics as the permission concept's edit path
 * ({@link buildPermissionLookup} / getEffectivePermissions in ProductRequestRepo.ts):
 * a user holds the role when ANY of their groups grants it at PT level OR at DT level.
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

    const groupIds = new Set<string>();

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
        for (const p of ptPerms) groupIds.add(p.groupIdentifier);
    }

    const dtPerms = await db
        .select({ groupIdentifier: DataTypePermission.groupIdentifier })
        .from(DataTypePermission)
        .where(
            and(
                eq(DataTypePermission.dataTypeIdentifier, dataTypeIdentifier),
                eq(DataTypePermission.role, role as any),
            ),
        );
    for (const p of dtPerms) groupIds.add(p.groupIdentifier);

    if (groupIds.size === 0) return [];

    const userRows = await db
        .select({ userId: UserGroup.userIdentifier })
        .from(UserGroup)
        .innerJoin(User, and(eq(UserGroup.userIdentifier, User.identifier), eq(User.disabled, false)))
        .where(inArray(UserGroup.groupIdentifier, [...groupIds]));

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

            const viewerIds = await resolveUsersWithRole(db, t.productType, dtId, "viewer");
            const writerIds = await resolveUsersWithRole(db, t.productType, dtId, "writer");
            const approverIds = await resolveUsersWithRole(db, t.productType, dtId, "approver");
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
 * Returns the set of active (non-disabled) user IDs holding at least one
 * writer or approver permission anywhere (DT-level or PT-level). Used to gate
 * digest delivery: pure viewers receive no email (design/notification.md §6).
 */
export async function getUsersWithWriterOrApprover(db: DBClient): Promise<Set<string>> {
    const result = new Set<string>();

    const dtRows = await db
        .selectDistinct({ userId: UserGroup.userIdentifier })
        .from(UserGroup)
        .innerJoin(User, and(eq(UserGroup.userIdentifier, User.identifier), eq(User.disabled, false)))
        .innerJoin(DataTypePermission, and(
            eq(UserGroup.groupIdentifier, DataTypePermission.groupIdentifier),
            inArray(DataTypePermission.role, ["writer", "approver"]),
        ));
    for (const r of dtRows) result.add(r.userId);

    const ptRows = await db
        .selectDistinct({ userId: UserGroup.userIdentifier })
        .from(UserGroup)
        .innerJoin(User, and(eq(UserGroup.userIdentifier, User.identifier), eq(User.disabled, false)))
        .innerJoin(ProductTypesDataTypePermission, and(
            eq(UserGroup.groupIdentifier, ProductTypesDataTypePermission.groupIdentifier),
            inArray(ProductTypesDataTypePermission.role, ["writer", "approver"]),
        ));
    for (const r of ptRows) result.add(r.userId);

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
