// Applications using this template are encouraged to place their functional permissions in
// this file and not in `FunctionalPermissions.ts` to achieve stability with upgrades of the template.
//
// Add each permission as a `FunctionalPermissionInsertType` entry to the exported
// `functionalPermissionDefinitions` array. `registerFunctionalPermissions()` (in
// `FunctionalPermissions.ts`) registers these alongside the built-in permissions at startup.

import type {FunctionalPermissionInsertType} from "@/types/FunctionalPermissionType.ts";

export const functionalPermissionDefinitions: FunctionalPermissionInsertType[] = [];

// FIXME: adjust to new schema
const FP_VIEW_DATA_TYPES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_DATA_TYPES, description: "View data type definitions — the field types available for product type configuration.", group: "Configuration" };
export const FP_VIEW_DATA_TYPES = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_DATA_TYPES_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_DATA_TYPES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_DATA_TYPES, description: "Create, edit, enable, or disable data types. Also grants access to script execution and script log features.", group: "Configuration" };
export const FP_MANAGE_DATA_TYPES = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_DATA_TYPES_DEF) satisfies FunctionalPermissionSelectType;

const FP_DO_CONFIGURATION_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_DO_CONFIGURATION, description: "Access the master data configuration area. Required alongside domain-specific permissions for lookups and consumables.", group: "Configuration" };
export const FP_DO_CONFIGURATION = await registerFunctionalPermission(getDatabaseConnection(), FP_DO_CONFIGURATION_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_TARGET_SYSTEMS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_TARGET_SYSTEMS, description: "View the list of target systems — the external systems that product change requests get exported to.", group: "Configuration" };
export const FP_VIEW_TARGET_SYSTEMS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_TARGET_SYSTEMS_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_TARGET_SYSTEMS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_TARGET_SYSTEMS, description: "Create, edit, enable, or disable target system definitions.", group: "Configuration" };
export const FP_MANAGE_TARGET_SYSTEMS = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_TARGET_SYSTEMS_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_PRODUCT_TYPES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCT_TYPES, description: "View product type definitions and their data type assignments.", group: "Configuration" };
export const FP_VIEW_PRODUCT_TYPES = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_PRODUCT_TYPES_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_PRODUCT_TYPES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_PRODUCT_TYPES, description: "Create, edit, enable, or disable product types. Also assign and reorder data types on product types.", group: "Configuration" };
export const FP_MANAGE_PRODUCT_TYPES = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_PRODUCT_TYPES_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_BUSINESS_DOMAINS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_BUSINESS_DOMAINS, description: "View business domain definitions — categories used to organize products.", group: "Configuration" };
export const FP_VIEW_BUSINESS_DOMAINS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_BUSINESS_DOMAINS_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_BUSINESS_DOMAINS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_BUSINESS_DOMAINS, description: "Create, edit, enable, or disable business domain definitions.", group: "Configuration" };
export const FP_MANAGE_BUSINESS_DOMAINS = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_BUSINESS_DOMAINS_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_CONSUMABLES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_CONSUMABLES, description: "View consumable master data definitions and their values. Requires FP_DO_CONFIGURATION alongside this permission.", group: "Configuration" };
export const FP_VIEW_CONSUMABLES = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_CONSUMABLES_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_CONSUMABLES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_CONSUMABLES, description: "Create, edit, enable, or disable consumable master data and their values. Requires FP_DO_CONFIGURATION alongside this permission.", group: "Configuration" };
export const FP_MANAGE_CONSUMABLES = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_CONSUMABLES_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_LOOKUPS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_LOOKUPS, description: "View lookup table definitions and their values. Requires FP_DO_CONFIGURATION alongside this permission.", group: "Configuration" };
export const FP_VIEW_LOOKUPS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_LOOKUPS_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_LOOKUPS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_LOOKUPS, description: "Create, edit, enable, or disable lookup tables and their values. Requires FP_DO_CONFIGURATION alongside this permission.", group: "Configuration" };
export const FP_MANAGE_LOOKUPS = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_LOOKUPS_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_PRODUCTS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCTS, description: "Search for and view products and their detailed field values. Also view product change requests and their details.", group: "General" };
export const FP_VIEW_PRODUCTS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_PRODUCTS_DEF) satisfies FunctionalPermissionSelectType;

