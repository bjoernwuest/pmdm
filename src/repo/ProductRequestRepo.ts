import type { DBClient } from "@/services/DatabaseDriver.ts";
import { ProductRequests, ProductRequestsValues, ProductNumberState, ProductRequestStatus } from "@/schema/ProductRequestSchema.ts";
import { ProductTypes, ProductTypesDataTypes, ProductTypesDataTypePermission, ProductTypesDataTypePreviousApproval, ProductTypesPermission } from "@/schema/ProductTypeSchema.ts";
import { DataTypeSchema, DataTypePermission, type DataTypeGroupRoles } from "@/schema/DataTypeSchema.ts";
import { DataTypeKind, YesNoScript, type YesNoScriptType, type ConfigString, type ConfigBoolean, type ConfigLookup, type ConfigConsumable, type ConfigProduct, CalculatedCalculationMode, DefaultValueCalculationMode, type ConfigCalculated } from "@/types/DataTypeType.ts";
import { BusinessDomains } from "@/schema/BusinessDomainSchema.ts";
import {Group, User, UserGroup} from "@/schema/UserSchema.ts";
import { Products, ProductsValues } from "@/schema/ProductSchema.ts";
import { markValuesAsUsed, markValuesAsUnused, ConsumableRepo, getValue as getConsumableValueRows } from "@/repo/ConsumableRepo.ts";
import { LookupRepo, getValue as getLookupValueRows } from "@/repo/LookupRepo.ts";
import { getPreviousApprovals, getDependants } from "@/repo/ProductTypeRepo.ts";
import type { LookupsValuesSelectType } from "@/types/LookupsType.ts";
import type { ConsumablesValuesSelectType } from "@/types/ConsumableType.ts";
import {
    message_CreateProductRequest,
    message_UpdateProductRequestValue,
    message_ApproveProductRequestValue,
    message_CancelProductRequest,
    message_ImportingProductRequest,
    message_MandatoryAndRequestorCanEditUpdated,
    type ProductRequestListRow,
    type ProductRequestDetail,
    type ProductRequestValueEnriched,
} from "@/types/ProductRequestType.ts";
import type { ProductRequestsSelectType as ProductRequestType } from "@/types/_ProductRequestType.ts";
import type { ProductRequestsValuesInsertType as ProductRequestsValuesInsert } from "@/types/_ProductRequestType.ts";
import type { ProductRequestsValuesSelectType as ProductRequestsValuesType } from "@/types/_ProductRequestType.ts";
import type { UserSelectType as UserType } from "@/types/_UserType.ts";
import type { UUIDType } from "@/types/helpers.ts";
import { PermissionDeniedError, FilterScriptError } from "@/types/errors.ts";
import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import PubSub from "@/services/PubSub.ts";
import { getLoggedinUserObject } from "@/services/Auth.ts";
import { createProductExportRows } from "@/repo/ProductExportRepo.ts";
import * as ProductRepo from "@/repo/ProductRepo.ts";
import * as ScriptEngine from "@/services/ScriptEngine.ts";
import { ScriptCategory, type ScriptExecutionContext } from "@/types/ScriptEngineType.ts";
import { devMode } from "@/devmode.ts";

// ---------------------------------------------------------------------------
// Product Number Generation
// ---------------------------------------------------------------------------

/**
 * Atomically generates a product number of pattern `5XXXXXX-01`.
 *
 * Uses `SELECT ... FOR UPDATE` on the `product_number_state` sentinel row to
 * prevent race conditions. Must be called within a transaction.
 */
export async function generateProductNumber(tx: DBClient): Promise<string> {
    // Ensure the sentinel row exists (idempotent — only inserts on first call)
    await tx
        .insert(ProductNumberState)
        .values({ locked: false })
        .onConflictDoNothing();

    // Lock the sentinel row to prevent concurrent number generation
    const locked = await tx
        .select()
        .from(ProductNumberState)
        .where(eq(ProductNumberState.locked, false))
        .for("update")
        .limit(1);

    if (locked.length === 0) {
        throw new Error("Could not acquire lock on product_number_state");
    }

    // Find the current max product number matching 5______-01 across both
    // products and product_requests tables
    const pattern = "5______-01";

    const existingProducts = await tx
        .select({ productNumber: Products.productNumber })
        .from(Products)
        .where(ilike(Products.productNumber, pattern));

    const existingRequests = await tx
        .select({ productNumber: ProductRequests.productNumber })
        .from(ProductRequests)
        .where(ilike(ProductRequests.productNumber, pattern));

    const allNumbers = [
        ...existingProducts.map((r) => r.productNumber),
        ...existingRequests.map((r) => r.productNumber),
    ];

    // Extract the six-digit numeric part and find max
    let maxNum = 0;
    for (const pn of allNumbers) {
        const match = pn.match(/^5(\d{6})-01$/);
        if (match) {
            const num = parseInt(match[1]!, 10);
            if (num > maxNum) maxNum = num;
        }
    }

    // Increment and zero-pad to 6 digits
    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(6, "0");
    return `5${padded}-01`;
}

// ---------------------------------------------------------------------------
// Permission Helpers
// ---------------------------------------------------------------------------

/**
 * Returns effective permissions (roles + showByDefault) for a user on a
 * specific data type within a product type context.
 *
 * Checks ProductTypesDataTypePermission first, falls back to DataTypePermission.
 */
async function getEffectivePermissions(
    db: DBClient,
    user: UserType,
    productTypeIdentifier: string,
    dataTypeIdentifier: string,
): Promise<{ roles: DataTypeGroupRoles[]; showByDefault: boolean }> {
    // Get user's group memberships
    const userGroups = await db
        .select({ groupIdentifier: UserGroup.groupIdentifier })
        .from(UserGroup)
        .where(eq(UserGroup.userIdentifier, user.identifier));

    const groupIds = userGroups.map((g) => g.groupIdentifier);
    if (groupIds.length === 0) {
        return { roles: [], showByDefault: false };
    }

    // Find the ProductTypesDataTypes assignment first
    const assignment = await db
        .select({ identifier: ProductTypesDataTypes.identifier })
        .from(ProductTypesDataTypes)
        .where(and(
            eq(ProductTypesDataTypes.productType, productTypeIdentifier),
            eq(ProductTypesDataTypes.dataType, dataTypeIdentifier),
        ))
        .limit(1);

    // Query PT-level permissions
    let ptPerms: { role: string; showByDefault: boolean }[] = [];
    if (assignment.length > 0) {
        ptPerms = await db
            .select({
                role: ProductTypesDataTypePermission.role,
                showByDefault: ProductTypesDataTypePermission.showByDefault,
            })
            .from(ProductTypesDataTypePermission)
            .where(and(
                eq(ProductTypesDataTypePermission.productTypeDataTypeIdentifier, assignment[0]!.identifier),
                inArray(ProductTypesDataTypePermission.groupIdentifier, groupIds),
            ));
    }

    // Query DT-level permissions
    const dtPerms = await db
        .select({
            role: DataTypePermission.role,
            showByDefault: DataTypePermission.showByDefault,
        })
        .from(DataTypePermission)
        .where(and(
            eq(DataTypePermission.dataTypeIdentifier, dataTypeIdentifier),
            inArray(DataTypePermission.groupIdentifier, groupIds),
        ));

    // Per-role merge: PT roles overlay DT roles
    const ptRoles = new Set(ptPerms.map((p) => p.role as DataTypeGroupRoles));
    const dtRolesNotInPt = dtPerms.map((p) => p.role as DataTypeGroupRoles).filter((r) => !ptRoles.has(r));
    const roles = [...ptRoles, ...dtRolesNotInPt];

    // showByDefault follows the viewer role's per-rule merge
    const ptViewerRows = ptPerms.filter((p) => p.role === "viewer");
    const dtViewerRows = dtPerms.filter((p) => p.role === "viewer");
    const showByDefault = ptViewerRows.length > 0
        ? ptViewerRows.some((p) => p.showByDefault)
        : dtViewerRows.some((p) => p.showByDefault);

    return { roles, showByDefault };
}

// ---------------------------------------------------------------------------
// Batched Permission Lookup (eliminates N+1 queries in list/detail views)
// ---------------------------------------------------------------------------

/** O(1) permission lookup function returned by {@link buildPermissionLookup}. */
export type PermissionLookup = (productTypeIdentifier: string, dataTypeIdentifier: string) => { roles: DataTypeGroupRoles[]; showByDefault: boolean };

/**
 * Builds an in-memory permission index for all (productType, dataType) pairs
 * across the given product types so that subsequent permission checks are O(1)
 * and require zero additional database queries.
 *
 * Uses at most 4 queries regardless of how many data types are involved.
 */
export async function buildPermissionLookup(
    db: DBClient,
    user: UserType,
    productTypeIdentifiers: string[],
): Promise<PermissionLookup> {
    // 1. Load user's group memberships (shared across all lookups)
    const userGroups = await db
        .select({ groupIdentifier: UserGroup.groupIdentifier })
        .from(UserGroup)
        .where(eq(UserGroup.userIdentifier, user.identifier));

    const groupIds = userGroups.map((g) => g.groupIdentifier);
    if (groupIds.length === 0) {
        return () => ({ roles: [], showByDefault: false });
    }

    // 2. Load all ProductTypesDataTypes assignments for the given product types
    const uniqueProductTypes = [...new Set(productTypeIdentifiers)];
    const assignments = await db
        .select({
            identifier: ProductTypesDataTypes.identifier,
            productType: ProductTypesDataTypes.productType,
            dataType: ProductTypesDataTypes.dataType,
        })
        .from(ProductTypesDataTypes)
        .where(inArray(ProductTypesDataTypes.productType, uniqueProductTypes));

    // Map `${productType}:${dataType}` → assignment identifier
    const assignmentMap = new Map<string, string>();
    for (const a of assignments) {
        assignmentMap.set(`${a.productType}:${a.dataType}`, a.identifier!);
    }

    // 3. Load all ProductTypesDataTypePermission for user's groups + those assignments
    const assignmentIds = [...new Set(assignments.map((a) => a.identifier!))];
    const ptPermRows = assignmentIds.length > 0
        ? await db
            .select({
                assignmentId: ProductTypesDataTypePermission.productTypeDataTypeIdentifier,
                role: ProductTypesDataTypePermission.role,
                showByDefault: ProductTypesDataTypePermission.showByDefault,
            })
            .from(ProductTypesDataTypePermission)
            .where(and(
                inArray(ProductTypesDataTypePermission.productTypeDataTypeIdentifier, assignmentIds),
                inArray(ProductTypesDataTypePermission.groupIdentifier, groupIds),
            ))
        : [];

    // Index product-type-level permissions by assignment identifier
    const ptPermIndex = new Map<string, { roles: DataTypeGroupRoles[]; showByDefault: boolean }>();
    for (const p of ptPermRows) {
        let entry = ptPermIndex.get(p.assignmentId);
        if (!entry) {
            entry = { roles: [], showByDefault: false };
            ptPermIndex.set(p.assignmentId, entry);
        }
        if (!entry.roles.includes(p.role as DataTypeGroupRoles)) {
            entry.roles.push(p.role as DataTypeGroupRoles);
        }
        if (p.showByDefault && p.role === "viewer") entry.showByDefault = true;
    }

    // 4. Load all DataTypePermission for user's groups (fallback)
    const dtPermRows = await db
        .select({
            dataTypeIdentifier: DataTypePermission.dataTypeIdentifier,
            role: DataTypePermission.role,
            showByDefault: DataTypePermission.showByDefault,
        })
        .from(DataTypePermission)
        .where(inArray(DataTypePermission.groupIdentifier, groupIds));

    // Index data-type-level permissions by data type identifier
    const dtPermIndex = new Map<string, { roles: DataTypeGroupRoles[]; showByDefault: boolean }>();
    for (const p of dtPermRows) {
        let entry = dtPermIndex.get(p.dataTypeIdentifier);
        if (!entry) {
            entry = { roles: [], showByDefault: false };
            dtPermIndex.set(p.dataTypeIdentifier, entry);
        }
        if (!entry.roles.includes(p.role as DataTypeGroupRoles)) {
            entry.roles.push(p.role as DataTypeGroupRoles);
        }
        if (p.showByDefault && p.role === "viewer") entry.showByDefault = true;
    }

    // Return O(1) lookup closure
    return (productTypeIdentifier: string, dataTypeIdentifier: string) => {
        const key = `${productTypeIdentifier}:${dataTypeIdentifier}`;
        const assignmentId = assignmentMap.get(key);
        const ptEntry = assignmentId ? ptPermIndex.get(assignmentId) : undefined;
        const dtEntry = dtPermIndex.get(dataTypeIdentifier);

        if (!ptEntry && !dtEntry) {
            return { roles: [], showByDefault: false };
        }
        if (!ptEntry) return dtEntry!;
        if (!dtEntry) return ptEntry;

        // Per-role merge: PT roles + DT roles that PT doesn't have
        const ptRoleSet = new Set(ptEntry.roles);
        const mergedRoles = [
            ...ptEntry.roles,
            ...dtEntry.roles.filter((r) => !ptRoleSet.has(r)),
        ];

        // showByDefault: PT viewer if PT has viewer, else DT viewer, else false
        const showByDefault = ptRoleSet.has("viewer" as DataTypeGroupRoles)
            ? ptEntry.showByDefault
            : dtEntry.showByDefault;

        return { roles: mergedRoles, showByDefault };
    };
}

