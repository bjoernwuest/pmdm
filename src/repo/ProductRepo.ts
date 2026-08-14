import type { DBClient } from "@/services/DatabaseDriver.ts";
import { Products, ProductsValues } from "@/schema/ProductSchema.ts";
import { LookupsValues } from "@/schema/LookupsSchema.ts";
import { ConsumablesValues } from "@/schema/ConsumableSchema.ts";
import { ProductTypes, ProductTypesDataTypes, ProductTypesDataTypePermission } from "@/schema/ProductTypeSchema.ts";
import { DataTypeSchema, DataTypePermission } from "@/schema/DataTypeSchema.ts";
import { BusinessDomains } from "@/schema/BusinessDomainSchema.ts";
import { UserGroup } from "@/schema/UserSchema.ts";
import {
    message_CreateProduct,
    message_UpdateProduct,
    message_DisableProduct,
    type ProductListRow,
    type ProductDetail,
    type EffectivePermissions,
    type EnrichedProductValue, type ProductsSelectType, type ImportResult, type ImportError, type ImportRow,
} from "@/types/ProductType.ts";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { clearValuesAndCascadeApprovals } from "@/repo/ProductRequestRepo.ts";
import PubSub from "@/services/PubSub.ts";
import { getLoggedinUserObject } from "@/services/Auth.ts";
import type {UserSelectType} from "@/types/UserType.ts";
import { DataTypeKind } from "@/types/DataTypeType.ts";
import { markValuesAsUsed } from "@/repo/ConsumableRepo.ts";

// ---------------------------------------------------------------------------
// Product CRUD
// ---------------------------------------------------------------------------

/**
 * Count products, optionally including disabled or filtered by condition.
 */
export async function countProducts(
    db: DBClient,
    includeDisabled: boolean = false,
    condition?: SQL,
): Promise<number> {
    const where = includeDisabled
        ? (condition ?? undefined)
        : (condition ? and(eq(Products.disabled, false), condition) : eq(Products.disabled, false));

    const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(Products)
        .where(where);
    return rows[0]?.count ?? 0;
}

/**
 * Get paginated product list, joined with ProductTypes.name.
 * Applies optional SQL condition for query builder filters.
 */
export async function getProducts(
    db: DBClient,
    includeDisabled: boolean = false,
    condition?: SQL,
    page: number = 0,
    pageSize: number = 20,
    orderCol: string = "productNumber",
    orderDir: "asc" | "desc" = "asc",
): Promise<ProductListRow[]> {
    const where = includeDisabled
        ? (condition ?? undefined)
        : (condition ? and(eq(Products.disabled, false), condition) : eq(Products.disabled, false));

    const orderFn = orderDir === "desc" ? desc : asc;
    let orderBy: SQL;
    switch (orderCol) {
        case "productTypeName":
            orderBy = orderFn(ProductTypes.name);
            break;
        case "updatedAt":
            orderBy = orderFn(Products.updatedAt);
            break;
        case "disabled":
            orderBy = orderFn(Products.disabled);
            break;
        default:
            orderBy = orderFn(Products.productNumber);
    }

    const rows = await db
        .select({
            productTypeIdentifier: Products.productTypeIdentifier,
            productNumber: Products.productNumber,
            updatedAt: Products.updatedAt,
            disabled: Products.disabled,
            productTypeName: ProductTypes.name,
        })
        .from(Products)
        .innerJoin(ProductTypes, eq(Products.productTypeIdentifier, ProductTypes.identifier))
        .where(where)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(page * pageSize);

    return rows.map((r) => ({
        productTypeIdentifier: r.productTypeIdentifier,
        productNumber: r.productNumber,
        updatedAt: r.updatedAt,
        disabled: r.disabled,
        productTypeName: r.productTypeName,
    })) as ProductListRow[];
}

/**
 * Get a single product by productNumber for script consumption.
 * Read-only; no permission checks (script API reads run with the caller's
 * already-established authority). Returns the product row with its values.
 */
