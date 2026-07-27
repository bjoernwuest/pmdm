import {
    DataTypeSchema,
    DataTypePermission,
} from "@/schema/DataTypeSchema.ts";
import {
    type ConfigBoolean,
    type ConfigCalculated,
    type ConfigConsumable,
    type ConfigLookup,
    type ConfigNumeric,
    type ConfigProduct,
    type ConfigString,
    type DataTypeGroupRoles,
    type DataTypePermissionWithGroup,
    type DataTypeSchemaSelectType,
    type DataTypePermissionSelectType,
    type DataTypeSchemaInsertType, DataTypeKind, YesNoScript, type YesNoScriptType,
} from "@/types/DataTypeType.ts";
import {
    message_CreateDataType,
    message_DisableDataType,
    message_UpdateDataType,
    message_DataTypePermission_Grant,
    message_DataTypePermission_Revoke,
    message_DataTypePermission_Update
} from "@/types/DataTypeType.ts";
import type { DBClient } from "@/services/DatabaseDriver.ts";
import {and, eq, type SQL, sql} from "drizzle-orm";
import PubSub from "@/services/PubSub.ts";
import { Group } from "@/schema/UserSchema.ts";
import {createConfigurationRepository} from "@/repo/_crud_Repo.ts";
import type {UUIDType} from "@/types/helpers.ts";
import {BusinessDomains} from "@/schema/BusinessDomainSchema.ts";
import type {BusinessDomainsSelectType} from "@/types/BusinessDomainType.ts";
import type {UserSelectType} from "@/types/_UserType.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a default config object for a given data type kind. */
function getDefaultConfigForKind(kind: string): ConfigCalculated | ConfigBoolean | ConfigNumeric | ConfigString | ConfigLookup | ConfigConsumable | ConfigProduct {
    switch (kind) {
        case DataTypeKind.Calculated: return { script: undefined, mode: "on_export" } as ConfigCalculated;
        case DataTypeKind.Boolean: return { permitEmpty: false, defaultProvider: undefined, validate: undefined } as ConfigBoolean;
        case DataTypeKind.Numeric: return { decimals: 0, min: undefined, max: undefined, defaultProvider: undefined, validate: undefined } as ConfigNumeric;
        case DataTypeKind.String: return { min: 0, max: undefined, multi: false, inputValidation: undefined, defaultProvider: undefined, validate: undefined } as ConfigString;
        case DataTypeKind.Lookup: return { source: undefined, multi: false, defaultProvider: undefined, filter: undefined, validate: undefined } as ConfigLookup;
        case DataTypeKind.Consumable: return { source: undefined, multi: false, defaultProvider: undefined, filter: undefined, validate: undefined } as ConfigConsumable;
        case DataTypeKind.Product: return { multi: false, defaultProvider: undefined, filter: undefined, validate: undefined } as ConfigProduct;
        default: throw new Error(`Unknown DataType kind: ${kind}`);
    }
}

// ---------------------------------------------------------------------------
// DataType CRUD - use factory where possible
// ---------------------------------------------------------------------------
const _DataTypeRepo = createConfigurationRepository(DataTypeSchema, { create: message_CreateDataType, update: message_UpdateDataType, disable: message_DisableDataType, });

export async function get(db: DBClient, includeDisabled?: boolean, condition?: SQL, page?: number, pageSize?: number, ...orderBy: SQL[]): Promise<{dataType: DataTypeSchemaSelectType, owner: BusinessDomainsSelectType | undefined}[]> {
    const dataType = await _DataTypeRepo.get(db, includeDisabled, condition, page, pageSize, ...orderBy);
    const result = await Promise.all(dataType.map(async dt => {
        const ownerDomain = await db.select().from(BusinessDomains).where(eq(BusinessDomains.identifier, dt.owner)).limit(1);
        return {dataType: dt, owner: ownerDomain[0]};
    }));
    return result as unknown as {dataType: DataTypeSchemaSelectType, owner: BusinessDomainsSelectType | undefined}[];
}

export async function getByIdentifier(db: DBClient, identifier: string, includeDisabled?: boolean): Promise<{dataType: DataTypeSchemaSelectType, owner: BusinessDomainsSelectType | undefined}> {
    const dataType = await _DataTypeRepo.getByIdentifier(db, identifier, includeDisabled);
    if (!dataType) throw new Error(`DataType with identifier ${identifier} not found`);
    const ownerDomain = await db.select().from(BusinessDomains).where(eq(BusinessDomains.identifier, dataType.owner)).limit(1);
    return {dataType, owner: ownerDomain[0]} as unknown as {dataType: DataTypeSchemaSelectType, owner: BusinessDomainsSelectType | undefined};
}

/**
 * Creates a new data type.
 *
 * @param db Database client instance.
 * @param user User creating the data type.
 * @param input Creation payload.
 * @returns The created data type row.
 */
