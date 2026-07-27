import { Type, type Static } from "@sinclair/typebox";

/**
 * Script Engine shared types.
 *
 * Browser-safe type definitions and TypeBox schemas for the script execution
 * context, trigger causes, categories, and the REST preview/validate endpoints.
 * The concrete `ScriptApi` interface lives in `src/services/ScriptEngine.ts`
 * (it is server-only); here `api` is typed as `unknown` to keep this file
 * free of backend imports.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ScriptTriggerCause = {
    ProductRequestCreate: "product_request_create" as const,
    ProductRequestUpdate: "product_request_update" as const,
    ProductRequestApprove: "product_request_approve" as const,
    ProductRequestImporting: "product_request_importing" as const,
    ProductTypeAssign: "product_type_assign" as const,
};
export type ScriptTriggerCause = typeof ScriptTriggerCause[keyof typeof ScriptTriggerCause];

export const ScriptTriggerCauseSchema = Type.Enum(ScriptTriggerCause);

export const ScriptCategory = {
    Calculation: "calculation" as const,
    DefaultProvider: "defaultProvider" as const,
    Filter: "filter" as const,
    Validate: "validate" as const,
    MandatoryScript: "mandatory_script" as const,
    RequestorCanEditScript: "requestorCanEdit_script" as const,
};
export type ScriptCategory = typeof ScriptCategory[keyof typeof ScriptCategory];

export const ScriptCategorySchema = Type.Enum(ScriptCategory);

// ---------------------------------------------------------------------------
// Context shapes
// ---------------------------------------------------------------------------

export type ScriptTriggerContext = {
    cause: ScriptTriggerCause;
    dataTypeIdentifier: string | null;
    productRequestIdentifier: string;
    pubsubTags: string[] | null;
    /** Only set for `validate` script executions: the value being submitted. */
    candidateValue?: unknown;
};

export type ScriptPrincipal = {
    userId: string | null;
    apiKeyIdentifier: string | null;
    isApiKey: boolean;
};

export type ScriptExecutionContext = {
    trigger: ScriptTriggerContext;
    principal: ScriptPrincipal;
    api: unknown;
    /** Only set for `filter` script executions: the candidate option rows. */
    options?: unknown[];
};

// ---------------------------------------------------------------------------
// Validate script result contract
// ---------------------------------------------------------------------------

export type ValidateScriptResult = {
    valid: boolean;
    message?: string;
};

// ---------------------------------------------------------------------------
// REST schemas — POST /api/scripts/preview
// ---------------------------------------------------------------------------

export const ScriptPreviewRequestSchema = Type.Object({
    script: Type.String(),
    category: ScriptCategorySchema,
    cause: ScriptTriggerCauseSchema,
    productRequestIdentifier: Type.String({ format: "uuid" }),
    dataTypeIdentifier: Type.Optional(Type.String({ format: "uuid" })),
});
export type ScriptPreviewRequest = Static<typeof ScriptPreviewRequestSchema>;

export const ScriptPreviewResponseSchema = Type.Object({
    result: Type.Unknown(),
    error: Type.Optional(Type.String()),
});
export type ScriptPreviewResponse = Static<typeof ScriptPreviewResponseSchema>;

// ---------------------------------------------------------------------------
// REST schemas — POST /api/scripts/validate
// ---------------------------------------------------------------------------

export const ScriptValidateRequestSchema = Type.Object({
    script: Type.String(),
});
export type ScriptValidateRequest = Static<typeof ScriptValidateRequestSchema>;

export const ScriptValidateResponseSchema = Type.Object({
    valid: Type.Boolean(),
    error: Type.Optional(Type.String()),
});
export type ScriptValidateResponse = Static<typeof ScriptValidateResponseSchema>;
