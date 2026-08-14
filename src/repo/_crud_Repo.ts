// Basic CRUD operations shared across various repos

import type { ConfigurationEntityRepo } from "@/api/_crud_API.ts";
import type { BaseColumnsNamedSelectType } from "@/schema/_base.ts";
import { baseColumnsNamed } from "@/schema/_base.ts";
import type { DBClient } from "@/services/DatabaseDriver.ts";
import {and, asc, count as sqlCount, eq, inArray, type InferInsertModel, sql, SQL} from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { AtLeastOne, IdentifierType, UUIDType } from "@/types/helpers.ts";
import type { UserSelectType } from "@/types/UserType.ts";
import PubSub from "@/services/PubSub.ts";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import {devMode} from "@/devmode.ts";
import type { Tag } from "@/types/PubSubType";

function getCreateConflictClause<TTable extends BaseConfigurationTable>(
    table: TTable,
    insertData: RepositoryCreateInput<TTable>,
) {
    if ("lookupIdentifier" in insertData && "lookupIdentifier" in table) {
        return sql`ON CONFLICT (${(table as any).lookupIdentifier}, lower(${(table as any).name}))`;
    }
    if ("consumableIdentifier" in insertData && "consumableIdentifier" in table) {
        return sql`ON CONFLICT (${(table as any).consumableIdentifier}, lower(${(table as any).name}))`;
    }
    return sql`ON CONFLICT (lower(${(table as any).name}))`;
}

/**
 * Structural table type for all generic configuration repositories.
 *
 * Any table used here must expose at least the mandatory columns declared in `baseColumns`.
 */
export interface BaseConfigurationTable extends AnyPgTable {}

type EnsureBaseColumns<TTable extends BaseConfigurationTable> = keyof typeof baseColumnsNamed extends keyof TTable["_"]["columns"] ? TTable : never;

type ImmutableUpdateColumns = "identifier" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "disabled" | "lookupIdentifier" | "consumableIdentifier" | "kind";

type RepositoryCreateInput<TTable extends BaseConfigurationTable> = Omit<InferInsertModel<TTable>, "identifier" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy">;
export type RepositoryUpdateInput<TTable extends BaseConfigurationTable> = AtLeastOne<Omit<InferSelectModel<TTable>, ImmutableUpdateColumns>>;

type RepositoryFactoryOptions<TTable extends BaseConfigurationTable, TCreateInput, TUpdateInput> = Tag[] | {
    create?: Tag[];
    update?: Tag[];
    disable?: Tag[];
    mapCreateInput?: (input: TCreateInput) => RepositoryCreateInput<TTable>;
    mapUpdateInput?: (input: TUpdateInput) => RepositoryUpdateInput<TTable>;
};

const resolveChannel = <TTable extends BaseConfigurationTable, TCreateInput, TUpdateInput>(
    options: RepositoryFactoryOptions<TTable, TCreateInput, TUpdateInput> | undefined,
    operation: "create" | "update" | "disable",
): Tag[] | undefined => Array.isArray(options) ? options : options?.[operation];

function resolveCreateInputMapper<TTable extends BaseConfigurationTable, TCreateInput, TUpdateInput>(
    options: RepositoryFactoryOptions<TTable, TCreateInput, TUpdateInput> | undefined,
): (input: TCreateInput) => RepositoryCreateInput<TTable> {
    if (options && !Array.isArray(options) && options.mapCreateInput) return options.mapCreateInput;
    return (input) => input as RepositoryCreateInput<TTable>;
}

function resolveUpdateInputMapper<TTable extends BaseConfigurationTable, TCreateInput, TUpdateInput>(
    options: RepositoryFactoryOptions<TTable, TCreateInput, TUpdateInput> | undefined,
): (input: TUpdateInput) => RepositoryUpdateInput<TTable> {
    if (options && !Array.isArray(options) && options.mapUpdateInput) return options.mapUpdateInput;
    return (input) => input as RepositoryUpdateInput<TTable>;
}

function getIdentifiers(elements: UUIDType | IdentifierType | UUIDType[] | IdentifierType[]): string[] {
    return Array.isArray(elements)
        ? elements.map((item) => typeof item === "object" && item !== null ? item.identifier : item)
        : [typeof elements === "object" && elements !== null ? elements.identifier : elements];
}

/**
 * Returns the total number of elements.
 *
 * By default, disabled elements are excluded from the count.
 *
 * @param db Database client instance.
 * @param table The actual Drizzle-ORM schema table.
 * @param includeDisabled Whether disabled elements should be included.
 * @param condition Further condition included in `WHERE` clause with `AND`.
 * @returns Total number of matching elements.
 */
export async function count<TTable extends BaseConfigurationTable>(db: DBClient, table: EnsureBaseColumns<TTable>, includeDisabled: boolean = false, condition: SQL | undefined = undefined): Promise<number> {
    return (await db.select({count: sqlCount()}).from(table as AnyPgTable).where(and(includeDisabled ? undefined : eq((table as any).disabled, false), condition)))[0]!.count ?? 0;
}

