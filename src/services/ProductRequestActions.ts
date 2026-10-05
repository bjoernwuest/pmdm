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
 * `canProvide = canEdit && isEmptyValue(value, kind, config)`
 *
 * A value needs to be provided only when the user may edit it and it is empty.
 */
export function canProvideProductRequestValue(input: CanProvideInput): boolean {
    return canEditProductRequestValue(input)
        && isEmptyValue(input.value, input.kind, input.config);
}

/**
 * Whether a value counts as "present" for the approve gate. A mandatory field
 * is only approvable when it has a value or a non-null `"null"` default.
 */
export function isApprovableValuePresent(input: {
    mandatory: boolean;
    value: unknown;
    defaultValue: unknown;
    kind: string;
    config?: Record<string, unknown> | null;
}): boolean {
    if (!input.mandatory) return true;
    if (!isEmptyValue(input.value, input.kind, input.config)) return true;
    return input.defaultValue !== null && input.defaultValue !== "null";
}

/**
 * `canApprove = hasApproverRole && approvedBy === null && kind !== Calculated
 *               && (!mandatory || isApprovableValuePresent(...))`
 *
 * Mirrors the authoritative approve gate in `approveProductRequestValue`.
 */
export function canApproveProductRequestValue(input: CanApproveInput): boolean {
    if (!input.hasApproverRole) return false;
    if (input.approvedBy !== null) return false;
    if (input.kind === DataTypeKind.Calculated) return false;
    return isApprovableValuePresent({
        mandatory: input.mandatory,
        value: input.value,
        defaultValue: input.defaultValue,
        kind: input.kind,
        config: input.config,
    });
}