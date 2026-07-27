import { type DBClient } from "@/services/DatabaseDriver.ts";
import { getConfigEntriesByKey, upsertConfigEntry } from "@/repo/ConfigRepo.ts";
import { type ConfigEntrySelectType, ConfigValueTypes } from "@/types/ConfigType.ts";
import {
    ScriptCategory,
    type ScriptExecutionContext,
    type ScriptPrincipal,
    type ScriptTriggerCause,
} from "@/types/ScriptEngineType.ts";
import {
    getRequestValueForScript,
    getRequestAllValuesForScript,
    getRequestMetaForScript,
} from "@/repo/ProductRequestRepo.ts";
import * as ProductRepo from "@/repo/ProductRepo.ts";
import * as DataTypeRepo from "@/repo/DataTypeRepo.ts";
import * as UserRepo from "@/repo/UserRepo.ts";
import * as LookupRepo from "@/repo/LookupRepo.ts";
import * as ConsumableRepo from "@/repo/ConsumableRepo.ts";
import * as TargetSystemRepo from "@/repo/TargetSystemRepo.ts";
import * as BusinessDomainRepo from "@/repo/BusinessDomainRepo.ts";
import * as ProductTypeRepo from "@/repo/ProductTypeRepo.ts";
import * as ApiKeyRepo from "@/repo/ApiKeyRepo.ts";
import { getFunctionalPermissionsOfUser } from "@/repo/FunctionalPermissionRepo.ts";
import { insertScriptLog } from "@/repo/ScriptLogRepo.ts";

const configDomain = "Script Engine";

// ── ConfigEntry declarations ────────────────────────────────────────────────

export const config = {
    cfgCalculationTimeoutMs: {
        domain: configDomain,
        key: "CalculationTimeoutMs",
        description: "Maximum wall-clock time (ms) for a calculation script. Exceeded → script aborted, null returned.",
        type: ConfigValueTypes.number,
        value: 5000,
        inputFormat: "^[1-9][0-9]*$",
        outputFormat: "",
        editInUI: true,
        mandatoryForStart: false,
        userProfile: false,
    } satisfies ConfigEntrySelectType,
    cfgDefaultProviderTimeoutMs: {
        domain: configDomain,
        key: "DefaultProviderTimeoutMs",
        description: "Maximum wall-clock time (ms) for a defaultProvider script.",
        type: ConfigValueTypes.number,
        value: 3000,
        inputFormat: "^[1-9][0-9]*$",
        outputFormat: "",
        editInUI: true,
        mandatoryForStart: false,
        userProfile: false,
    } satisfies ConfigEntrySelectType,
    cfgMandatoryScriptTimeoutMs: {
        domain: configDomain,
        key: "MandatoryScriptTimeoutMs",
        description: "Maximum wall-clock time (ms) for a mandatory_script / requestorCanEdit_script.",
        type: ConfigValueTypes.number,
        value: 1000,
        inputFormat: "^[1-9][0-9]*$",
        outputFormat: "",
        editInUI: true,
        mandatoryForStart: false,
        userProfile: false,
    } satisfies ConfigEntrySelectType,
    cfgFilterTimeoutMs: {
        domain: configDomain,
        key: "FilterTimeoutMs",
        description: "Maximum wall-clock time (ms) for a filter script.",
        type: ConfigValueTypes.number,
        value: 2000,
        inputFormat: "^[1-9][0-9]*$",
        outputFormat: "",
        editInUI: true,
        mandatoryForStart: false,
        userProfile: false,
    } satisfies ConfigEntrySelectType,
    cfgValidateTimeoutMs: {
        domain: configDomain,
        key: "ValidateTimeoutMs",
        description: "Maximum wall-clock time (ms) for a validate script.",
        type: ConfigValueTypes.number,
        value: 2000,
        inputFormat: "^[1-9][0-9]*$",
        outputFormat: "",
        editInUI: true,
        mandatoryForStart: false,
        userProfile: false,
    } satisfies ConfigEntrySelectType,
} satisfies Record<string, ConfigEntrySelectType>;

/**
 * Seeds all Script Engine config entries on startup (Pattern A).
 */
