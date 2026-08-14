import type {DBClient} from "@/services/DatabaseDriver.ts";
import {and, asc, eq, inArray, or, type SQL, sql} from "drizzle-orm";
import {Consumables, ConsumablesValues} from "@/schema/ConsumableSchema.ts";
import { clearValuesAndCascadeApprovals } from "@/repo/ProductRequestRepo.ts";
import {
    type ConsumablesSelectType,
    type ConsumableSummarySchemaType, type ConsumablesValuesInsertType,
    type ConsumablesValuesSelectType, message_CreateConsumable, message_CreateConsumableValue,
    message_DisableConsumable, message_DisableConsumableValue,
    message_UpdateConsumable, message_UpdateConsumableValue,
} from "@/types/ConsumableType.ts";
import type {UserSelectType} from "@/types/UserType.ts";
import type {IdentifierType, UUIDType} from "@/types/helpers.ts";
import {
    count as _count,
    create as _create,
    createConfigurationRepository,
    disable as _disable,
    enable as _enable,
    get as _get,
    getByIdentifier as _getByIdentifier,
    update as _update,
    type RepositoryUpdateInput,
} from "@/repo/_crud_Repo.ts";

const _ConsumableRepo = createConfigurationRepository(Consumables, { create: message_CreateConsumable, update: message_UpdateConsumable, disable: message_DisableConsumable, });

export async function get(db: DBClient, includeDisabled?: boolean, condition?: SQL, page?: number, pageSize?: number, ...orderBy: SQL[]): Promise<ConsumableSummarySchemaType[]> {
    const rows = await _ConsumableRepo.get(db, includeDisabled, undefined, page, pageSize);
    const stats = await getValueStats(db, rows);
    return rows.map((row) => ({
        consumable: row,
        enabledValueCount: stats.get(row.identifier)?.enabledValueCount ?? 0,
        disabledValueCount: stats.get(row.identifier)?.disabledValueCount ?? 0,
        usedValueCount: stats.get(row.identifier)?.usedValueCount ?? 0,
    }));
}

export const ConsumableRepo = { ..._ConsumableRepo, get };

/**
 * Returns the total number of consumable values of consumable.
 *
 * By default, disabled consumable values are excluded from the count.
 *
 * @param db Database client instance.
 * @param consumable The consumable whose values shall be counted.
 * @param includeDisabled Whether disabled consumable values should be included.
 * @returns Total number of matching consumables.
 */
export const countValue = (db: DBClient, parent: ConsumablesSelectType, includeDisabled: boolean = false) => _count(db, ConsumablesValues, includeDisabled, eq(ConsumablesValues.consumableIdentifier, parent.identifier));

/**
 * Retrieves consumable values with optional pagination.
 *
 * By default, disabled and already used consumable values are excluded.
 *
 * @param db Database client instance.
 * @param consumable The consumable for which to return values.
 * @param includeDisabled Whether disabled consumables should be included.
 * @param unusedOnly Return only values of consumable that are not assigned.
 * @param page Zero-based page index.
 * @param pageSize Number of records per page. If omitted, all matching records are returned.
 * @returns Matching business domains.
 */
export const getValue = (
    db: DBClient,
    parent: ConsumablesSelectType,
    includeDisabled: boolean = false,
    unusedOnly: boolean = false,
    page: number = 0,
    pageSize: number | undefined = undefined,
) => _get(
    db,
    ConsumablesValues,
    includeDisabled,
    and(
        eq(ConsumablesValues.consumableIdentifier, parent.identifier),
        unusedOnly ? eq(ConsumablesValues.isUsed, false) : undefined,
    ),
    page,
    pageSize,
    asc(ConsumablesValues.name),
    asc(ConsumablesValues.identifier),
);

/** Retrieves one consumable by identifier. */
export const getValueByIdentifier = (db: DBClient, identifier: string) => _getByIdentifier(db, ConsumablesValues, identifier, true);

/**
 * Disables one or more consumable values.
 *
 * The consumable values can be referenced by identifier, UUID, object instance,
 * or an array containing any of those types.
 *
 * @param db Database client instance.
 * @param userDisabling User performing the operation.
 * @param consumableValue consumable value(s) to disable.
 * @returns Updated consumable value records.
 */
export const disableValue = async (db: DBClient, userDisabling: UserSelectType, consumableValue: UUIDType | IdentifierType | UUIDType[] | IdentifierType[], knownUpdatedAt: string | undefined) => {
    // Extract identifiers from the input
    const identifiers: string[] = (Array.isArray(consumableValue)
        ? consumableValue.map(cv => typeof cv === "object" && "identifier" in cv ? cv.identifier : cv as string)
        : [typeof consumableValue === "object" && "identifier" in consumableValue ? consumableValue.identifier : consumableValue as string]);

    // Clear references from open product requests and cascade break approvals
    await clearValuesAndCascadeApprovals(db, userDisabling, identifiers);

    // Mark removed consumable values as unused since they are no longer
    // assigned to any product request.
    await markValuesAsUnused(db, identifiers);

    return _disable(db, ConsumablesValues, userDisabling, consumableValue, knownUpdatedAt, message_DisableConsumableValue);
};

