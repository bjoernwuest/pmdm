import { describe, expect, it } from "bun:test";
import {
    buildEffectiveProductTypePermissions,
    normalizeEffectiveRoles,
    type EffectiveProductTypeSource,
} from "@/services/EffectivePermissions.ts";
import type { AssignedDataTypeForProductType } from "@/repo/ProductTypeRepo.ts";

function productType(overrides: Partial<EffectiveProductTypeSource> = {}): EffectiveProductTypeSource {
    return {
        identifier: "pt-1",
        name: "Product type 1",
        description: null,
        requestorCanCancel: false,
        ...overrides,
    };
}

function assignment(overrides: Partial<AssignedDataTypeForProductType> = {}): AssignedDataTypeForProductType {
    return {
        productType: "pt-1",
        dataType: "dt-1",
        dataTypeName: "Data type 1",
        dataTypeKind: "string",
        editableOnUpdate: true,
        ...overrides,
    };
}

function roleLookup(entries: Record<string, string[]>) {
    return (productTypeIdentifier: string, dataTypeIdentifier: string): readonly string[] =>
        entries[`${productTypeIdentifier}:${dataTypeIdentifier}`] ?? [];
}

function build(
    roles: Record<string, string[]>,
    overrides: {
        productTypes?: EffectiveProductTypeSource[];
        assignments?: AssignedDataTypeForProductType[];
        cancelAll?: string[];
    } = {},
) {
    return buildEffectiveProductTypePermissions(
        overrides.productTypes ?? [productType()],
        overrides.assignments ?? [assignment()],
        roleLookup(roles),
        new Set(overrides.cancelAll ?? []),
    );
}

describe("normalizeEffectiveRoles", () => {
    it("orders roles canonically, deduplicates and drops unknown values", () => {
        expect(normalizeEffectiveRoles(["approver", "viewer", "writer", "viewer", "owner"]))
            .toEqual(["viewer", "writer", "approver"]);
    });
});

describe("buildEffectiveProductTypePermissions", () => {
    it("grants read only for a viewer", () => {
        const [result] = build({ "pt-1:dt-1": ["viewer"] });

        expect(result!.dataTypes[0]).toMatchObject({ canRead: true, canWrite: false, canApprove: false });
    });

    it("grants read and write for a writer", () => {
        const [result] = build({ "pt-1:dt-1": ["writer"] });

        expect(result!.dataTypes[0]).toMatchObject({ canRead: true, canWrite: true, canApprove: false });
    });

    it("grants read and approve for an approver", () => {
        const [result] = build({ "pt-1:dt-1": ["approver"] });

        expect(result!.dataTypes[0]).toMatchObject({ canRead: true, canWrite: false, canApprove: true });
    });

    it("keeps writer and approver roles visible on calculated data types but not actionable", () => {
        const [result] = build(
            { "pt-1:dt-1": ["writer", "approver"] },
            { assignments: [assignment({ dataTypeKind: "calculated" })] },
        );

        expect(result!.dataTypes[0]).toMatchObject({
            roles: ["writer", "approver"],
            canRead: true,
            canWrite: false,
            canApprove: false,
        });
    });

    it("keeps a data type row with no roles and disables every capability", () => {
        const [result] = build({});

        expect(result!.dataTypes).toHaveLength(1);
        expect(result!.dataTypes[0]).toMatchObject({
            roles: [],
            canRead: false,
            canWrite: false,
            canApprove: false,
        });
    });

    it("returns product types without roles or cancel rights", () => {
        const [result] = build({}, { assignments: [] });

        expect(result).toMatchObject({
            identifier: "pt-1",
            cancelAllRequests: false,
            cancelOwnRequests: false,
            dataTypes: [],
        });
    });

    it("returns product types with no assigned data types as an empty matrix", () => {
        const [result] = build({}, { assignments: [] });

        expect(result!.dataTypes).toEqual([]);
    });

    it("distinguishes cancel all, cancel own and no cancel", () => {
        const result = build({}, {
            productTypes: [
                productType({ identifier: "pt-all", name: "All", requestorCanCancel: true }),
                productType({ identifier: "pt-own", name: "Own", requestorCanCancel: true }),
                productType({ identifier: "pt-none", name: "None", requestorCanCancel: false }),
            ],
            assignments: [],
            cancelAll: ["pt-all"],
        });

        expect(result.map((entry) => ({
            identifier: entry.identifier,
            cancelAllRequests: entry.cancelAllRequests,
            cancelOwnRequests: entry.cancelOwnRequests,
        }))).toEqual([
            { identifier: "pt-all", cancelAllRequests: true, cancelOwnRequests: true },
            { identifier: "pt-none", cancelAllRequests: false, cancelOwnRequests: false },
            { identifier: "pt-own", cancelAllRequests: false, cancelOwnRequests: true },
        ]);
    });

    it("returns all roles in canonical order and sorts product types and data types by name", () => {
        const result = build(
            { "pt-b:dt-b": ["approver", "viewer", "writer"] },
            {
                productTypes: [
                    productType({ identifier: "pt-b", name: "Bravo" }),
                    productType({ identifier: "pt-a", name: "Alpha" }),
                ],
                assignments: [
                    assignment({ productType: "pt-b", dataType: "dt-b", dataTypeName: "Bravo data type" }),
                    assignment({ productType: "pt-b", dataType: "dt-a", dataTypeName: "Alpha data type" }),
                ],
            },
        );

        expect(result.map((entry) => entry.name)).toEqual(["Alpha", "Bravo"]);
        expect(result[1]!.dataTypes.map((dataType) => dataType.name)).toEqual(["Alpha data type", "Bravo data type"]);
        expect(result[1]!.dataTypes[1]!.roles).toEqual(["viewer", "writer", "approver"]);
    });
});