export async function getProductByNumberForScript(
    db: DBClient,
    productNumber: string,
): Promise<{
    productNumber: string;
    productTypeIdentifier: string | null;
    productTypeName: string | null;
    disabled: boolean;
    values: Record<string, unknown>;
} | null> {
    const rows = await db
        .select({
            productNumber: Products.productNumber,
            productTypeIdentifier: Products.productTypeIdentifier,
            productTypeName: ProductTypes.name,
            disabled: Products.disabled,
        })
        .from(Products)
        .leftJoin(ProductTypes, eq(Products.productTypeIdentifier, ProductTypes.identifier))
        .where(eq(Products.productNumber, productNumber))
        .limit(1);

    if (rows.length === 0) return null;

    const valueRows = await db
        .select({
            dataTypeIdentifier: ProductsValues.dataTypeIdentifier,
            value: ProductsValues.value,
        })
        .from(ProductsValues)
        .where(eq(ProductsValues.productNumber, productNumber));

    const values: Record<string, unknown> = {};
    for (const v of valueRows) {
        if (v.dataTypeIdentifier) values[v.dataTypeIdentifier] = v.value;
    }

    const r = rows[0]!;
    return {
        productNumber: r.productNumber!,
        productTypeIdentifier: r.productTypeIdentifier ?? null,
        productTypeName: r.productTypeName ?? null,
        disabled: r.disabled ?? false,
        values,
    };
}

/**
 * Get a single product by productNumber, enriched with productTypeName and
 * viewer-filtered values.
 */
