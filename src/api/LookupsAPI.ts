import type { ApiInstance } from "@/apps/api.ts";
import { status, t } from "elysia";
import { Type } from "@sinclair/typebox";
import {
    BadRequestErrorResponseSchema,
    ConflictErrorResponseSchema,
    ForbiddenErrorResponseSchema,
    IncludeDisabledQuerySchema,
    NotFoundErrorResponseSchema,
    PaginationQuerySchema,
    UnauthenticatedErrorResponseSchema,
} from "@/types/ApiType.ts";
import { getLoggedinUserObject, requirePermissions } from "@/services/Auth.ts";
import { FP_DO_CONFIGURATION, FP_MANAGE_LOOKUPS, FP_VIEW_LOOKUPS, FP_READ_PRODUCT_FILTER } from "@/services/auth/ApplicationDefinedFunctionalPermissions.ts";
import { runInTransaction } from "@/services/DatabaseDriver.ts";
import { getUserListPageSizes } from "@/services/ui_config.ts";
import {
    createValue,
    disableValue,
    enableValue,
    getValue,
    getValueByIdentifier,
    LookupRepo,
    updateValue,
} from "@/repo/LookupRepo.ts";
import { getSystemUser } from "@/repo/UserRepo.ts";
import {
    LookupsSchemaSelectSchema,
    LookupSummarySchema, LookupsValuesSelectSchema,
    message_CreateLookup,
    message_DisableLookup,
    message_UpdateLookup,
} from "@/types/LookupsType";
import { registerConfigurationEntityRoutes } from "@/api/_crud_API.ts";
import { addWorksheet, createWorkbook } from "@office-kit/xlsx/workbook";
import { getCell, getMaxCol, getMaxRow, writeRange } from "@office-kit/xlsx/worksheet";
import { loadWorkbook, workbookToBytes } from "@office-kit/xlsx/io";
import { getSheet, sheetNames } from "@office-kit/xlsx/workbook";
import { parseBooleanQuery } from "@/utils/parseBooleanQuery.ts";

type LookupImportRow = {
    rowNumber: number;
    identifier: string;
    name: string;
    disabled: boolean;
    sourceSystemIdentifier: string | null;
};

type ImportValidationError = {
    row: number;
    column: string;
    field: string;
    message: string;
    value?: string;
};

class ImportValidationFailure extends Error {
    constructor(public readonly errors: ImportValidationError[]) {
        super("Import validation failed");
    }
}

function buildXlsxResponse(bytes: Uint8Array, filename: string): Response {
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(new Blob([body]), {
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    });
}

function sanitizeFileName(value: string): string {
    return value.replace(/[<>:"/\\|?*]/g, "_").trim().replace(/\s+/g, " ") || "lookup_values";
}

function cellText(ws: unknown, row: number, column: number): string {
    const raw = getCell(ws as never, row, column)?.value;
    if (raw === undefined || raw === null) return "";
    return String(raw).trim();
}

function parseBooleanCell(value: unknown): { value: boolean | null; error: string | null } {
    if (typeof value === "boolean") return { value, error: null };
    if (typeof value === "number") {
        if (value === 0) return { value: false, error: null };
        if (value === 1) return { value: true, error: null };
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "y", "enabled"].includes(normalized)) return { value: true, error: null };
        if (["false", "0", "no", "n", "disabled"].includes(normalized)) return { value: false, error: null };
        if (normalized.length === 0) return { value: null, error: "Value is required" };
    }
    return { value: null, error: "Must be a boolean value" };
}

function getExpectedWorkbookHeaders(): string[] {
    return ["Identifier", "Name", "Disabled status", "Source system identifier"];
}

async function createLookupWorkbook(lookup: { identifier: string; name: string }, values: Array<{ identifier: string; name: string; disabled: boolean; sourceSystemIdentifier: string | null }>, templateOnly: boolean): Promise<{ bytes: Uint8Array; filename: string }> {
    const wb = createWorkbook();
    const ws = addWorksheet(wb, "Lookup values");
    writeRange(ws, "A1", [["Lookup", lookup.identifier]]);
    writeRange(ws, "A2", [getExpectedWorkbookHeaders()]);
    if (!templateOnly) {
        values.forEach((value, index) => {
            writeRange(ws, `A${index + 3}`, [[value.identifier, value.name, value.disabled, value.sourceSystemIdentifier ?? ""]]);
        });
    }
    return {
        bytes: await workbookToBytes(wb),
        filename: `${templateOnly ? "lookup_values_template" : "lookup_values"}_${sanitizeFileName(lookup.name)}.xlsx`,
    };
}