export async function startScriptEngine(db: DBClient): Promise<void> {
    for (const entry of Object.values(config)) {
        const existing = await getConfigEntriesByKey(db, entry.domain, entry.key, { limit: 1 });
        if (existing.length < 1) await upsertConfigEntry(db, entry);
    }
}

// ── Timeout resolution ──────────────────────────────────────────────────────

async function readTimeout(db: DBClient, category: ScriptCategory): Promise<number> {
    const entry = (() => {
        switch (category) {
            case ScriptCategory.Calculation: return config.cfgCalculationTimeoutMs;
            case ScriptCategory.DefaultProvider: return config.cfgDefaultProviderTimeoutMs;
            case ScriptCategory.MandatoryScript:
            case ScriptCategory.RequestorCanEditScript: return config.cfgMandatoryScriptTimeoutMs;
            case ScriptCategory.Filter: return config.cfgFilterTimeoutMs;
            case ScriptCategory.Validate: return config.cfgValidateTimeoutMs;
            default: return config.cfgCalculationTimeoutMs;
        }
    })();
    const rows = await getConfigEntriesByKey(db, entry.domain, entry.key, { limit: 1 });
    const num = Number(rows[0]?.value);
    return Number.isFinite(num) && num > 0 ? Math.round(num) : Number(entry.value);
}

// ── ScriptApi ───────────────────────────────────────────────────────────────

/**
 * Read-only query API exposed to scripts as `ctx.api`. Every method is async.
 *
 * Reads bypass per-data-type permission checks: scripts execute on behalf of
 * the system during a business operation with the caller's authority already
 * established, not as an end-user query. Script authors are trusted data type
 * administrators (see design/scripting_engine.md §8.1).
 */
export class ScriptApi {
    private _scriptCategory?: string;

    constructor(
        private readonly db: DBClient,
        private readonly logMeta: {
            dataTypeIdentifier: string | null;
            productRequestIdentifier: string;
            principalUserId: string | null;
        },
    ) {}

    _setLogMeta(category: string): void {
        this._scriptCategory = category;
    }

    _setLogDataTypeIdentifier(dataTypeIdentifier: string | null): void {
        this.logMeta.dataTypeIdentifier = dataTypeIdentifier;
    }

    readonly request = {
        getValue: async (dataTypeIdentifier: string): Promise<unknown> =>
            getRequestValueForScript(this.db, this.logMeta.productRequestIdentifier, dataTypeIdentifier),
        getAllValues: async (): Promise<Record<string, unknown>> =>
            getRequestAllValuesForScript(this.db, this.logMeta.productRequestIdentifier),
        meta: async () => getRequestMetaForScript(this.db, this.logMeta.productRequestIdentifier),
    };

    readonly products = {
        get: async (productNumber: string) =>
            ProductRepo.getProductByNumberForScript(this.db, productNumber),
        list: async (_filters?: Record<string, unknown>) =>
            ProductRepo.getProducts(this.db, true, undefined, 0, 1000),
    };

    readonly productRequests = {
        get: async (requestIdentifier: string) => ({
            meta: await getRequestMetaForScript(this.db, requestIdentifier),
            values: await getRequestAllValuesForScript(this.db, requestIdentifier),
        }),
        list: async (_filters?: Record<string, unknown>) => {
            throw new Error("api.productRequests.list is not implemented");
        },
    };

    readonly dataTypes = {
        get: async (identifier: string) => {
            const r = await DataTypeRepo.getByIdentifier(this.db, identifier, true);
            return r?.dataType ?? null;
        },
        list: async (_filters?: Record<string, unknown>) => {
            const rows = await DataTypeRepo.get(this.db, true);
            return rows.map((r) => r.dataType);
        },
    };

    readonly users = {
        get: async (userIdentifier: string) => {
            const rows = await UserRepo.getUsers(this.db, [{ identifier: userIdentifier }], undefined, true);
            return rows[0] ?? null;
        },
        list: async (_filters?: Record<string, unknown>) => UserRepo.getUsers(this.db, [], undefined, true),
        getGroups: async (userIdentifier: string) => {
            const map = await UserRepo.getGroupIdsAssignedTo(this.db, [{ identifier: userIdentifier }]);
            const ids = map.get(userIdentifier) ?? [];
            if (ids.length === 0) return [];
            return UserRepo.getGroups(this.db, ids, undefined, true);
        },
    };

