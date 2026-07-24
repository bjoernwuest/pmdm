import type { ApiInstance } from "@/apps/api.ts";
import { status, t } from "elysia";
import { authorize, getLoggedinUserObject } from "@/services/Auth.ts";
import type { FunctionalPermissionSelectType } from "@/types/FunctionalPermissionType.ts";
import { runInTransaction, type DBClient } from "@/services/DatabaseDriver.ts";
import { getUserListPageSizes } from "@/services/ui_config.ts";
import { getSystemUser } from "@/repo/UserRepo.ts";
import type { UserSelectType } from "@/types/UserType.ts";
import type {BaseColumnsNamedSelectType} from "@/schema/_base.ts";
import type { Tag } from "@/types/PubSubType";
import type {SQL} from "drizzle-orm";

/**
 * Repository contract required by the generic configuration route registrar.
 *
 * @typeParam TRecord      Entity row type for detail / mutation operations.
 * @typeParam TListRecord  Row type returned by {@link get} (defaults to `TRecord`).
 *                         Set to a different type when the repo enriches list rows
 *                         (e.g. with sub-entity statistics).
 * @typeParam TCreateInput Shape of the payload passed to {@link create}.
 * @typeParam TUpdateInput Shape of the update-fields payload passed to {@link update}.
 */
export type ConfigurationEntityRepo<
    TRecord extends BaseColumnsNamedSelectType,
    TListRecord = TRecord,
    TCreateInput = { name: string },
    TUpdateInput = { name: string },
> = {
    count: (db: DBClient, includeDisabled?: boolean) => Promise<number>;
    get: (db: DBClient, includeDisabled?: boolean, condition?: SQL, page?: number, pageSize?: number, ...orderBy: SQL[]) => Promise<TListRecord[]>;
    getByIdentifier: (db: DBClient, identifier: string, includeDisabled?: boolean) => Promise<TRecord | null>;
    create: (db: DBClient, user: UserSelectType, input: TCreateInput) => Promise<TRecord[]>;
    update: (
        db: DBClient,
        user: UserSelectType,
        identifier: string,
        input: TUpdateInput,
        knownUpdatedAt?: string,
    ) => Promise<TRecord[]>;
    disable: (
        db: DBClient,
        user: UserSelectType,
        identifier: string,
        knownUpdatedAt?: string,
    ) => Promise<TRecord[]>;
    enable: (
        db: DBClient,
        user: UserSelectType,
        identifier: string,
        knownUpdatedAt?: string,
    ) => Promise<TRecord[]>;
};

/**
 * Parameters configuring one set of generated CRUD routes.
 *
 * @typeParam TRecord      Entity row type for detail / mutation responses.
 * @typeParam TListRecord  Row type for list responses (defaults to `TRecord`).
 * @typeParam TCreateInput Shape of the payload passed to `repo.create()`.
 * @typeParam TUpdateInput Shape of the update-fields payload passed to `repo.update()` (excluding `knownUpdatedAt`).
 */
export type RegisterConfigurationEntityRoutesOptions<
    TRecord extends BaseColumnsNamedSelectType,
    TListRecord = TRecord,
    TCreateInput = { name: string },
    TUpdateInput = { name: string },
