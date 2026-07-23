import type { DBClient } from "@/services/DatabaseDriver.ts";
import { ProductExports } from "@/schema/ProductExportSchema.ts";
import { ProductRequests, ProductRequestsValues, ProductRequestStatus } from "@/schema/ProductRequestSchema.ts";
import { ProductTypesDataTypesTargetSystems, ProductTypesDataTypes } from "@/schema/ProductTypeSchema.ts";
import { ProductTypes } from "@/schema/ProductTypeSchema.ts";
import { Products, ProductsValues } from "@/schema/ProductSchema.ts";
import { DataTypeSchema } from "@/schema/DataTypeSchema.ts";
import { TargetSystems } from "@/schema/TargetSystemSchema.ts";
import { User } from "@/schema/UserSchema.ts";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import PubSub from "@/services/PubSub.ts";
import {
    message_DoneProductRequest,
    message_ProductExportExported,
    message_ProductExportImported,
} from "@/types/ProductRequestType.ts";

export class AlreadyExportedError extends Error {
    constructor(productRequestId: string, targetSystemId: string) {
        super(`Already exported: productRequest=${productRequestId}, targetSystem=${targetSystemId}`);
        this.name = "AlreadyExportedError";
    }
}

export class AlreadyImportedError extends Error {
    constructor(productRequestId: string, targetSystemId: string) {
        super(`Already imported: productRequest=${productRequestId}, targetSystem=${targetSystemId}`);
        this.name = "AlreadyImportedError";
    }
}

function buildUserDisplaySql(userAlias: string): SQL {
    return sql`CASE
        WHEN COALESCE(${sql.identifier(userAlias)}.first_name, '') = '' AND COALESCE(${sql.identifier(userAlias)}.last_name, '') = ''
        THEN '(' || COALESCE(${sql.identifier(userAlias)}.email, '') || ')'
        WHEN ${sql.identifier(userAlias)}.email IS NULL
        THEN COALESCE(${sql.identifier(userAlias)}.first_name, '') || ' ' || COALESCE(${sql.identifier(userAlias)}.last_name, '')
        ELSE COALESCE(${sql.identifier(userAlias)}.first_name, '') || ' ' || COALESCE(${sql.identifier(userAlias)}.last_name, '') || ' (' || ${sql.identifier(userAlias)}.email || ')'
    END`;
}

async function checkAndTransitionToDone(
    tx: DBClient,
    productRequestId: string,
): Promise<void> {
    const allRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(ProductExports)
        .where(eq(ProductExports.productRequest, productRequestId));

    const completedRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(ProductExports)
        .where(and(
            eq(ProductExports.productRequest, productRequestId),
            sql`${ProductExports.exportedAt} IS NOT NULL`,
            sql`${ProductExports.importedAt} IS NOT NULL`,
        ));

    if (allRows[0]!.count !== completedRows[0]!.count) return;

    const [updated] = await tx
        .update(ProductRequests)
        .set({ status: ProductRequestStatus.done, updatedAt: sql`now()` })
        .where(eq(ProductRequests.identifier, productRequestId))
        .returning();

    if (!updated) return;

    const request = await tx
        .select({
            productNumber: ProductRequests.productNumber,
            productType: ProductRequests.productType,
            productToUpdate: ProductRequests.productToUpdate,
        })
        .from(ProductRequests)
        .where(eq(ProductRequests.identifier, productRequestId))
        .limit(1);

    if (!request[0]) return;

    const { productNumber, productType, productToUpdate } = request[0];
    const isUpdateRequest = !!productToUpdate;

    const requestValues = await tx
        .select({
            dataType: ProductRequestsValues.dataType,
            value: ProductRequestsValues.value,
            defaultValue: ProductRequestsValues.defaultValue,
            editableOnUpdate: ProductTypesDataTypes.editableOnUpdate,
        })
        .from(ProductRequestsValues)
        .leftJoin(ProductTypesDataTypes, and(
            eq(ProductTypesDataTypes.productType, productType!),
            eq(ProductTypesDataTypes.dataType, ProductRequestsValues.dataType),
        ))
        .where(eq(ProductRequestsValues.productRequest, productRequestId));

    const resolvedValues: Array<{ dataType: string; value: unknown }> = [];
    for (const rv of requestValues) {
        if (isUpdateRequest && rv.editableOnUpdate === false) continue;

        const resolved = rv.value ?? rv.defaultValue;
        const finalValue = (resolved === "null") ? null : resolved;
        resolvedValues.push({
            dataType: rv.dataType!,
            value: finalValue,
        });
    }

    const existingProduct = await tx
        .select({ productNumber: Products.productNumber })
        .from(Products)
        .where(eq(Products.productNumber, productNumber))
        .limit(1);

    if (existingProduct.length > 0) {
        for (const rv of resolvedValues) {
            await tx
                .insert(ProductsValues)
                .values({
                    productNumber,
                    dataTypeIdentifier: rv.dataType,
                    value: rv.value as any,
                })
                .onConflictDoUpdate({
                    target: [ProductsValues.productNumber, ProductsValues.dataTypeIdentifier],
                    set: { value: rv.value as any },
                });
        }
        await tx
            .update(Products)
            .set({ updatedAt: sql`now()` })
            .where(eq(Products.productNumber, productNumber));
    } else {
        await tx
            .insert(Products)
            .values({
                productNumber,
                productTypeIdentifier: productType!,
                disabled: false,
            });

        for (const rv of resolvedValues) {
            await tx
                .insert(ProductsValues)
                .values({
                    productNumber,
                    dataTypeIdentifier: rv.dataType,
                    value: rv.value as any,
                });
        }
    }

    PubSub.publish(message_DoneProductRequest, updated);
}