const FP_CREATE_PRODUCT_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_PRODUCT, description: "Create brand-new products and import products from files (such as XLSX or CSV). Also create new product change requests.", group: "General" };
export const FP_CREATE_PRODUCT = await registerFunctionalPermission(getDatabaseConnection(), FP_CREATE_PRODUCT_DEF) satisfies FunctionalPermissionSelectType;

const FP_UPDATE_PRODUCT_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_UPDATE_PRODUCT, description: "Edit existing product data — modify field values on a product directly.", group: "General" };
export const FP_UPDATE_PRODUCT = await registerFunctionalPermission(getDatabaseConnection(), FP_UPDATE_PRODUCT_DEF) satisfies FunctionalPermissionSelectType;

const FP_DISABLE_PRODUCT_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_DISABLE_PRODUCT, description: "Mark products as disabled (inactive) or re-enable previously disabled products.", group: "General" };
export const FP_DISABLE_PRODUCT = await registerFunctionalPermission(getDatabaseConnection(), FP_DISABLE_PRODUCT_DEF) satisfies FunctionalPermissionSelectType;

const FP_REQUEST_PRODUCT_UPDATE_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_REQUEST_PRODUCT_UPDATE, description: "Submit a request that a product's data be updated — creates a product change request rather than modifying the product directly.", group: "General" };
export const FP_REQUEST_PRODUCT_UPDATE = await registerFunctionalPermission(getDatabaseConnection(), FP_REQUEST_PRODUCT_UPDATE_DEF) satisfies FunctionalPermissionSelectType;

const FP_CREATE_PRODUCT_COPY_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_PRODUCT_COPY, description: "Create a duplicate of an existing product — copies the product number base with all its field values.", group: "General" };
export const FP_CREATE_PRODUCT_COPY = await registerFunctionalPermission(getDatabaseConnection(), FP_CREATE_PRODUCT_COPY_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_PRODUCT_EXPORTS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCT_EXPORTS, description: "Access the product exports management page and view the list of pending product change requests awaiting export to target systems.", group: "General" };
export const FP_VIEW_PRODUCT_EXPORTS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_PRODUCT_EXPORTS_DEF) satisfies FunctionalPermissionSelectType;

const FP_EXPORT_PRODUCT_REQUESTS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_EXPORT_PRODUCT_REQUESTS, description: "Export product change requests to XLSX, CSV, or JSON files for delivery to target systems. Also mark requests as having been exported.", group: "General" };
export const FP_EXPORT_PRODUCT_REQUESTS = await registerFunctionalPermission(getDatabaseConnection(), FP_EXPORT_PRODUCT_REQUESTS_DEF) satisfies FunctionalPermissionSelectType;

const FP_CONFIRM_IMPORT_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_CONFIRM_IMPORT, description: "Confirm that a product change request file has been successfully imported into a target system by its operators.", group: "General" };
export const FP_CONFIRM_IMPORT = await registerFunctionalPermission(getDatabaseConnection(), FP_CONFIRM_IMPORT_DEF) satisfies FunctionalPermissionSelectType;

const FP_EDIT_EXPORT_STATUS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_EDIT_EXPORT_STATUS, description: "Manually change the export or import status of a product change request on the exports page. Requires either FP_EXPORT_PRODUCT_REQUESTS or FP_CONFIRM_IMPORT alongside it.", group: "General" };
export const FP_EDIT_EXPORT_STATUS = await registerFunctionalPermission(getDatabaseConnection(), FP_EDIT_EXPORT_STATUS_DEF) satisfies FunctionalPermissionSelectType;

const FP_NOTIFICATIONS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_NOTIFICATIONS, description: "Configure the email notification system — set recipients and schedules. Also manually trigger notification sends or simulate them for testing purposes.", group: "Admin" };
export const FP_NOTIFICATIONS = await registerFunctionalPermission(getDatabaseConnection(), FP_NOTIFICATIONS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_PRODUCT_FILTER_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_PRODUCT_FILTER, description: "Use the product search filter to find products. Provides read-only access to reference data needed for filtering (lookup values, consumable values) without granting full access to the master data configuration area.", group: "General" };
export const FP_READ_PRODUCT_FILTER = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_PRODUCT_FILTER_DEF) satisfies FunctionalPermissionSelectType;