    readonly groups = {
        get: async (groupIdentifier: string) => {
            const rows = await UserRepo.getGroup(this.db, { identifier: groupIdentifier });
            return rows[0] ?? null;
        },
        list: async (_filters?: Record<string, unknown>) => UserRepo.getGroups(this.db, [], undefined, true),
        getUsers: async (groupIdentifier: string) => {
            const map = await UserRepo.getUserIdsAssignedTo(this.db, [{ identifier: groupIdentifier }]);
            const ids = map.get(groupIdentifier) ?? [];
            if (ids.length === 0) return [];
            return UserRepo.getUsers(this.db, ids, undefined, true);
        },
    };

    readonly lookups = {
        get: async (identifier: string) =>
            (LookupRepo as any).getByIdentifier(this.db, identifier, true),
        getValues: async (identifier: string, _filters?: Record<string, unknown>) => {
            const lookup = await (LookupRepo as any).getByIdentifier(this.db, identifier, true);
            if (!lookup) return [];
            return LookupRepo.getValue(this.db, lookup, true);
        },
    };

    readonly consumables = {
        get: async (identifier: string) =>
            (ConsumableRepo as any).getByIdentifier(this.db, identifier, true),
        getValues: async (identifier: string, _filters?: Record<string, unknown>) => {
            const consumable = await (ConsumableRepo as any).getByIdentifier(this.db, identifier, true);
            if (!consumable) return [];
            return ConsumableRepo.getValue(this.db, consumable, true, false);
        },
    };

    readonly targetSystems = {
        get: async (identifier: string) =>
            TargetSystemRepo.getByIdentifier(this.db, identifier as any, true),
        list: async () => TargetSystemRepo.get(this.db, true),
    };

    readonly businessDomains = {
        get: async (identifier: string) =>
            BusinessDomainRepo.getByIdentifier(this.db, identifier as any, true),
        list: async () => BusinessDomainRepo.get(this.db, true),
    };

    readonly productTypes = {
        get: async (identifier: string) =>
            (ProductTypeRepo as any).getByIdentifier(this.db, identifier, true),
        list: async () => (ProductTypeRepo as any).get(this.db, true),
    };

    readonly permissions = {
        functional: async (userIdentifier: string) => {
            const perms = await getFunctionalPermissionsOfUser(this.db, { identifier: userIdentifier });
            return perms.map((p) => p.functionalPermissionName);
        },
        dataType: async (dataTypeIdentifier: string, _productTypeIdentifier?: string) => {
            const rows = await DataTypeRepo.getPermissions(this.db, dataTypeIdentifier);
            return rows;
        },
    };

    readonly apiKeys = {
        get: async (apiKeyIdentifier: string) => {
            const k = await ApiKeyRepo.getApiKey(this.db, apiKeyIdentifier);
            return k ?? null;
        },
        list: async () => ApiKeyRepo.getApiKeys(this.db, { page: 0, pageSize: 1000 }, true),
    };

    readonly previousApprovals = {
        getDependencies: async (dataTypeIdentifier: string, productTypeIdentifier: string) => {
            const rows = await ProductTypeRepo.getPreviousApprovals(this.db, productTypeIdentifier, dataTypeIdentifier);
            return rows.map((r) => r.dependsOnDataType);
        },
        getDependants: async (dataTypeIdentifier: string, productTypeIdentifier: string) => {
            const rows = await ProductTypeRepo.getDependants(this.db, productTypeIdentifier, dataTypeIdentifier);
            return rows.map((r) => r.dataType);
        },
    };

    log(level: "debug" | "info" | "warn" | "error", message: string): void {
        if (!this._scriptCategory) return;
        void insertScriptLog(this.db, {
            logLevel: level,
            message,
            scriptCategory: this._scriptCategory,
            dataTypeIdentifier: this.logMeta.dataTypeIdentifier,
            productRequestIdentifier: this.logMeta.productRequestIdentifier,
            principalUserId: this.logMeta.principalUserId,
        });
    }
}

// ── Context factory ─────────────────────────────────────────────────────────

export type BuildContextScenario = {
    cause: ScriptTriggerCause;
    productRequestIdentifier: string;
    dataTypeIdentifier?: string | null;
    principal: ScriptPrincipal;
    candidateValue?: unknown;
    options?: unknown[];
};