export async function createProductExportRows(
    tx: DBClient,
    productRequestId: string,
    productTypeId: string,
): Promise<void> {
    const targetSystems = await tx
        .selectDistinct({ targetSystem: ProductTypesDataTypesTargetSystems.targetSystem })
        .from(ProductTypesDataTypesTargetSystems)
        .innerJoin(TargetSystems, eq(ProductTypesDataTypesTargetSystems.targetSystem, TargetSystems.identifier))
        .where(and(
            eq(ProductTypesDataTypesTargetSystems.productType, productTypeId),
            eq(TargetSystems.disabled, false),
        ));

    if (targetSystems.length === 0) {
        await checkAndTransitionToDone(tx, productRequestId);
        return;
    }

    const rows = targetSystems.map((ts) => ({
        productRequest: productRequestId,
        targetSystem: ts.targetSystem,
    }));

    await tx.insert(ProductExports).values(rows);
}

export async function markAsExported(
    tx: DBClient,
    productRequestId: string,
    targetSystemId: string,
    userId: string,
): Promise<void> {
    const existing = await tx
        .select({ exportedAt: ProductExports.exportedAt })
        .from(ProductExports)
        .where(and(
            eq(ProductExports.productRequest, productRequestId),
            eq(ProductExports.targetSystem, targetSystemId),
        ))
        .limit(1);

    if (existing.length === 0) {
        throw new Error("ProductExport row not found");
    }
    if (existing[0]!.exportedAt !== null) {
        throw new AlreadyExportedError(productRequestId, targetSystemId);
    }

    await tx
        .update(ProductExports)
        .set({
            exportedAt: sql`now()`,
            exportedBy: userId,
            importedAt: null,
            importedBy: null,
        })
        .where(and(
            eq(ProductExports.productRequest, productRequestId),
            eq(ProductExports.targetSystem, targetSystemId),
        ));

    const user = await tx
        .select({ firstName: User.firstName, lastName: User.lastName, email: User.email })
        .from(User)
        .where(eq(User.identifier, userId))
        .limit(1);

    let exportedByDisplay = "";
    if (user.length > 0) {
        const u = user[0]!;
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
        exportedByDisplay = u.email
            ? (name ? `${name} (${u.email})` : `(${u.email})`)
            : (name || "");
    }

    PubSub.publish(message_ProductExportExported, {
        productRequest: productRequestId,
        targetSystem: targetSystemId,
        exportedAt: new Date().toISOString(),
        exportedByDisplay,
    });
}

