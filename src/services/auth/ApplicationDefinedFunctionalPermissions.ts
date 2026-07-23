// Applications using this template are encouraged to place their functional permission in this file and not in `functional_perms.ts` to achieve stability with upgrades of the template.

import type { FunctionalPermissionSelectType, FunctionalPermissionInsertType } from "@/types/FunctionalPermissionType.ts";
import { FunctionalPermissionNames } from "@/ui/auth/functional_permissions.ts";
import { registerFunctionalPermission } from "@/repo/FunctionalPermissionRepo.ts";
import { getDatabaseConnection } from "@/services/DatabaseDriver.ts";

const FP_VIEW_DATA_TYPES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_DATA_TYPES, description: "Permitted to view data types.", group: "Configuration" };
export const FP_VIEW_DATA_TYPES = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_DATA_TYPES_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_DATA_TYPES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_DATA_TYPES, description: "Permitted to create, edit, enable, and disable data types.", group: "Configuration" };
export const FP_MANAGE_DATA_TYPES = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_DATA_TYPES_DEF) satisfies FunctionalPermissionSelectType;

const FP_DO_CONFIGURATION_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_DO_CONFIGURATION, description: "Permitted to access the configuration section in the UI.", group: "Configuration" };
export const FP_DO_CONFIGURATION = await registerFunctionalPermission(getDatabaseConnection(), FP_DO_CONFIGURATION_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_TARGET_SYSTEMS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_TARGET_SYSTEMS, description: "Permitted to view target systems.", group: "Configuration" };
export const FP_VIEW_TARGET_SYSTEMS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_TARGET_SYSTEMS_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_TARGET_SYSTEMS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_TARGET_SYSTEMS, description: "Permitted to create, edit, enable, and disable target systems.", group: "Configuration" };
export const FP_MANAGE_TARGET_SYSTEMS = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_TARGET_SYSTEMS_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_PRODUCT_TYPES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCT_TYPES, description: "Permitted to view product types.", group: "Configuration" };
export const FP_VIEW_PRODUCT_TYPES = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_PRODUCT_TYPES_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_PRODUCT_TYPES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_PRODUCT_TYPES, description: "Permitted to create, edit, enable, and disable product types.", group: "Configuration" };
export const FP_MANAGE_PRODUCT_TYPES = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_PRODUCT_TYPES_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_BUSINESS_DOMAINS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_BUSINESS_DOMAINS, description: "Permitted to view business domains.", group: "Configuration" };
export const FP_VIEW_BUSINESS_DOMAINS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_BUSINESS_DOMAINS_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_BUSINESS_DOMAINS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_BUSINESS_DOMAINS, description: "Permitted to create, edit, enable, and disable business domains.", group: "Configuration" };
export const FP_MANAGE_BUSINESS_DOMAINS = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_BUSINESS_DOMAINS_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_CONSUMABLES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_CONSUMABLES, description: "Permitted to view consumables and consumable values.", group: "Configuration" };
export const FP_VIEW_CONSUMABLES = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_CONSUMABLES_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_CONSUMABLES_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_CONSUMABLES, description: "Permitted to create, edit, enable, and disable consumables and consumable values.", group: "Configuration" };
export const FP_MANAGE_CONSUMABLES = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_CONSUMABLES_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_LOOKUPS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_LOOKUPS, description: "Permitted to view lookups and lookup values.", group: "Configuration" };
export const FP_VIEW_LOOKUPS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_LOOKUPS_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_LOOKUPS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_LOOKUPS, description: "Permitted to create, edit, enable, and disable lookups and lookup values.", group: "Configuration" };
export const FP_MANAGE_LOOKUPS = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_LOOKUPS_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_PRODUCTS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCTS, description: "Permitted to view products.", group: "General" };
export const FP_VIEW_PRODUCTS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_PRODUCTS_DEF) satisfies FunctionalPermissionSelectType;

const FP_CREATE_PRODUCT_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_PRODUCT, description: "Permitted to create and import products.", group: "General" };
export const FP_CREATE_PRODUCT = await registerFunctionalPermission(getDatabaseConnection(), FP_CREATE_PRODUCT_DEF) satisfies FunctionalPermissionSelectType;

const FP_UPDATE_PRODUCT_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_UPDATE_PRODUCT, description: "Permitted to update products.", group: "General" };
export const FP_UPDATE_PRODUCT = await registerFunctionalPermission(getDatabaseConnection(), FP_UPDATE_PRODUCT_DEF) satisfies FunctionalPermissionSelectType;

const FP_DISABLE_PRODUCT_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_DISABLE_PRODUCT, description: "Permitted to disable/enable products.", group: "General" };
export const FP_DISABLE_PRODUCT = await registerFunctionalPermission(getDatabaseConnection(), FP_DISABLE_PRODUCT_DEF) satisfies FunctionalPermissionSelectType;

const FP_REQUEST_PRODUCT_UPDATE_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_REQUEST_PRODUCT_UPDATE, description: "Permitted to request updates on products.", group: "General" };
export const FP_REQUEST_PRODUCT_UPDATE = await registerFunctionalPermission(getDatabaseConnection(), FP_REQUEST_PRODUCT_UPDATE_DEF) satisfies FunctionalPermissionSelectType;

const FP_CREATE_PRODUCT_COPY_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_PRODUCT_COPY, description: "Permitted to create copies of products.", group: "General" };
export const FP_CREATE_PRODUCT_COPY = await registerFunctionalPermission(getDatabaseConnection(), FP_CREATE_PRODUCT_COPY_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_PRODUCT_EXPORTS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCT_EXPORTS, description: "View the product exports management page and list of pending exports.", group: "General" };
export const FP_VIEW_PRODUCT_EXPORTS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_PRODUCT_EXPORTS_DEF) satisfies FunctionalPermissionSelectType;

const FP_EXPORT_PRODUCT_REQUESTS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_EXPORT_PRODUCT_REQUESTS, description: "Export product requests to XLSX/CSV/JSON for a target system. Also marks the export as 'exported'.", group: "General" };
export const FP_EXPORT_PRODUCT_REQUESTS = await registerFunctionalPermission(getDatabaseConnection(), FP_EXPORT_PRODUCT_REQUESTS_DEF) satisfies FunctionalPermissionSelectType;

const FP_CONFIRM_IMPORT_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_CONFIRM_IMPORT, description: "Confirm that a product request was successfully imported into a target system.", group: "General" };
export const FP_CONFIRM_IMPORT = await registerFunctionalPermission(getDatabaseConnection(), FP_CONFIRM_IMPORT_DEF) satisfies FunctionalPermissionSelectType;

const FP_EDIT_EXPORT_STATUS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_EDIT_EXPORT_STATUS, description: "Change the export status dropdown on the product exports page.", group: "General" };
export const FP_EDIT_EXPORT_STATUS = await registerFunctionalPermission(getDatabaseConnection(), FP_EDIT_EXPORT_STATUS_DEF) satisfies FunctionalPermissionSelectType;

const FP_NOTIFICATIONS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_NOTIFICATIONS, description: "Access to the email notification system configuration and manual send/simulate features.", group: "Admin" };
export const FP_NOTIFICATIONS = await registerFunctionalPermission(getDatabaseConnection(), FP_NOTIFICATIONS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_PRODUCT_FILTER_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_PRODUCT_FILTER, description: "Permitted to use the product filter and read reference data (product types, data types, lookup values, consumable values) needed for filtering.", group: "General" };
export const FP_READ_PRODUCT_FILTER = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_PRODUCT_FILTER_DEF) satisfies FunctionalPermissionSelectType;
