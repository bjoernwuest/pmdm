import { Column, getTableColumns, getViewSelectedFields, is, Table, View } from "drizzle-orm";
import { isPgEnum } from "drizzle-orm/pg-core";
import { pathToFileURL } from "node:url";
import { baseColumnTypeText } from "./column-type-mapping";

/**
 * STEP 2 — Drizzle table/view/enum -> TypeBox, driven entirely by *runtime*
 * column metadata (never by re-parsing source text, and never by serializing
 * a live TypeBox schema object).
 *
 * The schema module is dynamically imported (Bun runs `.ts` natively — no
 * ts-node/tsx needed), then every named export is checked with drizzle-orm's
 * own `is(value, Table)` / `is(value, View)` runtime guards. Everything else
 * exported from the module (plain consts, typebox schemas, re-exported
 * helpers, ...) is intentionally ignored here — Step 1 already decided
 * whether that needs to be statically copied.
 */

export interface GeneratedSchemaBlock {
    /** The table/view/enum's own export name, e.g. "ApiKey". */
    name: string;
    /** Fully-formed TypeScript source text (Select/Insert schema + type exports). */
    text: string;
}

/** Dynamically imports one compiled schema file and emits TypeBox schema
 * text for every pg table, pg view, and pg enum it exports. */
export async function introspectSchemaModule(absoluteFilePath: string): Promise<GeneratedSchemaBlock[]> {
    const moduleNamespace = (await import(pathToFileURL(absoluteFilePath).href)) as Record<string, unknown>;

    const blocks: GeneratedSchemaBlock[] = [];
    for (const [exportName, value] of Object.entries(moduleNamespace)) {
        if (is(value, Table)) {
            blocks.push({ name: exportName, text: emitTableSchemas(exportName, value) });
        } else if (is(value, View)) {
            blocks.push({ name: exportName, text: emitViewSchema(exportName, value) });
        } else if (isPgEnum(value)) {
            blocks.push({ name: exportName, text: emitEnumSchema(exportName, value.enumValues) });
        }
    }
    return blocks;
}

/** Select schema optionality reflects `column.notNull` alone. */
function selectFieldTypeText(column: Column): string {
    const base = baseColumnTypeText(column);
    return column.notNull ? base : `Type.Optional(Nullable(${base}))`;
}

/**
 * Insert schema optionality is `!notNull` PLUS any column the database can
 * populate on its own (a default value, a generated expression, or an
 * identity/serial sequence) — those may be omitted from an insert even
 * though the column is NOT NULL at the database level.
 */
function insertFieldTypeText(column: Column): string {
    const base = baseColumnTypeText(column);
    const isNullable = !column.notNull;
    const canOmitOnInsert = isNullable || column.hasDefault || column.generated != null || column.generatedIdentity != null;
    if (!canOmitOnInsert) return base;
    return isNullable ? `Type.Optional(Nullable(${base}))` : `Type.Optional(${base})`;
}

function emitTableSchemas(tableName: string, table: InstanceType<typeof Table>): string {
    const columns = getTableColumns(table);
    const selectFields: string[] = [];
    const insertFields: string[] = [];

    for (const [propName, column] of Object.entries(columns)) {
        selectFields.push(`  ${propName}: ${selectFieldTypeText(column)},`);
        insertFields.push(`  ${propName}: ${insertFieldTypeText(column)},`);
    }

    return [
        `export const ${tableName}SelectSchema = Type.Object({`,
        selectFields.join("\n"),
        `});`,
        `export type ${tableName}SelectType = Static<typeof ${tableName}SelectSchema>;`,
        ``,
        `export const ${tableName}InsertSchema = Type.Object({`,
        insertFields.join("\n"),
        `});`,
        `export type ${tableName}InsertType = Static<typeof ${tableName}InsertSchema>;`,
    ].join("\n");
}

/** Views only ever get a Select schema — they aren't insertable. */
function emitViewSchema(viewName: string, view: InstanceType<typeof View>): string {
    const fields = getViewSelectedFields(view);
    const selectFields: string[] = [];

    for (const [propName, field] of Object.entries(fields)) {
        if (is(field, Column)) {
            selectFields.push(`  ${propName}: ${selectFieldTypeText(field)},`);
        } else {
            // A computed/raw SQL expression rather than a plain column
            // reference — no statically-known shape, so fall back rather
            // than guess (same policy as unmappable columns).
            selectFields.push(`  ${propName}: Type.Optional(Type.Unknown()),`);
        }
    }

    return [
        `export const ${viewName}SelectSchema = Type.Object({`,
        selectFields.join("\n"),
        `});`,
        `export type ${viewName}SelectType = Static<typeof ${viewName}SelectSchema>;`,
    ].join("\n");
}

function emitEnumSchema(enumName: string, enumValues: readonly string[]): string {
    const literals = enumValues.map(value => `Type.Literal(${JSON.stringify(value)})`).join(", ");
    return [
        `export const ${enumName}Schema = Type.Union([${literals}]);`,
        `export type ${enumName} = Static<typeof ${enumName}Schema>;`,
    ].join("\n");
}


