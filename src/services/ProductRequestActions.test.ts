import { describe, expect, it } from "bun:test";
import {
    canApproveProductRequestValue,
    canEditProductRequestValue,
    canProvideProductRequestValue,
    formatHeaderValue,
    isEmptyValue,
    isApprovableValuePresent,
    resolveConfig,
    resolveDisplayRawValue,
    resolveIsHeader,
    type CanApproveInput,
    type CanEditInput,
} from "@/services/ProductRequestActions.ts";

function editInput(overrides: Partial<CanEditInput> = {}): CanEditInput {
    return {
        hasWriterRole: false,
        requestorCanEdit: false,
        isRequestCreator: false,
        userRoles: [],
        isUpdateRequest: false,
        editableOnUpdate: true,
        ...overrides,
    };
}

function approveInput(overrides: Partial<CanApproveInput> = {}): CanApproveInput {
    return {
        hasApproverRole: true,
        approvedBy: null,
        kind: "string",
        mandatory: false,
        value: "something",
        defaultValue: null,
        config: null,
        ...overrides,
    };
}

describe("canEditProductRequestValue", () => {
    it("grants edit to a writer", () => {
        expect(canEditProductRequestValue(editInput({ hasWriterRole: true }))).toBe(true);
    });

    it("grants edit to the creator when requestorCanEdit and at least one role", () => {
        expect(canEditProductRequestValue(editInput({
            requestorCanEdit: true,
            isRequestCreator: true,
            userRoles: ["viewer"],
        }))).toBe(true);
    });

    it("denies the creator with requestorCanEdit but no roles (reported bug)", () => {
        expect(canEditProductRequestValue(editInput({
            requestorCanEdit: true,
            isRequestCreator: true,
            userRoles: [],
        }))).toBe(false);
    });

    it("denies a non-creator relying on requestorCanEdit", () => {
        expect(canEditProductRequestValue(editInput({
            requestorCanEdit: true,
            isRequestCreator: false,
            userRoles: ["viewer"],
        }))).toBe(false);
    });

    it("denies when requestorCanEdit is false even for the creator with roles", () => {
        expect(canEditProductRequestValue(editInput({
            requestorCanEdit: false,
            isRequestCreator: true,
            userRoles: ["writer"],
        }))).toBe(false);
    });

    it("denies on update requests when editableOnUpdate is false", () => {
        expect(canEditProductRequestValue(editInput({
            hasWriterRole: true,
            isUpdateRequest: true,
            editableOnUpdate: false,
        }))).toBe(false);
    });

    it("allows a writer on update requests when editableOnUpdate is true", () => {
        expect(canEditProductRequestValue(editInput({
            hasWriterRole: true,
            isUpdateRequest: true,
            editableOnUpdate: true,
        }))).toBe(true);
    });
});

describe("canProvideProductRequestValue", () => {
    it("is true for an empty value the user may edit", () => {
        expect(canProvideProductRequestValue({ ...editInput({ hasWriterRole: true }), value: null, kind: "string" })).toBe(true);
    });

    it("is true for an empty string the user may edit", () => {
        // isEmptyValue treats "" as empty, so "" still needs a value
        expect(canProvideProductRequestValue({ ...editInput({ hasWriterRole: true }), value: "", kind: "string" })).toBe(true);
    });

    it("is false for a non-empty value", () => {
        expect(canProvideProductRequestValue({ ...editInput({ hasWriterRole: true }), value: "x", kind: "string" })).toBe(false);
    });

    it("is false for an empty array", () => {
        expect(isEmptyValue([], "lookup", null)).toBe(true);
        expect(canProvideProductRequestValue({ ...editInput({ hasWriterRole: true }), value: [], kind: "lookup" })).toBe(true);
    });

    it("treats null as a valid value for permitEmpty booleans", () => {
        expect(isEmptyValue(null, "boolean", { permitEmpty: true })).toBe(false);
        expect(canProvideProductRequestValue({
            ...editInput({ hasWriterRole: true }),
            value: null,
            kind: "boolean",
            config: { permitEmpty: true },
        })).toBe(false);
        expect(canProvideProductRequestValue({
            ...editInput({ hasWriterRole: true }),
            value: null,
            kind: "boolean",
            config: { permitEmpty: false },
        })).toBe(true);
    });

    it("is false when the user cannot edit", () => {
        expect(canProvideProductRequestValue({ ...editInput(), value: null, kind: "string" })).toBe(false);
    });
});

describe("isApprovableValuePresent", () => {
    it("is true for a non-mandatory empty value", () => {
        expect(isApprovableValuePresent({ mandatory: false, value: null, defaultValue: null, kind: "string" })).toBe(true);
    });

    it("is false for a mandatory empty value without default", () => {
        expect(isApprovableValuePresent({ mandatory: true, value: null, defaultValue: null, kind: "string" })).toBe(false);
    });

    it("is true for a mandatory empty value with a default", () => {
        expect(isApprovableValuePresent({ mandatory: true, value: null, defaultValue: "fallback", kind: "string" })).toBe(true);
    });

    it("is false when defaultValue is the literal string 'null'", () => {
        expect(isApprovableValuePresent({ mandatory: true, value: "", defaultValue: "null", kind: "string" })).toBe(false);
    });
});

