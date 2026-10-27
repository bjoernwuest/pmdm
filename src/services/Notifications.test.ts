import { describe, expect, it } from "bun:test";
import { buildAwaitingTable, buildTransitionsTable, selectReminderRecipients } from "@/services/Notifications.ts";
import type { AwaitingItem, TransitionDigestItem } from "@/repo/NotificationRepo.ts";

function thNames(html: string): string[] {
    const head = html.match(/<thead>([\s\S]*?)<\/thead>/)![1]!;
    return [...head.matchAll(/<th>(.*?)<\/th>/g)].map((m) => m[1]!);
}

function rowCells(html: string): string[][] {
    const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)![1]!;
    return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) =>
        [...row[1]!.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]!),
    );
}

function awaiting(overrides: Partial<AwaitingItem> = {}): AwaitingItem {
    return {
        requestId: "req-1",
        productNumber: "5000001-01",
        productTypeName: "Widget",
        headerValues: {},
        ...overrides,
    };
}

function transition(overrides: Partial<TransitionDigestItem> = {}): TransitionDigestItem {
    return {
        requestId: "req-1",
        productNumber: "5000001-01",
        newStatus: "importing",
        productType: "pt-1",
        productTypeName: "Widget",
        headerValues: {},
        ...overrides,
    };
}

describe("buildAwaitingTable", () => {
    it("renders 'None' for empty input", () => {
        expect(buildAwaitingTable([], [], "")).toBe("<p>None</p>");
    });

    it("orders columns as Product Number, Product Type, headers, Awaiting, Link", () => {
        const html = buildAwaitingTable(
            [awaiting({ headerValues: { Color: "Red" } })],
            [awaiting({ requestId: "req-2", productNumber: "5000002-01", headerValues: { Size: "L" } })],
            "",
        );
        expect(thNames(html)).toEqual(["Product Number", "Product Type", "Color", "Size", "Awaiting", "Link"]);
    });

    it("uses the first-seen union order for header columns", () => {
        const html = buildAwaitingTable(
            [
                awaiting({ requestId: "req-1", productNumber: "5000001-01", headerValues: { Color: "Red", Size: "L" } }),
                awaiting({ requestId: "req-2", productNumber: "5000002-01", headerValues: { Weight: "10" } }),
            ],
            [],
            "",
        );
        expect(thNames(html)).toEqual(["Product Number", "Product Type", "Color", "Size", "Weight", "Awaiting", "Link"]);
    });

    it("sorts Provide value before Approve value, then product number ascending", () => {
        const html = buildAwaitingTable(
            [
                awaiting({ requestId: "r2", productNumber: "5000002-01" }),
                awaiting({ requestId: "r1", productNumber: "5000001-01" }),
            ],
            [awaiting({ requestId: "r0", productNumber: "5000000-01" })],
            "",
        );
        expect(rowCells(html).map((row) => [row[0], row[2]])).toEqual([
            ["5000001-01", "Provide value"],
            ["5000002-01", "Provide value"],
            ["5000000-01", "Approve value"],
        ]);
    });

    it("renders — for a missing header value and an empty product type name", () => {
        const html = buildAwaitingTable(
            [awaiting({ productNumber: "5000001-01", productTypeName: "", headerValues: { Color: "Red" } })],
            [awaiting({ requestId: "req-2", productNumber: "5000002-01", productTypeName: "Gadget" })],
            "",
        );
        const cells = rowCells(html);
        expect(cells[0]![1]).toBe("—");
        expect(cells[0]![2]).toBe("Red");
        expect(cells[1]![2]).toBe("—");
    });

    it("links each row to the product request", () => {
        const html = buildAwaitingTable([awaiting({ requestId: "req-9" })], [], "http://base");
        expect(html).toContain('href="http://base/product-requests/req-9"');
        expect(html).toContain("Open request");
    });
});

