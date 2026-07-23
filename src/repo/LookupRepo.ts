import type {DBClient} from "@/services/DatabaseDriver.ts";
import {and, asc, eq, inArray, or, type SQL, sql} from "drizzle-orm";
import {LookupsSchema, LookupsValues} from "@/schema/LookupsSchema.ts";
import { clearValuesAndCascadeApprovals } from "@/repo/ProductRequestRepo.ts";
import {count as _count, create as _create, createConfigurationRepository, disable as _disable, enable as _enable, get as _get, getByIdentifier as _getByIdentifier, update as _update, type RepositoryUpdateInput} from "@/repo/_crud_Repo.ts";
import type {IdentifierType, UUIDType} from "@/types/helpers.ts";
import {
    type LookupsSchemaSelectType,
    type LookupSummarySchemaType,
    type LookupsValuesInsertType,
} from "@/types/LookupsType.ts";
import {
    message_CreateLookup,
    message_CreateLookupValue,
    message_DisableLookup,
    message_DisableLookupValue,
    message_UpdateLookup,
    message_UpdateLookupValue,
} from "@/types/LookupsType.ts";
import type {UserSelectType} from "@/types/_UserType.ts";

const _LookupRepo = createConfigurationRepository(LookupsSchema, { create: message_CreateLookup,  update: message_UpdateLookup,  disable: message_DisableLookup, });

export async function get(db: DBClient, includeDisabled?: boolean, condition?: SQL, page?: number, pageSize?: number, ...orderBy: SQL[]): Promise<LookupSummarySchemaType[]> {
    const rows = await _LookupRepo.get(db, includeDisabled, undefined, page, pageSize);
    const stats = await getValueStats(db, rows);
    return rows.map((row) => ({
        lookup: row,
        enabledValueCount: stats.get(row.identifier)?.enabledValueCount ?? 0,
        disabledValueCount: stats.get(row.identifier)?.disabledValueCount ?? 0,
    }));
}

export const LookupRepo = { ..._LookupRepo, get };


/**
 * Counts values of one lookup type, excluding disabled rows by default.
 *
 * @param db Database client.
 * @param parent Parent lookup row.
 * @param includeDisabled Whether disabled value rows should be counted.
 * @returns Total number of matching lookup values.
 */
export const countValue = (db: DBClient, parent: LookupsSchemaSelectType, includeDisabled: boolean = false) => _count(db, LookupsValues, includeDisabled, eq(LookupsValues.lookupIdentifier, parent.identifier));

/**
 * Lists lookup values for one lookup type with optional pagination.
 *
 * @param db Database client.
 * @param parent Parent lookup row.
 * @param includeDisabled Whether disabled value rows should be included.
 * @param page Zero-based page index.
 * @param pageSize Optional page size.
 * @returns Matching lookup value rows.
 */
export const getValue = (db: DBClient, parent: LookupsSchemaSelectType, includeDisabled: boolean = false, page: number = 0, pageSize: number | undefined = undefined) => _get(db, LookupsValues, includeDisabled, eq(LookupsValues.lookupIdentifier, parent.identifier), page, pageSize, asc(LookupsValues.name), asc(LookupsValues.identifier));

/**
 * Returns one lookup value by identifier or `null` when absent.
 *
 * @param db Database client.
 * @param identifier Lookup value identifier.
 * @returns Matching lookup value row, or `null`.
 */
export const getValueByIdentifier = (db: DBClient, identifier: string) => _getByIdentifier(db, LookupsValues, identifier, true);

/**
 * Disables one or many lookup values and touches parent lookup audit metadata.
 *
 * @param db Database client.
 * @param userDisabling User performing the operation.
 * @param item Lookup value reference(s) to disable.
 * @param knownUpdatedAt Optional optimistic-lock timestamp.
 * @returns Updated lookup value rows.
 */