/**
 * Checks if the user has `role=cancel` permission on a given product type.
 * Also checks `requestorCanCancel` when the user is the request creator.
 */
async function userCanCancel(
    db: DBClient,
    user: UserType,
    productTypeIdentifier: string,
    requestCreatedBy?: string,
): Promise<boolean> {
    const userGroups = await db
        .select({ groupIdentifier: UserGroup.groupIdentifier })
        .from(UserGroup)
        .where(eq(UserGroup.userIdentifier, user.identifier));

    const groupIds = userGroups.map((g) => g.groupIdentifier);

    // Check group-based cancel permission
    if (groupIds.length > 0) {
        const perms = await db
            .select({ role: ProductTypesPermission.role })
            .from(ProductTypesPermission)
            .where(and(
                eq(ProductTypesPermission.productTypeIdentifier, productTypeIdentifier),
                inArray(ProductTypesPermission.groupIdentifier, groupIds),
            ));

        if (perms.some((p) => p.role === "cancel")) return true;
    }

    // Check requestorCanCancel: if the current user is the request creator
    // and the product type allows requestors to cancel
    if (requestCreatedBy && requestCreatedBy === user.identifier) {
        const pt = await db
            .select({ requestorCanCancel: ProductTypes.requestorCanCancel })
            .from(ProductTypes)
            .where(eq(ProductTypes.identifier, productTypeIdentifier))
            .limit(1);
        if (pt[0]?.requestorCanCancel) return true;
    }

    return false;
}

// ---------------------------------------------------------------------------
// Default Value Calculation
// ---------------------------------------------------------------------------

/**
 * Resolves a config value: ProductTypesDataTypes config takes precedence over
 * DataType config. Individual keys from ptConfig override dtConfig.
 */
function resolveConfig(
    dtConfig: Record<string, unknown> | null,
    ptConfig: Record<string, unknown> | null,
): Record<string, unknown> {
    return { ...(dtConfig ?? {}), ...(ptConfig ?? {}) };
}

/**
 * Returns `true` when the value represents an empty / no-value state for the
 * given data type kind.  Tri-state booleans (kind "boolean" with
 * `config.permitEmpty === true`) treat `null` as a valid value and return
 * `false`.  The function is used by the approval gates,
 * `computeActionableSummary`, and notification digests.
 */
export function isEmptyValue(value: unknown, kind: string, config?: Record<string, unknown> | null): boolean {
    if (value === null) {
        if (kind === "boolean" && (config as { permitEmpty?: boolean } | null | undefined)?.permitEmpty) {
            return false;
        }
        return true;
    }
    if (value === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
}

/**
 * Converts a YesNoScript value (+ optional script) to a boolean or null.
 * - null          → null (inherit from parent)
 * - "Yes"          → true
 * - "No"           → false
 * - "Script"       → evaluate the script, cast to boolean; null if script is missing
 *
 * When a script is present it executes via the ScriptEngine with the supplied
 * context (scoped to `dataTypeIdentifier` when provided).
 */
async function resolveYesNoScript(
    db: DBClient,
    value: string | null,
    script: string | null,
    ctx: ScriptExecutionContext | null,
    category: ScriptCategory,
    dataTypeIdentifier?: string,
): Promise<boolean | null> {
    if (value === null) return null;
    if (value === YesNoScript.Yes) return true;
    if (value === YesNoScript.No) return false;
    if (value === YesNoScript.Script) {
        if (script && ctx) {
            const scoped = dataTypeIdentifier ? ScriptEngine.forDataType(ctx, dataTypeIdentifier) : ctx;
            const result = await ScriptEngine.execute(db, script, scoped, category);
            return Boolean(result);
        }
        return null;
    }
    return null;
}

/**
 * Resolves a mandatory flag: ProductTypesDataTypes.mandatory > DataType.mandatory > false.
 * Expects raw YesNoScriptType column values and their associated script columns.
 */
async function resolveMandatory(
    db: DBClient,
    dtMandatory: string,
    dtMandatoryScript: string | null,
    ptMandatory: string | null,
    ptMandatoryScript: string | null,
    ctx: ScriptExecutionContext | null,
    dataTypeIdentifier?: string,
): Promise<boolean> {
    const dtBool = await resolveYesNoScript(db, dtMandatory, dtMandatoryScript, ctx, ScriptCategory.MandatoryScript, dataTypeIdentifier);
    const ptBool = await resolveYesNoScript(db, ptMandatory, ptMandatoryScript, ctx, ScriptCategory.MandatoryScript, dataTypeIdentifier);
    return ptBool ?? dtBool ?? false;
}

/**
 * Resolves requestorCanEdit: ProductTypesDataTypes.requestorCanEdit > DataType.requestorCanEdit > true.
 * Expects raw YesNoScriptType column values and their associated script columns.
 */
async function resolveRequestorCanEdit(
    db: DBClient,
    dtRequestorCanEdit: string,
    dtRequestorCanEditScript: string | null,
    ptRequestorCanEdit: string | null,
    ptRequestorCanEditScript: string | null,
    ctx: ScriptExecutionContext | null,
    dataTypeIdentifier?: string,
): Promise<boolean> {
    const dtBool = await resolveYesNoScript(db, dtRequestorCanEdit, dtRequestorCanEditScript, ctx, ScriptCategory.RequestorCanEditScript, dataTypeIdentifier);
    const ptBool = await resolveYesNoScript(db, ptRequestorCanEdit, ptRequestorCanEditScript, ctx, ScriptCategory.RequestorCanEditScript, dataTypeIdentifier);
    return ptBool ?? dtBool ?? true;
}

/**
 * Extracts consumable value identifiers from a product request value.
 * Handles both single (string) and multi-select (string[]).
 */
function parseConsumableIdentifiers(value: unknown): string[] {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) {
        return (value as Array<unknown>).filter((v): v is string => typeof v === "string");
    }
    if (typeof value === "string") return [value];
    return [];
}

// ---------------------------------------------------------------------------
// Product Request CRUD
// ---------------------------------------------------------------------------

/**
 * Creates a new product request with initial values for all assigned data types.
 *
 * @param tx Database transaction client.
 * @param claims Token claims for the current user.
 * @param input Creation parameters.
 * @returns The created product request.
 */
export async function createProductRequest(
    tx: DBClient,
    claims: Record<string, any>,
    input: {
        productTypeIdentifier: string;
        productNumber?: string;
        productToUpdate?: string;
        sourceProductNumber?: string;
    },
): Promise<ProductRequestType> {
    const user = (await getLoggedinUserObject(tx, claims));
    if (!user) throw new Error("User not found");

    // Determine product number
    let productNumber = input.productNumber ?? input.productToUpdate;
    if (!productNumber) {
        productNumber = await generateProductNumber(tx);
    }

    const isUpdateRequest = !!input.productToUpdate;

    // Check for existing active (open/importing) request with same product number
    const activeRequest = await tx
        .select({ identifier: ProductRequests.identifier, status: ProductRequests.status })
        .from(ProductRequests)
        .where(and(
            eq(ProductRequests.productNumber, productNumber),
            inArray(ProductRequests.status, [ProductRequestStatus.open, ProductRequestStatus.importing]),
        ))
        .limit(1);

    if (activeRequest.length > 0) {
        throw new Error(
            `An active (${activeRequest[0]!.status}) product request already exists for product number "${productNumber}". ` +
            `Navigate to /product-requests/${activeRequest[0]!.identifier} instead.`,
        );
    }

    // Check for existing active request targeting the same productToUpdate
    if (input.productToUpdate) {
        const activeUpdateRequest = await tx
            .select({ identifier: ProductRequests.identifier, status: ProductRequests.status })
            .from(ProductRequests)
            .where(and(
                eq(ProductRequests.productToUpdate, input.productToUpdate),
                inArray(ProductRequests.status, [ProductRequestStatus.open, ProductRequestStatus.importing]),
            ))
            .limit(1);

        if (activeUpdateRequest.length > 0) {
            throw new Error(
                `An active (${activeUpdateRequest[0]!.status}) update request already targets product "${input.productToUpdate}". ` +
                `Navigate to /product-requests/${activeUpdateRequest[0]!.identifier} instead.`,
            );
        }
    }

    // Check if a product with this number already exists (skip for update requests)
    if (!isUpdateRequest) {
        const existingProduct = await tx
            .select({ productNumber: Products.productNumber })
            .from(Products)
            .where(eq(Products.productNumber, productNumber))
            .limit(1);

        if (existingProduct.length > 0) {
            // Throw a specific error that the caller can catch to redirect
            const err = new Error(`Product number ${productNumber} already exists`);
            (err as any).conflictProductNumber = productNumber;
            throw err;
        }
    }

    // Load the product type
    const pt = await tx
        .select({ name: ProductTypes.name, requestorCanCancel: ProductTypes.requestorCanCancel })
        .from(ProductTypes)
        .where(eq(ProductTypes.identifier, input.productTypeIdentifier))
        .limit(1);

    if (pt.length === 0) {
        throw new Error(`Product type not found: ${input.productTypeIdentifier}`);
    }

    // Create the product request
    const [created] = await tx
        .insert(ProductRequests)
        .values({
            productType: input.productTypeIdentifier,
            productNumber,
            productToUpdate: input.productToUpdate ?? null,
            status: ProductRequestStatus.open,
            createdBy: user.identifier,
            updatedBy: user.identifier,
        })
        .returning();

    if (!created) throw new Error("Failed to create product request");

    // Load all enabled data types assigned to the product type
    const dataTypeAssignments = await tx
        .select({
            assignmentIdentifier: ProductTypesDataTypes.identifier,
            dataTypeIdentifier: ProductTypesDataTypes.dataType,
            mandatory: ProductTypesDataTypes.mandatory,
            requestorCanEdit: ProductTypesDataTypes.requestorCanEdit,
            editableOnUpdate: ProductTypesDataTypes.editableOnUpdate,
            config: ProductTypesDataTypes.config,
            ownerOverride: ProductTypesDataTypes.owner,
            dataTypeName: DataTypeSchema.name,
            dataTypeKind: DataTypeSchema.kind,
            dataTypeConfig: DataTypeSchema.config,
            dataTypeMandatory: DataTypeSchema.mandatory,
            dataTypeRequestorCanEdit: DataTypeSchema.requestorCanEdit,
            dataTypeOwner: DataTypeSchema.owner,
            dataTypeDisabled: DataTypeSchema.disabled,
        })
        .from(ProductTypesDataTypes)
        .innerJoin(DataTypeSchema, eq(ProductTypesDataTypes.dataType, DataTypeSchema.identifier))
        .where(and(
            eq(ProductTypesDataTypes.productType, input.productTypeIdentifier),
            eq(DataTypeSchema.disabled, false),
        ));

    // Load source product values if this is a copy request
    let sourceValues: Map<string, unknown> = new Map();
    if (input.sourceProductNumber) {
        const sourceRows = await tx
            .select({
                dataTypeIdentifier: ProductsValues.dataTypeIdentifier,
                value: ProductsValues.value,
            })
            .from(ProductsValues)
            .where(eq(ProductsValues.productNumber, input.sourceProductNumber));

        for (const row of sourceRows) {
            sourceValues.set(row.dataTypeIdentifier, row.value);
        }
    }

    // Build a script context once for all calculation/defaultProvider scripts
    // evaluated during creation. The creating user is the principal.
    const createCtx = ScriptEngine.buildContext(tx, {
        cause: "product_request_create",
        productRequestIdentifier: created.identifier!,
        principal: { userId: user.identifier ?? null, apiKeyIdentifier: null, isApiKey: false },
    });

    // Create values for each data type
    for (const assignment of dataTypeAssignments) {
        const resolvedConfig = resolveConfig(
            assignment.dataTypeConfig as Record<string, unknown> | null,
            assignment.config as Record<string, unknown> | null,
        );

        const isCalculated = assignment.dataTypeKind === DataTypeKind.Calculated;
        const isUpdateRequest = !!input.productToUpdate;

        let value: unknown = null;
        let defaultValue: unknown = null;
        let approvedBy: string | null = null;
        let approvedAt: string | null = null;

        if (isCalculated && resolvedConfig.script) {
            const mode = (resolvedConfig.mode as string | undefined) ?? CalculatedCalculationMode.OnExport;
            if (mode !== CalculatedCalculationMode.OnExport) {
                // Execute non-on_export calculation scripts at creation time.
                // on_export scripts are deferred until status → importing.
                value = await ScriptEngine.execute(
                    tx,
                    resolvedConfig.script as string,
                    ScriptEngine.forDataType(createCtx, assignment.dataTypeIdentifier),
                    ScriptCategory.Calculation,
                );
            }
        } else if (input.sourceProductNumber) {
            // Copy from source product
            const sourceVal = sourceValues.get(assignment.dataTypeIdentifier);
            if (sourceVal !== undefined) {
                value = sourceVal;
            } else if (resolvedConfig.defaultProvider) {
                value = null;
                defaultValue = await ScriptEngine.execute(
                    tx,
                    resolvedConfig.defaultProvider as string,
                    ScriptEngine.forDataType(createCtx, assignment.dataTypeIdentifier),
                    ScriptCategory.DefaultProvider,
                );
            }
        } else if (isUpdateRequest && !assignment.editableOnUpdate) {
            // For update requests with editableOnUpdate=false: use existing product value
            const sourceVal = sourceValues.get(assignment.dataTypeIdentifier);
            if (sourceVal !== undefined) {
                value = sourceVal;
            }
            // Auto-approve
            approvedBy = user.identifier;
            approvedAt = new Date().toISOString();
        } else {
            // New or update request (editable)
            value = null;
            if (resolvedConfig.defaultProvider) {
                defaultValue = await ScriptEngine.execute(
                    tx,
                    resolvedConfig.defaultProvider as string,
                    ScriptEngine.forDataType(createCtx, assignment.dataTypeIdentifier),
                    ScriptCategory.DefaultProvider,
                );
            }
        }

        await tx
            .insert(ProductRequestsValues)
            .values({
                dataType: assignment.dataTypeIdentifier,
                productRequest: created.identifier,
                value: value as any,
                defaultValue: defaultValue as any ?? null,
                approvedBy,
                approvedAt,
                createdBy: user.identifier,
                updatedBy: user.identifier,
            } as ProductRequestsValuesInsert);
    }

    PubSub.publish(message_CreateProductRequest, created);
    return created as ProductRequestType;
}

