/**
 * Authoritative, server-side decision logic for product-request value
 * actionability (edit / provide / approve).
 *
 * This module is the single source of truth shared by the product-request
 * repo (list + detail), the notification digest, and the write/approve gates.
 * The browser must never recompute these decisions — the API returns the
 * resulting flags and the UI only renders them.
 *
 * Pure predicates and config helpers live here (no database access). The
 * script resolvers moved here from `ProductRequestRepo` only call
 * `ScriptEngine`; the repo supplies the already-loaded raw columns and a
 * script context.
 */
import type { DBClient } from "@/services/DatabaseDriver.ts";
import * as ScriptEngine from "@/services/ScriptEngine.ts";
import { DataTypeKind, YesNoScript } from "@/types/DataTypeType.ts";
import { ScriptCategory, type ScriptExecutionContext } from "@/types/ScriptEngineType.ts";

// ---------------------------------------------------------------------------
// Pure config / emptiness helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a config value: ProductTypesDataTypes config takes precedence over
 * DataType config. Individual keys from ptConfig override dtConfig.
 */
export function resolveConfig(
    dtConfig: Record<string, unknown> | null,
    ptConfig: Record<string, unknown> | null,
): Record<string, unknown> {
    return { ...(dtConfig ?? {}), ...(ptConfig ?? {}) };
}

/**
 * Returns `true` when the value represents an empty / no-value state for the
 * given data type kind. Tri-state booleans (kind "boolean" with
 * `config.permitEmpty === true`) treat `null` as a valid value and return
 * `false`. Used by the approval gates, the actionable summary, and the
 * notification digest.
 */