export async function getProductByNumber(
    db: DBClient,
    tokenClaims: Record<string, any>,
    productNumber: string,
    includeDisabled: boolean = false,
): Promise<ProductDetail | null> {
    const where = includeDisabled
        ? eq(Products.productNumber, productNumber)
        : and(eq(Products.productNumber, productNumber), eq(Products.disabled, false));

    const rows = await db
        .select({
            productTypeIdentifier: Products.productTypeIdentifier,
            productNumber: Products.productNumber,
            updatedAt: Products.updatedAt,
            disabled: Products.disabled,
            productTypeName: ProductTypes.name,
        })
        .from(Products)
        .innerJoin(ProductTypes, eq(Products.productTypeIdentifier, ProductTypes.identifier))
        .where(where)
        .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0]!;
    const effectivePerms = await getEffectiveViewerPermissions(db, tokenClaims, row.productTypeIdentifier);

    const allValues = await db
        .select({
            productNumber: ProductsValues.productNumber,
            dataTypeIdentifier: ProductsValues.dataTypeIdentifier,
            value: ProductsValues.value,
            dataTypeName: DataTypeSchema.name,
            dataTypeKind: DataTypeSchema.kind,
            businessDomainIdentifier: DataTypeSchema.owner,
            businessDomainName: BusinessDomains.name,
        })
        .from(ProductsValues)
        .innerJoin(DataTypeSchema, eq(ProductsValues.dataTypeIdentifier, DataTypeSchema.identifier))
        .leftJoin(BusinessDomains, eq(DataTypeSchema.owner, BusinessDomains.identifier))
        .where(eq(ProductsValues.productNumber, productNumber));

    // Filter values based on effective viewer permissions
    const filteredValues = effectivePerms.viewableDataTypeIdentifiers.length > 0
        ? allValues.filter((v) => effectivePerms.viewableDataTypeIdentifiers.includes(v.dataTypeIdentifier))
        : allValues;

    // Batch-resolve lookup/consumable UUIDs to names
    const lookupUuids = new Set<string>();
    const consumableUuids = new Set<string>();
    for (const v of filteredValues) {
        const resolved = v.value;
        if (!resolved || resolved === "null") continue;
        const items = Array.isArray(resolved) ? resolved : [resolved];
        for (const item of items) {
            if (typeof item !== "string") continue;
            if (v.dataTypeKind === DataTypeKind.Lookup) lookupUuids.add(item);
            else if (v.dataTypeKind === DataTypeKind.Consumable) consumableUuids.add(item);
        }
    }

    const lookupNameMap = new Map<string, string>();
    if (lookupUuids.size > 0) {
        const lvRows = await db
            .select({ identifier: LookupsValues.identifier, name: LookupsValues.name })
            .from(LookupsValues)
            .where(inArray(LookupsValues.identifier, Array.from(lookupUuids)));
        for (const r of lvRows) lookupNameMap.set(r.identifier, r.name!);
    }

    const consumableNameMap = new Map<string, string>();
    if (consumableUuids.size > 0) {
        const cvRows = await db
            .select({ identifier: ConsumablesValues.identifier, name: ConsumablesValues.name })
            .from(ConsumablesValues)
            .where(inArray(ConsumablesValues.identifier, Array.from(consumableUuids)));
        for (const r of cvRows) consumableNameMap.set(r.identifier, r.name!);
    }

    function resolveDisplayValue(rawValue: unknown, kind: string): string | null {
        if (rawValue === null || rawValue === undefined || rawValue === "null") return null;
        if (kind === DataTypeKind.Lookup) {
            if (Array.isArray(rawValue)) return rawValue.map((item) => lookupNameMap.get(String(item)) ?? String(item)).join(", ");
            return lookupNameMap.get(String(rawValue)) ?? String(rawValue);
        }
        if (kind === DataTypeKind.Consumable) {
            if (Array.isArray(rawValue)) return rawValue.map((item) => consumableNameMap.get(String(item)) ?? String(item)).join(", ");
            return consumableNameMap.get(String(rawValue)) ?? String(rawValue);
        }
        if (kind === DataTypeKind.Product) {
            if (Array.isArray(rawValue)) return rawValue.map((item) => String(item)).join(", ");
            return String(rawValue);
        }
        return null;
    }

    const enrichedValues: EnrichedProductValue[] = filteredValues.map((v) => ({
        productNumber: v.productNumber,
        dataTypeIdentifier: v.dataTypeIdentifier,
        value: v.value,
        dataTypeName: v.dataTypeName,
        dataTypeKind: v.dataTypeKind,
        businessDomainIdentifier: v.businessDomainIdentifier,
        businessDomainName: v.businessDomainName,
        displayValue: resolveDisplayValue(v.value, v.dataTypeKind),
    }));

    return {
        productTypeIdentifier: row.productTypeIdentifier,
        productNumber: row.productNumber,
        updatedAt: row.updatedAt,
        disabled: row.disabled,
        productTypeName: row.productTypeName,
        values: enrichedValues,
    } as ProductDetail;
}

/**
 * Create a product with optional values. Validates values against DataType
 * and ProductTypesDataTypes configs. Publishes create.Product.
 */