// ---------------------------------------------------------------------------
// Lookup / Consumable Value Resolution (product-request scoped)
// ---------------------------------------------------------------------------

/**
 * Executes a data type's `filter` script against the candidate option rows and
 * returns the filtered subset. Fail-hard: a script error/timeout or a
 * non-array return propagates as an exception (the API layer maps it to 500).
 */
async function applyFilterScript<T>(
    db: DBClient,
    filterScript: string,
    user: UserType,
    requestId: string,
    dataTypeIdentifier: string,
    options: T[],
): Promise<T[]> {
    const filterCtx = ScriptEngine.buildContext(db, {
        cause: "product_request_update",
        productRequestIdentifier: requestId,
        dataTypeIdentifier,
        options: options as unknown[],
        principal: { userId: user.identifier ?? null, apiKeyIdentifier: null, isApiKey: false },
    });
    let result: unknown;
    try {
        result = await ScriptEngine.execute(db, filterScript, filterCtx, ScriptCategory.Filter, { throwOnError: true });
    } catch (e) {
        throw new FilterScriptError(e instanceof Error ? e.message : String(e));
    }
    if (!Array.isArray(result)) {
        throw new FilterScriptError("Filter script did not return an array");
    }
    return result as T[];
}

/**
 * Returns all lookup values for the lookup backing a lookup-kind data type,
 * scoped to a product request.
 *
 * Access is governed by the same data-type-level Viewer/Writer/Approver role
 * model used by {@link getProductRequest} — NOT by the Configuration-area
 * FP_VIEW_LOOKUPS permission. This lets any user who can see or edit the data
 * type's value on the product request resolve display names and populate the
 * selection dropdown, without requiring master-data administration rights.
 */
export async function getProductRequestLookupValues(
    db: DBClient,
    claims: Record<string, any>,
    requestId: string,
    dataTypeIdentifier: string,
): Promise<LookupsValuesSelectType[]> {
    const user = await getLoggedinUserObject(db, claims);
    if (!user) throw new Error("User not found");

    const requestRows = await db
        .select({ productType: ProductRequests.productType })
        .from(ProductRequests)
        .where(eq(ProductRequests.identifier, requestId))
        .limit(1);
    if (requestRows.length === 0) throw new Error("Product request not found");

    const perms = await getEffectivePermissions(db, user, requestRows[0]!.productType!, dataTypeIdentifier);
    if (perms.roles.length === 0) {
        throw new PermissionDeniedError("Permission denied: you cannot view this data type");
    }

    const dataTypeRows = await db
        .select({ kind: DataTypeSchema.kind, config: DataTypeSchema.config })
        .from(DataTypeSchema)
        .where(eq(DataTypeSchema.identifier, dataTypeIdentifier))
        .limit(1);
    if (dataTypeRows.length === 0) throw new Error("Data type not found");
    if (dataTypeRows[0]!.kind !== DataTypeKind.Lookup) throw new Error("Data type is not of kind lookup");

    const config = dataTypeRows[0]!.config as ConfigLookup;
    if (!config?.source) throw new Error("Data type has no lookup source configured");

    const lookup = await LookupRepo.getByIdentifier(db, config.source);
    if (!lookup) throw new Error("Lookup not found");

    const values = await getLookupValueRows(db, lookup, true);
    if (config.filter) {
        return applyFilterScript(db, config.filter as unknown as string, user, requestId, dataTypeIdentifier, values);
    }
    return values;
}

/**
 * Returns all consumable values for the consumable backing a consumable-kind
 * data type, scoped to a product request.
 *
 * Access is governed by the same data-type-level Viewer/Writer/Approver role
 * model used by {@link getProductRequest} — NOT by the Configuration-area
 * FP_VIEW_CONSUMABLES permission.
 */
export async function getProductRequestConsumableValues(
    db: DBClient,
    claims: Record<string, any>,
    requestId: string,
    dataTypeIdentifier: string,
): Promise<ConsumablesValuesSelectType[]> {
    const user = await getLoggedinUserObject(db, claims);
    if (!user) throw new Error("User not found");

    const requestRows = await db
        .select({ productType: ProductRequests.productType })
        .from(ProductRequests)
        .where(eq(ProductRequests.identifier, requestId))
        .limit(1);
    if (requestRows.length === 0) throw new Error("Product request not found");

    const perms = await getEffectivePermissions(db, user, requestRows[0]!.productType!, dataTypeIdentifier);
    if (perms.roles.length === 0) {
        throw new PermissionDeniedError("Permission denied: you cannot view this data type");
    }

    const dataTypeRows = await db
        .select({ kind: DataTypeSchema.kind, config: DataTypeSchema.config })
        .from(DataTypeSchema)
        .where(eq(DataTypeSchema.identifier, dataTypeIdentifier))
        .limit(1);
    if (dataTypeRows.length === 0) throw new Error("Data type not found");
    if (dataTypeRows[0]!.kind !== DataTypeKind.Consumable) throw new Error("Data type is not of kind consumable");

    const config = dataTypeRows[0]!.config as ConfigConsumable;
    if (!config?.source) throw new Error("Data type has no consumable source configured");

    const consumable = await ConsumableRepo.getByIdentifier(db, config.source);
    if (!consumable) throw new Error("Consumable not found");

    // includeDisabled=true, unusedOnly=false — return ALL values (including
    // used ones) so a currently-assigned value always resolves to its name
    // and remains selectable/unselectable in the UI.
    const values = await getConsumableValueRows(db, consumable, true, false);
    if (config.filter) {
        return applyFilterScript(db, config.filter as unknown as string, user, requestId, dataTypeIdentifier, values);
    }
    return values;
}

/**
 * Returns the candidate products for a product-kind data type, scoped to a
 * product request, with the data type's `filter` script applied.
 *
 * Access is governed by the same data-type-level Viewer/Writer/Approver role
 * model used by {@link getProductRequest}. Mirrors the lookup/consumable
 * endpoints so all three dropdown kinds behave consistently.
 *
 * Candidates are all non-disabled products, plus any currently-selected
 * products (so a selection always resolves to a label even if it has since
 * been disabled or filtered out).
 */
export async function getProductRequestProductValues(
    db: DBClient,
    claims: Record<string, any>,
    requestId: string,
    dataTypeIdentifier: string,
): Promise<{ productNumber: string; productTypeName: string | null; disabled: boolean }[]> {
    const user = await getLoggedinUserObject(db, claims);
    if (!user) throw new Error("User not found");

    const requestRows = await db
        .select({ productType: ProductRequests.productType, productToUpdate: ProductRequests.productToUpdate })
        .from(ProductRequests)
        .where(eq(ProductRequests.identifier, requestId))
        .limit(1);
    if (requestRows.length === 0) throw new Error("Product request not found");

    const perms = await getEffectivePermissions(db, user, requestRows[0]!.productType!, dataTypeIdentifier);
    if (perms.roles.length === 0) {
        throw new PermissionDeniedError("Permission denied: you cannot view this data type");
    }

    const dataTypeRows = await db
        .select({ kind: DataTypeSchema.kind, config: DataTypeSchema.config })
        .from(DataTypeSchema)
        .where(eq(DataTypeSchema.identifier, dataTypeIdentifier))
        .limit(1);
    if (dataTypeRows.length === 0) throw new Error("Data type not found");
    if (dataTypeRows[0]!.kind !== DataTypeKind.Product) throw new Error("Data type is not of kind product");

    const config = dataTypeRows[0]!.config as ConfigProduct;

    // Currently-selected product numbers for this data type on this request,
    // so they remain resolvable even if disabled or filtered out.
    const currentRows = await db
        .select({ value: ProductRequestsValues.value })
        .from(ProductRequestsValues)
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            eq(ProductRequestsValues.dataType, dataTypeIdentifier),
        ))
        .limit(1);
    const currentValue: unknown = currentRows[0]?.value ?? null;
    const selectedNumbers = new Set<string>(
        (Array.isArray(currentValue) ? currentValue : currentValue != null ? [currentValue] : [])
            .filter((v): v is string => v != null)
            .map((v) => String(v)),
    );

    // Candidates: all non-disabled products (a large page to cover the list),
    // excluding the productToUpdate target unless it is currently selected.
    const productToUpdate = requestRows[0]!.productToUpdate ?? null;
    const allProducts = await ProductRepo.getProducts(db, true, undefined, 0, 1000);
    const candidates = allProducts
        .filter((p) => !p.disabled && (p.productNumber !== productToUpdate || selectedNumbers.has(p.productNumber)))
        .map((p) => ({
            productNumber: p.productNumber,
            productTypeName: p.productTypeName ?? null,
            disabled: p.disabled ?? false,
        }));

    if (config?.filter) {
        return applyFilterScript(db, config.filter as unknown as string, user, requestId, dataTypeIdentifier, candidates);
    }
    return candidates;
}

/**
 * Returns a single product request enriched with values and metadata.
 * Values are filtered by the current user's view permissions.
 */