describe("buildTransitionsTable", () => {
    it("renders 'None' for empty input", () => {
        expect(buildTransitionsTable([], "")).toBe("<p>None</p>");
    });

    it("orders columns as Product Number, Product Type, headers, New Status, Link", () => {
        const html = buildTransitionsTable(
            [
                transition({ requestId: "req-1", productNumber: "5000001-01", newStatus: "importing", headerValues: { Color: "Red" } }),
                transition({ requestId: "req-2", productNumber: "5000002-01", newStatus: "importing", headerValues: { Size: "L" } }),
            ],
            "",
        );
        expect(thNames(html)).toEqual(["Product Number", "Product Type", "Color", "Size", "New Status", "Link"]);
    });

    it("sorts importing → done → cancelled, then product number ascending", () => {
        const html = buildTransitionsTable(
            [
                transition({ requestId: "rc", productNumber: "5000003-01", newStatus: "cancelled" }),
                transition({ requestId: "rd", productNumber: "5000002-01", newStatus: "done" }),
                transition({ requestId: "ri2", productNumber: "5000002-01", newStatus: "importing" }),
                transition({ requestId: "ri1", productNumber: "5000001-01", newStatus: "importing" }),
            ],
            "",
        );
        expect(rowCells(html).map((row) => [row[0], row[2]])).toEqual([
            ["5000001-01", "importing"],
            ["5000002-01", "importing"],
            ["5000002-01", "done"],
            ["5000003-01", "cancelled"],
        ]);
    });

    it("links done rows to the product and other statuses to the request", () => {
        const html = buildTransitionsTable(
            [
                transition({ requestId: "rd", productNumber: "5000002-01", newStatus: "done" }),
                transition({ requestId: "ri", productNumber: "5000001-01", newStatus: "importing" }),
                transition({ requestId: "rc", productNumber: "5000003-01", newStatus: "cancelled" }),
            ],
            "http://base",
        );
        expect(html).toContain('href="http://base/products/5000002-01"');
        expect(html).toContain("View product");
        expect(html).toContain('href="http://base/product-requests/ri"');
        expect(html).toContain('href="http://base/product-requests/rc"');
        expect(html).toContain("View request");
    });

    it("renders — for an empty product type name and a missing header value", () => {
        const html = buildTransitionsTable(
            [
                transition({ productTypeName: "", headerValues: {} }),
                transition({ requestId: "req-2", productNumber: "5000002-01", headerValues: { Color: "Red" } }),
            ],
            "",
        );
        const cells = rowCells(html);
        expect(cells[0]![1]).toBe("—");
        expect(cells[0]![2]).toBe("—");
        expect(cells[1]![2]).toBe("Red");
    });
});

describe("selectReminderRecipients", () => {
    const users = [
        { identifier: "user-provide", email: "provide@example.com", firstName: "Provide", lastName: "User" },
        { identifier: "user-approve", email: "approve@example.com", firstName: "Approve", lastName: "User" },
        { identifier: "user-idle", email: "idle@example.com", firstName: "Idle", lastName: "User" },
        { identifier: "user-no-email", email: null, firstName: "No", lastName: "Email" },
    ];

    const awaitingByUser = new Map<string, { awaitingProvide: AwaitingItem[]; awaitingApprove: AwaitingItem[] }>([
        ["user-provide", { awaitingProvide: [awaiting()], awaitingApprove: [] }],
        ["user-approve", { awaitingProvide: [], awaitingApprove: [awaiting()] }],
        ["user-no-email", { awaitingProvide: [awaiting()], awaitingApprove: [] }],
    ]);

    it("includes only users with actionable items and an email address", () => {
        expect(selectReminderRecipients(users, awaitingByUser).map((user) => user.identifier)).toEqual([
            "user-provide",
            "user-approve",
        ]);
    });

    it("is a force-send: per-user preferences are never consulted", () => {
        const recipients = selectReminderRecipients(users, awaitingByUser);
        expect(recipients.map((user) => user.identifier)).toContain("user-provide");
        expect(recipients.map((user) => user.identifier)).toContain("user-approve");
    });
});