export async function createProduct(
    db: DBClient,
    tokenClaims: Record<string, any>,
    productNumber: string,
    productTypeIdentifier: string,
    values: Record<string, unknown> = {},
): Promise<ProductsSelectType[]> {
    // Insert or upsert product
    const result = await db
        .insert(Products)
        .values({
            productTypeIdentifier,
            productNumber,
            disabled: false,
        })
        .onConflictDoUpdate({
            target: Products.productNumber,
            set: { updatedAt: sql`now()` },
        })
        .returning();

    if (result.length > 0) {
        // Upsert values - only those that differ
        const dataTypeIdentifiers = Object.keys(values);
        for (const dtId of dataTypeIdentifiers) {
            const existingValue = await db
                .select()
                .from(ProductsValues)
                .where(and(
                    eq(ProductsValues.productNumber, productNumber),
                    eq(ProductsValues.dataTypeIdentifier, dtId),
                ))
                .limit(1);

            const newVal = values[dtId];

            if (existingValue.length === 0) {
                // Insert new value
                await db
                    .insert(ProductsValues)
                    .values({
                        productNumber,
                        dataTypeIdentifier: dtId,
                        value: newVal as any,
                    })
                    .onConflictDoNothing();
            } else if (JSON.stringify(existingValue[0]!.value) !== JSON.stringify(newVal)) {
                // Update only if changed
                await db
                    .update(ProductsValues)
                    .set({ value: newVal as any })
                    .where(and(
                        eq(ProductsValues.productNumber, productNumber),
                        eq(ProductsValues.dataTypeIdentifier, dtId),
                    ));
            }
        }

        // Mark consumable values as used when assigned to a product
        if (dataTypeIdentifiers.length > 0) {
            const consumableDtIds = await db
                .select({ identifier: DataTypeSchema.identifier })
                .from(DataTypeSchema)
                .where(and(
                    inArray(DataTypeSchema.identifier, dataTypeIdentifiers),
                    eq(DataTypeSchema.kind, DataTypeKind.Consumable),
                ));

            for (const dt of consumableDtIds) {
                const val = values[dt.identifier];
                if (val === null || val === undefined) continue;
                const identifiers: string[] = Array.isArray(val)
                    ? (val as string[]).filter((v): v is string => typeof v === "string")
                    : (typeof val === "string" ? [val] : []);
                if (identifiers.length > 0) {
                    await markValuesAsUsed(db, identifiers);
                }
            }
        }

        PubSub.publish(message_CreateProduct, result[0]);
    }

    return result as unknown as ProductsSelectType[];
}

/**
 * Update product fields and optionally values. Uses optimistic locking.
 */
export async function updateProduct(
    db: DBClient,
    tokenClaims: Record<string, any>,
    productNumber: string,
    fields: { productTypeIdentifier?: string },
    values?: Record<string, unknown>,
    knownUpdatedAt?: string,
): Promise<ProductsSelectType[]> {
    const updateData: Record<string, any> = { updatedAt: sql`now()` };
    if (fields.productTypeIdentifier !== undefined) {
        updateData.productTypeIdentifier = fields.productTypeIdentifier;
    }

    const result = await db
        .update(Products)
        .set(updateData)
        .where(and(
            eq(Products.productNumber, productNumber),
            knownUpdatedAt ? sql`${Products.updatedAt} = ${knownUpdatedAt}` : undefined,
        ))
        .returning();

    if (knownUpdatedAt && result.length === 0) return [];

    if (result.length > 0 && values) {
        const dataTypeIdentifiers = Object.keys(values);
        for (const dtId of dataTypeIdentifiers) {
            const existingValue = await db
                .select()
                .from(ProductsValues)
                .where(and(
                    eq(ProductsValues.productNumber, productNumber),
                    eq(ProductsValues.dataTypeIdentifier, dtId),
                ))
                .limit(1);

            const newVal = values[dtId];

            if (existingValue.length === 0) {
                await db
                    .insert(ProductsValues)
                    .values({
                        productNumber,
                        dataTypeIdentifier: dtId,
                        value: newVal as any,
                    })
                    .onConflictDoNothing();
            } else if (JSON.stringify(existingValue[0]!.value) !== JSON.stringify(newVal)) {
                await db
                    .update(ProductsValues)
                    .set({ value: newVal as any })
                    .where(and(
                        eq(ProductsValues.productNumber, productNumber),
                        eq(ProductsValues.dataTypeIdentifier, dtId),
                    ));
            }
        }

        // Mark consumable values as used when assigned to a product
        if (dataTypeIdentifiers.length > 0) {
            const consumableDtIds = await db
                .select({ identifier: DataTypeSchema.identifier })
                .from(DataTypeSchema)
                .where(and(
                    inArray(DataTypeSchema.identifier, dataTypeIdentifiers),
                    eq(DataTypeSchema.kind, DataTypeKind.Consumable),
                ));

            for (const dt of consumableDtIds) {
                const val = values[dt.identifier];
                if (val === null || val === undefined) continue;
                const identifiers: string[] = Array.isArray(val)
                    ? (val as string[]).filter((v): v is string => typeof v === "string")
                    : (typeof val === "string" ? [val] : []);
                if (identifiers.length > 0) {
                    await markValuesAsUsed(db, identifiers);
                }
            }
        }

        PubSub.publish(message_UpdateProduct, result[0]);
    } else if (result.length > 0) {
        PubSub.publish(message_UpdateProduct, result[0]);
    }

    return result as unknown as ProductsSelectType[];
}

