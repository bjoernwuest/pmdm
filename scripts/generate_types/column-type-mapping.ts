import type { Column } from "drizzle-orm";

/**
 * Maps a single Drizzle column's *runtime metadata* to TypeBox call-expression
 * TEXT, e.g. `"Type.String({ format: 'uuid' })"`.
 *
 * This is intentionally hand-rolled: it never calls a drizzle-to-typebox
 * conversion library and never serializes a live TypeBox schema object. It
 * only reads `column.columnType` / `column.enumValues` (and, defensively, a
 * couple of column-kind-specific properties like `length`/`baseColumn`) and
 * emits the equivalent `Type.X(...)` source text by hand.
 *
 * Optionality (`Type.Optional(...)`) is deliberately NOT applied here — select
 * vs. insert schemas wrap the *same* base type with different optionality
 * rules. See `selectFieldTypeText` / `insertFieldTypeText` in
 * `step2-drizzle-introspection.ts`.
 */
export function baseColumnTypeText(column: Column): string {
    // Enum-backed text columns (pgEnum(...)) carry a closed set of literal
    // values — prefer a Type.Union of Type.Literal over a generic string.
    if (isEnumColumn(column) && column.enumValues && column.enumValues.length > 0) {
        const literals = column.enumValues.map(value => `Type.Literal(${JSON.stringify(value)})`).join(", ");
        return `Type.Union([${literals}])`;
    }

    switch (column.columnType) {
        // --- Identifier ---
        case "PgUUID":
            return "Type.String({ format: 'uuid' })";

        // --- Boolean ---
        case "PgBoolean":
            return "Type.Boolean()";

        // --- Free-form / network / interval text ---
        case "PgText":
        case "PgCidr":
        case "PgInet":
        case "PgMacaddr":
        case "PgMacaddr8":
        case "PgInterval":
            return "Type.String()";

        // --- Bounded text ---
        case "PgChar":
        case "PgVarchar": {
            const length = getColumnLength(column);
            return length !== undefined ? `Type.String({ maxLength: ${length} })` : "Type.String()";
        }

        // --- Date / time. Always JSON-safe strings, never Type.Date(). ---
        case "PgTime":
            return "Type.String({ format: 'time' })";
        case "PgDate":
        case "PgDateString":
            return "Type.String({ format: 'date' })";
        case "PgTimestamp":
        case "PgTimestampString":
            return "Type.String()";

        // --- Integers ---
        case "PgInteger":
        case "PgSmallInt":
        case "PgSerial":
        case "PgSmallSerial":
        case "PgBigInt53":
        case "PgBigSerial53":
            return "Type.Integer()";

        // --- Floating point ---
        case "PgReal":
        case "PgDoublePrecision":
        case "PgNumericNumber":
            return "Type.Number()";

        // --- Arbitrary-precision numeric / 64-bit bigint: neither a JS
        // number (precision loss) nor JSON's number type (no bigint support)
        // can represent these losslessly. A string is the standard,
        // lossless, JSON-safe wire representation for both. ---
        case "PgNumeric":
        case "PgBigInt64":
        case "PgBigSerial64":
        case "PgNumericBigInt":
            return "Type.String()";

        // --- JSON / JSONB: no statically-known shape is available here.
        // Falling back rather than guessing, per the generator's contract. ---
        case "PgJson":
        case "PgJsonb":
            return "Type.Unknown()";

        // --- Arrays: recurse into the element column's own mapping. ---
        case "PgArray": {
            const base = getArrayBaseColumn(column);
            return base ? `Type.Array(${baseColumnTypeText(base)})` : "Type.Array(Type.Unknown())";
        }

        // --- Geometric types (point/line), custom columns, and anything
        // else we cannot confidently map to a precise TypeBox shape. ---
        default:
            return "Type.Unknown()";
    }
}

function isEnumColumn(column: Column): boolean {
    return column.columnType === "PgEnumColumn" || column.columnType === "PgEnumObjectColumn";
}

/**
 * Reads the `length` property that only concrete PgVarchar/PgChar column
 * instances expose — it isn't part of the shared `Column` base type, so it
 * has to be read defensively.
 */
function getColumnLength(column: Column): number | undefined {
    const length = (column as unknown as { length?: unknown }).length;
    return typeof length === "number" ? length : undefined;
}

/**
 * Reads the `baseColumn` property that only PgArray column instances
 * expose — it isn't part of the shared `Column` base type, so it has to be
 * read defensively.
 */
function getArrayBaseColumn(column: Column): Column | undefined {
    return (column as unknown as { baseColumn?: Column }).baseColumn;
}