export async function markAsImported(
    tx: DBClient,
    productRequestId: string,
    targetSystemId: string,
    userId: string,
): Promise<void> {
    const existing = await tx
        .select({ importedAt: ProductExports.importedAt })
        .from(ProductExports)
        .where(and(
            eq(ProductExports.productRequest, productRequestId),
            eq(ProductExports.targetSystem, targetSystemId),
        ))
        .limit(1);

    if (existing.length === 0) {
        throw new Error("ProductExport row not found");
    }
    if (existing[0]!.importedAt !== null) {
        throw new AlreadyImportedError(productRequestId, targetSystemId);
    }

    await tx
        .update(ProductExports)
        .set({
            importedAt: sql`now()`,
            importedBy: userId,
        })
        .where(and(
            eq(ProductExports.productRequest, productRequestId),
            eq(ProductExports.targetSystem, targetSystemId),
        ));

    const user = await tx
        .select({ firstName: User.firstName, lastName: User.lastName, email: User.email })
        .from(User)
        .where(eq(User.identifier, userId))
        .limit(1);

    let importedByDisplay = "";
    if (user.length > 0) {
        const u = user[0]!;
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
        importedByDisplay = u.email
            ? (name ? `${name} (${u.email})` : `(${u.email})`)
            : (name || "");
    }

    PubSub.publish(message_ProductExportImported, {
        productRequest: productRequestId,
        targetSystem: targetSystemId,
        importedAt: new Date().toISOString(),
        importedByDisplay,
    });

    await checkAndTransitionToDone(tx, productRequestId);
}

export async function importProductExports(
    tx: DBClient,
    targetSystemId: string,
    userId: string,
    rows: Array<{ productNumber: string; exported: boolean; imported: boolean }>,
): Promise<{ totalRows: number; exportedCount: number; importedCount: number; errors: Array<{ row: number; productNumber: string; message: string }> }> {
    let exportedCount = 0;
    let importedCount = 0;
    const errors: Array<{ row: number; productNumber: string; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 1;

        if (!row.exported && !row.imported) continue;

        const requests = await tx
            .select({ identifier: ProductRequests.identifier })
            .from(ProductRequests)
            .where(and(
                eq(ProductRequests.productNumber, row.productNumber),
                eq(ProductRequests.status, ProductRequestStatus.importing),
            ))
            .limit(1);

        if (requests.length === 0) {
            errors.push({ row: rowNum, productNumber: row.productNumber, message: "Product request not in importing status" });
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
            errors.push({ row: rowNum, productNumber: row.productNumber, message: "Product export row not found for target system" });
            continue;
        }

        const pe = peRows[0]!;

        if (row.exported) {
            if (pe.exportedAt !== null) {
                errors.push({ row: rowNum, productNumber: row.productNumber, message: "Already exported" });
            } else {
                await markAsExported(tx, requestId, targetSystemId, userId);
                exportedCount++;
            }
        }

        if (row.imported) {
            if (pe.importedAt !== null) {
                errors.push({ row: rowNum, productNumber: row.productNumber, message: "Already imported" });
            } else {
                await markAsImported(tx, requestId, targetSystemId, userId);
                importedCount++;
            }
        }
    }

    return { totalRows: rows.length, exportedCount, importedCount, errors };
}

