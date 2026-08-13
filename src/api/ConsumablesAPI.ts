import type { ApiInstance } from "@/apps/api.ts";
import { status, t } from "elysia";
import { authorize, getLoggedinUserObject } from "@/services/Auth.ts";
import { FP_DO_CONFIGURATION, FP_MANAGE_CONSUMABLES, FP_VIEW_CONSUMABLES, FP_READ_PRODUCT_FILTER } from "@/services/auth/FunctionalPermissions.ts";
import { runInTransaction } from "@/services/DatabaseDriver.ts";
import { getUserListPageSizes } from "@/services/ui_config.ts";
import {
    ConsumableRepo,
    createValue,
    disableValue,
    enableValue,
    getValue,
    getValueByIdentifier,
    updateValue,
} from "@/repo/ConsumableRepo.ts";
import { getSystemUser } from "@/repo/UserRepo.ts";
import {
    ConsumablesSelectSchema,
    ConsumableSummarySchema, ConsumablesValuesSelectSchema,
    message_CreateConsumable,
    message_DisableConsumable,
    message_UpdateConsumable,
} from "@/types/ConsumableType";
import { registerConfigurationEntityRoutes } from "@/api/_crud_API.ts";
import { addWorksheet, createWorkbook } from "@office-kit/xlsx/workbook";
import { getCell, getMaxCol, getMaxRow, writeRange } from "@office-kit/xlsx/worksheet";
import { loadWorkbook, workbookToBytes } from "@office-kit/xlsx/io";
import { getSheet, sheetNames } from "@office-kit/xlsx/workbook";

function parseBooleanQuery(value: unknown): boolean {
    return value === true || value === "true" || value === "1";
}