export function isEmptyValue(value: unknown, kind: string, config?: Record<string, unknown> | null): boolean {
    if (value === null) {
        if (kind === "boolean" && (config as { permitEmpty?: boolean } | null | undefined)?.permitEmpty) {
            return false;
        }
        return true;
    }
    if (value === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
}

/**
 * Returns `true` when a field has an effective value: either the stored value
 * is non-empty, or a usable default exists. The literal string `"null"` is the
 * JSONB representation of an unset default and counts as absent.
 *
 * This intentionally mirrors the default-presence rule of the approval gate;
 * it must not switch to {@link isEmptyValue} for defaults, because empty-string
 * and empty-array defaults still count as present there.
 */
export function hasEffectiveValue(input: {
    value: unknown;
    defaultValue: unknown;
    kind: string;
    config?: Record<string, unknown> | null;
}): boolean {
    if (!isEmptyValue(input.value, input.kind, input.config)) return true;
    return input.defaultValue !== null
        && input.defaultValue !== undefined
        && input.defaultValue !== "null";
}

// ---------------------------------------------------------------------------
// Script resolvers (moved from ProductRequestRepo)
// ---------------------------------------------------------------------------

/**
 * Converts a YesNoScript value (+ optional script) to a boolean or null.
 * - null      → null (inherit from parent)
 * - "Yes"     → true
 * - "No"      → false
 * - "Script"  → evaluate the script, cast to boolean; null if script missing
 */
async function resolveYesNoScript(
    db: DBClient,
    value: string | null,
    script: string | null,
    ctx: ScriptExecutionContext | null,
    category: ScriptCategory,
    dataTypeIdentifier?: string,
): Promise<boolean | null> {
    if (value === null) return null;
    if (value === YesNoScript.Yes) return true;
    if (value === YesNoScript.No) return false;
    if (value === YesNoScript.Script) {
        if (script && ctx) {
            const scoped = dataTypeIdentifier ? ScriptEngine.forDataType(ctx, dataTypeIdentifier) : ctx;
            const result = await ScriptEngine.execute(db, script, scoped, category);
            return Boolean(result);
        }
        return null;
    }
    return null;
}

/**
 * Resolves a mandatory flag: ProductTypesDataTypes.mandatory > DataType.mandatory > false.
 * Expects raw YesNoScriptType column values and their associated script columns.
 */
export async function resolveMandatory(
    db: DBClient,
    dtMandatory: string,
    dtMandatoryScript: string | null,
    ptMandatory: string | null,
    ptMandatoryScript: string | null,
    ctx: ScriptExecutionContext | null,
    dataTypeIdentifier?: string,
): Promise<boolean> {
    const dtBool = await resolveYesNoScript(db, dtMandatory, dtMandatoryScript, ctx, ScriptCategory.MandatoryScript, dataTypeIdentifier);
    const ptBool = await resolveYesNoScript(db, ptMandatory, ptMandatoryScript, ctx, ScriptCategory.MandatoryScript, dataTypeIdentifier);
    return ptBool ?? dtBool ?? false;
}

/**
 * Resolves requestorCanEdit: ProductTypesDataTypes.requestorCanEdit > DataType.requestorCanEdit > true.
 * Expects raw YesNoScriptType column values and their associated script columns.
 */
export async function resolveRequestorCanEdit(
    db: DBClient,
    dtRequestorCanEdit: string,
    dtRequestorCanEditScript: string | null,
    ptRequestorCanEdit: string | null,
    ptRequestorCanEditScript: string | null,
    ctx: ScriptExecutionContext | null,
    dataTypeIdentifier?: string,
): Promise<boolean> {
    const dtBool = await resolveYesNoScript(db, dtRequestorCanEdit, dtRequestorCanEditScript, ctx, ScriptCategory.RequestorCanEditScript, dataTypeIdentifier);
    const ptBool = await resolveYesNoScript(db, ptRequestorCanEdit, ptRequestorCanEditScript, ctx, ScriptCategory.RequestorCanEditScript, dataTypeIdentifier);
    return ptBool ?? dtBool ?? true;
}

/**
 * Resolves the effective "is header" flag for a data type in a product type:
 * assignment override > data type master flag > false.
 *
 * `null`/`undefined` means "inherit from the next level down".
 */
export function resolveIsHeader(
    dataTypeFlag: boolean | null | undefined,
    assignmentOverride: boolean | null | undefined,
): boolean {
    return assignmentOverride ?? dataTypeFlag ?? false;
}

/**
 * Picks the raw value used for display, mirroring the detail table: the stored
 * value when present, otherwise the default value. The literal string `"null"`
 * counts as absent. Returns `null` when neither carries a value.
 */
export function resolveDisplayRawValue(value: unknown, defaultValue: unknown): unknown {
    if (value !== null && value !== undefined) return value;
    if (defaultValue !== null && defaultValue !== undefined && defaultValue !== "null") return defaultValue;
    return null;
}

/**
 * Turns a resolved value into a display string for a header attribute.
 *
 * - `boolean` → `true` / `false`
 * - `lookup` / `consumable` → resolved name(s); unresolved identifiers fall back to the raw id
 * - `product` → product number(s) as stored
 * - `string` / `calculated` / anything else → raw string
 *
 * Empty value falls back to the default value; both empty → `—`.
 *
 * @param nameFor Optional resolver mapping a lookup/consumable value identifier
 *                to its display name. When omitted, raw identifiers are shown.
 */
export function formatHeaderValue(input: {
    value: unknown;
    defaultValue: unknown;
    kind: string;
    nameFor?: (identifier: string) => string | null | undefined;
}): string {
    const raw = resolveDisplayRawValue(input.value, input.defaultValue);
    if (raw === null) return "—";
    if (input.kind === DataTypeKind.Boolean) return raw ? "true" : "false";
    if (input.kind === DataTypeKind.Lookup || input.kind === DataTypeKind.Consumable) {
        const ids = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v));
        const names = ids.map((id) => input.nameFor?.(id) ?? id);
        return names.join(", ");
    }
    if (typeof raw === "object") {
        return Array.isArray(raw) ? raw.map((v) => String(v)).join(", ") : JSON.stringify(raw);
    }
    return String(raw);
}

// ---------------------------------------------------------------------------
// Actionability predicates
// ---------------------------------------------------------------------------

/** Inputs required to decide whether a value may be edited by the current user. */
export type CanEditInput = {
    /** Whether the current user holds the `writer` role on the data type. */
    hasWriterRole: boolean;
    /** Resolved `requestorCanEdit` flag (PT override > DT > default true, script-aware). */
    requestorCanEdit: boolean | null;
    /** Whether the current user is the creator of the product request. */
    isRequestCreator: boolean;
    /** All roles the current user holds on the data type (any role satisfies the ≥1-role guard). */
    userRoles: readonly string[];
    /** Whether this product request is an update request (`productToUpdate` set). */
    isUpdateRequest: boolean;
    /** Whether the data type is editable on update requests. */
    editableOnUpdate: boolean;
};