/**
 * Builds a fresh ScriptExecutionContext with a ScriptApi backed by `dbClient`.
 */
export function buildContext(dbClient: DBClient, scenario: BuildContextScenario): ScriptExecutionContext {
    return {
        trigger: {
            cause: scenario.cause,
            dataTypeIdentifier: scenario.dataTypeIdentifier ?? null,
            productRequestIdentifier: scenario.productRequestIdentifier,
            pubsubTags: null,
            candidateValue: scenario.candidateValue,
        },
        principal: scenario.principal,
        api: new ScriptApi(dbClient, {
            dataTypeIdentifier: scenario.dataTypeIdentifier ?? null,
            productRequestIdentifier: scenario.productRequestIdentifier,
            principalUserId: scenario.principal.userId,
        }),
        options: scenario.options,
    };
}

/**
 * Returns a shallow clone of `ctx` with a different `trigger.dataTypeIdentifier`.
 * The `api` instance is shared.
 */
export function forDataType(ctx: ScriptExecutionContext, dataTypeIdentifier: string): ScriptExecutionContext {
    (ctx.api as ScriptApi)._setLogDataTypeIdentifier(dataTypeIdentifier);
    return {
        ...ctx,
        trigger: { ...ctx.trigger, dataTypeIdentifier },
    };
}

// ── Sandboxed execution ─────────────────────────────────────────────────────

const SHADOWED_GLOBALS = [
    "process", "require", "global", "globalThis",
    "console", "fetch", "Function",
    "setTimeout", "setInterval", "setImmediate",
    "clearTimeout", "clearInterval", "clearImmediate",
    "XMLHttpRequest", "WebSocket",
    "module", "exports", "__dirname", "__filename",
] as const;

class ScriptTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`Script exceeded timeout of ${timeoutMs}ms`);
        this.name = "ScriptTimeoutError";
    }
}

export type ExecuteOptions = {
    /**
     * When true, engine failures (script throw / timeout) are re-thrown instead
     * of returning null. Used by validate (fail-closed) and filter (fail-hard)
     * call sites where silently swallowing a failure would be incorrect.
     */
    throwOnError?: boolean;
};

/**
 * Compiles and executes a stored script in a mitigated scope.
 *
 * The script body is wrapped in an async IIFE so top-level `await` works.
 * Dangerous globals are shadowed to `undefined`. Execution is bounded by a
 * configurable wall-clock timeout via `Promise.race`.
 *
 * On error or timeout the failure is logged with structured metadata; the
 * default behaviour returns `null`, while `opts.throwOnError` re-throws.
 */
export async function execute(
    dbClient: DBClient,
    script: string,
    ctx: ScriptExecutionContext,
    category: ScriptCategory,
    opts?: ExecuteOptions,
): Promise<unknown> {
    const timeoutMs = await readTimeout(dbClient, category);

    const meta = {
        category,
        cause: ctx.trigger.cause,
        dataTypeIdentifier: ctx.trigger.dataTypeIdentifier,
        productRequestIdentifier: ctx.trigger.productRequestIdentifier,
        principal: ctx.principal,
    };

    let fn: (...args: unknown[]) => Promise<unknown>;
    try {
        // eslint-disable-next-line no-new-func
        const compiled = new Function(
            "ctx",
            ...SHADOWED_GLOBALS,
            `"use strict"; return (async () => { ${script} })();`,
        );
        fn = compiled as (...args: unknown[]) => Promise<unknown>;
    } catch (e) {
        console.error("[ScriptEngine] Script compilation failed:", { ...meta, error: e });
        if (opts?.throwOnError) throw e;
        return null;
    }

    const shadowedUndefineds = SHADOWED_GLOBALS.map(() => undefined);

    try {
        (ctx.api as ScriptApi)._setLogMeta(category);
        const result = await Promise.race([
            fn(ctx, ...shadowedUndefineds),
            new Promise((_, reject) => setTimeout(() => reject(new ScriptTimeoutError(timeoutMs)), timeoutMs)),
        ]);
        return result;
    } catch (e) {
        console.error("[ScriptEngine] Script execution failed:", {
            ...meta,
            error: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : e,
        });
        if (opts?.throwOnError) throw e;
        return null;
    }
}
