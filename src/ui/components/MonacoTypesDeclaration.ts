/**
 * Shared Monaco TypeScript type declarations for IntelliSense.
 *
 * Registered with `monaco.languages.typescript.typescriptDefaults.addExtraLib`
 * by both `MonacoField` and `ScriptEditorPopup` via `registerMonacoTypes()`.
 *
 * The `ctx` global represents the script execution context injected by the
 * `ScriptEngine` into every stored script (see design/scripting_engine.md).
 */

// ---------------------------------------------------------------------------
// Domain entity types (kept for backward compatibility with older help text)
// ---------------------------------------------------------------------------

const DOMAIN_TYPES = `
declare type DataTypeType = {
    identifier: string;
    name: string;
    disabled: boolean;
    description: string | null;
    kind: string;
    mandatory: boolean;
    requestorCanEdit: boolean;
    config: Record<string, unknown>;
    owner: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string | null;
    updatedBy: string | null;
};

declare type ProductRequestType = {
    identifier: string;
    productType: string | null;
    productNumber: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string | null;
    updatedBy: string | null;
};

declare type ProductType = {
    productTypeIdentifier: string;
    productNumber: string;
};
`;

// ---------------------------------------------------------------------------
// Script Execution Context (`ctx`) types
// ---------------------------------------------------------------------------