> = {
    /** Base API path, e.g. `/business_domains`. */
    basePath: string;
    /** Route parameter used for identifier lookups, e.g. `businessdomainid`. */
    routeParam: string;
    /** Human readable singular label used in route descriptions and error messages. */
    entityLabel: string;
    /** Response key for list payloads, e.g. `businessDomains`. */
    listResponseKey: string;
    /** Response key for detail payloads, e.g. `businessDomain`. */
    detailResponseKey: string;
    /** OpenAPI schema for one entity row in detail responses. */
    entitySchema: unknown;
    /**
     * Optional OpenAPI schema for one entity row in list responses.
     *
     * When omitted, defaults to {@link entitySchema}. Set to a different schema
     * when the repo's `get` function returns enriched rows (e.g. summary objects
     * with sub-entity statistics) that differ from the detail row shape.
     */
    listEntitySchema?: unknown;
    /**
     * Optional OpenAPI schema for one entity row in the detail (single-item) response.
     *
     * When omitted, defaults to {@link entitySchema}. Set to a different schema
     * when the repo's `getByIdentifier` function returns enriched rows that differ
     * from the entity schema shape.
     */
    detailEntitySchema?: unknown;
    /** Functional permission required to read rows. */
    viewPermission: FunctionalPermissionSelectType;
    /**
     * Optional alternative permissions accepted for the list endpoint only.
     *
     * When provided, users holding any of these permissions can list rows
     * without needing the primary {@link viewPermission}. The detail endpoint
     * still requires {@link viewPermission}.
     */
    alternativeListViewPermissions?: FunctionalPermissionSelectType[];
    /** Functional permission required to mutate rows. */
    managePermission: FunctionalPermissionSelectType;
    /** Repo implementation handling persistence and PubSub publication. */
    repo: ConfigurationEntityRepo<TRecord, TListRecord, TCreateInput, TUpdateInput>;
    /**
     * PubSub tags emitted by the repo while mutating rows.
     *
     * @example [["create", "BusinessDomain"], ["update", "BusinessDomain"], ["disable", "BusinessDomain"]]
     */
    pubSubTags: readonly Tag[][];
    /**
     * Optional TypeBox schema for the POST (create) request body.
     *
     * When omitted, defaults to `{ name: t.String({ minLength: 1, maxLength: 255 }) }`.
     */
    createBodySchema?: unknown;
    /**
     * Optional TypeBox schema for the PUT (update) request body.
     *
     * When omitted, defaults to `{ name: t.String({ minLength: 1, maxLength: 255 }), knownUpdatedAt: t.String() }`.
     */
    updateBodySchema?: unknown;
    /**
     * Optional mapper from the validated create body to the repo's `TCreateInput`.
     *
     * When omitted, the body is passed through as-is.
     */
    mapCreateBody?: (body: any) => TCreateInput;
    /**
     * Optional mapper from the validated update body to the repo's update fields + `knownUpdatedAt`.
     *
     * Must return `{ input: TUpdateInput, knownUpdatedAt: string }`.
     * When omitted, defaults to extracting `{ name }` as input and `knownUpdatedAt` from the body.
     */
    mapUpdateBody?: (body: any) => { input: TUpdateInput; knownUpdatedAt: string };
};

/**
 * Parses truthy query values used for includeDisabled filters.
 *
 * @param value Raw query value from Elysia context.
 * @returns `true` when value is `true`, `"true"`, or `"1"`; otherwise `false`.
 */
function parseBooleanQuery(value: unknown): boolean {
    return value === true || value === "true" || value === "1";
}

/**
 * Registers CRUD-style configuration routes for simple name-based entities.
 *
 * The generated mutation handlers call repo methods which publish changes through
 * `PubSub` tags defined in `options.pubSubTags`.
 *
 * @typeParam TRecord Entity row type returned by the backing repository.
 * @param app API app instance receiving route registrations.
 * @param options Route generation parameters and repository contract.
 * @returns Nothing. Routes are attached directly to `app`.
 *
 * Events emitted via `PubSub.publish` by repository mutation methods:
 * - `options.pubSubTags[0]` for create operations
 * - `options.pubSubTags[1]` for update operations
 * - `options.pubSubTags[2]` for disable/enable operations
 */
export function registerConfigurationEntityRoutes<
    TRecord extends BaseColumnsNamedSelectType,
    TListRecord = TRecord,
    TCreateInput = { name: string },
    TUpdateInput = { name: string },
