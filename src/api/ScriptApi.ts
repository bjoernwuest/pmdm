import type { ApiInstance } from "@/apps/api.ts";
import { authorize, getLoggedinUserObject } from "@/services/Auth.ts";
import { FP_MANAGE_DATA_TYPES } from "@/services/auth/FunctionalPermissions.ts";
import * as ScriptEngine from "@/services/ScriptEngine.ts";
import type { ScriptCategory, ScriptPrincipal, ScriptTriggerCause } from "@/types/ScriptEngineType.ts";
import {
    ScriptPreviewRequestSchema,
    ScriptPreviewResponseSchema,
    ScriptValidateRequestSchema,
    ScriptValidateResponseSchema,
} from "@/types/ScriptEngineType.ts";
import { status, t } from "elysia";

/**
 * Registers the Script Engine authoring-support routes (preview + validate).
 */
// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance): void {
    /**
     * Resolves the script principal from the request context: the internal
     * user identifier for session auth, or the API key identifier for API-key
     * auth (mutually exclusive).
     */
    async function resolvePrincipal(context: any): Promise<ScriptPrincipal> {
        if (context.apiKeyAuth) {
            return {
                userId: null,
                apiKeyIdentifier: context.apiKeyAuth.apiKeyIdentifier,
                isApiKey: true,
            };
        }
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const user = await getLoggedinUserObject(context.dbClient, claims);
        return {
            userId: user?.identifier ?? null,
            apiKeyIdentifier: null,
            isApiKey: false,
        };
    }

    // -----------------------------------------------------------------------
    // POST /api/scripts/preview — execute a script against a real request
    // -----------------------------------------------------------------------
    app.post("/scripts/preview", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_MANAGE_DATA_TYPES]);
        if (!authz.some((p) => p.identifier === FP_MANAGE_DATA_TYPES.identifier)) {
            return status(403, { error: `Permission denied. Required: ${FP_MANAGE_DATA_TYPES.functionalPermissionName}` });
        }

        const body = context.body as {
            script: string;
            category: ScriptCategory;
            cause: ScriptTriggerCause;
            productRequestIdentifier: string;
            dataTypeIdentifier?: string;
        };

        const principal = await resolvePrincipal(context);
        const ctx = ScriptEngine.buildContext(context.dbClient, {
            cause: body.cause,
            productRequestIdentifier: body.productRequestIdentifier,
            dataTypeIdentifier: body.dataTypeIdentifier ?? null,
            principal,
        });

        try {
            const result = await ScriptEngine.execute(context.dbClient, body.script, ctx, body.category, { throwOnError: true });
            return { result };
        } catch (e) {
            return { result: null, error: e instanceof Error ? e.message : String(e) };
        }
    }, {
        body: ScriptPreviewRequestSchema,
        response: {
            200: ScriptPreviewResponseSchema,
            401: t.Object({ error: t.String() }),
            403: t.Object({ error: t.String() }),
        },
        detail: {
            tags: ["Scripts"],
            summary: "Preview-execute a stored script",
            description:
                "Executes a script body in the sandboxed ScriptEngine against a real product request and returns the result. " +
                "The trigger cause is supplied by the caller so any scenario can be simulated. " +
                `Requires the ${FP_MANAGE_DATA_TYPES.functionalPermissionName} permission.`,
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
    });

    // -----------------------------------------------------------------------
    // POST /api/scripts/validate — syntax-check a script without executing
    // -----------------------------------------------------------------------
    app.post("/scripts/validate", async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [FP_MANAGE_DATA_TYPES]);
        if (!authz.some((p) => p.identifier === FP_MANAGE_DATA_TYPES.identifier)) {
            return status(403, { error: `Permission denied. Required: ${FP_MANAGE_DATA_TYPES.functionalPermissionName}` });
        }

        const body = context.body as { script: string };

        try {
            // Parse-only: constructing the Function validates the syntax but
            // the function is never invoked.
            // eslint-disable-next-line no-new-func
            new Function("ctx", `"use strict"; return (async () => { ${body.script} })();`);
            return { valid: true };
        } catch (e) {
            return { valid: false, error: e instanceof Error ? e.message : String(e) };
        }
    }, {
        body: ScriptValidateRequestSchema,
        response: {
            200: ScriptValidateResponseSchema,
            401: t.Object({ error: t.String() }),
            403: t.Object({ error: t.String() }),
        },
        detail: {
            tags: ["Scripts"],
            summary: "Syntax-check a stored script",
            description:
                "Parses a script body without executing it and reports whether it is syntactically valid. " +
                `Requires the ${FP_MANAGE_DATA_TYPES.functionalPermissionName} permission.`,
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
    });
}