export const disableValue = async (db: DBClient, userDisabling: UserSelectType, lookupValue: UUIDType | IdentifierType | UUIDType[] | IdentifierType[], knownUpdatedAt: string | undefined) => {
    // Extract identifiers from the input
    const identifiers: string[] = (Array.isArray(lookupValue)
        ? lookupValue.map(lv => typeof lv === "object" && "identifier" in lv ? lv.identifier : lv as string)
        : [typeof lookupValue === "object" && "identifier" in lookupValue ? lookupValue.identifier : lookupValue as string]);

    // Clear references from open product requests and cascade break approvals
    await clearValuesAndCascadeApprovals(db, userDisabling, identifiers);

    return _disable(db, LookupsValues, userDisabling, lookupValue, knownUpdatedAt, message_DisableLookupValue);
};

/**
 * Enables one or many lookup values and touches parent lookup audit metadata.
 *
 * @param db Database client.
 * @param userEnabling User performing the operation.
 * @param item Lookup value reference(s) to enable.
 * @param knownUpdatedAt Optional optimistic-lock timestamp.
 * @returns Updated lookup value rows.
 */
export const enableValue = (db: DBClient, userEnabling: UserSelectType, lookupValue: UUIDType | IdentifierType | UUIDType[] | IdentifierType[], knownUpdatedAt: string | undefined) => _enable(db, LookupsValues, userEnabling, lookupValue, knownUpdatedAt, message_DisableLookupValue);

/**
 * Updates mutable lookup-value fields and touches parent lookup metadata.
 *
 * @param db Database client.
 * @param userUpdating User performing the operation.
 * @param item Lookup value reference(s) to update.
 * @param paramToUpdate Mutable fields to change.
 * @param knownUpdatedAt Optional optimistic-lock timestamp.
 * @returns Updated lookup value rows.
 */
export const updateValue = (db: DBClient, userUpdating: UserSelectType, lookupValue: UUIDType | IdentifierType | UUIDType[] | IdentifierType[], paramToUpdate: RepositoryUpdateInput<typeof LookupsValues>, knownUpdatedAt?: string) => _update(db, LookupsValues, userUpdating, lookupValue, paramToUpdate, knownUpdatedAt, message_UpdateLookupValue);

/**
 * Creates lookup values, ignoring case-insensitive duplicates per lookup type.
 *
 * @param db Database client.
 * @param userCreating User creating the rows.
 * @param item Insert payload for a lookup value.
 * @returns Created lookup value rows.
 */
export const createValue = (db: DBClient, userCreating: UserSelectType, lookupValue: LookupsValuesInsertType) => _create(db, LookupsValues, userCreating, lookupValue, message_CreateLookupValue);

/**
 * Returns aggregate enabled/disabled value counts grouped by lookup identifier.
 *
 * @param db Database client.
 * @param lookup One or many lookup references used to derive parent identifiers.
 * @returns Map keyed by lookup identifier with enabled/disabled counters.
 */
export async function getValueStats(db: DBClient, lookup: UUIDType | IdentifierType | LookupsSchemaSelectType | UUIDType[] | IdentifierType[] | LookupsSchemaSelectType[]): Promise<Map<string, {enabledValueCount: number, disabledValueCount: number}>> {
    const identifiers = Array.isArray(lookup)
        ? lookup.map(ts => typeof ts === "object" && ts !== null ? ts.identifier : ts)
        : [ typeof lookup === "object" && lookup !== null ? lookup.identifier : lookup ];

    if (identifiers.length === 0) return new Map();

    const rows = await db.select({
        lookupIdentifier: LookupsValues.lookupIdentifier,
        enabledValueCount: sql<number>`count(*) filter (where ${LookupsValues.disabled} = false)`.mapWith(Number),
        disabledValueCount: sql<number>`count(*) filter (where ${LookupsValues.disabled} = true)`.mapWith(Number),
    }).from(LookupsValues).where(inArray(LookupsValues.lookupIdentifier, identifiers)).groupBy(LookupsValues.lookupIdentifier);

    return new Map(rows.map((row) => [row.lookupIdentifier, {
        enabledValueCount: row.enabledValueCount,
        disabledValueCount: row.disabledValueCount,
    }]));
}