>(
    app: ApiInstance,
    options: RegisterConfigurationEntityRoutesOptions<TRecord, TListRecord, TCreateInput, TUpdateInput>,
): void {
    const singularLabel = options.entityLabel;
    const pluralLabel = `${singularLabel.toLowerCase()}s`;

    app.get(options.basePath, async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const allListPerms = [options.viewPermission, ...(options.alternativeListViewPermissions ?? [])];
        const authz = await authorize(context.dbClient, claims, allListPerms);
        if (!authz.some((perm) => allListPerms.some((ap) => ap.identifier === perm.identifier))) {
            const requiredNames = allListPerms.map((p) => p.functionalPermissionName).join(" or ");
            return status(403, `Permission denied. Required: ${requiredNames}`);
        }

        const availablePageSizes = await getUserListPageSizes(context.dbClient, typeof claims.oid === "string" ? claims.oid : undefined);
        const page = Math.max(0, Number(context.query.page ?? 0));
        const pageSize = Math.max(1, Number(context.query.pageSize ?? availablePageSizes[0] ?? 10));
        const includeDisabled = parseBooleanQuery(context.query.includeDisabled);

        const [total, rows] = await Promise.all([
            options.repo.count(context.dbClient, includeDisabled),
            options.repo.get(context.dbClient, includeDisabled, undefined, page, pageSize),
        ]);

        const payload: Record<string, unknown> = {
            page,
            pageSize,
            total,
            availablePageSizes,
            includeDisabled,
            [options.listResponseKey]: rows,
        };
        return payload;
    }, {
        query: t.Object({
            page: t.Optional(t.Union([t.Number({ minimum: 0 }), t.String()])),
            pageSize: t.Optional(t.Union([t.Number({ minimum: 1 }), t.String()])),
            includeDisabled: t.Optional(t.Union([t.Boolean(), t.String()])),
        }),
        response: {
            200: t.Object({
                [options.listResponseKey]: t.Array((options.listEntitySchema ?? options.entitySchema) as any),
                page: t.Number({ minimum: 0 }),
                pageSize: t.Number({ minimum: 1 }),
                total: t.Number({ minimum: 0 }),
                availablePageSizes: t.Array(t.Number({ minimum: 1 })),
                includeDisabled: t.Boolean(),
            } as any),
            401: t.String(),
            403: t.String(),
        },
        detail: {
            tags: [singularLabel],
            summary: `Get paged ${pluralLabel}`,
            description: `Returns ${pluralLabel} with pagination metadata and optional inclusion of disabled entries.`,
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
    });

    app.get(`${options.basePath}/:${options.routeParam}`, async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [options.viewPermission]);
        if (!authz.some((perm) => perm.identifier === options.viewPermission.identifier)) {
            return status(403, `Permission denied. Required: ${options.viewPermission.functionalPermissionName}`);
        }

        const identifier = context.params[options.routeParam] as string;
        const item = await options.repo.getByIdentifier(context.dbClient, identifier, true);
        if (!item) return status(404, `${options.entityLabel} does not exist`);
        return { [options.detailResponseKey]: item };
    }, {
        params: t.Object({ [options.routeParam]: t.String({ format: "uuid" }) } as any),
        response: {
            200: t.Object({ [options.detailResponseKey]: (options.detailEntitySchema ?? options.entitySchema) as any }),
            401: t.String(),
            403: t.String(),
            404: t.String(),
        },
        detail: {
            tags: [singularLabel],
            summary: `Get ${options.entityLabel.toLowerCase()} by identifier`,
            description: `Returns a single ${options.entityLabel.toLowerCase()} including disabled entries.`,
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
    });

    app.post(options.basePath, async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [options.managePermission]);
        if (!authz.some((perm) => perm.identifier === options.managePermission.identifier)) {
            return status(403, `Permission denied. Required: ${options.managePermission.functionalPermissionName}`);
        }

        const created = await runInTransaction(context.dbClient, async (tx) => {
            const user = (await getLoggedinUserObject(tx, claims)) ?? (await getSystemUser(tx));
            const createInput: TCreateInput = options.mapCreateBody
                ? options.mapCreateBody(context.body as any)
                : context.body as TCreateInput;
            return options.repo.create(tx, user, createInput);
        });

        if (created.length === 0) return status(409, `A ${options.entityLabel.toLowerCase()} with this name already exists`);
        return { [options.detailResponseKey]: created[0]! };
    }, {
        body: (options.createBodySchema ?? t.Object({ name: t.String({ minLength: 1, maxLength: 255 }) })) as any,
        response: {
            200: t.Object({ [options.detailResponseKey]: options.entitySchema } as any),
            401: t.String(),
            403: t.String(),
            409: t.String(),
        },
        detail: {
            tags: [singularLabel],
            summary: `Create ${options.entityLabel.toLowerCase()}`,
            description: `Creates a new ${options.entityLabel.toLowerCase()} if the name is unique.`,
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
    });

    app.put(`${options.basePath}/:${options.routeParam}`, async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [options.managePermission]);
        if (!authz.some((perm) => perm.identifier === options.managePermission.identifier)) {
            return status(403, `Permission denied. Required: ${options.managePermission.functionalPermissionName}`);
        }

        const identifier = context.params[options.routeParam] as string;
        const updated = await runInTransaction(context.dbClient, async (tx) => {
            const user = (await getLoggedinUserObject(tx, claims)) ?? (await getSystemUser(tx));
            const existing = await options.repo.getByIdentifier(tx, identifier, true);
            if (!existing) return null;
            const { input, knownUpdatedAt } = options.mapUpdateBody
                ? options.mapUpdateBody(context.body as any)
                : { input: { name: (context.body as any).name.trim() } as TUpdateInput, knownUpdatedAt: (context.body as any).knownUpdatedAt as string };
            const rows = await options.repo.update(tx, user, identifier, input, knownUpdatedAt);
            return rows[0] ?? false;
        });

        if (updated === null) return status(404, `${options.entityLabel} does not exist`);
        if (updated === false) return status(409, `${options.entityLabel} was modified by another user`);
        return { [options.detailResponseKey]: updated };
    }, {
        params: t.Object({ [options.routeParam]: t.String({ format: "uuid" }) } as any),
        body: (options.updateBodySchema ?? t.Object({
            name: t.String({ minLength: 1, maxLength: 255 }),
            knownUpdatedAt: t.String(),
        })) as any,
        response: {
            200: t.Object({ [options.detailResponseKey]: options.entitySchema } as any),
            401: t.String(),
            403: t.String(),
            404: t.String(),
            409: t.String(),
        },
        detail: {
            tags: [singularLabel],
            summary: `Rename ${options.entityLabel.toLowerCase()}`,
            description: `Updates the ${options.entityLabel.toLowerCase()} name using optimistic locking via knownUpdatedAt.`,
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
    });

    app.patch(`${options.basePath}/:${options.routeParam}/disabled`, async (context) => {
        const claims = context.session?.idTokenClaims ?? context.tokenClaims ?? {};
        const authz = await authorize(context.dbClient, claims, [options.managePermission]);
        if (!authz.some((perm) => perm.identifier === options.managePermission.identifier)) {
            return status(403, `Permission denied. Required: ${options.managePermission.functionalPermissionName}`);
        }

        const identifier = context.params[options.routeParam] as string;
        const updated = await runInTransaction(context.dbClient, async (tx) => {
            const user = (await getLoggedinUserObject(tx, claims)) ?? (await getSystemUser(tx));
            const existing = await options.repo.getByIdentifier(tx, identifier, true);
            if (!existing) return null;
            const rows = context.body.disabled
                ? await options.repo.disable(tx, user, identifier, context.body.knownUpdatedAt)
                : await options.repo.enable(tx, user, identifier, context.body.knownUpdatedAt);
            return rows[0] ?? false;
        });

        if (updated === null) return status(404, `${options.entityLabel} does not exist`);
        if (updated === false) return status(409, `${options.entityLabel} was modified by another user`);
        return { [options.detailResponseKey]: updated };
    }, {
        params: t.Object({ [options.routeParam]: t.String({ format: "uuid" }) } as any),
        body: t.Object({
            disabled: t.Boolean(),
            knownUpdatedAt: t.String(),
        }),
        response: {
            200: t.Object({ [options.detailResponseKey]: options.entitySchema } as any),
            401: t.String(),
            403: t.String(),
            404: t.String(),
            409: t.String(),
        },
        detail: {
            tags: [singularLabel],
            summary: `Enable or disable ${options.entityLabel.toLowerCase()}`,
            description: `Sets the disabled flag using optimistic locking via knownUpdatedAt.`,
            parameters: [
                { name: "X-API-Key", in: "header", description: "API key for authentication", schema: { type: "string" }, required: false },
            ],
        },
    });
}