describe("canApproveProductRequestValue", () => {
    it("allows an approver on a non-calculated, present value", () => {
        expect(canApproveProductRequestValue(approveInput())).toBe(true);
    });

    it("denies a non-approver", () => {
        expect(canApproveProductRequestValue(approveInput({ hasApproverRole: false }))).toBe(false);
    });

    it("denies an already approved value", () => {
        expect(canApproveProductRequestValue(approveInput({ approvedBy: "user-1" }))).toBe(false);
    });

    it("denies a calculated value", () => {
        expect(canApproveProductRequestValue(approveInput({ kind: "calculated" }))).toBe(false);
    });

    it("denies a mandatory empty value without default", () => {
        expect(canApproveProductRequestValue(approveInput({
            mandatory: true,
            value: null,
            defaultValue: null,
        }))).toBe(false);
    });

    it("allows an optional empty value", () => {
        expect(canApproveProductRequestValue(approveInput({
            mandatory: false,
            value: null,
            defaultValue: null,
        }))).toBe(true);
    });

    it("allows a mandatory empty value that has a default", () => {
        expect(canApproveProductRequestValue(approveInput({
            mandatory: true,
            value: null,
            defaultValue: 42,
        }))).toBe(true);
    });

    it("respects permitEmpty booleans as present", () => {
        expect(canApproveProductRequestValue(approveInput({
            mandatory: true,
            value: null,
            defaultValue: null,
            kind: "boolean",
            config: { permitEmpty: true },
        }))).toBe(true);
    });
});

describe("resolveIsHeader", () => {
    it("falls back to false when both levels are unset", () => {
        expect(resolveIsHeader(undefined, undefined)).toBe(false);
        expect(resolveIsHeader(null, null)).toBe(false);
    });

    it("uses the data type master flag when there is no override", () => {
        expect(resolveIsHeader(true, null)).toBe(true);
        expect(resolveIsHeader(false, null)).toBe(false);
        expect(resolveIsHeader(true, undefined)).toBe(true);
    });

    it("lets the assignment override win over the data type flag", () => {
        expect(resolveIsHeader(false, true)).toBe(true);
        expect(resolveIsHeader(true, false)).toBe(false);
    });

    it("covers all tri-state combinations", () => {
        expect(resolveIsHeader(false, false)).toBe(false);
        expect(resolveIsHeader(true, true)).toBe(true);
    });
});

describe("resolveDisplayRawValue", () => {
    it("prefers the stored value", () => {
        expect(resolveDisplayRawValue("x", "fallback")).toBe("x");
    });

    it("falls back to the default when the value is empty", () => {
        expect(resolveDisplayRawValue(null, "fallback")).toBe("fallback");
        expect(resolveDisplayRawValue(undefined, 42)).toBe(42);
    });

    it("treats the literal string 'null' as absent", () => {
        expect(resolveDisplayRawValue(null, "null")).toBe(null);
        expect(resolveDisplayRawValue("null", null)).toBe("null");
    });

    it("returns null when both are absent", () => {
        expect(resolveDisplayRawValue(null, null)).toBe(null);
    });
});

describe("formatHeaderValue", () => {
    it("renders an em dash when value and default are empty", () => {
        expect(formatHeaderValue({ value: null, defaultValue: null, kind: "string" })).toBe("—");
        expect(formatHeaderValue({ value: null, defaultValue: "null", kind: "string" })).toBe("—");
    });

    it("falls back to the default value", () => {
        expect(formatHeaderValue({ value: null, defaultValue: "fallback", kind: "string" })).toBe("fallback");
    });

    it("renders booleans as true/false", () => {
        expect(formatHeaderValue({ value: true, defaultValue: null, kind: "boolean" })).toBe("true");
        expect(formatHeaderValue({ value: false, defaultValue: null, kind: "boolean" })).toBe("false");
    });

    it("resolves lookup identifiers to names", () => {
        const names: Record<string, string> = { "id-1": "Alpha", "id-2": "Beta" };
        expect(formatHeaderValue({
            value: ["id-1", "id-2"],
            defaultValue: null,
            kind: "lookup",
            nameFor: (id) => names[id],
        })).toBe("Alpha, Beta");
    });

    it("falls back to the raw identifier when no name is known", () => {
        expect(formatHeaderValue({ value: "id-9", defaultValue: null, kind: "consumable", nameFor: () => null })).toBe("id-9");
    });

    it("renders product numbers as stored", () => {
        expect(formatHeaderValue({ value: "5123456-01", defaultValue: null, kind: "product" })).toBe("5123456-01");
        expect(formatHeaderValue({ value: 5123456, defaultValue: null, kind: "product" })).toBe("5123456");
    });

    it("renders strings and calculated values raw", () => {
        expect(formatHeaderValue({ value: "hello", defaultValue: null, kind: "string" })).toBe("hello");
        expect(formatHeaderValue({ value: 42, defaultValue: null, kind: "calculated" })).toBe("42");
    });
});

describe("resolveConfig", () => {
    it("merges dt config with pt overrides", () => {
        expect(resolveConfig({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
    });

    it("handles nulls", () => {
        expect(resolveConfig(null, { b: 3 })).toEqual({ b: 3 });
        expect(resolveConfig({ a: 1 }, null)).toEqual({ a: 1 });
    });
});