const SCRIPT_CONTEXT_TYPES = `
declare type ScriptTriggerCause =
    | "product_request_create"
    | "product_request_update"
    | "product_request_approve"
    | "product_request_importing"
    | "product_type_assign";

declare type ScriptTriggerContext = {
    /** Why this script runs. */
    cause: ScriptTriggerCause;
    /** The data type that prompted this execution, or null. */
    dataTypeIdentifier: string | null;
    /** The product request on which the script runs. Always set. */
    productRequestIdentifier: string;
    /** PubSub message tags that triggered execution (future). */
    pubsubTags: string[] | null;
    /** The value being submitted (only set for validate scripts). */
    candidateValue?: unknown;
};

declare type ScriptPrincipal = {
    /** The internal user identifier (uuid), or null for system-triggered execution. */
    userId: string | null;
    /** The API key identifier if the request came from API key auth. */
    apiKeyIdentifier: string | null;
    /** Convenience flag: true when apiKeyIdentifier is set. */
    isApiKey: boolean;
};

// ---------------------------------------------------------------------------
// ScriptApi — read-only query API available as ctx.api
// ---------------------------------------------------------------------------

declare type ScriptRequestMeta = {
    identifier: string;
    status: string;
    productTypeIdentifier: string | null;
    productTypeName: string | null;
    productNumber: string;
    createdBy: string | null;
};

declare type ScriptUserInfo = {
    identifier: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    disabled: boolean | null;
};

declare type ScriptGroupInfo = {
    identifier: string;
    name: string;
    description: string | null;
    disabled: boolean | null;
};

declare type ScriptLookupValue = {
    identifier: string;
    name: string;
    value: string | null;
    disabled: boolean;
};

declare type ScriptConsumableValue = {
    identifier: string;
    name: string;
    value: string | null;
    disabled: boolean;
    isUsed: boolean;
};

declare type ScriptProductEntry = {
    productNumber: string;
    productTypeIdentifier: string | null;
    productTypeName: string | null;
    disabled: boolean;
};

declare type ScriptApiKeyInfo = {
    identifier: string;
    name: string;
    createdAt: string;
    expiresAt: string | null;
    disabled: boolean;
};

declare type ScriptPermissionRow = {
    groupIdentifier: string;
    groupName: string;
    role: string;
};

declare interface ScriptApi {
    readonly request: {
        /** Returns the persisted value of a data type on the current product request. */
        getValue(dataTypeIdentifier: string): Promise<unknown>;
        /** Returns all persisted values on the current request as { dataTypeIdentifier: value }. */
        getAllValues(): Promise<Record<string, unknown>>;
        /** Returns metadata about the current product request. */
        meta(): Promise<ScriptRequestMeta | null>;
    };
    readonly products: {
        /** Returns a single product enriched with its current values, or null. */
        get(productNumber: string): Promise<{
            productNumber: string;
            productTypeIdentifier: string | null;
            productTypeName: string | null;
            disabled: boolean;
            values: Record<string, unknown>;
        } | null>;
        /** Returns a paginated product list. */
        list(filters?: Record<string, unknown>): Promise<ScriptProductEntry[]>;
    };
    readonly productRequests: {
        /** Returns a single product request with its values. */
        get(requestIdentifier: string): Promise<{
            meta: ScriptRequestMeta | null;
            values: Record<string, unknown>;
        }>;
        /** Returns a product request list filtered by status, product type, etc. */
        list(filters?: Record<string, unknown>): Promise<any[]>;
    };
    readonly dataTypes: {
        /** Returns a data type definition including kind, config, owner, etc. */
        get(identifier: string): Promise<DataTypeType | null>;
        /** Returns all data types, optionally filtered by kind or BusinessDomain. */
        list(filters?: Record<string, unknown>): Promise<DataTypeType[]>;
    };
    readonly users: {
        /** Returns a single user by identifier. */
        get(userIdentifier: string): Promise<ScriptUserInfo | null>;
        /** Returns a user list, optionally filtered. */
        list(filters?: Record<string, unknown>): Promise<ScriptUserInfo[]>;
        /** Returns the groups a user belongs to. */
        getGroups(userIdentifier: string): Promise<ScriptGroupInfo[]>;
    };
    readonly groups: {
        /** Returns a single group by identifier. */
        get(groupIdentifier: string): Promise<ScriptGroupInfo | null>;
        /** Returns all groups. */
        list(filters?: Record<string, unknown>): Promise<ScriptGroupInfo[]>;
        /** Returns users belonging to a group. */
        getUsers(groupIdentifier: string): Promise<ScriptUserInfo[]>;
    };
    readonly lookups: {
        /** Returns a lookup definition (name, description, source system). */
        get(identifier: string): Promise<any | null>;
        /** Returns all values of a lookup. */
        getValues(identifier: string, filters?: Record<string, unknown>): Promise<ScriptLookupValue[]>;
    };
    readonly consumables: {
        /** Returns a consumable definition. */
        get(identifier: string): Promise<any | null>;
        /** Returns all values of a consumable, optionally filtered. */
        getValues(identifier: string, filters?: Record<string, unknown>): Promise<ScriptConsumableValue[]>;
    };
    readonly targetSystems: {
        /** Returns a target system definition. */
        get(identifier: string): Promise<any | null>;
        /** Returns all target systems. */
        list(): Promise<any[]>;
    };
    readonly businessDomains: {
        /** Returns a business domain definition. */
        get(identifier: string): Promise<any | null>;
        /** Returns all business domains. */
        list(): Promise<any[]>;
    };
    readonly productTypes: {
        /** Returns a product type definition including its assigned data types. */
        get(identifier: string): Promise<any | null>;
        /** Returns all product types. */
        list(): Promise<any[]>;
    };
    readonly permissions: {
        /** Returns the effective functional permission names for a user. */
        functional(userIdentifier: string): Promise<string[]>;
        /** Returns groups and their roles (viewer/writer/approver) on a data type. */
        dataType(dataTypeIdentifier: string, productTypeIdentifier?: string): Promise<ScriptPermissionRow[]>;
    };
    readonly apiKeys: {
        /** Returns an API key by identifier. */
        get(apiKeyIdentifier: string): Promise<ScriptApiKeyInfo | null>;
        /** Returns all API keys. */
        list(): Promise<ScriptApiKeyInfo[]>;
    };
    readonly previousApprovals: {
        /** Returns data type uuids that must be approved before the given data type. */
        getDependencies(dataTypeIdentifier: string, productTypeIdentifier: string): Promise<string[]>;
        /** Returns data type uuids that depend on the given data type being approved first. */
        getDependants(dataTypeIdentifier: string, productTypeIdentifier: string): Promise<string[]>;
    };
    /** Writes a message to the server log. Non-blocking (fire-and-forget). */
    log(level: "debug" | "info" | "warn" | "error", message: string): void;
}

declare interface ScriptExecutionContext {
    trigger: ScriptTriggerContext;
    principal: ScriptPrincipal;
    api: ScriptApi;
    /** The unfiltered candidate options array (only set for filter scripts). */
    options?: unknown[];
}

/**
 * The script execution context.
 *
 * Every stored script receives this object as its only parameter. Use
 * \`await ctx.api.request.getValue("uuid")\` to read other values on the
 * current request, \`ctx.trigger.cause\` to branch on why the script runs,
 * \`ctx.principal.userId\` to identify the acting user, and so on.
 *
 * All \`ctx.api\` methods are **async** — the script body runs inside an
 * async function, so \`await\` works at the top level.
 */
declare const ctx: ScriptExecutionContext;
`;

// ---------------------------------------------------------------------------
// Assembled declaration
// ---------------------------------------------------------------------------

export const MONACO_TYPES_DECLARATION = DOMAIN_TYPES + "\n" + SCRIPT_CONTEXT_TYPES;

const REGISTRATION_KEY = "ts:types.d.ts";
let monacoTypesRegistered = false;

/**
 * Registers the shared TypeScript type declarations with Monaco.
 *
 * Callers pass the monaco instance from the editor's `beforeMount` callback.
 * The declarations are registered exactly once (global flag), so both
 * `MonacoField` and `ScriptEditorPopup` can call this safely.
 */
export function registerMonacoTypes(monaco: any): void {
    if (!monacoTypesRegistered) {
        monacoTypesRegistered = true;
        monaco.languages.typescript.typescriptDefaults.addExtraLib(
            MONACO_TYPES_DECLARATION,
            REGISTRATION_KEY,
        );
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            diagnosticCodesToIgnore: [1108, 1308],
        });
    }
}