/**
 * Retrieves elements with optional pagination.
 *
 * By default, disabled elements are excluded.
 *
 * @param db Database client instance.
 * @param table The actual Drizzle-ORM schema table.
 * @param includeDisabled Whether disabled elements should be included.
 * @param condition Further condition included in `WHERE` clause with `AND`.
 * @param page Zero-based page index.
 * @param pageSize Number of records per page. If omitted, all matching records are returned.
 * @param ordering Instructions for ordering, like `asc` and `desc`.
 * @returns Matching elements.
 */
export async function get<TTable extends BaseConfigurationTable>(db: DBClient, table: EnsureBaseColumns<TTable>, includeDisabled: boolean = false, condition: SQL | undefined = undefined, page: number = 0, pageSize: number | undefined = undefined, ...ordering: SQL[]): Promise<InferSelectModel<TTable>[]> {
    let query = db.select().from(table as AnyPgTable).where(and(includeDisabled ? undefined : eq((table as any).disabled, false), condition));
    if (ordering) query.orderBy(...ordering);
    if (pageSize) query.limit(Math.max(1, pageSize)).offset(Math.max(0, page) * Math.max(1, pageSize));
    return query as unknown as InferSelectModel<TTable>[];
}

/** Retrieves one row by identifier. */
export async function getByIdentifier<TTable extends BaseConfigurationTable>(db: DBClient, table: EnsureBaseColumns<TTable>, identifier: UUIDType | IdentifierType, includeDisabled: boolean = true, ): Promise<InferSelectModel<TTable> | null> {
    const idf = (typeof identifier === "object" && identifier !== null && "identifier" in identifier) ? identifier.identifier : identifier as string;
    return (await get(db, table, includeDisabled, eq((table as any).identifier, idf), 0, 1))[0] ?? null;
}

/**
 * Sets disabled status to one or more elements.
 *
 * The element can be referenced by identifier, UUID or an array containing any of those types.
 *
 * @param db Database client instance.
 * @param table The actual Drizzle-ORM schema table. * @param includeDisabled Whether disabled elements should be included.
 * @param userDisabling User performing the operation.
 * @param elements elements to set disabled status.
 * @param disabled Status whether to disable or enable.
 * @param knownUpdatedAt The timestamp when the element(s) was updated. If it does not match, update is rejected!
 * @param pubSubChannel The channel where to announce the update of. Only rows actually updated are announced.
 * @returns Updated elements.
 */
export async function setDisabled<TTable extends BaseConfigurationTable>(db: DBClient, table: EnsureBaseColumns<TTable>, userDisabling: UserSelectType, elements: UUIDType | IdentifierType | UUIDType[] | IdentifierType[], disabled: boolean, knownUpdatedAt: string | undefined, pubSubTags: Tag[] | undefined): Promise<InferSelectModel<TTable>[]> {
    const identifiers = getIdentifiers(elements);
    const updateValues = { disabled: disabled, updatedBy: userDisabling.identifier, updatedAt: sql`now()` } as const;
    const result = await db.update(table).set(updateValues as any).where(and(inArray((table as any).identifier, identifiers), knownUpdatedAt ? eq((table as any).updatedAt, knownUpdatedAt) : undefined)).returning();
    if (pubSubTags) result.forEach(r => PubSub.publish(pubSubTags, r));
    return result as unknown as InferSelectModel<TTable>[];
}

/** Disables rows by identifier references. */
export function disable<TTable extends BaseConfigurationTable>(db: DBClient, table: EnsureBaseColumns<TTable>, userDisabling: UserSelectType, elements: UUIDType | IdentifierType | UUIDType[] | IdentifierType[], knownUpdatedAt: string | undefined, pubSubTags: Tag[] | undefined, ): Promise<InferSelectModel<TTable>[]> { return setDisabled(db, table, userDisabling, elements, true, knownUpdatedAt, pubSubTags); }

/** Enables rows by identifier references. */
export function enable<TTable extends BaseConfigurationTable>(db: DBClient,table: EnsureBaseColumns<TTable>,userEnabling: UserSelectType,elements: UUIDType | IdentifierType | UUIDType[] | IdentifierType[],knownUpdatedAt: string | undefined, pubSubTags: Tag[] | undefined): Promise<InferSelectModel<TTable>[]> { return setDisabled(db, table, userEnabling, elements, false, knownUpdatedAt, pubSubTags); }