/** Inputs required to decide whether the current user should provide a value. */
export type CanProvideInput = CanEditInput & {
    value: unknown;
    defaultValue: unknown;
    /** Current approver identifier (null when not yet approved). */
    approvedBy: string | null;
    kind: string;
    config?: Record<string, unknown> | null;
};

/** Inputs required to decide whether a value may be approved by the current user. */
export type CanApproveInput = {
    /** Whether the current user holds the `approver` role on the data type. */
    hasApproverRole: boolean;
    /** Current approver identifier (null when not yet approved). */
    approvedBy: string | null;
    kind: string;
    /** Resolved mandatory flag for the acting user. */
    mandatory: boolean;
    value: unknown;
    defaultValue: unknown;
    config?: Record<string, unknown> | null;
    /**
     * Whether every previous-approval prerequisite is already approved.
     * `undefined` means "no known unmet dependency" and keeps older callers
     * source-compatible; `false` blocks the approval.
     */
    previousApprovalDepsMet?: boolean;
};

/**
 * `canEdit = (hasWriterRole || (requestorCanEdit && isRequestCreator && userRoles.length > 0))
 *            && (!isUpdateRequest || editableOnUpdate)`
 *
 * Mirrors the authoritative write gate in `updateProductRequestValue`.
 */
export function canEditProductRequestValue(input: CanEditInput): boolean {
    const roleEdit = input.hasWriterRole
        || (!!input.requestorCanEdit && input.isRequestCreator && input.userRoles.length > 0);
    return roleEdit && (!input.isUpdateRequest || input.editableOnUpdate);
}

/**
 * `canProvide = canEdit && kind !== Calculated && approvedBy === null && !hasEffectiveValue(...)`
 *
 * A value needs to be provided only when the user may edit it, it is not
 * approved yet, it has no effective value (no stored value and no usable
 * default), and it is not calculated. Editing an approved value remains
 * possible through {@link canEditProductRequestValue}.
 */
export function canProvideProductRequestValue(input: CanProvideInput): boolean {
    if (input.kind === DataTypeKind.Calculated) return false;
    if (input.approvedBy !== null) return false;
    return canEditProductRequestValue(input) && !hasEffectiveValue(input);
}

/**
 * Whether a value counts as "present" for the approve gate. A mandatory field
 * is only approvable when it has an effective value.
 */
export function isApprovableValuePresent(input: {
    mandatory: boolean;
    value: unknown;
    defaultValue: unknown;
    kind: string;
    config?: Record<string, unknown> | null;
}): boolean {
    return !input.mandatory || hasEffectiveValue(input);
}

/**
 * Whether a value satisfies a previous-approval prerequisite:
 * `approvedBy !== null || kind === Calculated`.
 *
 * Calculated data types are auto-approved and never carry `approvedBy`, yet
 * they must not block their dependants. Mirrors the SQL predicate in
 * `validatePreviousApprovals`; keep both in sync.
 */
export function isApprovedForDependency(input: {
    approvedBy: string | null;
    kind: string;
}): boolean {
    return input.approvedBy !== null || input.kind === DataTypeKind.Calculated;
}

/**
 * `canApprove = hasApproverRole && approvedBy === null && kind !== Calculated
 *               && previousApprovalDepsMet !== false
 *               && isApprovableValuePresent(...)`
 *
 * Mirrors the authoritative approve gate in `approveProductRequestValue`.
 */
export function canApproveProductRequestValue(input: CanApproveInput): boolean {
    if (!input.hasApproverRole) return false;
    if (input.approvedBy !== null) return false;
    if (input.kind === DataTypeKind.Calculated) return false;
    if (input.previousApprovalDepsMet === false) return false;
    return isApprovableValuePresent({
        mandatory: input.mandatory,
        value: input.value,
        defaultValue: input.defaultValue,
        kind: input.kind,
        config: input.config,
    });
}