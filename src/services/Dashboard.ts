import type { DBClient } from "@/services/DatabaseDriver.ts";
import { isEmptyValue, resolveConfig } from "@/services/ProductRequestActions.ts";
import { DataTypeKind } from "@/types/DataTypeType.ts";
import {
    listPendingRequestRowsFromDataTypeRoles,
    listPendingRequestRowsFromProductTypeRoles,
    type PendingRequestRoleRow,
} from "@/repo/ProductRequestRepo.ts";

export type PendingRequestsByGroup = {
    groupIdentifier: string;
    groupName: string;
    pendingApproval: number;
    pendingDataEntry: number;
    total: number;
};

type GroupCounts = {
    groupName: string;
    approvalRequests: Set<string>;
    entryRequests: Set<string>;
};

function defaultIsPresent(defaultValue: unknown): boolean {
    return defaultValue !== null && defaultValue !== undefined && defaultValue !== "null";
}

function addPendingRoleRow(counts: Map<string, GroupCounts>, row: PendingRequestRoleRow): void {
    if (row.approvedBy !== null) return;
    if (row.kind === DataTypeKind.Calculated) return;

    let group = counts.get(row.groupIdentifier);
    if (!group) {
        group = {
            groupName: row.groupName,
            approvalRequests: new Set<string>(),
            entryRequests: new Set<string>(),
        };
        counts.set(row.groupIdentifier, group);
    }

    const config = resolveConfig(row.dataTypeConfig, row.productTypeConfig);
    const valueIsEmpty = isEmptyValue(row.value, row.kind, config);

    if (row.role === "approver" && (!valueIsEmpty || defaultIsPresent(row.defaultValue))) {
        group.approvalRequests.add(row.requestIdentifier);
    }

    if (row.role === "writer" && valueIsEmpty && (!row.isUpdateRequest || row.editableOnUpdate !== false)) {
        group.entryRequests.add(row.requestIdentifier);
    }
}

/**
 * Finalizes dashboard pending counts from the filtered value×role rows.
 *
 * The database resolves joins and role assignments; this function performs the
 * unioned distinct-request aggregation that Drizzle cannot express cleanly.
 */
export function computePendingRequestsByGroup(rows: readonly PendingRequestRoleRow[]): PendingRequestsByGroup[] {
    const counts = new Map<string, GroupCounts>();
    for (const row of rows) addPendingRoleRow(counts, row);

    const result: PendingRequestsByGroup[] = [];
    for (const [groupIdentifier, group] of counts) {
        const pendingApproval = group.approvalRequests.size;
        const pendingDataEntry = group.entryRequests.size;
        const total = pendingApproval + pendingDataEntry;
        if (total === 0) continue;
        result.push({
            groupIdentifier,
            groupName: group.groupName,
            pendingApproval,
            pendingDataEntry,
            total,
        });
    }

    return result.sort((a, b) => {
        if (a.total !== b.total) return b.total - a.total;
        const byName = a.groupName.localeCompare(b.groupName, undefined, { sensitivity: "base" });
        if (byName !== 0) return byName;
        return a.groupIdentifier.localeCompare(b.groupIdentifier);
    });
}

/** Loads and finalizes pending product request counts per group. */
export async function getPendingRequestsByGroup(db: DBClient): Promise<PendingRequestsByGroup[]> {
    const [dataTypeRoles, productTypeRoles] = await Promise.all([
        listPendingRequestRowsFromDataTypeRoles(db),
        listPendingRequestRowsFromProductTypeRoles(db),
    ]);
    return computePendingRequestsByGroup([...dataTypeRoles, ...productTypeRoles]);
}