/**
 * Toggle disabled flag.
 */
export async function setProductDisabled(
    db: DBClient,
    user: UserSelectType,
    productNumber: string,
    disabled: boolean,
    knownUpdatedAt?: string,
): Promise<ProductsSelectType[]> {
    const result = await db
        .update(Products)
        .set({ disabled, updatedAt: sql`now()` })
        .where(and(
            eq(Products.productNumber, productNumber),
            knownUpdatedAt ? sql`${Products.updatedAt} = ${knownUpdatedAt}` : undefined,
        ))
        .returning();

    if (knownUpdatedAt && result.length === 0) return [];

    if (result.length > 0) {
        PubSub.publish(message_DisableProduct, result[0]);
    }

    // When disabling a product, clear it from open product requests and
    // cascade-break approvals of data types that depend on affected values.
    if (disabled) {
        await clearValuesAndCascadeApprovals(db, user, [productNumber]);
    }

    return result as unknown as ProductsSelectType[];
}

/**
 * Convenience wrapper for setProductDisabled(…, true, …).
 */
export async function disableProduct(
    db: DBClient,
    user: UserSelectType,
    productNumber: string,
    knownUpdatedAt?: string,
): Promise<ProductsSelectType[]> {
    return setProductDisabled(db, user, productNumber, true, knownUpdatedAt);
}

/**
 * Convenience wrapper for setProductDisabled(…, false, …).
 */
