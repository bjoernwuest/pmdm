import { ScriptLogSchema } from "@/schema/ScriptLogSchema.ts";
import { desc, sql, and, eq, inArray, lt } from "drizzle-orm";
import type { DBClient } from "@/services/DatabaseDriver.ts";
import type { ScriptLogSchemaInsertType } from "@/types/_ScriptLogType.ts";

export async function insertScriptLog(db: DBClient, input: ScriptLogSchemaInsertType): Promise<void> {
    try {
        await db.insert(ScriptLogSchema).values(input);
    } catch (err) {
        console.error("[ScriptLogRepo] Failed to insert script log entry:", err);
    }
}

export type ScriptLogFilters = {
    logLevel?: string[];
    scriptCategory?: string[];
    dataTypeIdentifier?: string;
    productRequestIdentifier?: string;
};

export async function getScriptLogs(
    db: DBClient,
    filters: ScriptLogFilters,
    page: number,
    pageSize: number,
): Promise<{ rows: typeof ScriptLogSchema.$inferSelect[]; total: number; page: number; pageSize: number }> {
    const conditions = [];

    if (filters.logLevel && filters.logLevel.length > 0) {
        conditions.push(inArray(ScriptLogSchema.logLevel, filters.logLevel));
    }
    if (filters.scriptCategory && filters.scriptCategory.length > 0) {
        conditions.push(inArray(ScriptLogSchema.scriptCategory, filters.scriptCategory));
    }
    if (filters.dataTypeIdentifier) {
        conditions.push(eq(ScriptLogSchema.dataTypeIdentifier, filters.dataTypeIdentifier));
    }
    if (filters.productRequestIdentifier) {
        conditions.push(eq(ScriptLogSchema.productRequestIdentifier, filters.productRequestIdentifier));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
        .select({ c: sql<number>`count(*)` })
        .from(ScriptLogSchema)
        .where(whereClause);

    const total = Number(countRow?.c ?? 0);

    const rows = await db
        .select()
        .from(ScriptLogSchema)
        .where(whereClause)
        .orderBy(desc(ScriptLogSchema.createdAt))
        .offset(page * pageSize)
        .limit(pageSize);

    return { rows, total, page, pageSize };
}

export async function clearScriptLogs(db: DBClient): Promise<number> {
    const result = await db.delete(ScriptLogSchema).returning();
    return result.length;
}

export async function deleteScriptLogsOlderThan(db: DBClient, hours: number): Promise<number> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const result = await db
        .delete(ScriptLogSchema)
        .where(lt(ScriptLogSchema.createdAt, cutoff))
        .returning();
    return result.length;
}