/**
 * Enables one or more consumable values.
 *
 * The consumables can be referenced by identifier, UUID, object instance,
 * or an array containing any of those types.
 *
 * @param db Database client instance.
 * @param userEnabling User performing the operation.
 * @param consumableValue consumable value(s) to enable.
 * @returns Updated consumable value records.
 */
export const enableValue = (db: DBClient, userDisabling: UserSelectType, consumableValue: UUIDType | IdentifierType | UUIDType[] | IdentifierType[], knownUpdatedAt: string | undefined) => _enable(db, ConsumablesValues, userDisabling, consumableValue, knownUpdatedAt, message_DisableConsumableValue);

/**
 * Updates one or more consumable values.
 *
 * Only mutable properties may be updated. At least one property must be supplied.
 * Audit fields, identifiers, timestamps, and the disabled flag cannot be modified
 * through this function.
 *
 * @param db Database client instance.
 * @param userUpdating User performing the update.
 * @param consumableValue consumable value(s) to update.
 * @param paramToUpdate Object containing one or more fields to update.
 * @returns Updated consumable value(s) records.
 */
export const updateValue = (db: DBClient, userUpdating: UserSelectType, consumableValue: UUIDType | IdentifierType | UUIDType[] | IdentifierType[], paramToUpdate: RepositoryUpdateInput<typeof ConsumablesValues>, knownUpdatedAt?: string) => _update(db, ConsumablesValues, userUpdating, consumableValue, paramToUpdate, knownUpdatedAt, message_UpdateConsumableValue);

/**
 * Creates a new consumable value.
 *
 * If a consumable value with the same name already exists, no record is created
 * and an empty result set is returned.
 *
 * @param db Database client instance.
 * @param userCreating User creating the business domain.
 * @param consumableValue Definition of the consumable value to create.
 * @returns The created consumable value record, or an empty array if creation was skipped.
 */
export const createValue = (db: DBClient, userCreating: UserSelectType, consumableValue: ConsumablesValuesInsertType) => _create(db, ConsumablesValues, userCreating, consumableValue, message_CreateConsumableValue);

export async function getValueStats(db: DBClient, consumableValue: UUIDType | IdentifierType | ConsumablesValuesSelectType | UUIDType[] | IdentifierType[] | ConsumablesValuesSelectType[]): Promise<Map<string, {enabledValueCount: number, disabledValueCount: number, usedValueCount: number}>> {
    const identifiers = Array.isArray(consumableValue)
        ? consumableValue.map(ts => typeof ts === "object" && ts !== null ? ts.identifier : ts)
        : [ typeof consumableValue === "object" && consumableValue !== null ? consumableValue.identifier : consumableValue ];

    const rows = await db.select({
        consumableIdentifier: ConsumablesValues.consumableIdentifier,
        enabledValueCount: sql<number>`count(*) filter (where ${ConsumablesValues.disabled} = false)`.mapWith(Number),
        disabledValueCount: sql<number>`count(*) filter (where ${ConsumablesValues.disabled} = true)`.mapWith(Number),
        usedValueCount: sql<number>`count(*) filter (where ${ConsumablesValues.isUsed} = true)`.mapWith(Number),
    }).from(ConsumablesValues).where(inArray(ConsumablesValues.consumableIdentifier, identifiers)).groupBy(ConsumablesValues.consumableIdentifier);

    return new Map(rows.map((row) => [row.consumableIdentifier, {
        enabledValueCount: row.enabledValueCount,
        disabledValueCount: row.disabledValueCount,
        usedValueCount: row.usedValueCount,
    }]));
}

/**
 * Marks one or more consumable values as used (is_used = true).
 *
 * Identifiers that do not exist or are already marked as used are silently
 * ignored (the UPDATE is a no-op for them).
 *
 * @param db         Database client instance.
 * @param identifiers Consumable value identifiers to mark as used.
 */
export async function markValuesAsUsed(
    db: DBClient,
    identifiers: string[],
): Promise<void> {
    if (identifiers.length === 0) return;
    await db
        .update(ConsumablesValues)
        .set({ isUsed: true, updatedAt: sql`now()` })
        .where(inArray(ConsumablesValues.identifier, identifiers));
}

/**
 * Marks one or more consumable values as **unused** so they become available
 * for assignment to product requests again.
 *
 * @param db         Database client instance.
 * @param identifiers Consumable value identifiers to mark as unused.
 */
export async function markValuesAsUnused(
    db: DBClient,
    identifiers: string[],
): Promise<void> {
    if (identifiers.length === 0) return;
    await db
        .update(ConsumablesValues)
        .set({ isUsed: false, updatedAt: sql`now()` })
        .where(inArray(ConsumablesValues.identifier, identifiers));
}