export async function getProductRequest(
    db: DBClient,
    claims: Record<string, any>,
    requestId: string,
): Promise<ProductRequestDetail | null> {
    const user = await getLoggedinUserObject(db, claims);
    if (!user) return null;

    const rows = await db
        .select({
            identifier: ProductRequests.identifier,
            createdAt: ProductRequests.createdAt,
            updatedAt: ProductRequests.updatedAt,
            createdBy: ProductRequests.createdBy,
            updatedBy: ProductRequests.updatedBy,
            productType: ProductRequests.productType,
            productNumber: ProductRequests.productNumber,
            productToUpdate: ProductRequests.productToUpdate,
            status: ProductRequests.status,
            productTypeName: ProductTypes.name,
            createdByName: sql<string>`${User.firstName} || ' ' || ${User.lastName}`,
        })
        .from(ProductRequests)
        .innerJoin(ProductTypes, eq(ProductRequests.productType, ProductTypes.identifier))
        .innerJoin(User, eq(ProductRequests.createdBy, User.identifier))
        .where(eq(ProductRequests.identifier, requestId))
        .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0]!;

    // Load all values for this request
    const valueRows = await db
        .select({
            identifier: ProductRequestsValues.identifier,
            createdAt: ProductRequestsValues.createdAt,
            updatedAt: ProductRequestsValues.updatedAt,
            createdBy: ProductRequestsValues.createdBy,
            updatedBy: ProductRequestsValues.updatedBy,
            dataType: ProductRequestsValues.dataType,
            productRequest: ProductRequestsValues.productRequest,
            approvedAt: ProductRequestsValues.approvedAt,
            approvedBy: ProductRequestsValues.approvedBy,
            defaultValue: ProductRequestsValues.defaultValue,
            value: ProductRequestsValues.value,
            // Data type fields
            dataTypeName: DataTypeSchema.name,
            dataTypeDescription: DataTypeSchema.description,
            dataTypeKind: DataTypeSchema.kind,
            dataTypeConfig: DataTypeSchema.config,
            dataTypeMandatory: DataTypeSchema.mandatory,
            dataTypeMandatoryScript: DataTypeSchema.mandatory_script,
            dataTypeRequestorCanEdit: DataTypeSchema.requestorCanEdit,
            dataTypeRequestorCanEditScript: DataTypeSchema.requestorCanEdit_script,
            dataTypeOwner: DataTypeSchema.owner,
            dataTypeDisabled: DataTypeSchema.disabled,
            // ProductTypesDataTypes fields
            ptMandatory: ProductTypesDataTypes.mandatory,
            ptMandatoryScript: ProductTypesDataTypes.mandatory_script,
            ptRequestorCanEdit: ProductTypesDataTypes.requestorCanEdit,
            ptRequestorCanEditScript: ProductTypesDataTypes.requestorCanEdit_script,
            ptEditableOnUpdate: ProductTypesDataTypes.editableOnUpdate,
            ptConfig: ProductTypesDataTypes.config,
            ptOwnerOverride: ProductTypesDataTypes.owner,
            // Approver name and email
            approverName: sql<string>`CASE WHEN ${ProductRequestsValues.approvedBy} IS NOT NULL THEN (SELECT u.first_name || ' ' || u.last_name FROM users u WHERE u.identifier = ${ProductRequestsValues.approvedBy}) ELSE NULL END`,
            approverEmail: sql<string>`CASE WHEN ${ProductRequestsValues.approvedBy} IS NOT NULL THEN (SELECT u.email FROM users u WHERE u.identifier = ${ProductRequestsValues.approvedBy}) ELSE NULL END`,
            // Last editor name and email
            editorName: sql<string>`CASE WHEN ${ProductRequestsValues.updatedBy} IS NOT NULL THEN (SELECT u2.first_name || ' ' || u2.last_name FROM users u2 WHERE u2.identifier = ${ProductRequestsValues.updatedBy}) ELSE NULL END`,
            editorEmail: sql<string>`CASE WHEN ${ProductRequestsValues.updatedBy} IS NOT NULL THEN (SELECT u2.email FROM users u2 WHERE u2.identifier = ${ProductRequestsValues.updatedBy}) ELSE NULL END`,
        })
        .from(ProductRequestsValues)
        .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
        .leftJoin(ProductTypesDataTypes, and(
            eq(ProductTypesDataTypes.productType, row.productType!),
            eq(ProductTypesDataTypes.dataType, ProductRequestsValues.dataType),
        ))
        .where(eq(ProductRequestsValues.productRequest, requestId));

    // Load previous-approval dependencies for this product type
    const prevApprovalRows = await db
        .select({
            dataType: ProductTypesDataTypePreviousApproval.dataType,
            dependsOnDataType: ProductTypesDataTypePreviousApproval.dependsOnDataType,
        })
        .from(ProductTypesDataTypePreviousApproval)
        .where(eq(ProductTypesDataTypePreviousApproval.productType, row.productType!));

    const depsMap = new Map<string, string[]>();
    for (const pa of prevApprovalRows) {
        const deps = depsMap.get(pa.dataType) ?? [];
        deps.push(pa.dependsOnDataType);
        depsMap.set(pa.dataType, deps);
    }

    const approvedSet = new Set<string>();
    for (const v of valueRows) {
        if (v.approvedBy != null && v.dataType) {
            approvedSet.add(v.dataType);
        }
    }

    // Build data type name map for dependency tooltips
    const dtNameMap = new Map<string, string>();
    for (const v of valueRows) {
        if (v.dataType && v.dataTypeName) {
            dtNameMap.set(v.dataType, v.dataTypeName);
        }
    }

    // Build batched permission lookup for this product type (1 query for
    // assignments + 2 queries for permissions instead of 2-3 per value)
    const getPerms = await buildPermissionLookup(db, user, [row.productType!]);

    // Batch-load all BusinessDomain names referenced by the values
    const ownerIdentifiers = [...new Set(
        valueRows.map((v) => v.ptOwnerOverride ?? v.dataTypeOwner).filter(Boolean),
    )] as string[];
    const bdMap = new Map<string, string>();
    if (ownerIdentifiers.length > 0) {
        const bdRows = await db
            .select({ identifier: BusinessDomains.identifier, name: BusinessDomains.name })
            .from(BusinessDomains)
            .where(inArray(BusinessDomains.identifier, ownerIdentifiers));
        for (const bd of bdRows) {
            bdMap.set(bd.identifier!, bd.name);
        }
    }

    // Build a script context once for all mandatory/requestorCanEdit script
    // evaluations in this view. The viewing user is the principal.
    const viewCtx = ScriptEngine.buildContext(db, {
        cause: "product_request_update",
        productRequestIdentifier: requestId,
        principal: { userId: user.identifier ?? null, apiKeyIdentifier: null, isApiKey: false },
    });

    // Enrich values with permissions and resolve precedence
    const enrichedValues: ProductRequestValueEnriched[] = [];
    for (const v of valueRows) {
        // Skip disabled data types
        if (v.dataTypeDisabled) continue;

        const perms = getPerms(row.productType!, v.dataType!);

        // Skip if user has no roles
        if (perms.roles.length === 0) continue;

        // Resolve fields with precedence
        const resolvedConfig = resolveConfig(
            v.dataTypeConfig as Record<string, unknown> | null,
            v.ptConfig as Record<string, unknown> | null,
        );

        // Resolve owner BusinessDomain name (from batch-loaded map)
        const ownerIdentifier = v.ptOwnerOverride ?? v.dataTypeOwner;
        const businessDomainName = ownerIdentifier ? (bdMap.get(ownerIdentifier) ?? null) : null;

        enrichedValues.push({
            identifier: v.identifier,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt,
            createdBy: v.createdBy,
            updatedBy: v.updatedBy,
            dataType: v.dataType,
            productRequest: v.productRequest,
            approvedAt: v.approvedAt,
            approvedBy: v.approvedBy,
            defaultValue: v.defaultValue,
            value: v.value,
            dataTypeName: v.dataTypeName,
            dataTypeDescription: v.dataTypeDescription,
            dataTypeKind: v.dataTypeKind,
            dataTypeConfig: resolvedConfig,
            mandatory: await resolveMandatory(db, v.dataTypeMandatory, v.dataTypeMandatoryScript, v.ptMandatory, v.ptMandatoryScript, viewCtx, v.dataType ?? undefined),
            requestorCanEdit: await resolveRequestorCanEdit(db, v.dataTypeRequestorCanEdit, v.dataTypeRequestorCanEditScript, v.ptRequestorCanEdit, v.ptRequestorCanEditScript, viewCtx, v.dataType ?? undefined),
            editableOnUpdate: v.ptEditableOnUpdate ?? true,
            businessDomainName,
            userRoles: perms.roles,
            showByDefault: perms.showByDefault,
            editorName: v.editorName,
            editorEmail: v.editorEmail,
            approverName: v.approverName,
            approverEmail: v.approverEmail,
            ...(() => {
                const deps = depsMap.get(v.dataType!) ?? [];
                const unmetDeps = deps.filter(d => !approvedSet.has(d));
                return {
                    previousApprovalDepsMet: unmetDeps.length === 0,
                    previousApprovalDepsWaiting: unmetDeps.map(d => dtNameMap.get(d) ?? d),
                };
            })(),
        } as ProductRequestValueEnriched);
    }

    return {
        identifier: row.identifier,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
        productType: row.productType,
        productNumber: row.productNumber,
        productToUpdate: row.productToUpdate,
        status: row.status,
        productTypeName: row.productTypeName!,
        createdByName: row.createdByName as string,
        values: enrichedValues,
    } as ProductRequestDetail;
}

/**
 * Returns a paginated, filtered list of product requests.
 * Computes actionableSummary per request for the current user.
 */
