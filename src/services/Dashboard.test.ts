import { describe, expect, it } from "bun:test";
import { computePendingRequestsByGroup } from "@/services/Dashboard.ts";
import type { PendingRequestRoleRow } from "@/repo/ProductRequestRepo.ts";

function row(overrides: Partial<PendingRequestRoleRow> = {}): PendingRequestRoleRow {
    return {
        requestIdentifier: "req-1",
        isUpdateRequest: false,
        dataType: "dt-1",
        kind: "string",
        dataTypeConfig: null,
        productTypeConfig: null,
        value: "a value",
        defaultValue: null,
        approvedBy: null,
        editableOnUpdate: null,
        groupIdentifier: "group-1",
        groupName: "Group 1",
        role: "approver",
        ...overrides,
    };
}

describe("computePendingRequestsByGroup", () => {
    it("counts a request once per group even with multiple pending values", () => {
        const result = computePendingRequestsByGroup([
            row({ dataType: "dt-1" }),
            row({ dataType: "dt-2" }),
            row({ dataType: "dt-3" }),
        ]);

        expect(result).toEqual([{
            groupIdentifier: "group-1",
            groupName: "Group 1",
            pendingApproval: 1,
            pendingDataEntry: 0,
            total: 1,
        }]);
    });

    it("deduplicates data-type-level and product-type-level rows for the same role", () => {
        const result = computePendingRequestsByGroup([
            row(),
            row(),
        ]);

        expect(result[0]?.pendingApproval).toBe(1);
    });

    it("computes approval and data-entry buckets independently for one request", () => {
        const result = computePendingRequestsByGroup([
            row({ dataType: "dt-approval", role: "approver", value: "present" }),
            row({ dataType: "dt-entry", role: "writer", value: null }),
        ]);

        expect(result).toEqual([{
            groupIdentifier: "group-1",
            groupName: "Group 1",
            pendingApproval: 1,
            pendingDataEntry: 1,
            total: 2,
        }]);
    });

    it("ignores already approved values", () => {
        const result = computePendingRequestsByGroup([
            row({ role: "approver", approvedBy: "user-1" }),
            row({ role: "writer", value: null, approvedBy: "user-1" }),
        ]);

        expect(result).toEqual([]);
    });

    it("treats an empty value with a default as pending approval but not pending entry", () => {
        const result = computePendingRequestsByGroup([
            row({ role: "approver", value: null, defaultValue: "Fallback" }),
            row({ role: "approver", value: null, defaultValue: "null", requestIdentifier: "req-2" }),
        ]);

        expect(result[0]?.pendingApproval).toBe(1);
        expect(result[0]?.pendingDataEntry).toBe(0);
    });

    it("excludes entry when an update request is not editable on update", () => {
        const result = computePendingRequestsByGroup([
            row({ role: "writer", value: null, isUpdateRequest: true, editableOnUpdate: false, requestIdentifier: "req-false" }),
            row({ role: "writer", value: null, isUpdateRequest: true, editableOnUpdate: true, requestIdentifier: "req-true" }),
            row({ role: "writer", value: null, isUpdateRequest: true, editableOnUpdate: null, requestIdentifier: "req-null" }),
            row({ role: "writer", value: null, isUpdateRequest: false, editableOnUpdate: false, requestIdentifier: "req-create" }),
        ]);

        expect(result[0]?.pendingDataEntry).toBe(3);
    });

    it("ignores calculated data types", () => {
        const result = computePendingRequestsByGroup([
            row({ kind: "calculated", role: "approver", value: null }),
            row({ kind: "calculated", role: "writer", value: null }),
        ]);

        expect(result).toEqual([]);
    });

    it("honors boolean permitEmpty from data-type and product-type config", () => {
        const result = computePendingRequestsByGroup([
            row({ kind: "boolean", value: null, dataTypeConfig: { permitEmpty: true }, role: "approver" }),
            row({ kind: "boolean", value: null, dataTypeConfig: { permitEmpty: true }, productTypeConfig: { permitEmpty: false }, role: "writer", requestIdentifier: "req-2" }),
        ]);

        expect(result[0]?.pendingApproval).toBe(1);
        expect(result[0]?.pendingDataEntry).toBe(1);
    });

    it("sorts by total descending then group name ascending and removes zero totals", () => {
        const result = computePendingRequestsByGroup([
            row({ groupIdentifier: "b", groupName: "Beta", requestIdentifier: "req-b" }),
            row({ groupIdentifier: "a", groupName: "alpha", requestIdentifier: "req-a1" }),
            row({ groupIdentifier: "a", groupName: "alpha", requestIdentifier: "req-a2" }),
            row({ groupIdentifier: "z", groupName: "Zulu", requestIdentifier: "req-z" }),
            row({ groupIdentifier: "zero", groupName: "No work", approvedBy: "user-1" }),
        ]);

        expect(result.map((group) => group.groupIdentifier)).toEqual(["a", "b", "z"]);
        expect(result.map((group) => group.total)).toEqual([2, 1, 1]);
    });
});