type ConsumableImportRow = {
    rowNumber: number;
    identifier: string;
    name: string;
    disabled: boolean;
    isUsed: boolean;
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
    return value.replace(/[<>:"/\\|?*]/g, "_").trim().replace(/\s+/g, " ") || "consumable_values";
}

function cellText(ws: any, row: number, column: number): string {
    const raw = getCell(ws, row, column)?.value;
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
    return ["Identifier", "Name", "Disabled status", "Used status"];
}

async function createConsumableWorkbook(consumable: { identifier: string; name: string }, values: Array<{ identifier: string; name: string; disabled: boolean; isUsed: boolean }>, templateOnly: boolean): Promise<{ bytes: Uint8Array; filename: string }> {
    const wb = createWorkbook();
    const ws = addWorksheet(wb, "Consumable values");
    writeRange(ws, "A1", [["Consumable", consumable.identifier]]);
    writeRange(ws, "A2", [getExpectedWorkbookHeaders()]);
    if (!templateOnly) {
        values.forEach((value, index) => {
            writeRange(ws, `A${index + 3}`, [[value.identifier, value.name, value.disabled, value.isUsed]]);
        });
    }
    return {
        bytes: await workbookToBytes(wb),
        filename: `${templateOnly ? "consumable_values_template" : "consumable_values"}_${sanitizeFileName(consumable.name)}.xlsx`,
    };
}

async function createConsumableErrorWorkbook(consumable: { identifier: string; name: string }, errors: ImportValidationError[]): Promise<{ bytes: Uint8Array; filename: string }> {
    const wb = createWorkbook();
    const ws = addWorksheet(wb, "Errors");
    writeRange(ws, "A1", [["Consumable", consumable.identifier]]);
    writeRange(ws, "A2", [["Row", "Column", "Field", "Message", "Value"]]);
    errors.forEach((error, index) => {
        writeRange(ws, `A${index + 3}`, [[error.row, error.column, error.field, error.message, error.value ?? ""]]);
    });
    return {
        bytes: await workbookToBytes(wb),
        filename: `consumable_import_errors_${sanitizeFileName(consumable.name)}.xlsx`,
    };
}

async function parseConsumableImportRows(consumable: { identifier: string; name: string }, ws: any): Promise<ConsumableImportRow[]> {
    const errors: ImportValidationError[] = [];
    const headers = getExpectedWorkbookHeaders();
    const maxCol = getMaxCol(ws);
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
    if (workbookKind !== "Consumable") {
        errors.push({ row: 1, column: "A", field: "kind", message: "Row 1 column A must contain 'Consumable'", value: workbookKind });
    }
    if (workbookIdentifier !== consumable.identifier) {
        errors.push({ row: 1, column: "B", field: "identifier", message: `Row 1 column B must contain '${consumable.identifier}'`, value: workbookIdentifier });
    }

    const rows: ConsumableImportRow[] = [];
    const maxRow = getMaxRow(ws);
    const seenIdentifiers = new Set<string>();
    const seenNames = new Set<string>();

    for (let row = 3; row <= maxRow; row++) {
        const identifier = cellText(ws, row, 1);
        const name = cellText(ws, row, 2);
        const disabledRaw = getCell(ws, row, 3)?.value;
        const usedRaw = getCell(ws, row, 4)?.value;

        const rowHasData = [identifier, name, cellText(ws, row, 3), cellText(ws, row, 4)].some((value) => value.length > 0);
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

        const parsedUsed = parseBooleanCell(usedRaw);
        if (usedRaw !== undefined && usedRaw !== null && usedRaw !== "") {
            // Only validate if a value was provided; default to false if omitted
            if (parsedUsed.error || parsedUsed.value === null) {
                errors.push({ row, column: "D", field: "isUsed", message: parsedUsed.error ?? "Invalid boolean value", value: String(usedRaw ?? "") });
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
            isUsed: parsedUsed.value ?? false,
        });
    }

    if (errors.length > 0) throw new ImportValidationFailure(errors);
    return rows;
}

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    // -----------------------------------------------------------------------
    // Standard CRUD routes via generic configuration entity registrar
    // (GET list, GET detail, POST, PUT, PATCH disabled for the top-level Consumable entity)
    // The repo's `get` returns enriched ConsumableSummarySchemaType rows with value stats.
    // -----------------------------------------------------------------------
    registerConfigurationEntityRoutes(app, {
        basePath: "/consumables",
        routeParam: "consumableid",
        entityLabel: "Consumable",
        listResponseKey: "consumables",
        detailResponseKey: "consumable",
        entitySchema: ConsumablesSelectSchema,
        listEntitySchema: ConsumableSummarySchema,
        viewPermission: FP_VIEW_CONSUMABLES,
        managePermission: FP_MANAGE_CONSUMABLES,
        repo: ConsumableRepo,
        pubSubTags: [message_CreateConsumable, message_UpdateConsumable, message_DisableConsumable],
    });

    app.get("/consumables/:consumableid/export", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_VIEW_CONSUMABLES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_VIEW_CONSUMABLES.identifier)) return status(403, `Permission denied. Required: ${FP_VIEW_CONSUMABLES.functionalPermissionName}`);

        const consumable = await ConsumableRepo.getByIdentifier(context.dbClient, context.params.consumableid, true);
        if (!consumable) return status(404, "Consumable does not exist");

        const values = await getValue(context.dbClient, consumable, true, false);
        const result = await createConsumableWorkbook(consumable, values.map((value) => ({
            identifier: value.identifier,
            name: value.name,
            disabled: value.disabled,
            isUsed: value.isUsed,
        })), false);
        return buildXlsxResponse(result.bytes, result.filename);
    }, {
        params: t.Object({ consumableid: t.String({ format: "uuid" }) }),
        detail: {
            tags: ["Consumable"],
            summary: "Export consumable values to XLSX",
            description: "Downloads all values of a consumable as an XLSX spreadsheet. Requires FP_DO_CONFIGURATION AND FP_VIEW_CONSUMABLES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "consumableid",
                    description: "UUID of the consumable whose values are exported.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "XLSX spreadsheet with all consumable values (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – no consumable with this identifier exists." }),
        },
    });

    app.get("/consumables/:consumableid/export-template", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_VIEW_CONSUMABLES]);
        if (!authz.some((perm) => perm.identifier === FP_VIEW_CONSUMABLES.identifier)) return status(403, `Permission denied. Required: ${FP_VIEW_CONSUMABLES.functionalPermissionName}`);

        const consumable = await ConsumableRepo.getByIdentifier(context.dbClient, context.params.consumableid, true);
        if (!consumable) return status(404, "Consumable does not exist");

        const result = await createConsumableWorkbook(consumable, [], true);
        return buildXlsxResponse(result.bytes, result.filename);
    }, {
        params: t.Object({ consumableid: t.String({ format: "uuid" }) }),
        detail: {
            tags: ["Consumable"],
            summary: "Download consumable import template",
            description: "Downloads an XLSX template for importing consumable values. Requires FP_VIEW_CONSUMABLES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "consumableid",
                    description: "UUID of the consumable for which the XLSX import template is generated.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Any({ description: "XLSX import template file (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – no consumable with this identifier exists." }),
        },
    });

    app.post("/consumables/:consumableid/import", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_CONSUMABLES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_CONSUMABLES.identifier)) return status(403, `Permission denied. Required: ${FP_MANAGE_CONSUMABLES.functionalPermissionName}`);

        const consumable = await ConsumableRepo.getByIdentifier(context.dbClient, context.params.consumableid, true);
        if (!consumable) return status(404, "Consumable does not exist");

        const reqFormData = await context.request.formData();
        const file = reqFormData.get("file");
        if (!(file instanceof Blob)) return status(400, "No file provided");

        let workbook;
        try {
            const buf = await file.arrayBuffer();
            workbook = await loadWorkbook({ toBytes: async () => new Uint8Array(buf) });
        } catch (e: any) {
            return status(400, `Failed to parse XLSX file: ${e.message}`);
        }

        const names = sheetNames(workbook);
        if (names.length === 0) return status(400, "XLSX file has no sheets");
        const ws = getSheet(workbook, names[0]!);
        if (!ws) return status(400, "XLSX file has no sheets");

        let rows: ConsumableImportRow[];
        try {
            rows = await parseConsumableImportRows(consumable, ws);
        } catch (error) {
            if (error instanceof ImportValidationFailure) {
                const report = await createConsumableErrorWorkbook(consumable, error.errors);
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
                        if (!existing || existing.consumableIdentifier !== consumable.identifier) {
                            throw new ImportValidationFailure([{ row: row.rowNumber, column: "A", field: "identifier", message: "Consumable value does not exist", value: row.identifier }]);
                        }

                        const updatePayload: { name?: string; isUsed?: boolean } = {};
                        if (existing.name !== row.name) updatePayload.name = row.name;
                        if (existing.isUsed !== row.isUsed) updatePayload.isUsed = row.isUsed;

                        let current = existing;
                        if (Object.keys(updatePayload).length > 0) {
                            const updatedRows = await updateValue(tx, user, existing.identifier, updatePayload as never, existing.updatedAt);
                            current = updatedRows[0] ?? (() => { throw new ImportValidationFailure([{ row: row.rowNumber, column: "B", field: "name", message: "Consumable value could not be updated", value: row.name }]); })();
                            updated += 1;
                        }

                        if (current.disabled !== row.disabled) {
                            const toggled = row.disabled
                                ? await disableValue(tx, user, current.identifier, current.updatedAt)
                                : await enableValue(tx, user, current.identifier, current.updatedAt);
                            current = toggled[0] ?? (() => { throw new ImportValidationFailure([{ row: row.rowNumber, column: "C", field: "disabled", message: "Consumable value could not be updated", value: String(row.disabled) }]); })();
                            updated += 1;
                        }
                    } else {
                        const createdRows = await createValue(tx, user, {
                            consumableIdentifier: consumable.identifier,
                            name: row.name,
                            disabled: row.disabled,
                            isUsed: row.isUsed,
                        } as never);
                        if (createdRows.length === 0) {
                            throw new ImportValidationFailure([{ row: row.rowNumber, column: "A", field: "identifier", message: "Consumable value could not be created", value: row.name }]);
                        }
                        created += 1;
                    }
                }

                return { created, updated };
            });

            return result;
        } catch (error) {
            if (error instanceof ImportValidationFailure) {
                const report = await createConsumableErrorWorkbook(consumable, error.errors);
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
        params: t.Object({ consumableid: t.String({ format: "uuid" }) }),
        detail: {
            tags: ["Consumable"],
            summary: "Import consumable values from XLSX",
            description: "Imports consumable values from an XLSX spreadsheet and returns a downloadable error report when validation fails. Requires FP_DO_CONFIGURATION AND FP_MANAGE_CONSUMABLES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "consumableid",
                    description: "UUID of the consumable whose values are imported.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
        response: {
            200: t.Object({ created: t.Number(), updated: t.Number() }, { description: "Import result with the number of created and updated consumable values." }),
            400: t.Any({ description: "Invalid request – missing file, malformed XLSX, or a validation error report workbook (XLSX) describing per-row errors." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – no consumable with this identifier exists." }),
        },
    });

    // -----------------------------------------------------------------------
    // Consumable value sub-routes (nested resources – not covered by generic CRUD)
    // -----------------------------------------------------------------------

    app.get("/consumables/:consumableid/values", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_VIEW_CONSUMABLES, FP_READ_PRODUCT_FILTER]);
        if (!authz.some((perm) => perm.identifier === FP_VIEW_CONSUMABLES.identifier || perm.identifier === FP_READ_PRODUCT_FILTER.identifier)) return status(403, `Permission denied. Required: ${FP_VIEW_CONSUMABLES.functionalPermissionName}`);

        const consumable = await ConsumableRepo.getByIdentifier(context.dbClient, context.params.consumableid);
        if (!consumable) return status(404, "Consumable does not exist");

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? availablePageSizes[0] ?? 10));
        const includeDisabled = parseBooleanQuery(context.query.includeDisabled);
        const showUsed = parseBooleanQuery(context.query.showUsed);
        const values = await getValue(context.dbClient, consumable, includeDisabled, !showUsed, page, pageSize);

        return {
            values,
            page,
            pageSize,
            availablePageSizes,
            includeDisabled,
            showUsed,
        };
    }, {
        params: t.Object({ consumableid: t.String({ format: "uuid" }) }),
        query: t.Object({
            page: t.Optional(t.Union([t.Number({ minimum: 0 }), t.String()])),
            pageSize: t.Optional(t.Union([t.Number({ minimum: 1 }), t.String()])),
            includeDisabled: t.Optional(t.Union([t.Boolean(), t.String()])),
            showUsed: t.Optional(t.Union([t.Boolean(), t.String()])),
        }),
        response: {
            200: t.Object({
                values: t.Array(ConsumablesValuesSelectSchema),
                page: t.Number({ minimum: 0 }),
                pageSize: t.Number({ minimum: 1 }),
                availablePageSizes: t.Array(t.Number({ minimum: 1 })),
                includeDisabled: t.Boolean(),
                showUsed: t.Boolean(),
            }, { description: "Paged consumable values with pagination metadata, disabled-inclusion flag, and used-inclusion flag." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – no consumable with this identifier exists." }),
        },
        detail: {
            tags: ["Consumable"],
            summary: "Get paged consumable values",
            description: "Returns consumable values with pagination metadata and optional inclusion of disabled and used entries. Requires FP_VIEW_CONSUMABLES or FP_READ_PRODUCT_FILTER.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "consumableid",
                    description: "UUID of the consumable whose values are listed.",
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
                {
                    name: "showUsed",
                    description: "Include values that are marked as used in the results. Accepts 'true', '1', true (boolean). Defaults to false.",
                    in: "query",
                    required: false,
                    schema: { type: "string", enum: ["true", "1", "false", "0"], default: "false" },
                },
            ],
        },
    });

    app.post("/consumables/:consumableid/values", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_CONSUMABLES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_CONSUMABLES.identifier)) return status(403, `Permission denied. Required: ${FP_MANAGE_CONSUMABLES.functionalPermissionName}`);

        const consumable = await ConsumableRepo.getByIdentifier(context.dbClient, context.params.consumableid);
        if (!consumable) return status(404, "Consumable does not exist");

        const name = context.body.name.trim();
        if (name.length === 0) return status(400, "Name must not be empty");

        const created = await runInTransaction(context.dbClient, async (tx) => {
            const user = await getLoggedinUserObject(tx, claims) ?? await getSystemUser(tx);
            return await createValue(tx, user, { consumableIdentifier: consumable.identifier, name: name, isUsed: false, disabled: false });
        });

        if (created.length === 0) return status(409, "A consumable value with this name already exists");
        return created[0]!;
    }, {
        params: t.Object({ consumableid: t.String({ format: "uuid" }) }),
        body: t.Object({ name: t.String({ minLength: 1, maxLength: 255 }) }),
        response: {
            200: {...ConsumablesValuesSelectSchema, description: "The newly created consumable value."},
            400: t.String({ description: "Invalid request – the name must not be empty." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – no consumable with this identifier exists." }),
            409: t.String({ description: "Conflict – a consumable value with this name already exists." }),
        },
        detail: {
            tags: ["Consumable"],
            summary: "Create consumable value",
            description: "Creates a new consumable value for the selected consumable. Requires FP_DO_CONFIGURATION AND FP_MANAGE_CONSUMABLES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "consumableid",
                    description: "UUID of the consumable the new value belongs to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    app.put("/consumables/:consumableid/values/:valueid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_CONSUMABLES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_CONSUMABLES.identifier)) return status(403, `Permission denied. Required: ${FP_MANAGE_CONSUMABLES.functionalPermissionName}`);

        const name = context.body.name.trim();
        if (name.length === 0) return status(400, "Name must not be empty");

        const updated = await runInTransaction(context.dbClient, async (tx) => {
            const user = await getLoggedinUserObject(tx, claims) ?? await getSystemUser(tx);
            const consumable = await ConsumableRepo.getByIdentifier(tx, context.params.consumableid);
            if (!consumable) return null;
            const existing = await getValueByIdentifier(tx, context.params.valueid);
            if (!existing || existing.consumableIdentifier !== consumable.identifier) return null;
            const rows = await updateValue(tx, user, context.params.valueid, { name }, context.body.knownUpdatedAt);
            return rows[0] ?? false;
        });

        if (updated === null) return status(404, "Consumable value does not exist");
        if (updated === false) return status(409, "Consumable value was modified by another user");
        return updated;
    }, {
        params: t.Object({ consumableid: t.String({ format: "uuid" }), valueid: t.String({ format: "uuid" }) }),
        body: t.Object({ name: t.String({ minLength: 1, maxLength: 255 }), knownUpdatedAt: t.String() }),
        response: {
            200: {...ConsumablesValuesSelectSchema, description: "The renamed consumable value."},
            400: t.String({ description: "Invalid request – the name must not be empty." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the consumable value does not exist." }),
            409: t.String({ description: "Conflict – optimistic locking failed; the consumable value was modified by another user." }),
        },
        detail: {
            tags: ["Consumable"],
            summary: "Rename consumable value",
            description: "Updates the consumable value name using optimistic locking via knownUpdatedAt. Requires FP_DO_CONFIGURATION AND FP_MANAGE_CONSUMABLES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "consumableid",
                    description: "UUID of the consumable the value belongs to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "valueid",
                    description: "UUID of the consumable value to rename.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });

    app.patch("/consumables/:consumableid/values/:valueid", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_DO_CONFIGURATION, FP_MANAGE_CONSUMABLES]);
        if (!authz.some((perm) => perm.identifier === FP_DO_CONFIGURATION.identifier)) {
            return status(403, `Permission denied. Required: ${FP_DO_CONFIGURATION.functionalPermissionName}`);
        }
        if (!authz.some((perm) => perm.identifier === FP_MANAGE_CONSUMABLES.identifier)) return status(403, `Permission denied. Required: ${FP_MANAGE_CONSUMABLES.functionalPermissionName}`);

        const body = context.body as Record<string, unknown>;
        if (body.disabled === undefined && body.isUsed === undefined) return status(400, "At least one of 'disabled' or 'isUsed' must be provided");

        const updated = await runInTransaction(context.dbClient, async (tx) => {
            const user = await getLoggedinUserObject(tx, claims) ?? await getSystemUser(tx);
            const consumable = await ConsumableRepo.getByIdentifier(tx, context.params.consumableid);
            if (!consumable) return null;
            const existing = await getValueByIdentifier(tx, context.params.valueid);
            if (!existing || existing.consumableIdentifier !== consumable.identifier) return null;

            if (body.disabled !== undefined) {
                const rows = body.disabled
                    ? await disableValue(tx, user, context.params.valueid, context.body.knownUpdatedAt)
                    : await enableValue(tx, user, context.params.valueid, context.body.knownUpdatedAt);
                return rows[0] ?? false;
            }

            const rows = await updateValue(tx, user, context.params.valueid, { isUsed: context.body.isUsed } as any, context.body.knownUpdatedAt);
            return rows[0] ?? false;
        });

        if (updated === null) return status(404, "Consumable value does not exist");
        if (updated === false) return status(409, "Consumable value was modified by another user");
        return updated;
    }, {
        params: t.Object({ consumableid: t.String({ format: "uuid" }), valueid: t.String({ format: "uuid" }) }),
        body: t.Object({ disabled: t.Optional(t.Boolean()), isUsed: t.Optional(t.Boolean()), knownUpdatedAt: t.String() }),
        response: {
            200: {...ConsumablesValuesSelectSchema, description: "The consumable value with updated disabled/isUsed flags."},
            400: t.String({ description: "Invalid request – at least one of 'disabled' or 'isUsed' must be provided." }),
            401: t.String({ description: "Unauthenticated – missing or invalid session, API key, or bearer token." }),
            403: t.String({ description: "Permission denied – the authenticated principal lacks the required functional permission." }),
            404: t.String({ description: "Not found – the consumable value does not exist." }),
            409: t.String({ description: "Conflict – optimistic locking failed; the consumable value was modified by another user." }),
        },
        detail: {
            tags: ["Consumable"],
            summary: "Update consumable value flags",
            description: "Updates disabled or isUsed flags for a consumable value using optimistic locking via knownUpdatedAt. Requires FP_DO_CONFIGURATION AND FP_MANAGE_CONSUMABLES.",
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                {
                    name: "consumableid",
                    description: "UUID of the consumable the value belongs to.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
                {
                    name: "valueid",
                    description: "UUID of the consumable value to update.",
                    in: "path",
                    required: true,
                    schema: { type: "string", format: "uuid" },
                },
            ],
        },
    });
}