/**
 * Updates one or more elements.
 *
 * Only mutable properties may be updated. At least one property must be supplied.
 * Audit fields, identifiers, timestamps, and the disabled flag cannot be modified
 * through this function.
 *
 * @param db Database client instance.
 * @param table The actual Drizzle-ORM schema table. * @param includeDisabled Whether disabled elements should be included.
 * @param userUpdating User performing the update.
 * @param elements elements to update.
 * @param paramToUpdate Object containing one or more fields to update.
 * @param knownUpdatedAt The timestamp when the element(s) was updated. If it does not match, update is rejected!
 * @param pubSubChannel The channel where to announce the update of. Only rows actually updated are announced.
 * @returns Updated element records.
 */
export async function update<TTable extends BaseConfigurationTable>(db: DBClient, table: EnsureBaseColumns<TTable>, userUpdating: UserSelectType, elements: UUIDType | IdentifierType | UUIDType[] | IdentifierType[], paramToUpdate: RepositoryUpdateInput<TTable>, knownUpdatedAt: string | undefined, pubSubTags: Tag[] | undefined): Promise<InferSelectModel<TTable>[]> {
    const identifiers = getIdentifiers(elements);

    const updateValues = { ...paramToUpdate, updatedBy: userUpdating.identifier, updatedAt: sql`now()` } as const;
    const result = await db.update(table).set(updateValues as any).where(and(inArray((table as any).identifier, identifiers), knownUpdatedAt ? eq((table as any).updatedAt, knownUpdatedAt) : undefined)).returning();
    if (pubSubTags) result.forEach(r => PubSub.publish(pubSubTags, r));
    return result as unknown as InferSelectModel<TTable>[];
}

/**
 * Creates a new element.
 *
 * If a element with the same name already exists, no record is created
 * and an empty result set is returned.
 *
 * @param db Database client instance.
 * @param table The actual Drizzle-ORM schema table. * @param includeDisabled Whether disabled elements should be included.
 * @param userCreating User creating the element.
 * @param element Definition of the element to create.
 * @returns The created element record, or an empty array if creation was skipped.
 */
export async function create<TTable extends BaseConfigurationTable>(db: DBClient, table: EnsureBaseColumns<TTable>, userCreating: UserSelectType, insertData: RepositoryCreateInput<TTable>, pubSubTags: Tag[] | undefined): Promise<InferSelectModel<TTable>[]> {
    const valuesToInsert = { ...insertData, createdBy: userCreating.identifier };
    const conflictClause = getCreateConflictClause(table, insertData);
    const result = await db.insert(table).values(valuesToInsert as any).onConflictDoNothing(conflictClause as any).returning();
    if (pubSubTags) result.forEach(r => PubSub.publish(pubSubTags, r));
    return result as unknown as InferSelectModel<TTable>[];
}

export function createConfigurationRepository<TTable extends BaseConfigurationTable, TCreateInput = RepositoryCreateInput<TTable>, TUpdateInput = RepositoryUpdateInput<TTable>>(table: EnsureBaseColumns<TTable>, options?: RepositoryFactoryOptions<TTable, TCreateInput, TUpdateInput>): ConfigurationEntityRepo<InferSelectModel<TTable> & BaseColumnsNamedSelectType, InferSelectModel<TTable> & BaseColumnsNamedSelectType, TCreateInput, TUpdateInput> {
    const mapCreateInput = resolveCreateInputMapper(options);
    const mapUpdateInput = resolveUpdateInputMapper(options);
    return {
        count: (db, includeDisabled = false) => count(db, table, includeDisabled),
        get: async (db, includeDisabled = false, condition: SQL | undefined = undefined, page = 0, pageSize = undefined, ...orderBy: SQL[])=> {
            const finalOrder = orderBy.length > 0 ? orderBy : [asc((table as any).name), asc((table as any).identifier)];
            return await get(db, table, includeDisabled, condition, page, pageSize, ...finalOrder) as (InferSelectModel<TTable> & BaseColumnsNamedSelectType)[];
        },
        getByIdentifier: async (db, identifier, includeDisabled = true) => await getByIdentifier(db, table, identifier, includeDisabled) as (InferSelectModel<TTable> & BaseColumnsNamedSelectType) | null,
        create: (db, user, input) => create(db, table, user, mapCreateInput(input), resolveChannel(options, "create")) as Promise<(InferSelectModel<TTable> & BaseColumnsNamedSelectType)[]>,
        update: (db, user, identifier, input, knownUpdatedAt) => update(db, table, user, identifier, mapUpdateInput(input), knownUpdatedAt, resolveChannel(options, "update")) as Promise<(InferSelectModel<TTable> & BaseColumnsNamedSelectType)[]>,
        disable: (db, user, identifier, knownUpdatedAt) => disable(db, table, user, identifier, knownUpdatedAt, resolveChannel(options, "disable")) as Promise<(InferSelectModel<TTable> & BaseColumnsNamedSelectType)[]>,
        enable: (db, user, identifier, knownUpdatedAt) => enable(db, table, user, identifier, knownUpdatedAt, resolveChannel(options, "disable")) as Promise<(InferSelectModel<TTable> & BaseColumnsNamedSelectType)[]>,
    };
}