async function createLookupErrorWorkbook(lookup: { identifier: string; name: string }, errors: ImportValidationError[]): Promise<{ bytes: Uint8Array; filename: string }> {
    const wb = createWorkbook();
    const ws = addWorksheet(wb, "Errors");
    writeRange(ws, "A1", [["Lookup", lookup.identifier]]);
    writeRange(ws, "A2", [["Row", "Column", "Field", "Message", "Value"]]);
    errors.forEach((error, index) => {
        writeRange(ws, `A${index + 3}`, [[error.row, error.column, error.field, error.message, error.value ?? ""]]);
    });
    return {
        bytes: await workbookToBytes(wb),
        filename: `lookup_import_errors_${sanitizeFileName(lookup.name)}.xlsx`,
    };
}

async function parseLookupImportRows(lookup: { identifier: string; name: string }, ws: unknown): Promise<LookupImportRow[]> {
    const errors: ImportValidationError[] = [];
    const headers = getExpectedWorkbookHeaders();
    const maxCol = getMaxCol(ws as never);
    if (maxCol < headers.length) {
        errors.push({ row: 2, column: "A:D", field: "headers", message: "Header row is incomplete" });
    }

    headers.forEach((expected, index) => {
        const actual = cellText(ws, 2, index + 1);
        if (actual !== expected) {
            errors.push({ row: 2, column: String.fromCharCode(65 + index), field: "headers", message: `Expected '${expected}' but found '${actual || "(empty)"}'` });
        }
    });

    const workbookKind = cellText(ws, 1, 1);
    const workbookIdentifier = cellText(ws, 1, 2);
    if (workbookKind !== "Lookup") {
        errors.push({ row: 1, column: "A", field: "kind", message: "Row 1 column A must contain 'Lookup'", value: workbookKind });
    }
    if (workbookIdentifier !== lookup.identifier) {
        errors.push({ row: 1, column: "B", field: "identifier", message: `Row 1 column B must contain '${lookup.identifier}'`, value: workbookIdentifier });
    }

    const rows: LookupImportRow[] = [];
    const maxRow = getMaxRow(ws as never);
    const seenIdentifiers = new Set<string>();
    const seenNames = new Set<string>();

    for (let row = 3; row <= maxRow; row++) {
        const identifier = cellText(ws, row, 1);
        const name = cellText(ws, row, 2);
        const disabledRaw = (getCell(ws as never, row, 3)?.value) as unknown;
        const sourceSystemIdentifier = cellText(ws, row, 4);

        const rowHasData = [identifier, name, sourceSystemIdentifier, cellText(ws, row, 3)].some((value) => value.length > 0);
        if (!rowHasData) continue;

        if (maxCol > headers.length) {
            for (let col = headers.length + 1; col <= maxCol; col++) {
                const extra = cellText(ws, row, col);
                if (extra.length > 0) {
                    errors.push({ row, column: String.fromCharCode(64 + col), field: `column_${col}`, message: "Unexpected extra column data", value: extra });
                }
            }
        }

        if (name.length === 0) {
            errors.push({ row, column: "B", field: "name", message: "Name must not be empty" });
        }

        const parsedDisabled = parseBooleanCell(disabledRaw);
        if (disabledRaw !== undefined && disabledRaw !== null && disabledRaw !== "") {
            // Only validate if a value was provided; default to false if omitted
            if (parsedDisabled.error || parsedDisabled.value === null) {
                errors.push({ row, column: "C", field: "disabled", message: parsedDisabled.error ?? "Invalid boolean value", value: String(disabledRaw ?? "") });
            }
        }

        const normalizedName = name.toLowerCase();
        if (identifier.length > 0) {
            if (seenIdentifiers.has(identifier)) {
                errors.push({ row, column: "A", field: "identifier", message: "Duplicate identifier in import file", value: identifier });
            }
            seenIdentifiers.add(identifier);
        }
        if (normalizedName.length > 0) {
            if (seenNames.has(normalizedName)) {
                errors.push({ row, column: "B", field: "name", message: "Duplicate name in import file", value: name });
            }
            seenNames.add(normalizedName);
        }

        rows.push({
            rowNumber: row,
            identifier,
            name,
            disabled: parsedDisabled.value ?? false,
            sourceSystemIdentifier: sourceSystemIdentifier.length > 0 ? sourceSystemIdentifier : null,
        });
    }

    if (errors.length > 0) throw new ImportValidationFailure(errors);
    return rows;
}

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    // -----------------------------------------------------------------------
    // Standard CRUD routes via generic configuration entity registrar
    // (GET list, GET detail, POST, PUT, PATCH disabled for the top-level Lookup entity)
    // The repo's `get` returns enriched LookupSummarySchemaType rows with value stats.
    // -----------------------------------------------------------------------
    registerConfigurationEntityRoutes(app, {
        basePath: "/lookups",
        routeParam: "lookupid",
        entityLabel: "Lookup",
        listResponseKey: "lookups",
        detailResponseKey: "lookup",
        entitySchema: LookupsSchemaSelectSchema,
        listEntitySchema: LookupSummarySchema,
        viewPermission: FP_VIEW_LOOKUPS,
        managePermission: FP_MANAGE_LOOKUPS,
        repo: LookupRepo,
        pubSubTags: [message_CreateLookup, message_UpdateLookup, message_DisableLookup],
        createBodySchema: t.Object({
            name: t.String({ minLength: 1, maxLength: 255 }),
            sourceSystem: t.Optional(t.String({ maxLength: 255 })),
        }),
        updateBodySchema: t.Object({
            name: t.String({ minLength: 1, maxLength: 255 }),
            sourceSystem: t.Optional(t.String({ maxLength: 255 })),
            knownUpdatedAt: t.String(),
        }),
        mapCreateBody: (body) => ({
            name: body.name.trim(),
            sourceSystem: body.sourceSystem ?? undefined,
        }),
        mapUpdateBody: (body) => {
            const input: Record<string, unknown> = { name: body.name.trim() };
            if (body.sourceSystem !== undefined) input.sourceSystem = String(body.sourceSystem).trim();
            return { input, knownUpdatedAt: body.knownUpdatedAt } as { input: any; knownUpdatedAt: string };
        },
    });

    app.get("/lookups/:lookupid/export", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_VIEW_LOOKUPS]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const lookup = await LookupRepo.getByIdentifier(context.dbClient, context.params.lookupid, true);
        if (!lookup) return status(404, { error: "Lookup does not exist" });

        const values = await getValue(context.dbClient, lookup, true);
        const result = await createLookupWorkbook(lookup, values.map((value) => ({
            identifier: value.identifier,
            name: value.name,
            disabled: value.disabled,
            sourceSystemIdentifier: value.sourceSystemIdentifier ?? null,
        })), false);
        return buildXlsxResponse(result.bytes, result.filename);
    }, {
        params: t.Object({ lookupid: t.String({ format: "uuid" }) }),
        detail: {
            tags: ["Lookup"],
            summary: "Export lookup values to XLSX",
            description: "Downloads all values of a lookup as an XLSX spreadsheet. Requires FP_DO_CONFIGURATION AND FP_VIEW_LOOKUPS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "lookupid",
                    description: "UUID of the lookup whose values are exported.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "XLSX spreadsheet with all lookup values (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)." }),
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
    });

    app.get("/lookups/:lookupid/export-template", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_VIEW_LOOKUPS]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const lookup = await LookupRepo.getByIdentifier(context.dbClient, context.params.lookupid, true);
        if (!lookup) return status(404, { error: "Lookup does not exist" });

        const result = await createLookupWorkbook(lookup, [], true);
        return buildXlsxResponse(result.bytes, result.filename);
    }, {
        params: t.Object({ lookupid: t.String({ format: "uuid" }) }),
        detail: {
            tags: ["Lookup"],
            summary: "Download lookup import template",
            description: "Downloads an XLSX template for importing lookup values. Requires FP_VIEW_LOOKUPS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "lookupid",
                    description: "UUID of the lookup for which the XLSX import template is generated.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "XLSX import template file (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)." }),
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
    });

    app.post("/lookups/:lookupid/import", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_LOOKUPS]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const lookup = await LookupRepo.getByIdentifier(context.dbClient, context.params.lookupid, true);
        if (!lookup) return status(404, { error: "Lookup does not exist" });

        const reqFormData = await context.request.formData();
        const file = reqFormData.get("file");
        if (!(file instanceof Blob)) return status(400, { error: "No file provided" });

        let workbook: Awaited<ReturnType<typeof loadWorkbook>>;
        try {
            const buf = await file.arrayBuffer();
            workbook = await loadWorkbook({ toBytes: async () => new Uint8Array(buf) });
        } catch (e: any) {
            return status(400, { error: `Failed to parse XLSX file: ${e.message}` });
        }

        const names = sheetNames(workbook);
        if (names.length === 0) return status(400, { error: "XLSX file has no sheets" });
        const ws = getSheet(workbook, names[0]!);
        if (!ws) return status(400, { error: "XLSX file has no sheets" });

        let rows: LookupImportRow[];
        try {
            rows = await parseLookupImportRows(lookup, ws);
        } catch (error) {
            if (error instanceof ImportValidationFailure) {
                const report = await createLookupErrorWorkbook(lookup, error.errors);
                const body = report.bytes.buffer.slice(report.bytes.byteOffset, report.bytes.byteOffset + report.bytes.byteLength) as ArrayBuffer;
                return new Response(new Blob([body]), {
                    status: 400,
                    headers: {
                        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "Content-Disposition": `attachment; filename="${report.filename}"`,
                        "X-Import-Error-Count": String(error.errors.length),
                    },
                });
            }
            return status(400, error instanceof Error ? error.message : "Invalid import workbook");
        }

        try {
            const result = await runInTransaction(context.dbClient, async (tx) => {
                const user = (await getLoggedinUserObject(tx, claims)) ?? (await getSystemUser(tx));
                let created = 0;
                let updated = 0;

                for (const row of rows) {
                    if (row.identifier.length > 0) {
                        const existing = await getValueByIdentifier(tx, row.identifier);
                        if (!existing || existing.lookupIdentifier !== lookup.identifier) {
                            throw new ImportValidationFailure([{ row: row.rowNumber, column: "A", field: "identifier", message: "Lookup value does not exist", value: row.identifier }]);
                        }

                        const updatePayload: { name?: string; sourceSystemIdentifier?: string | null } = {};
                        if (existing.name !== row.name) updatePayload.name = row.name;
                        if ((existing.sourceSystemIdentifier ?? null) !== row.sourceSystemIdentifier) updatePayload.sourceSystemIdentifier = row.sourceSystemIdentifier;

                        let current = existing;
                        if (Object.keys(updatePayload).length > 0) {
                            const updatedRows = await updateValue(tx, user, existing.identifier, updatePayload as never, existing.updatedAt);
                            current = updatedRows[0] ?? (() => { throw new ImportValidationFailure([{ row: row.rowNumber, column: "B", field: "name", message: "Lookup value could not be updated", value: row.name }]); })();
                            updated += 1;
                        }

                        if (current.disabled !== row.disabled) {
                            const toggled = row.disabled
                                ? await disableValue(tx, user, current.identifier, current.updatedAt)
                                : await enableValue(tx, user, current.identifier, current.updatedAt);
                            current = toggled[0] ?? (() => { throw new ImportValidationFailure([{ row: row.rowNumber, column: "C", field: "disabled", message: "Lookup value could not be updated", value: String(row.disabled) }]); })();
                            updated += 1;
                        }
                    } else {
                        const createdRows = await createValue(tx, user, {
                            lookupIdentifier: lookup.identifier,
                            name: row.name,
                            disabled: row.disabled,
                            sourceSystemIdentifier: row.sourceSystemIdentifier,
                        } as never);
                        if (createdRows.length === 0) {
                            throw new ImportValidationFailure([{ row: row.rowNumber, column: "A", field: "identifier", message: "Lookup value could not be created", value: row.name }]);
                        }
                        created += 1;
                    }
                }

                return { created, updated };
            });

            return result;
        } catch (error) {
            if (error instanceof ImportValidationFailure) {
                const report = await createLookupErrorWorkbook(lookup, error.errors);
                const body = report.bytes.buffer.slice(report.bytes.byteOffset, report.bytes.byteOffset + report.bytes.byteLength) as ArrayBuffer;
                return new Response(new Blob([body]), {
                    status: 400,
                    headers: {
                        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "Content-Disposition": `attachment; filename="${report.filename}"`,
                        "X-Import-Error-Count": String(error.errors.length),
                    },
                });
            }
            throw error;
        }
    }, {
        params: t.Object({ lookupid: t.String({ format: "uuid" }) }),
        detail: {
            tags: ["Lookup"],
            summary: "Import lookup values from XLSX",
            description: "Imports lookup values from an XLSX spreadsheet and returns a downloadable error report when validation fails. Requires FP_DO_CONFIGURATION AND FP_MANAGE_LOOKUPS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "lookupid",
                    description: "UUID of the lookup whose values are imported.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ created: t.Number(), updated: t.Number() }, { description: "Import result with the number of created and updated lookup values." }),
            400: t.Any({ description: "Invalid request – missing file, malformed XLSX, or a validation error report workbook (XLSX) describing per-row errors." }),
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
    });

    // -----------------------------------------------------------------------
    // Lookup value sub-routes (nested resources – not covered by generic CRUD)
    // -----------------------------------------------------------------------

    app.get("/lookups/:lookupid/values", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [], [FP_VIEW_LOOKUPS, FP_READ_PRODUCT_FILTER]);
        if (!permissionCheck.authz.some((perm) => perm.identifier === FP_VIEW_LOOKUPS.identifier || perm.identifier === FP_READ_PRODUCT_FILTER.identifier)) return status(403, { error: `Permission denied. Required: ${FP_VIEW_LOOKUPS.functionalPermissionName}` });

        const lookup = await LookupRepo.getByIdentifier(context.dbClient, context.params.lookupid);
        if (!lookup) return status(404, { error: "Lookup does not exist" });

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? availablePageSizes[0] ?? 10));
        const includeDisabled = parseBooleanQuery(context.query.includeDisabled);
        const values = await getValue(context.dbClient, lookup, includeDisabled, page, pageSize);

        return { values, page, pageSize, availablePageSizes, includeDisabled };
    }, {
        params: t.Object({ lookupid: t.String({ format: "uuid" }) }),
        query: Type.Composite([PaginationQuerySchema, IncludeDisabledQuerySchema]),
        response: {
            200: t.Object({
                values: t.Array(LookupsValuesSelectSchema),
                page: t.Number({ minimum: 0 }),
                pageSize: t.Number({ minimum: 1 }),
                availablePageSizes: t.Array(t.Number({ minimum: 1 })),
                includeDisabled: t.Boolean(),
            }, { description: "Paged lookup values with pagination metadata and disabled-inclusion flag." }),
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
        },
        detail: {
            tags: ["Lookup"],
            summary: "Get paged lookup values",
            description: "Returns lookup values with pagination metadata and optional inclusion of disabled entries. Requires FP_VIEW_LOOKUPS or FP_READ_PRODUCT_FILTER.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "lookupid",
                    description: "UUID of the lookup whose values are listed.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "page",
                    description: "Zero-based page number for pagination. Defaults to 0.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 0, default: 0 },
                },
                {
                    name: "pageSize",
                    description: "Number of values per page. Must be one of the available page sizes returned by the server. Defaults to the first available size.",
                    in: "query",
                    required: false,
                    schema: { type: "integer", minimum: 1 },
                },
                {
                    name: "includeDisabled",
                    description: "Include disabled values in the results. Accepts 'true', '1', true (boolean). Defaults to false.",
                    in: "query",
                    required: false,
                    schema: { type: "string", enum: ["true", "1", "false", "0"], default: "false" },
                },
            ],
        },
    });

    app.post("/lookups/:lookupid/values", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_LOOKUPS]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const lookup = await LookupRepo.getByIdentifier(context.dbClient, context.params.lookupid);
        if (!lookup) return status(404, { error: "Lookup does not exist" });

        const name = context.body.name.trim();
        if (name.length === 0) return status(400, { error: "Name must not be empty" });

        const created = await runInTransaction(context.dbClient, async (tx) => {
            const user = await getLoggedinUserObject(tx, claims) ?? await getSystemUser(tx);
            return await createValue(tx, user, { lookupIdentifier: lookup.identifier, name, sourceSystemIdentifier: context.body.sourceSystemIdentifier ?? null, disabled: false });
        });

        if (created.length === 0) return status(409, { error: "A lookup value with this name already exists" });
        return created[0]!;
    }, {
        params: t.Object({ lookupid: t.String({ format: "uuid" }) }),
        body: t.Object({ name: t.String({ minLength: 1, maxLength: 255 }), sourceSystemIdentifier: t.Optional(t.Union([t.String(), t.Null()])) }),
        response: {
            200: {...LookupsValuesSelectSchema, description: "The newly created lookup value."},
            400: BadRequestErrorResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
            409: ConflictErrorResponseSchema,
        },
        detail: {
            tags: ["Lookup"],
            summary: "Create lookup value",
            description: "Creates a new lookup value for the selected lookup. Requires FP_DO_CONFIGURATION AND FP_MANAGE_LOOKUPS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "lookupid",
                    description: "UUID of the lookup the new value belongs to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    app.put("/lookups/:lookupid/values/:valueid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_LOOKUPS]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const name = context.body.name.trim();
        if (name.length === 0) return status(400, { error: "Name must not be empty" });

        const updated = await runInTransaction(context.dbClient, async (tx) => {
            const user = await getLoggedinUserObject(tx, claims) ?? await getSystemUser(tx);
            const lookup = await LookupRepo.getByIdentifier(tx, context.params.lookupid);
            if (!lookup) return null;
            const existing = await getValueByIdentifier(tx, context.params.valueid);
            if (!existing || existing.lookupIdentifier !== lookup.identifier) return null;
            const rows = await updateValue(tx, user, context.params.valueid, { name }, context.body.knownUpdatedAt);
            return rows[0] ?? false;
        });

        if (updated === null) return status(404, { error: "Lookup value does not exist" });
        if (updated === false) return status(409, { error: "Lookup value was modified by another user" });
        return updated;
    }, {
        params: t.Object({ lookupid: t.String({ format: "uuid" }), valueid: t.String({ format: "uuid" }) }),
        body: t.Object({ name: t.String({ minLength: 1, maxLength: 255 }), knownUpdatedAt: t.String() }),
        response: {
            200: {...LookupsValuesSelectSchema, description: "The renamed lookup value."},
            400: BadRequestErrorResponseSchema,
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
            409: ConflictErrorResponseSchema,
        },
        detail: {
            tags: ["Lookup"],
            summary: "Rename lookup value",
            description: "Updates the lookup value name using optimistic locking via knownUpdatedAt. Requires FP_DO_CONFIGURATION AND FP_MANAGE_LOOKUPS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "lookupid",
                    description: "UUID of the lookup the value belongs to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "valueid",
                    description: "UUID of the lookup value to rename.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    app.patch("/lookups/:lookupid/values/:valueid/disabled", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const permissionCheck = await requirePermissions(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_LOOKUPS]);
        if (!permissionCheck.ok) return permissionCheck.denial;

        const updated = await runInTransaction(context.dbClient, async (tx) => {
            const user = await getLoggedinUserObject(tx, claims) ?? await getSystemUser(tx);
            const lookup = await LookupRepo.getByIdentifier(tx, context.params.lookupid);
            if (!lookup) return null;
            const existing = await getValueByIdentifier(tx, context.params.valueid);
            if (!existing || existing.lookupIdentifier !== lookup.identifier) return null;
            const rows = context.body.disabled
                ? await disableValue(tx, user, context.params.valueid, context.body.knownUpdatedAt)
                : await enableValue(tx, user, context.params.valueid, context.body.knownUpdatedAt);
            return rows[0] ?? false;
        });

        if (updated === null) return status(404, { error: "Lookup value does not exist" });
        if (updated === false) return status(409, { error: "Lookup value was modified by another user" });
        return updated;
    }, {
        params: t.Object({ lookupid: t.String({ format: "uuid" }), valueid: t.String({ format: "uuid" }) }),
        body: t.Object({ disabled: t.Boolean(), knownUpdatedAt: t.String() }),
        response: {
            200: {...LookupsValuesSelectSchema, description: "The lookup value with updated disabled status."},
            401: UnauthenticatedErrorResponseSchema,
            403: ForbiddenErrorResponseSchema,
            404: NotFoundErrorResponseSchema,
            409: ConflictErrorResponseSchema,
        },
        detail: {
            tags: ["Lookup"],
            summary: "Enable or disable lookup value",
            description: "Sets the disabled flag for a lookup value using optimistic locking via knownUpdatedAt. Requires FP_DO_CONFIGURATION AND FP_MANAGE_LOOKUPS.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "lookupid",
                    description: "UUID of the lookup the value belongs to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "valueid",
                    description: "UUID of the lookup value to enable or disable.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });
}