export async function listProductRequests(
    db: DBClient,
    claims: Record<string, any>,
    filters: {
        status?: string[];
        productTypeIdentifier?: string;
        productNumberContains?: string;
        actionFilter?: "provide_or_approve" | "provide_value" | "approve_value";
    },
    page: number = 0,
    pageSize: number = 20,
): Promise<{ requests: ProductRequestListRow[]; total: number; availablePageSizes: number[] }> {
    const user = await getLoggedinUserObject(db, claims);
    if (!user) {
        return { requests: [], total: 0, availablePageSizes: [10, 20, 50, 100] };
    }

    // Build WHERE conditions
    const conditions: SQL[] = [];
    if (filters.status && filters.status.length > 0) {
        conditions.push(inArray(ProductRequests.status, filters.status as typeof ProductRequestStatus[keyof typeof ProductRequestStatus][]));
    }
    if (filters.productTypeIdentifier) {
        conditions.push(eq(ProductRequests.productType, filters.productTypeIdentifier));
    }
    if (filters.productNumberContains) {
        conditions.push(ilike(ProductRequests.productNumber, `%${filters.productNumberContains}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count first
    const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ProductRequests)
        .where(where);

    let total = countResult[0]?.count ?? 0;

    // Fetch page of results
    const rows = await db
        .select({
            identifier: ProductRequests.identifier,
            createdAt: ProductRequests.createdAt,
            updatedAt: ProductRequests.updatedAt,
            createdBy: ProductRequests.createdBy,
            updatedBy: ProductRequests.updatedBy,
            productType: ProductRequests.productType,
            productNumber: ProductRequests.productNumber,
            productToUpdate: ProductRequests.productToUpdate,
            status: ProductRequests.status,
            productTypeName: ProductTypes.name,
            createdByName: sql<string>`${User.firstName} || ' ' || ${User.lastName}`,
        })
        .from(ProductRequests)
        .innerJoin(ProductTypes, eq(ProductRequests.productType, ProductTypes.identifier))
        .innerJoin(User, eq(ProductRequests.createdBy, User.identifier))
        .where(where)
        .orderBy(desc(ProductRequests.createdAt))
        .limit(pageSize)
        .offset(page * pageSize);

    // Build batched permission lookup for all product types in this page
    // (at most 4 queries instead of ~2000+ for a full page of results)
    const uniqueProductTypes = [...new Set(rows.map((r) => r.productType!))];
    const getPerms = await buildPermissionLookup(db, user, uniqueProductTypes);

    // Enrich with actionableSummary (uses batched permission lookup)
    const enrichedRows: ProductRequestListRow[] = [];
    for (const row of rows) {
        const summary = await computeActionableSummary(
            db, user, row.identifier, row.productType!, getPerms,
        );
        enrichedRows.push({
            identifier: row.identifier,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            createdBy: row.createdBy,
            updatedBy: row.updatedBy,
            productType: row.productType,
            productNumber: row.productNumber,
            productToUpdate: row.productToUpdate,
            status: row.status,
            productTypeName: row.productTypeName!,
            createdByName: row.createdByName as string,
            actionableSummary: summary,
        } as ProductRequestListRow);
    }

    // Apply actionFilter on the enriched results if set.
    // Action filters ("provide value", "approve value") only apply to "open"
    // requests — non-open statuses always pass through.
    let filteredRows = enrichedRows;
    if (filters.actionFilter) {
        filteredRows = enrichedRows.filter((r) => {
            if (r.status !== "open") return true;
            switch (filters.actionFilter) {
                case "provide_or_approve":
                    return r.actionableSummary.needsValue || r.actionableSummary.needsApproval;
                case "provide_value":
                    return r.actionableSummary.needsValue;
                case "approve_value":
                    return r.actionableSummary.needsApproval;
                default:
                    return true;
            }
        });

        // Return the filtered count as total so pagination is self-consistent.
        // (A fully accurate total would require computing summaries for all
        // matching rows before pagination — prohibitively expensive.)
        total = filteredRows.length;
    }

    return {
        requests: filteredRows,
        total,
        availablePageSizes: [10, 20, 50, 100],
    };
}

/**
 * Computes the actionableSummary for a single product request for a given user.
 *
 * When {@link getPerms} is provided (pre-built via {@link buildPermissionLookup}),
 * permission checks are O(1) in-memory lookups.  When omitted the function falls
 * back to per-value {@link getEffectivePermissions} calls for backwards
 * compatibility (e.g. single-request detail views that didn't pre-build a lookup).
 */
async function computeActionableSummary(
    db: DBClient,
    user: UserType,
    requestId: string,
    productTypeIdentifier: string,
    getPerms?: PermissionLookup,
): Promise<{ needsValue: boolean; needsApproval: boolean }> {
    let needsValue = false;
    let needsApproval = false;

    // Load all values for this request
    const values = await db
        .select({
            dataType: ProductRequestsValues.dataType,
            value: ProductRequestsValues.value,
            approvedBy: ProductRequestsValues.approvedBy,
            dataTypeKind: DataTypeSchema.kind,
            dataTypeConfig: DataTypeSchema.config,
            requestorCanEdit: DataTypeSchema.requestorCanEdit,
            requestorCanEditScript: DataTypeSchema.requestorCanEdit_script,
            createdBy: ProductRequestsValues.createdBy,
            // ProductTypesDataTypes overrides
            ptConfig: ProductTypesDataTypes.config,
            ptRequestorCanEdit: ProductTypesDataTypes.requestorCanEdit,
            ptRequestorCanEditScript: ProductTypesDataTypes.requestorCanEdit_script,
            ptEditableOnUpdate: ProductTypesDataTypes.editableOnUpdate,
        })
        .from(ProductRequestsValues)
        .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
        .leftJoin(ProductTypesDataTypes, and(
            eq(ProductTypesDataTypes.productType, productTypeIdentifier),
            eq(ProductTypesDataTypes.dataType, ProductRequestsValues.dataType),
        ))
        .where(eq(ProductRequestsValues.productRequest, requestId));

    // Also load the request to check if it's an update request
    const request = await db
        .select({ productToUpdate: ProductRequests.productToUpdate, createdBy: ProductRequests.createdBy })
        .from(ProductRequests)
        .where(eq(ProductRequests.identifier, requestId))
        .limit(1);

    const isUpdateRequest = !!request[0]?.productToUpdate;

    // Build a script context once for all requestorCanEdit script evaluations.
    const summaryCtx = ScriptEngine.buildContext(db, {
        cause: "product_request_update",
        productRequestIdentifier: requestId,
        principal: { userId: user.identifier ?? null, apiKeyIdentifier: null, isApiKey: false },
    });

    for (const v of values) {
        const perms = getPerms
            ? getPerms(productTypeIdentifier, v.dataType!)
            : await getEffectivePermissions(db, user, productTypeIdentifier, v.dataType!);

        // Check "needsValue": editable and value is null.
        // Tri-state booleans (permitEmpty) accept null as a valid value, so
        // they never need "Provide value" (mirrors the approve-path rule).
        const isCreator = v.createdBy === user.identifier;
        const hasWriterRole = perms.roles.includes("writer" as DataTypeGroupRoles);
        const reqEdit = await resolveRequestorCanEdit(db, v.requestorCanEdit, v.requestorCanEditScript, v.ptRequestorCanEdit, v.ptRequestorCanEditScript, summaryCtx, v.dataType ?? undefined);
        const canEdit = hasWriterRole || (reqEdit && isCreator);
        const editableOnUpdate = v.ptEditableOnUpdate ?? true;
        const canEditEffective = canEdit && (isUpdateRequest ? editableOnUpdate : true);

        const resolvedConfig = resolveConfig(
            v.dataTypeConfig as Record<string, unknown> | null,
            v.ptConfig as Record<string, unknown> | null,
        );
        if (canEditEffective && isEmptyValue(v.value, v.dataTypeKind!, resolvedConfig)) {
            needsValue = true;
        }

        // Check "needsApproval": approvable and not yet approved
        const hasApproverRole = perms.roles.includes("approver" as DataTypeGroupRoles);
        if (hasApproverRole && v.approvedBy === null && v.dataTypeKind !== DataTypeKind.Calculated) {
            needsApproval = true;
        }
    }

    return { needsValue, needsApproval };
}

// ---------------------------------------------------------------------------
// Value Updates
// ---------------------------------------------------------------------------

/**
 * Updates a single data type value on a product request.
 * Validates permissions and triggers dependent default recalculation.
 */
export async function updateProductRequestValue(
    tx: DBClient,
    claims: Record<string, any>,
    requestId: string,
    dataTypeIdentifier: string,
    value: unknown,
): Promise<{ value: ProductRequestsValuesType; recalculated: ProductRequestsValuesType[] }> {
    const user = (await getLoggedinUserObject(tx, claims));
    if (!user) throw new Error("User not found");

    // Verify product request exists and is open
    const request = await tx
        .select({
            identifier: ProductRequests.identifier,
            status: ProductRequests.status,
            createdBy: ProductRequests.createdBy,
            productType: ProductRequests.productType,
            productToUpdate: ProductRequests.productToUpdate,
        })
        .from(ProductRequests)
        .where(eq(ProductRequests.identifier, requestId))
        .limit(1);

    if (request.length === 0) throw new Error("Product request not found");
    if (request[0]!.status !== ProductRequestStatus.open) {
        throw new Error("Product request is not open");
    }

    // Verify write permission
    const perms = await getEffectivePermissions(
        tx, user, request[0]!.productType!, dataTypeIdentifier,
    );

    const dataType = await tx
        .select({
            requestorCanEdit: DataTypeSchema.requestorCanEdit,
            kind: DataTypeSchema.kind,
            config: DataTypeSchema.config,
        })
        .from(DataTypeSchema)
        .where(eq(DataTypeSchema.identifier, dataTypeIdentifier))
        .limit(1);

    if (dataType.length === 0) throw new Error("Data type not found");

    // Check editableOnUpdate for update requests
    const isUpdateRequest = !!request[0]!.productToUpdate;
    if (isUpdateRequest) {
        const assignment = await tx
            .select({ editableOnUpdate: ProductTypesDataTypes.editableOnUpdate })
            .from(ProductTypesDataTypes)
            .where(and(
                eq(ProductTypesDataTypes.productType, request[0]!.productType!),
                eq(ProductTypesDataTypes.dataType, dataTypeIdentifier),
            ))
            .limit(1);

        if (assignment.length > 0 && !assignment[0]!.editableOnUpdate) {
            throw new Error("This data type is not editable for update requests");
        }
    }

    const isCreator = request[0]!.createdBy === user.identifier;
    const hasWriterRole = perms.roles.includes("writer" as DataTypeGroupRoles);
    const reqEdit = dataType[0]!.requestorCanEdit ?? true;
    if (!hasWriterRole && !(reqEdit && isCreator)) {
        throw new PermissionDeniedError("Permission denied: you cannot edit this value");
    }

    // Validate value based on data type kind and config
    const kind = dataType[0]!.kind as string;
    const config = dataType[0]!.config as Record<string, unknown> | null;

    switch (kind) {
        case DataTypeKind.String: {
            const strConfig = config as ConfigString | null | undefined;
            if (value !== null && typeof value !== "string") {
                throw new Error("Value must be a string");
            }
            if (value && strConfig?.inputValidation) {
                try {
                    const regex = new RegExp(strConfig.inputValidation);
                    if (!regex.test(value as string)) {
                        throw new Error(`Input does not match the required format`);
                    }
                } catch (_) {
                    // Invalid regex in config — skip validation
                }
            }
            break;
        }
        case DataTypeKind.Boolean: {
            const boolConfig = config as ConfigBoolean | null | undefined;
            if (typeof value !== "boolean" && value !== null) {
                throw new Error("Value must be a boolean or null");
            }
            if (value === null && !boolConfig?.permitEmpty) {
                throw new Error("Value cannot be null for this field");
            }
            break;
        }
        case DataTypeKind.Lookup:
        case DataTypeKind.Consumable:
        case DataTypeKind.Product: {
            const multiConfig = config as ConfigLookup | ConfigConsumable | ConfigProduct | null | undefined;
            if (multiConfig?.multi === true) {
                if (!Array.isArray(value)) {
                    throw new Error("Expected an array value for multi-valued field");
                }
            } else {
                if (Array.isArray(value)) {
                    throw new Error("Expected a single value, not an array");
                }
            }
            break;
        }
        case DataTypeKind.Calculated:
            // Calculated values are auto-generated; skip validation
            break;
    }

    // Execute the validate script (if configured) AFTER kind-based validation,
    // so the script only sees structurally-valid values. The candidate value is
    // passed via ctx.trigger.candidateValue; ctx.api.request.getValue() still
    // reads the previously persisted value. Fail-closed: a script error/timeout
    // rejects the update.
    const validateScript = (config as { validate?: string } | null | undefined)?.validate;
    if (validateScript && kind !== DataTypeKind.Calculated) {
        const validateCtx = ScriptEngine.buildContext(tx, {
            cause: "product_request_update",
            productRequestIdentifier: requestId,
            dataTypeIdentifier,
            candidateValue: value,
            principal: { userId: user.identifier ?? null, apiKeyIdentifier: null, isApiKey: false },
        });
        let rawResult: unknown;
        try {
            rawResult = await ScriptEngine.execute(tx, validateScript, validateCtx, ScriptCategory.Validate, { throwOnError: true });
        } catch (e) {
            throw new Error(`Validation script error: ${e instanceof Error ? e.message : String(e)}`);
        }
        // Coerce the result defensively into the ValidateScriptResult contract.
        let valid: boolean;
        let message: string | undefined;
        if (rawResult !== null && typeof rawResult === "object") {
            const r = rawResult as { valid?: unknown; message?: unknown };
            valid = r.valid === true;
            message = typeof r.message === "string" ? r.message : undefined;
            if (r.valid === undefined) {
                valid = false;
                message = message ?? "Invalid validator return";
            }
        } else {
            valid = Boolean(rawResult);
        }
        if (!valid) {
            throw new Error(message ?? "Validation failed");
        }
    }

    // Load current value BEFORE the update so we can detect removed consumable IDs
    const currentValueRows = await tx
        .select({ value: ProductRequestsValues.value })
        .from(ProductRequestsValues)
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            eq(ProductRequestsValues.dataType, dataTypeIdentifier),
        ))
        .limit(1);
    const oldValue: unknown = currentValueRows[0]?.value ?? null;

    // Update the value and clear any previous approval since the value changed
    const [updated] = await tx
        .update(ProductRequestsValues)
        .set({
            value: value as any,
            updatedBy: user.identifier,
            updatedAt: sql`now()`,
            approvedBy: null,
            approvedAt: null,
        } as any)
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            eq(ProductRequestsValues.dataType, dataTypeIdentifier),
        ))
        .returning();

    if (!updated) throw new Error("Product request value not found");

    PubSub.publish(message_UpdateProductRequestValue, updated);

    // Cascade: if approval was cleared, recursively clear approvals of data types
    // that depend on this one within the same product request.
    if (request[0]!.productType) {
        await cascadeBreakApprovals(tx, requestId, request[0]!.productType!, dataTypeIdentifier);
    }

    // If this is a consumable-typed value, mark the selected consumable
    // value(s) as used and unmark removed ones so they become available again.
    if (kind === DataTypeKind.Consumable) {
        const oldIdentifiers: string[] = parseConsumableIdentifiers(oldValue);
        const newIdentifiers: string[] = parseConsumableIdentifiers(value);
        const removedIds = oldIdentifiers.filter((id) => !newIdentifiers.includes(id));

        await markValuesAsUnused(tx, removedIds);

        if (newIdentifiers.length > 0) {
            await markValuesAsUsed(tx, newIdentifiers);
        }
    }

    // Recalculate on_change calculated data types and defaultProvider values
    // when a non-calculated value changes. Build the script context once and
    // share it across both recalculation passes.
    let recalculated: ProductRequestsValuesType[] = [];
    if (kind !== DataTypeKind.Calculated) {
        const updateCtx = ScriptEngine.buildContext(tx, {
            cause: "product_request_update",
            productRequestIdentifier: requestId,
            dataTypeIdentifier,
            principal: { userId: user.identifier ?? null, apiKeyIdentifier: null, isApiKey: false },
        });
        recalculated = await recalculateOnChangeCalculatedValues(tx, user.identifier!, requestId, updateCtx);
        await recalculateDefaultValues(tx, user.identifier!, requestId, updateCtx);
    }

    // Re-evaluate mandatory & requestorCanEdit scripts for all values.
    // Run unconditionally — these scripts only read data, no mutation cascade.
    try {
        const statuses = await reevaluateMandatoryAndRequestorCanEdit(tx, requestId, user.identifier!);
        PubSub.publish(message_MandatoryAndRequestorCanEditUpdated, {
            productRequest: requestId,
            mandatory: statuses.mandatory,
            requestorCanEdit: statuses.requestorCanEdit,
        });
        for (const inv of statuses.invalidatedApprovals) {
            PubSub.publish(message_ApproveProductRequestValue, inv);
        }
    } catch (e: unknown) {
        if (devMode) console.error("Mandatory/requestorCanEdit re-evaluation failed:", e);
    }

    return { value: updated as ProductRequestsValuesType, recalculated };
}

// ---------------------------------------------------------------------------
// Recalculation helpers
// ---------------------------------------------------------------------------

/**
 * Recalculates all calculated data type values on the given product request
 * that have `mode: "on_change"`.
 *
 * Called after any non-calculated value on the request is updated so that
 * calculation scripts can reflect the latest input values.
 */
async function recalculateOnChangeCalculatedValues(
    tx: DBClient,
    updatedBy: string,
    requestId: string,
    ctx: ScriptExecutionContext,
): Promise<ProductRequestsValuesType[]> {
    const calculatedRows = await tx
        .select({
            dataType: ProductRequestsValues.dataType,
            dtConfig: DataTypeSchema.config,
            ptConfig: ProductTypesDataTypes.config,
        })
        .from(ProductRequestsValues)
        .innerJoin(ProductRequests, eq(ProductRequestsValues.productRequest, ProductRequests.identifier))
        .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
        .leftJoin(ProductTypesDataTypes, and(
            eq(ProductTypesDataTypes.productType, ProductRequests.productType),
            eq(ProductTypesDataTypes.dataType, ProductRequestsValues.dataType),
        ))
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            eq(DataTypeSchema.kind, DataTypeKind.Calculated),
        ));

    if (devMode) {
        console.log("[recalculateOnChangeCalculatedValues] request=%s found=%d calculated data types",
            requestId, calculatedRows.length);
    }

    const results: ProductRequestsValuesType[] = [];

    for (const row of calculatedRows) {
        const resolvedConfig = resolveConfig(
            row.dtConfig as Record<string, unknown> | null,
            row.ptConfig as Record<string, unknown> | null,
        );
        const mode = (resolvedConfig.mode as string | undefined) ?? CalculatedCalculationMode.OnExport;
        const script = resolvedConfig.script as string | undefined;

        if (mode !== CalculatedCalculationMode.OnChange || !script) {
            if (devMode) {
                const appliedDefault = resolvedConfig.mode == null;
                const reason = mode !== CalculatedCalculationMode.OnChange
                    ? (appliedDefault
                        ? `mode unset (defaulted to "on_export")`
                        : `mode=${String(mode)} (expected "on_change")`)
                    : "script is empty";
                console.log("[recalculateOnChangeCalculatedValues] request=%s dt=%s skipped: %s",
                    requestId, row.dataType, reason);
            }
            continue;
        }

        if (devMode) {
            console.log("[recalculateOnChangeCalculatedValues] request=%s dt=%s executing calculation script",
                requestId, row.dataType);
        }

        const value = await ScriptEngine.execute(
            tx,
            script,
            ScriptEngine.forDataType(ctx, row.dataType!),
            ScriptCategory.Calculation,
        );

        if (value === null && devMode) {
            console.warn("[recalculateOnChangeCalculatedValues] request=%s dt=%s script returned null (may indicate error or intentional null)",
                requestId, row.dataType);
        }

        const [updated] = await tx
            .update(ProductRequestsValues)
            .set({
                value: value as any,
                updatedBy,
                updatedAt: sql`now()`,
            } as any)
            .where(and(
                eq(ProductRequestsValues.productRequest, requestId),
                eq(ProductRequestsValues.dataType, row.dataType!),
            ))
            .returning();

        if (updated) {
            results.push(updated as ProductRequestsValuesType);
        }

        PubSub.publish(message_UpdateProductRequestValue, {
            productRequest: requestId,
            dataType: row.dataType!,
            value,
        });
    }

    if (devMode) {
        console.log("[recalculateOnChangeCalculatedValues] request=%s executed=%d scripts",
            requestId, results.length);
    }

    return results;
}

/**
 * Recalculates the `defaultValue` of all non-calculated data types on the
 * given product request that have a `defaultProvider` script with mode
 * `on_change` or `on_change_no_value`.
 *
 * Mode semantics (design/scripting_engine.md §5.2):
 * - `on_change_no_value`: only recalculates while the data type has no
 *   user-assigned value (`value IS NULL`) and is not approved
 *   (`approvedAt IS NULL`). Writes to `defaultValue`.
 * - `on_change`: always recalculates; writes to `defaultValue` AND clears any
 *   existing approval (`approvedBy`/`approvedAt` → null).
 *
 * The `value` column is never overwritten by a defaultProvider.
 */
async function recalculateDefaultValues(
    tx: DBClient,
    updatedBy: string,
    requestId: string,
    ctx: ScriptExecutionContext,
): Promise<void> {
    const rows = await tx
        .select({
            dataType: ProductRequestsValues.dataType,
            value: ProductRequestsValues.value,
            approvedAt: ProductRequestsValues.approvedAt,
            dtConfig: DataTypeSchema.config,
            ptConfig: ProductTypesDataTypes.config,
        })
        .from(ProductRequestsValues)
        .innerJoin(ProductRequests, eq(ProductRequestsValues.productRequest, ProductRequests.identifier))
        .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
        .leftJoin(ProductTypesDataTypes, and(
            eq(ProductTypesDataTypes.productType, ProductRequests.productType),
            eq(ProductTypesDataTypes.dataType, ProductRequestsValues.dataType),
        ))
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            // defaultProvider does not apply to calculated data types
            sql`${DataTypeSchema.kind} <> ${DataTypeKind.Calculated}`,
        ));

    if (devMode) {
        const withDefaultProvider = rows.filter((r) => {
            const cfg = resolveConfig(
                r.dtConfig as Record<string, unknown> | null,
                r.ptConfig as Record<string, unknown> | null,
            );
            return !!cfg.defaultProvider;
        }).length;
        console.log("[recalculateDefaultValues] request=%s total=%d withDefaultProvider=%d",
            requestId, rows.length, withDefaultProvider);
    }

    let executedCount = 0;

    for (const row of rows) {
        const resolvedConfig = resolveConfig(
            row.dtConfig as Record<string, unknown> | null,
            row.ptConfig as Record<string, unknown> | null,
        );
        const script = resolvedConfig.defaultProvider as string | undefined;
        const mode = (resolvedConfig.mode as string | undefined) ?? DefaultValueCalculationMode.OnCreate;

        if (!script) continue;

        const hasValue = row.value !== null;
        const isApproved = row.approvedAt !== null;

        if (mode === "on_change_no_value") {
            if (hasValue || isApproved) {
                if (devMode) {
                    const reason = hasValue && isApproved ? "has value and is approved"
                        : hasValue ? "has value" : "is approved";
                    console.log("[recalculateDefaultValues] request=%s dt=%s skipped on_change_no_value: %s",
                        requestId, row.dataType, reason);
                }
                continue;
            }
        } else if (mode === "on_change") {
            // Always recalculate (falls through)
        } else {
            if (devMode && script) {
                const appliedDefault = resolvedConfig.mode == null;
                console.log("[recalculateDefaultValues] request=%s dt=%s skipped: %s",
                    requestId, row.dataType,
                    appliedDefault
                        ? `mode unset (defaulted to "on_create")`
                        : `mode=${String(mode)} (expected on_change or on_change_no_value)`);
            }
            continue;
        }

        if (devMode) {
            console.log("[recalculateDefaultValues] request=%s dt=%s executing defaultProvider script mode=%s",
                requestId, row.dataType, mode);
        }

        const defaultValue = await ScriptEngine.execute(
            tx,
            script,
            ScriptEngine.forDataType(ctx, row.dataType!),
            ScriptCategory.DefaultProvider,
        );

        if (defaultValue === null && devMode) {
            console.warn("[recalculateDefaultValues] request=%s dt=%s script returned null (may indicate error or intentional null)",
                requestId, row.dataType);
        }

        const setClause: Record<string, unknown> = {
            defaultValue: defaultValue as any,
            updatedBy,
            updatedAt: sql`now()`,
        };
        if (mode === "on_change") {
            // Break approval
            setClause.approvedBy = null;
            setClause.approvedAt = null;
        }

        await tx
            .update(ProductRequestsValues)
            .set(setClause as any)
            .where(and(
                eq(ProductRequestsValues.productRequest, requestId),
                eq(ProductRequestsValues.dataType, row.dataType!),
            ));

        executedCount++;

        PubSub.publish(message_UpdateProductRequestValue, {
            productRequest: requestId,
            dataType: row.dataType!,
            defaultValue,
        });
    }

    if (devMode) {
        console.log("[recalculateDefaultValues] request=%s executed=%d scripts",
            requestId, executedCount);
    }
}

/**
 * Recalculates all calculated data type values on the given product request
 * that have `mode: "on_export"`.
 *
 * Called when a product request transitions to "importing" status so that
 * the computed values are persisted and available in exports.
 */
async function recalculateOnExportCalculatedValues(
    tx: DBClient,
    requestId: string,
    ctx: ScriptExecutionContext,
): Promise<void> {
    const calculatedRows = await tx
        .select({
            dataType: ProductRequestsValues.dataType,
            dtConfig: DataTypeSchema.config,
            ptConfig: ProductTypesDataTypes.config,
        })
        .from(ProductRequestsValues)
        .innerJoin(ProductRequests, eq(ProductRequestsValues.productRequest, ProductRequests.identifier))
        .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
        .leftJoin(ProductTypesDataTypes, and(
            eq(ProductTypesDataTypes.productType, ProductRequests.productType),
            eq(ProductTypesDataTypes.dataType, ProductRequestsValues.dataType),
        ))
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            eq(DataTypeSchema.kind, DataTypeKind.Calculated),
        ));

    for (const row of calculatedRows) {
        const resolvedConfig = resolveConfig(
            row.dtConfig as Record<string, unknown> | null,
            row.ptConfig as Record<string, unknown> | null,
        );
        const mode = (resolvedConfig.mode as string | undefined) ?? CalculatedCalculationMode.OnExport;
        const script = resolvedConfig.script as string | undefined;

        if (mode !== CalculatedCalculationMode.OnExport || !script) continue;

        const value = await ScriptEngine.execute(
            tx,
            script,
            ScriptEngine.forDataType(ctx, row.dataType!),
            ScriptCategory.Calculation,
        );

        await tx
            .update(ProductRequestsValues)
            .set({
                value: value as any,
                updatedAt: sql`now()`,
            } as any)
            .where(and(
                eq(ProductRequestsValues.productRequest, requestId),
                eq(ProductRequestsValues.dataType, row.dataType!),
            ));
    }
}

/**
 * Re-evaluates mandatory and requestorCanEdit scripts for every value on a
 * product request. Used after a value change to push updated flags to the UI
 * via PubSub without a full detail refetch.
 */
async function reevaluateMandatoryAndRequestorCanEdit(
    tx: DBClient,
    requestId: string,
    userId: string,
): Promise<{
    mandatory: Record<string, boolean>;
    requestorCanEdit: Record<string, boolean>;
    invalidatedApprovals: ProductRequestsValuesType[];
}> {
    const rows = await tx
        .select({
            dataType: ProductRequestsValues.dataType,
            value: ProductRequestsValues.value,
            defaultValue: ProductRequestsValues.defaultValue,
            approvedBy: ProductRequestsValues.approvedBy,
            dataTypeKind: DataTypeSchema.kind,
            dtConfig: DataTypeSchema.config,
            dtMandatory: DataTypeSchema.mandatory,
            dtMandatoryScript: DataTypeSchema.mandatory_script,
            dtRequestorCanEdit: DataTypeSchema.requestorCanEdit,
            dtRequestorCanEditScript: DataTypeSchema.requestorCanEdit_script,
            ptConfig: ProductTypesDataTypes.config,
            ptMandatory: ProductTypesDataTypes.mandatory,
            ptMandatoryScript: ProductTypesDataTypes.mandatory_script,
            ptRequestorCanEdit: ProductTypesDataTypes.requestorCanEdit,
            ptRequestorCanEditScript: ProductTypesDataTypes.requestorCanEdit_script,
        })
        .from(ProductRequestsValues)
        .innerJoin(ProductRequests, eq(ProductRequestsValues.productRequest, ProductRequests.identifier))
        .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
        .leftJoin(ProductTypesDataTypes, and(
            eq(ProductTypesDataTypes.productType, ProductRequests.productType),
            eq(ProductTypesDataTypes.dataType, ProductRequestsValues.dataType),
        ))
        .where(eq(ProductRequestsValues.productRequest, requestId));

    const ctx = ScriptEngine.buildContext(tx, {
        cause: "product_request_update",
        productRequestIdentifier: requestId,
        principal: { userId, apiKeyIdentifier: null, isApiKey: false },
    });

    const mandatory: Record<string, boolean> = {};
    const requestorCanEdit: Record<string, boolean> = {};
    const invalidatedApprovals: ProductRequestsValuesType[] = [];

    for (const row of rows) {
        if (!row.dataType) continue;
        mandatory[row.dataType] = await resolveMandatory(
            tx,
            row.dtMandatory, row.dtMandatoryScript,
            row.ptMandatory ?? null, row.ptMandatoryScript ?? null,
            ctx, row.dataType,
        );
        requestorCanEdit[row.dataType] = await resolveRequestorCanEdit(
            tx,
            row.dtRequestorCanEdit, row.dtRequestorCanEditScript,
            row.ptRequestorCanEdit ?? null, row.ptRequestorCanEditScript ?? null,
            ctx, row.dataType,
        );

        // Invalidate an approval that is now mandatory but has no value
        // (e.g. a dependency field changed, making this field mandatory
        // after the value was already approved).
        if (mandatory[row.dataType] && row.approvedBy !== null
            && isEmptyValue(row.value, row.dataTypeKind, resolveConfig(
                row.dtConfig as Record<string, unknown> | null,
                row.ptConfig as Record<string, unknown> | null,
            ))
            && (row.defaultValue === null || row.defaultValue === "null")) {
            const [invalidated] = await tx
                .update(ProductRequestsValues)
                .set({ approvedBy: null, approvedAt: null } as any)
                .where(and(
                    eq(ProductRequestsValues.productRequest, requestId),
                    eq(ProductRequestsValues.dataType, row.dataType),
                ))
                .returning();
            if (invalidated) invalidatedApprovals.push(invalidated as ProductRequestsValuesType);
        }
    }

    return { mandatory, requestorCanEdit, invalidatedApprovals };
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

/**
 * Approves a single data type value on a product request.
 * Checks auto-progression after approval.
 */
export async function approveProductRequestValue(
    tx: DBClient,
    claims: Record<string, any>,
    requestId: string,
    dataTypeIdentifier: string,
): Promise<{ value: ProductRequestsValuesType; allApproved: boolean }> {
    const user = (await getLoggedinUserObject(tx, claims));
    if (!user) throw new Error("User not found");

    // Verify product request exists and is open
    const request = await tx
        .select({
            identifier: ProductRequests.identifier,
            status: ProductRequests.status,
            productType: ProductRequests.productType,
        })
        .from(ProductRequests)
        .where(eq(ProductRequests.identifier, requestId))
        .limit(1);

    if (request.length === 0) throw new Error("Product request not found");
    if (request[0]!.status !== ProductRequestStatus.open) {
        throw new Error("Product request is not open");
    }

    // Verify Approver role
    const perms = await getEffectivePermissions(
        tx, user, request[0]!.productType!, dataTypeIdentifier,
    );
    if (!perms.roles.includes("approver" as DataTypeGroupRoles)) {
        throw new PermissionDeniedError("Permission denied: you cannot approve this value");
    }

    // Load the existing value row with mandatory info
    const existing = await tx
        .select({
            value: ProductRequestsValues.value,
            defaultValue: ProductRequestsValues.defaultValue,
            approvedBy: ProductRequestsValues.approvedBy,
            updatedBy: ProductRequestsValues.updatedBy,
            updatedAt: ProductRequestsValues.updatedAt,
            dataTypeKind: DataTypeSchema.kind,
            dataTypeConfig: DataTypeSchema.config,
            dataTypeMandatory: DataTypeSchema.mandatory,
            dataTypeMandatoryScript: DataTypeSchema.mandatory_script,
            ptMandatory: ProductTypesDataTypes.mandatory,
            ptMandatoryScript: ProductTypesDataTypes.mandatory_script,
        })
        .from(ProductRequestsValues)
        .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
        .leftJoin(ProductTypesDataTypes, and(
            eq(ProductTypesDataTypes.productType, request[0]!.productType!),
            eq(ProductTypesDataTypes.dataType, dataTypeIdentifier),
        ))
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            eq(ProductRequestsValues.dataType, dataTypeIdentifier),
        ))
        .limit(1);

    if (existing.length === 0) throw new Error("Product request value not found");

    // Resolve mandatory: only require a value when the field is mandatory
    const row = existing[0]!;
    const approveCtx = ScriptEngine.buildContext(tx, {
        cause: "product_request_approve",
        productRequestIdentifier: requestId,
        dataTypeIdentifier,
        principal: { userId: user.identifier ?? null, apiKeyIdentifier: null, isApiKey: false },
    });
    const isMandatory = await resolveMandatory(
        tx,
        row.dataTypeMandatory, row.dataTypeMandatoryScript,
        row.ptMandatory, row.ptMandatoryScript,
        approveCtx,
        dataTypeIdentifier,
    );
    if (isMandatory && isEmptyValue(row.value, row.dataTypeKind, row.dataTypeConfig as Record<string, unknown> | null)
        && (row.defaultValue === null || row.defaultValue === "null")) {
        throw new Error("Cannot approve: mandatory field has no value");
    }

    // Validate previous-approval prerequisites
    await validatePreviousApprovals(tx, request[0]!.productType!, requestId, dataTypeIdentifier);

    // Update approval
    const [updated] = await tx
        .update(ProductRequestsValues)
        .set({
            approvedBy: user.identifier,
            approvedAt: sql`now()`,
        } as any)
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            eq(ProductRequestsValues.dataType, dataTypeIdentifier),
        ))
        .returning();

    if (!updated) throw new Error("Failed to approve value");

    PubSub.publish(message_ApproveProductRequestValue, updated);

    // Check auto-progression
    const allApproved = await checkAllApproved(tx, requestId);

    return { value: updated as ProductRequestsValuesType, allApproved };
}

/**
 * Approves all unapproved values the current user can approve on a request.
 */
export async function approveAllProductRequestValues(
    tx: DBClient,
    claims: Record<string, any>,
    requestId: string,
): Promise<{ approvedCount: number; allApproved: boolean }> {
    const user = (await getLoggedinUserObject(tx, claims));
    if (!user) throw new Error("User not found");

    // Verify product request exists and is open
    const request = await tx
        .select({
            identifier: ProductRequests.identifier,
            status: ProductRequests.status,
            productType: ProductRequests.productType,
        })
        .from(ProductRequests)
        .where(eq(ProductRequests.identifier, requestId))
        .limit(1);

    if (request.length === 0) throw new Error("Product request not found");
    if (request[0]!.status !== ProductRequestStatus.open) {
        throw new Error("Product request is not open");
    }

    // Load all values for this request
    const values = await tx
        .select({
            dataType: ProductRequestsValues.dataType,
            value: ProductRequestsValues.value,
            defaultValue: ProductRequestsValues.defaultValue,
            approvedBy: ProductRequestsValues.approvedBy,
            dataTypeKind: DataTypeSchema.kind,
            dataTypeConfig: DataTypeSchema.config,
            dataTypeMandatory: DataTypeSchema.mandatory,
            dataTypeMandatoryScript: DataTypeSchema.mandatory_script,
            ptMandatory: ProductTypesDataTypes.mandatory,
            ptMandatoryScript: ProductTypesDataTypes.mandatory_script,
        })
        .from(ProductRequestsValues)
        .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
        .leftJoin(ProductTypesDataTypes, and(
            eq(ProductTypesDataTypes.productType, request[0]!.productType!),
            eq(ProductTypesDataTypes.dataType, ProductRequestsValues.dataType),
        ))
        .where(eq(ProductRequestsValues.productRequest, requestId));

    let approvedCount = 0;

    // Build a script context once for all mandatory script evaluations.
    const approveAllCtx = ScriptEngine.buildContext(tx, {
        cause: "product_request_approve",
        productRequestIdentifier: requestId,
        principal: { userId: user.identifier ?? null, apiKeyIdentifier: null, isApiKey: false },
    });

    for (const v of values) {
        // Skip already approved
        if (v.approvedBy !== null) continue;
        // Skip calculated (auto-approved)
        if (v.dataTypeKind === DataTypeKind.Calculated) continue;
        // Resolve mandatory; only require a value for mandatory fields
        const isMandatory = await resolveMandatory(
            tx,
            v.dataTypeMandatory, v.dataTypeMandatoryScript,
            v.ptMandatory, v.ptMandatoryScript,
            approveAllCtx,
            v.dataType ?? undefined,
        );
        if (isMandatory && isEmptyValue(v.value, v.dataTypeKind, v.dataTypeConfig as Record<string, unknown> | null)
            && (v.defaultValue === null || v.defaultValue === "null")) {
            continue;
        }

        // Check user has Approver role
        const perms = await getEffectivePermissions(
            tx, user, request[0]!.productType!, v.dataType!,
        );
        if (!perms.roles.includes("approver" as DataTypeGroupRoles)) continue;

        // Validate previous-approval prerequisites
        try {
            await validatePreviousApprovals(tx, request[0]!.productType!, requestId, v.dataType!);
        } catch (_) {
            continue;
        }

        // Approve (also update last-editor audit fields)
        await tx
            .update(ProductRequestsValues)
            .set({
                approvedBy: user.identifier,
                approvedAt: sql`now()`,
                updatedBy: user.identifier,
                updatedAt: sql`now()`,
            } as any)
            .where(and(
                eq(ProductRequestsValues.productRequest, requestId),
                eq(ProductRequestsValues.dataType, v.dataType!),
            ));

        approvedCount++;
    }

    if (approvedCount > 0) {
        PubSub.publish(message_ApproveProductRequestValue, { requestId, approvedCount });
    }

    const allApproved = await checkAllApproved(tx, requestId);
    return { approvedCount, allApproved };
}

// ---------------------------------------------------------------------------
// Previous-Approval Validation & Cascade
// ---------------------------------------------------------------------------

/**
 * Clears references to the given identifiers from ProductRequestsValues rows
 * that belong to open product requests, then cascades approval breaks to
 * dependent data types. Centralized so all disable paths (lookup, consumable,
 * product) use the same open-status filter and cascade logic.
 */
export async function clearValuesAndCascadeApprovals(
    tx: DBClient,
    user: UserType,
    identifiers: string[],
): Promise<void> {
    // Build subquery of open request IDs — only clear values in open requests
    const openRequestIds = tx
        .select({ identifier: ProductRequests.identifier })
        .from(ProductRequests)
        .where(eq(ProductRequests.status, ProductRequestStatus.open));

    const affectedPairs: { productRequest: string | null; dataType: string | null }[] = [];

    for (const id of identifiers) {
        // 1. Single-value rows: set value = null
        const clearedSingle = await tx
            .update(ProductRequestsValues)
            .set({ value: null, approvedBy: null, approvedAt: null, updatedBy: user.identifier, updatedAt: sql`now()` })
            .where(and(
                inArray(ProductRequestsValues.productRequest, openRequestIds),
                sql`${ProductRequestsValues.value}::text = ${JSON.stringify(id)}`,
            ))
            .returning({ productRequest: ProductRequestsValues.productRequest, dataType: ProductRequestsValues.dataType });
        affectedPairs.push(...clearedSingle);

        // 2. Multi-value rows: remove this ID from the array, keeping other values
        const arrayRows = await tx
            .select({ identifier: ProductRequestsValues.identifier, value: ProductRequestsValues.value })
            .from(ProductRequestsValues)
            .where(and(
                inArray(ProductRequestsValues.productRequest, openRequestIds),
                sql`jsonb_typeof(${ProductRequestsValues.value}) = 'array'`,
                sql`${ProductRequestsValues.value}::jsonb ? ${id}`,
            ));

        for (const row of arrayRows) {
            const currentValue = row.value as unknown[];
            if (!Array.isArray(currentValue)) continue;
            const filtered = currentValue.filter((v: unknown) => typeof v === "string" && v !== id);
            const [clearedArray] = await tx
                .update(ProductRequestsValues)
                .set({
                    value: filtered.length > 0 ? (filtered as any) : null,
                    approvedBy: null,
                    approvedAt: null,
                    updatedBy: user.identifier,
                    updatedAt: sql`now()`,
                } as any)
                .where(eq(ProductRequestsValues.identifier, row.identifier as string))
                .returning({ productRequest: ProductRequestsValues.productRequest, dataType: ProductRequestsValues.dataType });
            if (clearedArray) affectedPairs.push(clearedArray);
        }
    }

    // Cascade: for each unique (productRequest, dataType) where approval was cleared,
    // recursively clear approvals of dependent data types.
    if (affectedPairs.length > 0) {
        const uniquePairs = Array.from(new Map(
            affectedPairs
                .filter(r => r.productRequest != null)
                .map(r => [`${r.productRequest}::${r.dataType}`, r as { productRequest: string; dataType: string }])
        ).values());

        for (const pair of uniquePairs) {
            const [req] = await tx
                .select({ productType: ProductRequests.productType })
                .from(ProductRequests)
                .where(eq(ProductRequests.identifier, pair.productRequest))
                .limit(1);
            if (req?.productType) {
                await cascadeBreakApprovals(tx, pair.productRequest, req.productType, pair.dataType);
            }
        }
    }
}

/**
 * Validates that all previous-approval prerequisites for a data type are
 * met within the given product request. Throws if any dependency is not approved.
 */
async function validatePreviousApprovals(
    tx: DBClient,
    productType: string,
    requestId: string,
    dataTypeIdentifier: string,
): Promise<void> {
    const deps = await getPreviousApprovals(tx, productType, dataTypeIdentifier);
    if (deps.length === 0) return;

    const depIdentifiers = deps.map(d => d.dependsOnDataType);

    const approved = await tx
        .select({ dataType: ProductRequestsValues.dataType })
        .from(ProductRequestsValues)
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            inArray(ProductRequestsValues.dataType, depIdentifiers),
            isNotNull(ProductRequestsValues.approvedBy),
        ));

    const approvedSet = new Set(approved.map(r => r.dataType));

    for (const dep of deps) {
        if (!approvedSet.has(dep.dependsOnDataType)) {
            throw new Error(`Cannot approve: "${dep.dependsOnDataTypeName}" must be approved first`);
        }
    }
}

/**
 * Recursively clears approvals of data types that depend on `brokenDataTypeIdentifier`
 * within the given product request, since the prerequisite approval was broken.
 */
export async function cascadeBreakApprovals(
    tx: DBClient,
    requestId: string,
    productType: string,
    brokenDataTypeIdentifier: string,
    broken: Set<string> = new Set(),
): Promise<void> {
    // Guard: only cascade in open requests
    const [req] = await tx
        .select({ status: ProductRequests.status })
        .from(ProductRequests)
        .where(eq(ProductRequests.identifier, requestId))
        .limit(1);
    if (!req || req.status !== ProductRequestStatus.open) return;

    if (broken.has(brokenDataTypeIdentifier)) return;
    broken.add(brokenDataTypeIdentifier);

    const dependants = await getDependants(tx, productType, brokenDataTypeIdentifier);

    for (const dep of dependants) {
        // Check if this dependent is currently approved in this request
        const [valueRow] = await tx
            .select({ approvedBy: ProductRequestsValues.approvedBy })
            .from(ProductRequestsValues)
            .where(and(
                eq(ProductRequestsValues.productRequest, requestId),
                eq(ProductRequestsValues.dataType, dep.dataType),
                isNotNull(ProductRequestsValues.approvedBy),
            ))
            .limit(1);

        if (valueRow) {
            await tx
                .update(ProductRequestsValues)
                .set({ approvedBy: null, approvedAt: null } as any)
                .where(and(
                    eq(ProductRequestsValues.productRequest, requestId),
                    eq(ProductRequestsValues.dataType, dep.dataType),
                ));

            PubSub.publish(message_ApproveProductRequestValue, {
                requestId,
                dataType: dep.dataType,
                cleared: true,
            });

            // Recurse: data types depending on this now-broken one must also be
            // cleared
            await cascadeBreakApprovals(tx, requestId, productType, dep.dataType, broken);
        }
    }
}

/**
 * Checks if all non-calculated data types on a request are approved.
 * If so, transitions status from open → importing.
 */
export async function checkAllApproved(
    tx: DBClient,
    requestId: string,
): Promise<boolean> {
    // Count total non-calculated data types
    const totalResult = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(ProductRequestsValues)
        .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            sql`${DataTypeSchema.kind} != ${DataTypeKind.Calculated}`,
        ));

    // Count approved non-calculated data types
    const approvedResult = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(ProductRequestsValues)
        .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            sql`${DataTypeSchema.kind} != ${DataTypeKind.Calculated}`,
            sql`${ProductRequestsValues.approvedBy} IS NOT NULL`,
        ));

    const totalCount = totalResult[0]?.count ?? 0;
    const approvedCount = approvedResult[0]?.count ?? 0;

    if (totalCount > 0 && totalCount === approvedCount) {
        await tx
            .update(ProductRequests)
            .set({ status: ProductRequestStatus.importing })
            .where(eq(ProductRequests.identifier, requestId));

        // Calculate on_export values before creating export rows so the
        // computed results are persisted and available for export.
        try {
            // System-driven transition: no user principal.
            const importCtx = ScriptEngine.buildContext(tx, {
                cause: "product_request_importing",
                productRequestIdentifier: requestId,
                principal: { userId: null, apiKeyIdentifier: null, isApiKey: false },
            });
            await recalculateOnExportCalculatedValues(tx, requestId, importCtx);
        } catch (e) {
            console.error("recalculateOnExportCalculatedValues failed:", e);
        }

        const request = await tx
            .select({ productType: ProductRequests.productType })
            .from(ProductRequests)
            .where(eq(ProductRequests.identifier, requestId))
            .limit(1);

        if (request[0]?.productType) {
            await createProductExportRows(tx, requestId, request[0].productType);
        }

        PubSub.publish(message_ImportingProductRequest, { identifier: requestId });
        return true;
    }

    return false;
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

/**
 * Cancels a product request. User must have role=cancel permission.
 */
export async function cancelProductRequest(
    tx: DBClient,
    claims: Record<string, any>,
    requestId: string,
): Promise<ProductRequestType> {
    const user = (await getLoggedinUserObject(tx, claims));
    if (!user) throw new Error("User not found");

    // Verify product request exists and is open
    const request = await tx
        .select({
            identifier: ProductRequests.identifier,
            status: ProductRequests.status,
            productType: ProductRequests.productType,
            createdBy: ProductRequests.createdBy,
        })
        .from(ProductRequests)
        .where(eq(ProductRequests.identifier, requestId))
        .limit(1);

    if (request.length === 0) throw new Error("Product request not found");
    if (request[0]!.status !== ProductRequestStatus.open) {
        throw new Error("Only open requests can be cancelled");
    }

    // Verify cancel permission (group-based or requestor-can-cancel)
    const canCancel = await userCanCancel(
        tx, user, request[0]!.productType!, request[0]!.createdBy!,
    );
    if (!canCancel) {
        throw new PermissionDeniedError("Permission denied: you cannot cancel this request");
    }

    // Clean up consumable values (mark as not used)
    // Find all consumable-type data type values in this request
    const consumableValues = await tx
        .select({
            value: ProductRequestsValues.value,
            dataTypeIdentifier: ProductRequestsValues.dataType,
        })
        .from(ProductRequestsValues)
        .innerJoin(DataTypeSchema, eq(ProductRequestsValues.dataType, DataTypeSchema.identifier))
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            eq(DataTypeSchema.kind, DataTypeKind.Consumable),
        ));

    // Release all assigned consumable values so they become available again
    const allConsumableIds: string[] = [];
    for (const cv of consumableValues) {
        allConsumableIds.push(...parseConsumableIdentifiers(cv.value));
    }
    await markValuesAsUnused(tx, allConsumableIds);

    // Update status to cancelled
    const [updated] = await tx
        .update(ProductRequests)
        .set({ status: ProductRequestStatus.cancelled })
        .where(eq(ProductRequests.identifier, requestId))
        .returning();

    if (!updated) throw new Error("Failed to cancel request");

    PubSub.publish(message_CancelProductRequest, updated);
    return updated as ProductRequestType;
}

// ---------------------------------------------------------------------------
// Script-facing read helpers (used by the ScriptEngine's ScriptApi)
// ---------------------------------------------------------------------------

/**
 * Returns the value of a single data type on a product request, or null when
 * the row does not exist. Read-only; no permission checks (script API reads
 * run with the caller's already-established authority).
 */
export async function getRequestValueForScript(
    db: DBClient,
    requestId: string,
    dataTypeIdentifier: string,
): Promise<unknown> {
    const rows = await db
        .select({ value: ProductRequestsValues.value })
        .from(ProductRequestsValues)
        .where(and(
            eq(ProductRequestsValues.productRequest, requestId),
            eq(ProductRequestsValues.dataType, dataTypeIdentifier),
        ))
        .limit(1);
    return rows.length === 0 ? null : rows[0]!.value;
}

/**
 * Returns all values on a product request as `{ dataTypeIdentifier: value }`.
 */
export async function getRequestAllValuesForScript(
    db: DBClient,
    requestId: string,
): Promise<Record<string, unknown>> {
    const rows = await db
        .select({
            dataType: ProductRequestsValues.dataType,
            value: ProductRequestsValues.value,
        })
        .from(ProductRequestsValues)
        .where(eq(ProductRequestsValues.productRequest, requestId));
    const out: Record<string, unknown> = {};
    for (const r of rows) {
        if (r.dataType) out[r.dataType] = r.value;
    }
    return out;
}

/**
 * Returns metadata about a product request for script consumption.
 */
export async function getRequestMetaForScript(
    db: DBClient,
    requestId: string,
): Promise<{
    identifier: string;
    status: string;
    productTypeIdentifier: string | null;
    productTypeName: string | null;
    productNumber: string;
    createdBy: string | null;
} | null> {
    const rows = await db
        .select({
            identifier: ProductRequests.identifier,
            status: ProductRequests.status,
            productTypeIdentifier: ProductRequests.productType,
            productTypeName: ProductTypes.name,
            productNumber: ProductRequests.productNumber,
            createdBy: ProductRequests.createdBy,
        })
        .from(ProductRequests)
        .leftJoin(ProductTypes, eq(ProductRequests.productType, ProductTypes.identifier))
        .where(eq(ProductRequests.identifier, requestId))
        .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0]!;
    return {
        identifier: r.identifier!,
        status: r.status as string,
        productTypeIdentifier: r.productTypeIdentifier ?? null,
        productTypeName: r.productTypeName ?? null,
        productNumber: r.productNumber!,
        createdBy: r.createdBy ?? null,
    };
}