export async function getExportPageData(
    db: DBClient,
    whereCondition: SQL | undefined,
    page: number,
    pageSize: number,
): Promise<{
    requests: Array<{
        identifier: string;
        productNumber: string;
        productType: string;
        productTypeName: string;
        createdByName: string;
        exports: Array<{
            targetSystem: string;
            targetSystemName: string;
            targetSystemDisabled: boolean;
            exportedAt: string | null;
            exportedByDisplay: string | null;
            importedAt: string | null;
            importedByDisplay: string | null;
        }>;
    }>;
    targetSystems: Array<{ identifier: string; name: string; disabled: boolean }>;
    total: number;
}> {
    const baseConditions = [eq(ProductRequests.status, ProductRequestStatus.importing)];
    if (whereCondition) baseConditions.push(whereCondition);
    const baseWhere = and(...baseConditions);

    const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ProductRequests)
        .where(baseWhere);

    const total = countResult[0]?.count ?? 0;

    const requestRows = await db
        .select({
            identifier: ProductRequests.identifier,
            productNumber: ProductRequests.productNumber,
            productType: ProductRequests.productType,
            productTypeName: ProductTypes.name,
            createdByName: sql<string>`COALESCE(${User.firstName} || ' ' || ${User.lastName}, ${User.email}, 'Unknown')`.as("createdByName"),
        })
        .from(ProductRequests)
        .leftJoin(ProductTypes, eq(ProductRequests.productType, ProductTypes.identifier))
        .leftJoin(User, eq(ProductRequests.createdBy, User.identifier))
        .where(baseWhere)
        .orderBy(sql`${ProductRequests.createdAt} DESC`)
        .limit(pageSize)
        .offset(page * pageSize);

    const requestIds = requestRows.map((r) => r.identifier);

    let exportRows: Array<{
        productRequest: string;
        targetSystem: string;
        targetSystemName: string;
        targetSystemDisabled: boolean;
        exportedAt: string | null;
        exportedByDisplay: string | null;
        importedAt: string | null;
        importedByDisplay: string | null;
    }> = [];

    if (requestIds.length > 0) {
        const rawExportRows = await db
            .select({
                productRequest: ProductExports.productRequest,
                targetSystem: ProductExports.targetSystem,
                targetSystemName: TargetSystems.name,
                targetSystemDisabled: TargetSystems.disabled,
                exportedAt: ProductExports.exportedAt,
                exportedByDisplay: buildUserDisplaySql("exported_user").as("exportedByDisplay"),
                importedAt: ProductExports.importedAt,
                importedByDisplay: buildUserDisplaySql("imported_user").as("importedByDisplay"),
            })
            .from(ProductExports)
            .innerJoin(TargetSystems, eq(ProductExports.targetSystem, TargetSystems.identifier))
            .leftJoin(sql`${User} AS exported_user`, eq(ProductExports.exportedBy, sql.raw("exported_user.identifier")))
            .leftJoin(sql`${User} AS imported_user`, eq(ProductExports.importedBy, sql.raw("imported_user.identifier")))
            .where(inArray(ProductExports.productRequest, requestIds));

        exportRows = rawExportRows.map((r) => ({
            productRequest: r.productRequest!,
            targetSystem: r.targetSystem!,
            targetSystemName: r.targetSystemName,
            targetSystemDisabled: r.targetSystemDisabled,
            exportedAt: r.exportedAt,
            exportedByDisplay: r.exportedByDisplay as string,
            importedAt: r.importedAt,
            importedByDisplay: r.importedByDisplay as string,
        }));
    }

    const allTargetSystems = await db
        .select({
            identifier: TargetSystems.identifier,
            name: TargetSystems.name,
            disabled: TargetSystems.disabled,
        })
        .from(TargetSystems)
        .orderBy(TargetSystems.name);

    const requests = requestRows.map((req) => ({
        identifier: req.identifier,
        productNumber: req.productNumber,
        productType: req.productType!,
        productTypeName: req.productTypeName ?? "Unknown",
        createdByName: req.createdByName ?? "Unknown",
        exports: exportRows
            .filter((er) => er.productRequest === req.identifier)
            .map((er) => ({
                targetSystem: er.targetSystem,
                targetSystemName: er.targetSystemName,
                targetSystemDisabled: er.targetSystemDisabled,
                exportedAt: er.exportedAt,
                exportedByDisplay: er.exportedByDisplay,
                importedAt: er.importedAt,
                importedByDisplay: er.importedByDisplay,
            })),
    }));

    return { requests, targetSystems: allTargetSystems, total };
}

export async function getExportRowsByRequest(
    db: DBClient,
    productRequestId: string,
): Promise<Array<{
    productRequest: string;
    targetSystem: string;
    targetSystemName: string;
    exportedAt: string | null;
    exportedByDisplay: string | null;
    importedAt: string | null;
    importedByDisplay: string | null;
}>> {
    const rows = await db
        .select({
            productRequest: ProductExports.productRequest,
            targetSystem: ProductExports.targetSystem,
            targetSystemName: TargetSystems.name,
            exportedAt: ProductExports.exportedAt,
            exportedByDisplay: buildUserDisplaySql("exported_user").as("exportedByDisplay"),
            importedAt: ProductExports.importedAt,
            importedByDisplay: buildUserDisplaySql("imported_user").as("importedByDisplay"),
        })
        .from(ProductExports)
        .innerJoin(TargetSystems, eq(ProductExports.targetSystem, TargetSystems.identifier))
        .leftJoin(sql`${User} AS exported_user`, eq(ProductExports.exportedBy, sql.raw("exported_user.identifier")))
        .leftJoin(sql`${User} AS imported_user`, eq(ProductExports.importedBy, sql.raw("imported_user.identifier")))
        .where(eq(ProductExports.productRequest, productRequestId));

    return rows.map((r) => ({
        productRequest: r.productRequest!,
        targetSystem: r.targetSystem!,
        targetSystemName: r.targetSystemName,
        exportedAt: r.exportedAt,
        exportedByDisplay: r.exportedByDisplay as string,
        importedAt: r.importedAt,
        importedByDisplay: r.importedByDisplay as string,
    }));
}