export async function enableProduct(
    db: DBClient,
    user: UserSelectType,
    productNumber: string,
    knownUpdatedAt?: string,
): Promise<ProductsSelectType[]> {
    return setProductDisabled(db, user, productNumber, false, knownUpdatedAt);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Bulk import within a single transaction. Validates each row, then calls
 * createProduct for each valid row. Validation and PubSub are handled inside
 * createProduct.
 */
export async function importProducts(
    db: DBClient,
    tokenClaims: Record<string, any>,
    productTypeIdentifier: string,
    rows: ImportRow[],
): Promise<ImportResult> {
    const errors: ImportError[] = [];
    let created = 0;

    // Load DataType assignments for this ProductType
    const dataTypeAssignments = await db
        .select({
            dataTypeIdentifier: ProductTypesDataTypes.dataType,
            dataTypeName: DataTypeSchema.name,
            dataTypeKind: DataTypeSchema.kind,
            dataTypeConfig: DataTypeSchema.config,
            mandatory: ProductTypesDataTypes.mandatory,
            ptConfig: ProductTypesDataTypes.config,
        })
        .from(ProductTypesDataTypes)
        .innerJoin(DataTypeSchema, eq(ProductTypesDataTypes.dataType, DataTypeSchema.identifier))
        .where(eq(ProductTypesDataTypes.productType, productTypeIdentifier));

    const dtMap = new Map(dataTypeAssignments.map((d) => [d.dataTypeName, d]));

    // Collect all productNumbers in batch for uniqueness check
    const productNumbers = rows.map((r) => r.productNumber);
    const existingProducts = await db
        .select({ productNumber: Products.productNumber })
        .from(Products)
        .where(inArray(Products.productNumber, productNumbers));

    const importBatchProductNumbers = new Set<string>();
    const existingSet = new Set(existingProducts.map((p) => p.productNumber));

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 1; // 1-based

        // Validate productNumber
        if (!row.productNumber || row.productNumber.trim() === "") {
            errors.push({ row: rowNum, productNumber: row.productNumber || "(empty)", field: "productNumber", message: "Product number must not be empty" });
            continue;
        }

        // Check uniqueness within import batch
        if (importBatchProductNumbers.has(row.productNumber.toLowerCase())) {
            errors.push({ row: rowNum, productNumber: row.productNumber, field: "productNumber", message: "Duplicate product number within import batch" });
            continue;
        }
        importBatchProductNumbers.add(row.productNumber.toLowerCase());

        // Validate each value against DataType configs
        let rowHasError = false;
        const validatedValues: Record<string, unknown> = {};

        for (const [dtName, rawValue] of Object.entries(row.values)) {
            const dtAssignment = dtMap.get(dtName);
            if (!dtAssignment) {
                errors.push({ row: rowNum, productNumber: row.productNumber, field: dtName, message: `Unknown DataType "${dtName}"` });
                rowHasError = true;
                continue;
            }

            if (dtAssignment.dataTypeKind === "calculated") {
                // Skip calculated values during import
                continue;
            }

            // Resolve config precedence: ProductTypesDataTypes config takes precedence over DataType config
            const dtConfig = dtAssignment.dataTypeConfig as Record<string, any> | null;
            const ptConfig = dtAssignment.ptConfig as Record<string, any> | null;
            const resolvedConfig = { ...(dtConfig ?? {}), ...(ptConfig ?? {}) };

            // Check mandatory
            const isMandatory = dtAssignment.mandatory ?? (dtConfig?.mandatory ?? false);
            if (isMandatory && (rawValue === null || rawValue === undefined || rawValue === "")) {
                errors.push({ row: rowNum, productNumber: row.productNumber, field: dtName, message: `Value is mandatory` });
                rowHasError = true;
                continue;
            }

            if (rawValue === null || rawValue === undefined || rawValue === "") {
                validatedValues[dtAssignment.dataTypeIdentifier] = null;
                continue;
            }

            // Type-specific validation
            const kind = dtAssignment.dataTypeKind;
            const error = validateDataTypeValue(kind, rawValue, resolvedConfig, dtAssignment.dataTypeIdentifier, db);
            if (error) {
                errors.push({ row: rowNum, productNumber: row.productNumber, field: dtName, message: error });
                rowHasError = true;
            } else {
                validatedValues[dtAssignment.dataTypeIdentifier] = rawValue;
            }
        }

        if (!rowHasError) {
            // Valid row — will be created in the caller's transaction
            try {
                // Direct insert in this transaction
                await db
                    .insert(Products)
                    .values({
                        productTypeIdentifier,
                        productNumber: row.productNumber,
                        disabled: false,
                    })
                    .onConflictDoUpdate({
                        target: Products.productNumber,
                        set: { updatedAt: sql`now()` },
                    });

                // Insert values
                for (const [dtId, val] of Object.entries(validatedValues)) {
                    await db
                        .insert(ProductsValues)
                        .values({
                            productNumber: row.productNumber,
                            dataTypeIdentifier: dtId,
                            value: val as any,
                        })
                        .onConflictDoUpdate({
                            target: [ProductsValues.productNumber, ProductsValues.dataTypeIdentifier],
                            set: { value: val as any },
                        });
                }

                created++;
            } catch (e: any) {
                errors.push({ row: rowNum, productNumber: row.productNumber, field: "productNumber", message: `Database error: ${e.message}` });
            }
        }
    }

    return { created, errors };
}