export async function create(db: DBClient, user: UserSelectType, input: DataTypeSchemaInsertType): Promise<DataTypeSchemaSelectType[]> {
    const config = (input.config ?? getDefaultConfigForKind(input.kind)) as ConfigCalculated | ConfigBoolean | ConfigNumeric | ConfigString | ConfigLookup | ConfigConsumable | ConfigProduct;
    const valuesToInsert = {
        name: input.name,
        kind: input.kind as DataTypeKind,
        owner: input.owner,
        config,
        description: input.description ?? null,
        mandatory: (input.mandatory ?? YesNoScript.No) as YesNoScriptType,
        requestorCanEdit: (input.requestorCanEdit ?? YesNoScript.Yes) as YesNoScriptType,
        createdBy: user.identifier,
    };
    return await _DataTypeRepo.create(db, user, valuesToInsert) as unknown as DataTypeSchemaSelectType[];
}

export const DataTypeRepo = { ..._DataTypeRepo, get, getByIdentifier, create };

// ---------------------------------------------------------------------------
// DataTypePermission CRUD
// ---------------------------------------------------------------------------

/**
 * Returns all permissions for a given data type, including the group name.
 *
 * @param db Database client instance.
 * @param dataTypeIdentifier Data type identifier.
 * @returns Permission rows with joined group names.
 */
export async function getPermissions(db: DBClient, dataTypeIdentifier: UUIDType): Promise<DataTypePermissionWithGroup[]> {
    const rows = await db
        .select({
            dataTypeIdentifier: DataTypePermission.dataTypeIdentifier,
            groupIdentifier: DataTypePermission.groupIdentifier,
            role: DataTypePermission.role,
            createdAt: DataTypePermission.createdAt,
            createdBy: DataTypePermission.createdBy,
            showByDefault: DataTypePermission.showByDefault,
            groupName: Group.groupName,
        })
        .from(DataTypePermission)
        .innerJoin(Group, eq(DataTypePermission.groupIdentifier, Group.identifier))
        .where(eq(DataTypePermission.dataTypeIdentifier, dataTypeIdentifier));

    return rows as DataTypePermissionWithGroup[];
}

/**
 * Grants a permission to a group for a data type (upsert).
 *
 * @param db Database client instance.
 * @param user User performing the grant.
 * @param input Permission grant details.
 * @returns The created or updated permission row.
 */
export async function grantPermission(db: DBClient, user: UserSelectType, dataTypeIdentifier: UUIDType, groupIdentifier: UUIDType, role: DataTypeGroupRoles, showByDefault: boolean = true): Promise<DataTypePermissionSelectType[]> {
    const result = await db
        .insert(DataTypePermission)
        .values({
            dataTypeIdentifier: dataTypeIdentifier,
            groupIdentifier: groupIdentifier,
            role: role,
            showByDefault: showByDefault,
            createdBy: user.identifier,
        } as any)
        .onConflictDoUpdate({
            target: [DataTypePermission.dataTypeIdentifier, DataTypePermission.groupIdentifier, DataTypePermission.role],
            set: {showByDefault: showByDefault, createdBy: user.identifier, createdAt: sql`now()`} as any,
        }).returning();

    if (result.length > 0) PubSub.publish(message_DataTypePermission_Grant, result[0]);
    return result as unknown as DataTypePermissionSelectType[];
}

/**
 * Revokes (deletes) a permission assignment.
 *
 * @param db Database client instance.
 * @param dataTypeIdentifier Data type identifier.
 * @param groupIdentifier Group identifier.
 * @param role Role to revoke.
 * @returns The deleted permission row(s).
 */
export async function revokePermission(db: DBClient, dataTypeIdentifier: string, groupIdentifier: string, role: string): Promise<DataTypePermissionSelectType[]> {
    const existing = await db.delete(DataTypePermission).where(and(eq(DataTypePermission.dataTypeIdentifier, dataTypeIdentifier), eq(DataTypePermission.groupIdentifier, groupIdentifier), eq(DataTypePermission.role, role as any))).returning();
    existing.forEach(row => PubSub.publish(message_DataTypePermission_Revoke, row));
    return existing as unknown as DataTypePermissionSelectType[];
}

/**
 * Updates the showByDefault flag on a permission.
 *
 * @param db Database client instance.
 * @param dataTypeIdentifier Data type identifier.
 * @param groupIdentifier Group identifier.
 * @param role Role.
 * @param input Fields to update.
 * @param knownUpdatedAt Optimistic-lock timestamp (on createdAt field since no updatedAt).
 * @returns The updated permission row.
 */
export async function updatePermission(db: DBClient, dataTypeIdentifier: string, groupIdentifier: string, role: DataTypeGroupRoles, showByDefault: boolean = true, knownUpdatedAt?: string): Promise<DataTypePermissionSelectType[]> {
    const result = await db.update(DataTypePermission).set({showByDefault: showByDefault} as any)
        .where(
            and(
                eq(DataTypePermission.dataTypeIdentifier, dataTypeIdentifier),
                eq(DataTypePermission.groupIdentifier, groupIdentifier),
                eq(DataTypePermission.role, role as any),
                knownUpdatedAt ? eq(DataTypePermission.createdAt, knownUpdatedAt) : undefined,
            ),
        ).returning();

    result.forEach(row => PubSub.publish(message_DataTypePermission_Update, result[0]));
    return result as unknown as DataTypePermissionSelectType[];
}
