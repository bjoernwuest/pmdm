import type { ApiInstance } from "@/apps/api.ts";
import { runInTransaction } from "@/services/DatabaseDriver.ts";
import type { DBClient } from "@/services/DatabaseDriver.ts";
import { authorize, getLoggedinUserObject } from "@/services/Auth.ts";
import {
    FP_VIEW_PRODUCT_EXPORTS,
    FP_EXPORT_PRODUCT_REQUESTS,
    FP_CONFIRM_IMPORT,
    FP_EDIT_EXPORT_STATUS,
} from "@/services/auth/FunctionalPermissions.ts";
import {
    getExportPageData,
    getExportRowsByRequest,
    markAsExported,
    markAsImported,
    AlreadyExportedError,
    AlreadyImportedError,
} from "@/repo/ProductExportRepo.ts";
import { ProductRequestStatus } from "@/schema/ProductRequestSchema.ts";
import { ProductRequests, ProductRequestsValues } from "@/schema/ProductRequestSchema.ts";
import { ProductExports } from "@/schema/ProductExportSchema.ts";
import { ProductTypesDataTypesTargetSystems } from "@/schema/ProductTypeSchema.ts";
import { DataTypeSchema } from "@/schema/DataTypeSchema.ts";
import { TargetSystems } from "@/schema/TargetSystemSchema.ts";
import { LookupsValues } from "@/schema/LookupsSchema.ts";
import { ConsumablesValues } from "@/schema/ConsumableSchema.ts";
import { getUserListPageSizes } from "@/services/ui_config.ts";
import { status, t } from "elysia";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ProductExportsListResponse, ImportProductExportsResponse } from "@/types/ProductExportType.ts";

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance): void {
    // -----------------------------------------------------------------------
    // GET /api/product_exports — List product requests in importing status
    // -----------------------------------------------------------------------
    app.get("/product_exports", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_VIEW_PRODUCT_EXPORTS]);
        if (!authz.some((perm) => perm.identifier === FP_VIEW_PRODUCT_EXPORTS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_VIEW_PRODUCT_EXPORTS.functionalPermissionName}`);
        }

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? availablePageSizes[0] ?? 20));
        const filterParam = context.query.filter as string | undefined;

        let whereCondition: ReturnType<typeof and> | undefined;
        if (filterParam) {
            try {
                const parsed = JSON.parse(filterParam);
                if (parsed.criteria && parsed.expression) {
                    const cond = buildRequestFilterCondition(parsed.criteria, parsed.expression);
                    if (cond) whereCondition = cond;
                }
            } catch (_) { /* ignore */ }
        }

        const result = await getExportPageData(context.dbClient, whereCondition, page, pageSize);

        return {
            requests: result.requests,
            targetSystems: result.targetSystems,
            page,
            pageSize,
            total: result.total,
            availablePageSizes,
        } satisfies ProductExportsListResponse & { availablePageSizes: number[] };
    }, {
        query: t.Object({
            page: t.Optional(t.Union([t.Number({ minimum: 0 }), t.String()])),
            pageSize: t.Optional(t.Union([t.Number({ minimum: 1 }), t.String()])),
            filter: t.Optional(t.String()),
        }),
        detail: {
            tags: ["Product Exports"],
            summary: "List product exports",
            description: "Returns a paginated list of product requests in importing status with their export status per target system.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
        response: {
            200: t.Object({
                requests: t.Array(t.Any()),
                targetSystems: t.Array(t.Any()),
                page: t.Number(),
                pageSize: t.Number(),
                total: t.Number(),
                availablePageSizes: t.Array(t.Number()),
            }),
            401: t.String(),
            403: t.String(),
        },
    });

    // -----------------------------------------------------------------------
    // GET /api/product_exports/export — Export product requests for a target system
    // -----------------------------------------------------------------------
    app.get("/product_exports/export", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_EXPORT_PRODUCT_REQUESTS]);
        if (!authz.some((perm) => perm.identifier === FP_EXPORT_PRODUCT_REQUESTS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_EXPORT_PRODUCT_REQUESTS.functionalPermissionName}`);
        }

        const targetSystemId = context.query.targetSystem as string;
        const format = context.query.format as string;
        const productRequestsParam = context.query.productRequests as string;

        if (!targetSystemId) return status(400, "targetSystem is required");
        if (!format || !["xlsx", "csv", "json"].includes(format)) return status(400, "format must be xlsx, csv, or json");
        if (!productRequestsParam) return status(400, "productRequests is required");

        const requestIds = productRequestsParam.split(",").map((s) => s.trim()).filter(Boolean);
        if (requestIds.length === 0) return status(400, "No product requests provided");

        const userId = (await getLoggedinUserObject(context.dbClient, claims))?.identifier;

        const exportData = await buildExportData(context.dbClient, targetSystemId, requestIds);

        if (exportData.error) {
            return status(exportData.error.status, exportData.error.message);
        }

        await runInTransaction(context.dbClient, async (tx) => {
            for (const requestId of requestIds) {
                const row = await tx
                    .select({ exportedAt: ProductExports.exportedAt })
                    .from(ProductExports)
                    .where(and(
                        eq(ProductExports.productRequest, requestId),
                        eq(ProductExports.targetSystem, targetSystemId),
                    ))
                    .limit(1);

                if (row.length === 0) continue;

                try {
                    await markAsExported(tx, requestId, targetSystemId, userId ?? "00000000-0000-0000-0000-000000000000");
                } catch (e) {
                    if (!(e instanceof AlreadyExportedError)) throw e;
                }
            }
        });

        const safeName = exportData.targetSystemName.replace(/[<>:"/\\|?*]/g, "_");
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `product_exports_${safeName}_${dateStr}`;

        if (format === "json") {
            return exportData.rows as any;
        }

        if (format === "csv") {
            const csvContent = generateCsv(exportData.headers, exportData.rows);
            return new Response(csvContent, {
                headers: {
                    "Content-Type": "text/csv",
                    "Content-Disposition": `attachment; filename="${filename}.csv"`,
                },
            });
        }

        const { createWorkbook, addWorksheet } = await import("@office-kit/xlsx/workbook");
        const { writeRange } = await import("@office-kit/xlsx/worksheet");
        const { workbookToBytes } = await import("@office-kit/xlsx/io");

        const wb = createWorkbook();
        const ws = addWorksheet(wb, "Export");
        writeRange(ws, "A1", [exportData.headers]);
        for (let i = 0; i < exportData.rows.length; i++) {
            writeRange(ws, `A${i + 2}`, [exportData.headers.map((h) => exportData.rows[i]![h as keyof typeof exportData.rows[0]] ?? "")]);
        }
        const bytes = await workbookToBytes(wb);

        return new Response(Buffer.from(bytes), {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
            },
        });
    }, {
        query: t.Object({
            targetSystem: t.String({ format: "uuid" }),
            format: t.String(),
            productRequests: t.String(),
        }),
        detail: {
            tags: ["Product Exports"],
            summary: "Export product requests for a target system",
            description: "Exports selected product requests as XLSX, CSV, or JSON file for a target system. Marks the product requests as exported.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
        response: {
            200: t.Any(),
            400: t.String(),
            401: t.String(),
            403: t.String(),
            404: t.String(),
        },
    });

    // -----------------------------------------------------------------------
    // POST /api/product_exports/import — Import export/import status from Excel
    // -----------------------------------------------------------------------
    app.post("/product_exports/import", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const targetSystemId = context.query.targetSystem as string;
        if (!targetSystemId) return status(400, "targetSystem is required");

        const checkPerms = await authorize(context.dbClient, claims, [FP_EXPORT_PRODUCT_REQUESTS, FP_CONFIRM_IMPORT]);
        const hasExportPerm = checkPerms.some((p) => p.identifier === FP_EXPORT_PRODUCT_REQUESTS.identifier);
        const hasImportPerm = checkPerms.some((p) => p.identifier === FP_CONFIRM_IMPORT.identifier);

        const reqFormData = await context.request.formData();
        const file = reqFormData.get("file");
        if (!file) return status(400, "No file provided");

        const { loadWorkbook } = await import("@office-kit/xlsx/io");
        const { getSheet, sheetNames } = await import("@office-kit/xlsx/workbook");
        const { getCell, getMaxRow } = await import("@office-kit/xlsx/worksheet");

        let wb;
        try {
            const buf = await (file as Blob).arrayBuffer();
            wb = await loadWorkbook({ toBytes: async () => new Uint8Array(buf) });
        } catch (e: any) {
            return status(400, `Failed to parse XLSX file: ${e.message}`);
        }

        const names = sheetNames(wb);
        if (names.length === 0) return status(400, "XLSX file has no sheets");
        const ws = getSheet(wb, names[0]!);
        if (!ws) return status(400, "XLSX file has no sheets");

        const headerA = getCell(ws, 1, 1)?.value?.toString()?.trim() ?? "";
        const headerB = getCell(ws, 1, 2)?.value?.toString()?.trim() ?? "";
        const headerC = getCell(ws, 1, 3)?.value?.toString()?.trim() ?? "";

        if (!headerA || headerA.toLowerCase() !== "productnumber") {
            return status(400, "Column A header must be 'productNumber'");
        }
        if (!headerB || headerB.toLowerCase() !== "exported") {
            return status(400, "Column B header must be 'exported'");
        }
        if (!headerC || headerC.toLowerCase() !== "imported") {
            return status(400, "Column C header must be 'imported'");
        }

        type ImportRow = { productNumber: string; exported: boolean; imported: boolean };
        const rows: ImportRow[] = [];
        const maxRow = getMaxRow(ws);

        for (let row = 2; row <= maxRow; row++) {
            const pn = getCell(ws, row, 1)?.value?.toString()?.trim() ?? "";
            if (!pn) continue;

            const exportedRaw = getCell(ws, row, 2)?.value?.toString()?.trim()?.toLowerCase() ?? "";
            const importedRaw = getCell(ws, row, 3)?.value?.toString()?.trim()?.toLowerCase() ?? "";

            const exported = ["true", "yes", "1", "x", "y"].includes(exportedRaw);
            const imported = ["true", "yes", "1", "x", "y"].includes(importedRaw);

            if (!exported && !imported) continue;

            rows.push({ productNumber: pn, exported, imported });
        }

        const userId = (await getLoggedinUserObject(context.dbClient, claims))?.identifier;

        const result = await runInTransaction(context.dbClient, async (tx) => {
            const txResult: ImportProductExportsResponse = { totalRows: rows.length, exportedCount: 0, importedCount: 0, errors: [] };
            const resolvedUserId = userId ?? "00000000-0000-0000-0000-000000000000";

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i]!;
                const rowNum = i + 1;

                if (row.exported && !hasExportPerm) {
                    txResult.errors.push({ row: rowNum, productNumber: row.productNumber, message: "Permission denied: FP_EXPORT_PRODUCT_REQUESTS required" });
                    continue;
                }
                if (row.imported && !hasImportPerm) {
                    txResult.errors.push({ row: rowNum, productNumber: row.productNumber, message: "Permission denied: FP_CONFIRM_IMPORT required" });
                    continue;
                }

                const requests = await tx
                    .select({ identifier: ProductRequests.identifier })
                    .from(ProductRequests)
                    .where(and(
                        eq(ProductRequests.productNumber, row.productNumber),
                        eq(ProductRequests.status, ProductRequestStatus.importing),
                    ))
                    .limit(1);

                if (requests.length === 0) {
                    txResult.errors.push({ row: rowNum, productNumber: row.productNumber, message: "Product request not in importing status" });
                    continue;
                }

                const requestId = requests[0]!.identifier;
                const peRows = await tx
                    .select({ exportedAt: ProductExports.exportedAt, importedAt: ProductExports.importedAt })
                    .from(ProductExports)
                    .where(and(
                        eq(ProductExports.productRequest, requestId),
                        eq(ProductExports.targetSystem, targetSystemId),
                    ))
                    .limit(1);

                if (peRows.length === 0) {
                    txResult.errors.push({ row: rowNum, productNumber: row.productNumber, message: "Product export row not found for target system" });
                    continue;
                }

                const pe = peRows[0]!;

                if (row.exported) {
                    if (pe.exportedAt !== null) {
                        txResult.errors.push({ row: rowNum, productNumber: row.productNumber, message: "Already exported" });
                    } else {
                        await markAsExported(tx, requestId, targetSystemId, resolvedUserId);
                        txResult.exportedCount++;
                    }
                }

                if (row.imported) {
                    if (pe.importedAt !== null) {
                        txResult.errors.push({ row: rowNum, productNumber: row.productNumber, message: "Already imported" });
                    } else {
                        await markAsImported(tx, requestId, targetSystemId, resolvedUserId);
                        txResult.importedCount++;
                    }
                }
            }

            return txResult;
        });

        return result;
    }, {
        query: t.Object({
            targetSystem: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product Exports"],
            summary: "Import export/import status from Excel",
            description: "Imports export and import status from an uploaded XLSX file. Returns summary with counts and errors.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
        response: {
            200: t.Object({
                totalRows: t.Number(),
                exportedCount: t.Number(),
                importedCount: t.Number(),
                errors: t.Array(t.Object({
                    row: t.Number(),
                    productNumber: t.String(),
                    message: t.String(),
                })),
            }),
            400: t.String(),
            401: t.String(),
            403: t.String(),
        },
    });

    // -----------------------------------------------------------------------
    // PATCH /api/product_exports/:productRequestId/:targetSystemId/exported
    // -----------------------------------------------------------------------
    app.patch("/product_exports/:productRequestId/:targetSystemId/exported", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_EXPORT_PRODUCT_REQUESTS, FP_EDIT_EXPORT_STATUS]);
        if (!authz.some((perm) => perm.identifier === FP_EXPORT_PRODUCT_REQUESTS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_EXPORT_PRODUCT_REQUESTS.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_EDIT_EXPORT_STATUS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_EDIT_EXPORT_STATUS.functionalPermissionName}`);
        }

        const productRequestId = context.params.productRequestId as string;
        const targetSystemId = context.params.targetSystemId as string;

        try {
            const userId = (await getLoggedinUserObject(context.dbClient, claims))?.identifier;
            const resolvedUserId = userId ?? "00000000-0000-0000-0000-000000000000";

            await runInTransaction(context.dbClient, async (tx) => {
                const req = await tx
                    .select({ status: ProductRequests.status })
                    .from(ProductRequests)
                    .where(eq(ProductRequests.identifier, productRequestId))
                    .limit(1);

                if (req.length === 0) {
                    throw new Error("Product request not found");
                }
                if (req[0]!.status !== ProductRequestStatus.importing) {
                    throw new Error("Product request is not in importing status");
                }

                const pe = await tx
                    .select({ exportedAt: ProductExports.exportedAt })
                    .from(ProductExports)
                    .where(and(
                        eq(ProductExports.productRequest, productRequestId),
                        eq(ProductExports.targetSystem, targetSystemId),
                    ))
                    .limit(1);

                if (pe.length === 0) {
                    throw new Error("Product export row not found");
                }

                await markAsExported(tx, productRequestId, targetSystemId, resolvedUserId);
            });

            const rows = await getExportRowsByRequest(context.dbClient, productRequestId);
            const row = rows.find((r) => r.targetSystem === targetSystemId);
            return row ?? status(404, "Product export row not found");
        } catch (e: any) {
            if (e instanceof AlreadyExportedError) return status(409, "Already exported");
            if (e.message === "Product request not found") return status(404, e.message);
            if (e.message === "Product export row not found") return status(404, e.message);
            if (e.message === "Product request is not in importing status") return status(409, e.message);
            return status(400, e.message);
        }
    }, {
        params: t.Object({
            productRequestId: t.String({ format: "uuid" }),
            targetSystemId: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product Exports"],
            summary: "Mark export as exported",
            description: "Marks a single product export as exported. Requires FP_EXPORT_PRODUCT_REQUESTS and FP_EDIT_EXPORT_STATUS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
        response: {
            200: t.Any(),
            400: t.String(),
            401: t.String(),
            403: t.String(),
            404: t.String(),
            409: t.String(),
        },
    });

    // -----------------------------------------------------------------------
    // PATCH /api/product_exports/:productRequestId/:targetSystemId/imported
    // -----------------------------------------------------------------------
    app.patch("/product_exports/:productRequestId/:targetSystemId/imported", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_CONFIRM_IMPORT, FP_EDIT_EXPORT_STATUS]);
        if (!authz.some((perm) => perm.identifier === FP_CONFIRM_IMPORT.identifier)) {
            return status(403, `Permission denied. Required: ${FP_CONFIRM_IMPORT.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_EDIT_EXPORT_STATUS.identifier)) {
            return status(403, `Permission denied. Required: ${FP_EDIT_EXPORT_STATUS.functionalPermissionName}`);
        }

        const productRequestId = context.params.productRequestId as string;
        const targetSystemId = context.params.targetSystemId as string;

        try {
            const userId = (await getLoggedinUserObject(context.dbClient, claims))?.identifier;
            const resolvedUserId = userId ?? "00000000-0000-0000-0000-000000000000";

            await runInTransaction(context.dbClient, async (tx) => {
                const req = await tx
                    .select({ status: ProductRequests.status })
                    .from(ProductRequests)
                    .where(eq(ProductRequests.identifier, productRequestId))
                    .limit(1);

                if (req.length === 0) {
                    throw new Error("Product request not found");
                }
                if (req[0]!.status !== ProductRequestStatus.importing) {
                    throw new Error("Product request is not in importing status");
                }

                const pe = await tx
                    .select({ importedAt: ProductExports.importedAt })
                    .from(ProductExports)
                    .where(and(
                        eq(ProductExports.productRequest, productRequestId),
                        eq(ProductExports.targetSystem, targetSystemId),
                    ))
                    .limit(1);

                if (pe.length === 0) {
                    throw new Error("Product export row not found");
                }

                await markAsImported(tx, productRequestId, targetSystemId, resolvedUserId);
            });

            const rows = await getExportRowsByRequest(context.dbClient, productRequestId);
            const row = rows.find((r) => r.targetSystem === targetSystemId);
            return row ?? status(404, "Product export row not found");
        } catch (e: any) {
            if (e instanceof AlreadyImportedError) return status(409, "Already imported");
            if (e.message === "Product request not found") return status(404, e.message);
            if (e.message === "Product export row not found") return status(404, e.message);
            if (e.message === "Product request is not in importing status") return status(409, e.message);
            return status(400, e.message);
        }
    }, {
        params: t.Object({
            productRequestId: t.String({ format: "uuid" }),
            targetSystemId: t.String({ format: "uuid" }),
        }),
        detail: {
            tags: ["Product Exports"],
            summary: "Mark export as imported",
            description: "Marks a single product export as imported. Requires FP_CONFIRM_IMPORT and FP_EDIT_EXPORT_STATUS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
        response: {
            200: t.Any(),
            400: t.String(),
            401: t.String(),
            403: t.String(),
            404: t.String(),
            409: t.String(),
        },
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildExportData(
    db: DBClient,
    targetSystemId: string,
    requestIds: string[],
): Promise<{ headers: string[]; rows: any[]; targetSystemName: string; error?: { status: number; message: string } }> {
    const requests = await db
        .select({
            identifier: ProductRequests.identifier,
            productNumber: ProductRequests.productNumber,
            productType: ProductRequests.productType,
        })
        .from(ProductRequests)
        .where(inArray(ProductRequests.identifier, requestIds));

    if (requests.length === 0) {
        return { headers: [], rows: [], targetSystemName: "", error: { status: 404, message: "No product requests found" } };
    }

    const productTypes = new Set(requests.map((r) => r.productType));
    if (productTypes.size > 1) {
        return { headers: [], rows: [], targetSystemName: "", error: { status: 400, message: "All product requests must share the same product type" } };
    }

    const productTypeId = requests[0]!.productType!;

    const dataTypeAssignments = await db
        .select({
            dataType: ProductTypesDataTypesTargetSystems.dataType,
            name: sql<string>`COALESCE(${ProductTypesDataTypesTargetSystems.name}, ${DataTypeSchema.name})`.as("name"),
            kind: DataTypeSchema.kind,
        })
        .from(ProductTypesDataTypesTargetSystems)
        .innerJoin(DataTypeSchema, eq(ProductTypesDataTypesTargetSystems.dataType, DataTypeSchema.identifier))
        .where(and(
            eq(ProductTypesDataTypesTargetSystems.productType, productTypeId),
            eq(ProductTypesDataTypesTargetSystems.targetSystem, targetSystemId),
        ))
        .orderBy(sql`COALESCE(${ProductTypesDataTypesTargetSystems.name}, ${DataTypeSchema.name})`);

    const headers = ["productNumber", ...dataTypeAssignments.map((a) => a.name!)];
    const dtMap = new Map(dataTypeAssignments.map((a) => [a.dataType, a.name!]));
    const lookupDtIds = new Set(dataTypeAssignments.filter((a) => a.kind === "lookup").map((a) => a.dataType));
    const consumableDtIds = new Set(dataTypeAssignments.filter((a) => a.kind === "consumable").map((a) => a.dataType));

    const allProductValues = await db
        .select({
            productRequest: ProductRequestsValues.productRequest,
            dataType: ProductRequestsValues.dataType,
            value: ProductRequestsValues.value,
            defaultValue: ProductRequestsValues.defaultValue,
        })
        .from(ProductRequestsValues)
        .where(inArray(ProductRequestsValues.productRequest, requestIds));

    const lookupUuids = new Set<string>();
    const consumableUuids = new Set<string>();
    for (const v of allProductValues) {
        const resolved = v.value ?? v.defaultValue;
        if (!resolved || resolved === "null") continue;
        const items = Array.isArray(resolved) ? resolved : [resolved];
        for (const item of items) {
            if (typeof item !== "string") continue;
            if (lookupDtIds.has(v.dataType!)) lookupUuids.add(item);
            else if (consumableDtIds.has(v.dataType!)) consumableUuids.add(item);
        }
    }

    const lookupNameMap = new Map<string, string>();
    if (lookupUuids.size > 0) {
        const lvRows = await db
            .select({ identifier: LookupsValues.identifier, name: LookupsValues.name })
            .from(LookupsValues)
            .where(inArray(LookupsValues.identifier, Array.from(lookupUuids)));
        for (const r of lvRows) lookupNameMap.set(r.identifier, r.name!);
    }

    const consumableNameMap = new Map<string, string>();
    if (consumableUuids.size > 0) {
        const cvRows = await db
            .select({ identifier: ConsumablesValues.identifier, name: ConsumablesValues.name })
            .from(ConsumablesValues)
            .where(inArray(ConsumablesValues.identifier, Array.from(consumableUuids)));
        for (const r of cvRows) consumableNameMap.set(r.identifier, r.name!);
    }

    const tsRows = await db
        .select({ name: TargetSystems.name })
        .from(TargetSystems)
        .where(eq(TargetSystems.identifier, targetSystemId))
        .limit(1);
    const targetSystemName = tsRows[0]?.name ?? "Export";

    const rows = [];
    for (const request of requests) {
        const values = allProductValues.filter((v) => v.productRequest === request.identifier);
        const row: any = { productNumber: request.productNumber };
        for (const [dtId, dtName] of dtMap) {
            const val = values.find((v) => v.dataType === dtId);
            const resolved = val ? (val.value ?? val.defaultValue) : null;
            if (resolved === "null" || resolved === null) {
                row[dtName] = "";
            } else if (lookupDtIds.has(dtId)) {
                row[dtName] = resolveIdentifiers(resolved, lookupNameMap);
            } else if (consumableDtIds.has(dtId)) {
                row[dtName] = resolveIdentifiers(resolved, consumableNameMap);
            } else {
                row[dtName] = String(resolved);
            }
        }
        rows.push(row);
    }

    return { headers, rows, targetSystemName };
}

function resolveIdentifiers(resolved: unknown, nameMap: Map<string, string>): string {
    if (Array.isArray(resolved)) {
        return resolved.map((item) => nameMap.get(String(item)) ?? String(item)).join(", ");
    }
    return nameMap.get(String(resolved)) ?? String(resolved);
}

function generateCsv(headers: string[], rows: any[]): string {
    const escape = (val: string) => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
    };
    const headerLine = headers.map(escape).join(",");
    const dataLines = rows.map((row) =>
        headers.map((h) => escape(String(row[h] ?? ""))).join(","),
    );
    return [headerLine, ...dataLines].join("\n");
}

function buildRequestFilterCondition(criteria: any[], expression: string): any | null {
    if (!criteria.length || !expression) return null;
    try {
        const parts = expression.match(/(\d+|AND|OR|NOT|\(|\))/gi);
        if (!parts) return null;

        let sqlExpr = "";
        for (const part of parts) {
            const num = parseInt(part, 10);
            if (!isNaN(num) && num > 0 && num <= criteria.length) {
                const criterion = criteria[num - 1];
                sqlExpr += criterion ? `(${buildRequestCriterionCondition(criterion) ?? "TRUE"})` : "TRUE";
            } else {
                sqlExpr += ` ${part} `;
            }
        }
        return sql`${sql.raw(sqlExpr)}`;
    } catch (_) {
        return null;
    }
}

function buildRequestCriterionCondition(criterion: any): string | null {
    if (!criterion.dataTypeIdentifier || !criterion.operator) return null;

    const dtId = escapeSql(criterion.dataTypeIdentifier);
    const op = criterion.operator.toUpperCase();
    const val = criterion.value;
    const vals = criterion.values;
    const ci = criterion.caseInsensitive === true;

    if (dtId === "__pseudo_productNumber") {
        return buildRequestColumnCondition("product_number", op, val, vals, ci);
    }
    if (dtId === "__pseudo_productType") {
        return buildRequestColumnCondition("product_type", op, val, vals, ci);
    }
    return buildRequestValueCondition(dtId, op, val, vals, ci);
}

function buildRequestColumnCondition(col: string, op: string, val: unknown, vals: unknown[], ci: boolean): string | null {
    const likeOp = ci ? "ILIKE" : "LIKE";
    const table = "product_requests";
    switch (op) {
        case "=":
            return ci ? `${table}.${col}::text ILIKE '${escapeSql(val)}'` : `${table}.${col} = '${escapeSql(val)}'`;
        case "!=":
            return ci ? `${table}.${col}::text NOT ILIKE '${escapeSql(val)}'` : `${table}.${col} != '${escapeSql(val)}'`;
        case "CONTAINS":
            return `${table}.${col}::text ${likeOp} '%${escapeSql(val)}%'`;
        case "NOT CONTAINS":
            return `${table}.${col}::text NOT ${likeOp} '%${escapeSql(val)}%'`;
        case "STARTS WITH":
            return `${table}.${col}::text ${likeOp} '${escapeSql(val)}%'`;
        case "ENDS WITH":
            return `${table}.${col}::text ${likeOp} '%${escapeSql(val)}'`;
        case "REGEX":
            return ci ? `${table}.${col}::text ~* '${escapeSql(val)}'` : `${table}.${col}::text ~ '${escapeSql(val)}'`;
        case "NOT REGEX":
            return ci ? `${table}.${col}::text !~* '${escapeSql(val)}'` : `${table}.${col}::text !~ '${escapeSql(val)}'`;
        case "EMPTY": return `(${table}.${col} IS NULL OR ${table}.${col}::text = '')`;
        case "NOT EMPTY": return `(${table}.${col} IS NOT NULL AND ${table}.${col}::text != '')`;
        default: return null;
    }
}

function buildRequestValueCondition(dtId: string, op: string, val: unknown, vals: unknown[], ci: boolean): string | null {
    const likeOp = ci ? "ILIKE" : "LIKE";
    const table = "product_requests_values";
    switch (op) {
        case "=":
            return ci
                ? `EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text ILIKE '${escapeSql(val)}')`
                : `EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text = '${escapeSql(val)}')`;
        case "!=":
            return ci
                ? `EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text NOT ILIKE '${escapeSql(val)}')`
                : `EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text != '${escapeSql(val)}')`;
        case "CONTAINS":
            return `EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text ${likeOp} '%${escapeSql(val)}%')`;
        case "NOT CONTAINS":
            return `NOT EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text ${likeOp} '%${escapeSql(val)}%')`;
        case "STARTS WITH":
            return `EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text ${likeOp} '${escapeSql(val)}%')`;
        case "ENDS WITH":
            return `EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text ${likeOp} '%${escapeSql(val)}')`;
        case "REGEX":
            return ci
                ? `EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text ~* '${escapeSql(val)}')`
                : `EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text ~ '${escapeSql(val)}')`;
        case "NOT REGEX":
            return ci
                ? `NOT EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text ~* '${escapeSql(val)}')`
                : `NOT EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value::text ~ '${escapeSql(val)}')`;
        case "EMPTY":
            return `NOT EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value IS NOT NULL)`;
        case "NOT EMPTY":
            return `EXISTS (SELECT 1 FROM ${table} prv WHERE prv.product_request = product_requests.identifier AND prv.data_type = '${dtId}' AND prv.value IS NOT NULL)`;
        default: return null;
    }
}

function escapeSql(val: any): string {
    if (val === null || val === undefined) return "";
    return String(val).replace(/'/g, "''");
}