function validateDataTypeValue(
    kind: string,
    value: unknown,
    config: Record<string, any> | null,
    dataTypeIdentifier: string,
    _db: DBClient,
): string | null {
    switch (kind) {
        case "boolean": {
            const strVal = String(value).toLowerCase().trim();
            if (strVal === "true" || strVal === "1" || strVal === "yes") return null;
            if (strVal === "false" || strVal === "0" || strVal === "no") return null;
            const permitEmpty = config?.permitEmpty ?? false;
            if (permitEmpty && (strVal === "" || strVal === "null" || strVal === "undefined")) return null;
            return `Invalid boolean value: "${value}". Expected true/false, 1/0, yes/no.`;
        }
        case "string": {
            const strVal = String(value);
            const inputValidation = config?.inputValidation;
            if (inputValidation && strVal.length > 0) {
                try {
                    const regex = new RegExp(inputValidation);
                    if (!regex.test(strVal)) {
                        return `Input does not match the required format`;
                    }
                } catch (_) {
                    // Invalid regex — skip
                }
            }
            return null;
        }
        case "lookup":
        case "consumable":
        case "product":
            // These are validated more thoroughly at query time; basic format check here
            return null;
        case "calculated":
            return null;
        default:
            return `Unknown DataType kind: ${kind}`;
    }
}

// ---------------------------------------------------------------------------
// Viewer Permissions
// ---------------------------------------------------------------------------

/**
 * Returns DataType identifiers the user has viewer role for, considering group
 * memberships and ProductTypesDataTypePermission (ignoring showByDefault).
 * Falls back to DataTypePermission if no ProductType-level permission exists.
 */
export async function getEffectiveViewerPermissions(
    db: DBClient,
    tokenClaims: Record<string, any>,
    productTypeIdentifier: string,
): Promise<EffectivePermissions> {
    // Get user
    const user = await getLoggedinUserObject(db, tokenClaims);
    if (!user) {
        return { viewableDataTypeIdentifiers: [] };
    }

    // Get user's group memberships
    const userGroups = await db
        .select({ groupIdentifier: UserGroup.groupIdentifier })
        .from(UserGroup)
        .where(eq(UserGroup.userIdentifier, user.identifier));

    const groupIds = userGroups.map((g) => g.groupIdentifier);
    if (groupIds.length === 0) {
        return { viewableDataTypeIdentifiers: [] };
    }

    // Check ProductTypesDataTypePermission for viewer role (ignoring showByDefault)
    const ptPerms = await db
        .select({
            dataTypeIdentifier: ProductTypesDataTypes.dataType,
            groupIdentifier: ProductTypesDataTypePermission.groupIdentifier,
        })
        .from(ProductTypesDataTypePermission)
        .innerJoin(
            ProductTypesDataTypes,
            eq(ProductTypesDataTypePermission.productTypeDataTypeIdentifier, ProductTypesDataTypes.identifier),
        )
        .where(and(
            eq(ProductTypesDataTypes.productType, productTypeIdentifier),
            eq(ProductTypesDataTypePermission.role, "viewer"),
            inArray(ProductTypesDataTypePermission.groupIdentifier, groupIds),
        ));

    if (ptPerms.length > 0) {
        const viewableIds = [...new Set(ptPerms.map((p) => p.dataTypeIdentifier))];
        return { viewableDataTypeIdentifiers: viewableIds };
    }

    // Fall back to DataTypePermission for viewer role
    const dtPerms = await db
        .select({ dataTypeIdentifier: DataTypePermission.dataTypeIdentifier })
        .from(DataTypePermission)
        .where(and(
            eq(DataTypePermission.role, "viewer"),
            inArray(DataTypePermission.groupIdentifier, groupIds),
        ));

    // Get all DataTypes assigned to this ProductType
    const assignedDataTypes = await db
        .select({ dataTypeIdentifier: ProductTypesDataTypes.dataType })
        .from(ProductTypesDataTypes)
        .where(eq(ProductTypesDataTypes.productType, productTypeIdentifier));

    const assignedDtIds = new Set(assignedDataTypes.map((d) => d.dataTypeIdentifier));
    const viewableIds = [...new Set(
        dtPerms
            .filter((p) => assignedDtIds.has(p.dataTypeIdentifier))
            .map((p) => p.dataTypeIdentifier),
    )];

    return { viewableDataTypeIdentifiers: viewableIds };
}
