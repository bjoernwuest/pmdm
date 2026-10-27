import type { DBClient } from "@/services/DatabaseDriver.ts";
import {
    hasEffectiveValue,
    isApprovableValuePresent,
    resolveConfig,
    resolveMandatory,
} from "@/services/ProductRequestActions.ts";
import * as ScriptEngine from "@/services/ScriptEngine.ts";
import { DataTypeKind } from "@/types/DataTypeType.ts";
import type {
    DashboardGapField,
    DashboardGroupRef,
    OpenProductRequestGapAnalysis,
    OpenProductRequestOption,
} from "@/types/DashboardType.ts";
import {
    getProductRequestGapInputs,
    listDataTypeRoleGroupsForProductType,
    listOpenProductRequests,
    listPendingRequestRowsFromDataTypeRoles,
    listPendingRequestRowsFromProductTypeRoles,
    type PendingRequestRoleRow,
} from "@/repo/ProductRequestRepo.ts";
import { listPreviousApprovalsForProductTypes } from "@/repo/ProductTypeRepo.ts";

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
    const hasValue = hasEffectiveValue({
        value: row.value,
        defaultValue: row.defaultValue,
        kind: row.kind,
        config,
    });

    if (row.role === "approver" && hasValue) {
        group.approvalRequests.add(row.requestIdentifier);
    }

    if (row.role === "writer" && !hasValue && (!row.isUpdateRequest || row.editableOnUpdate !== false)) {
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

// ---------------------------------------------------------------------------
// Open-request gap analysis
// ---------------------------------------------------------------------------

/** A value row with its resolved mandatory flag, ready for pure assembly. */
export type GapFieldValueInput = {
    dataTypeIdentifier: string;
    dataTypeName: string;
    dataTypeKind: string;
    dataTypeDisabled: boolean;
    config: Record<string, unknown> | null;
    mandatory: boolean;
    value: unknown;
    defaultValue: unknown;
    approvedBy: string | null;
    editableOnUpdate: boolean | null;
};

export type PreviousApprovalRef = {
    dependsOnDataType: string;
    dependsOnDataTypeName: string;
};

export type GapRoleGroupRow = {
    dataType: string;
    role: string;
    groupIdentifier: string;
    groupName: string;
};

export type GapAssemblyInput = {
    isUpdateRequest: boolean;
    fields: readonly GapFieldValueInput[];
    previousApprovalsByDataType: ReadonlyMap<string, readonly PreviousApprovalRef[]>;
    approvedSet: ReadonlySet<string>;
    roleGroups: readonly GapRoleGroupRow[];
};

function groupsFor(
    roleGroups: readonly GapRoleGroupRow[],
    dataTypeIdentifier: string,
    role: string,
): DashboardGroupRef[] {
    const byIdentifier = new Map<string, DashboardGroupRef>();
    for (const row of roleGroups) {
        if (row.dataType !== dataTypeIdentifier || row.role !== role) continue;
        if (!byIdentifier.has(row.groupIdentifier)) {
            byIdentifier.set(row.groupIdentifier, {
                identifier: row.groupIdentifier,
                name: row.groupName,
            });
        }
    }
    return [...byIdentifier.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Pure field-row assembly for the dashboard gap analysis. The caller resolves
 * mandatory scripts (they depend on the viewer); this helper applies the
 * actionability rules, drops fully satisfied fields, and attaches the
 * responsible groups.
 */
export function assembleGapFields(input: GapAssemblyInput): DashboardGapField[] {
    const fields: DashboardGapField[] = [];

    for (const field of input.fields) {
        if (field.dataTypeDisabled) continue;
        if (field.dataTypeKind === DataTypeKind.Calculated) continue;

        // An approved field is no longer a gap, regardless of the stored value.
        if (field.approvedBy !== null) continue;

        const valueMissing = !hasEffectiveValue({
            value: field.value,
            defaultValue: field.defaultValue,
            kind: field.dataTypeKind,
            config: field.config,
        }) && (!input.isUpdateRequest || (field.editableOnUpdate ?? true));

        const dependencies = input.previousApprovalsByDataType.get(field.dataTypeIdentifier) ?? [];
        const blockedBy = dependencies.filter((dep) => !input.approvedSet.has(dep.dependsOnDataType));
        const depsMet = blockedBy.length === 0;

        let approvalState: DashboardGapField["approvalState"];
        if (!depsMet) {
            approvalState = "blocked";
        } else if (!isApprovableValuePresent({
            mandatory: field.mandatory,
            value: field.value,
            defaultValue: field.defaultValue,
            kind: field.dataTypeKind,
            config: field.config,
        })) {
            approvalState = "waiting_for_value";
        } else {
            approvalState = "pending";
        }

        fields.push({
            dataTypeIdentifier: field.dataTypeIdentifier,
            dataTypeName: field.dataTypeName,
            dataTypeKind: field.dataTypeKind,
            mandatory: field.mandatory,
            valueMissing,
            approvalState,
            approvalBlockedBy: blockedBy.map((dep) => dep.dependsOnDataTypeName),
            providerGroups: groupsFor(input.roleGroups, field.dataTypeIdentifier, "writer"),
            approverGroups: groupsFor(input.roleGroups, field.dataTypeIdentifier, "approver"),
        });
    }

    return fields.sort((a, b) => a.dataTypeName.localeCompare(b.dataTypeName));
}

/** Returns the open product requests available for dashboard gap analysis. */
export async function getOpenProductRequestOptions(db: DBClient): Promise<OpenProductRequestOption[]> {
    return listOpenProductRequests(db);
}

/**
 * Builds the gap analysis for one open product request from the viewer's
 * perspective. Returns null when the request does not exist or is no longer open.
 */
export async function getOpenRequestGapAnalysis(
    db: DBClient,
    viewerUserId: string,
    requestIdentifier: string,
): Promise<OpenProductRequestGapAnalysis | null> {
    const inputs = await getProductRequestGapInputs(db, requestIdentifier);
    if (!inputs || inputs.request.status !== "open") return null;

    const [previousApprovals, roleGroups] = await Promise.all([
        listPreviousApprovalsForProductTypes(db, [inputs.request.productType]),
        listDataTypeRoleGroupsForProductType(db, inputs.request.productType),
    ]);

    const previousApprovalsByDataType = new Map<string, PreviousApprovalRef[]>();
    for (const dependency of previousApprovals) {
        const list = previousApprovalsByDataType.get(dependency.dataType) ?? [];
        list.push({
            dependsOnDataType: dependency.dependsOnDataType,
            dependsOnDataTypeName: dependency.dependsOnDataTypeName,
        });
        previousApprovalsByDataType.set(dependency.dataType, list);
    }

    const approvedSet = new Set<string>(
        inputs.values.filter((value) => value.approvedBy !== null).map((value) => value.dataTypeIdentifier),
    );

    const scriptContext = ScriptEngine.buildContext(db, {
        cause: "product_request_update",
        productRequestIdentifier: requestIdentifier,
        principal: { userId: viewerUserId, apiKeyIdentifier: null, isApiKey: false },
    });

    const fields: GapFieldValueInput[] = [];
    for (const value of inputs.values) {
        // Disabled and calculated fields never appear as gap rows; skip their
        // mandatory scripts as well.
        if (value.dataTypeDisabled || value.dataTypeKind === DataTypeKind.Calculated) continue;

        const mandatory = await resolveMandatory(
            db,
            value.dataTypeMandatory,
            value.dataTypeMandatoryScript,
            value.productTypeMandatory,
            value.productTypeMandatoryScript,
            scriptContext,
            value.dataTypeIdentifier,
        );
        fields.push({
            dataTypeIdentifier: value.dataTypeIdentifier,
            dataTypeName: value.dataTypeName,
            dataTypeKind: value.dataTypeKind,
            dataTypeDisabled: value.dataTypeDisabled,
            config: resolveConfig(value.dataTypeConfig, value.productTypeConfig),
            mandatory,
            value: value.value,
            defaultValue: value.defaultValue,
            approvedBy: value.approvedBy,
            editableOnUpdate: value.editableOnUpdate,
        });
    }

    return {
        identifier: inputs.request.identifier,
        productNumber: inputs.request.productNumber,
        productTypeName: inputs.request.productTypeName,
        createdByName: inputs.request.createdByName,
        productToUpdate: inputs.request.productToUpdate,
        fields: assembleGapFields({
            isUpdateRequest: inputs.request.productToUpdate !== null,
            fields,
            previousApprovalsByDataType,
            approvedSet,
            roleGroups,
        }),
    };
}
