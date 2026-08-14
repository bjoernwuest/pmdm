// Applications using this template are encouraged to place their functional permissions in
// this file and not in `FunctionalPermissions.ts` to achieve stability with upgrades of the template.
//
// Each exported `FP_*` constant is typed `FunctionalPermissionSelectType`: its
// `identifier`/`createdAt`/`updatedAt` start as empty-string placeholders and are
// overwritten with the DB-generated values at startup (see
// `src/autostart/app-functional-permissions.ts`, which runs before the server listens).
// `functionalPermissionDefinitions` feeds the shared `registerFunctionalPermissions()`
// startup loop with pure insert-type objects (placeholders stripped) so DB-generated
// values are never overridden.

import type { FunctionalPermissionInsertType, FunctionalPermissionSelectType } from "@/types/FunctionalPermissionType.ts";
import { FunctionalPermissionNames } from "@/ui/auth/app_functional_permissions.ts";

const registrationPlaceholders = { identifier: "", createdAt: "", updatedAt: "" } as const;

export const FP_VIEW_DATA_TYPES: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_DATA_TYPES, description: "View data type definitions — the field types available for product type configuration.", group: "Configuration", ...registrationPlaceholders };

export const FP_MANAGE_DATA_TYPES: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_DATA_TYPES, description: "Create, edit, enable, or disable data types. Also grants access to script execution and script log features.", group: "Configuration", ...registrationPlaceholders };

export const FP_DO_CONFIGURATION: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_DO_CONFIGURATION, description: "Access the master data configuration area. Required alongside domain-specific permissions for lookups and consumables.", group: "Configuration", ...registrationPlaceholders };

export const FP_VIEW_TARGET_SYSTEMS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_TARGET_SYSTEMS, description: "View the list of target systems — the external systems that product change requests get exported to.", group: "Configuration", ...registrationPlaceholders };

export const FP_MANAGE_TARGET_SYSTEMS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_TARGET_SYSTEMS, description: "Create, edit, enable, or disable target system definitions.", group: "Configuration", ...registrationPlaceholders };

export const FP_VIEW_PRODUCT_TYPES: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCT_TYPES, description: "View product type definitions and their data type assignments.", group: "Configuration", ...registrationPlaceholders };

export const FP_MANAGE_PRODUCT_TYPES: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_PRODUCT_TYPES, description: "Create, edit, enable, or disable product types. Also assign and reorder data types on product types.", group: "Configuration", ...registrationPlaceholders };

export const FP_VIEW_BUSINESS_DOMAINS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_BUSINESS_DOMAINS, description: "View business domain definitions — categories used to organize products.", group: "Configuration", ...registrationPlaceholders };

export const FP_MANAGE_BUSINESS_DOMAINS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_BUSINESS_DOMAINS, description: "Create, edit, enable, or disable business domain definitions.", group: "Configuration", ...registrationPlaceholders };

export const FP_VIEW_CONSUMABLES: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_CONSUMABLES, description: "View consumable master data definitions and their values. Requires FP_DO_CONFIGURATION alongside this permission.", group: "Configuration", ...registrationPlaceholders };

export const FP_MANAGE_CONSUMABLES: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_CONSUMABLES, description: "Create, edit, enable, or disable consumable master data and their values. Requires FP_DO_CONFIGURATION alongside this permission.", group: "Configuration", ...registrationPlaceholders };

export const FP_VIEW_LOOKUPS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_LOOKUPS, description: "View lookup table definitions and their values. Requires FP_DO_CONFIGURATION alongside this permission.", group: "Configuration", ...registrationPlaceholders };

export const FP_MANAGE_LOOKUPS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_LOOKUPS, description: "Create, edit, enable, or disable lookup tables and their values. Requires FP_DO_CONFIGURATION alongside this permission.", group: "Configuration", ...registrationPlaceholders };

export const FP_VIEW_PRODUCTS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCTS, description: "Search for and view products and their detailed field values. Also view product change requests and their details.", group: "General", ...registrationPlaceholders };

export const FP_CREATE_PRODUCT: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_PRODUCT, description: "Create brand-new products and import products from files (such as XLSX or CSV). Also create new product change requests.", group: "General", ...registrationPlaceholders };

export const FP_UPDATE_PRODUCT: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_UPDATE_PRODUCT, description: "Edit existing product data — modify field values on a product directly.", group: "General", ...registrationPlaceholders };

export const FP_DISABLE_PRODUCT: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_DISABLE_PRODUCT, description: "Mark products as disabled (inactive) or re-enable previously disabled products.", group: "General", ...registrationPlaceholders };

export const FP_REQUEST_PRODUCT_UPDATE: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_REQUEST_PRODUCT_UPDATE, description: "Submit a request that a product's data be updated — creates a product change request rather than modifying the product directly.", group: "General", ...registrationPlaceholders };

export const FP_CREATE_PRODUCT_COPY: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_PRODUCT_COPY, description: "Create a duplicate of an existing product — copies the product number base with all its field values.", group: "General", ...registrationPlaceholders };

export const FP_VIEW_PRODUCT_EXPORTS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCT_EXPORTS, description: "Access the product exports management page and view the list of pending product change requests awaiting export to target systems.", group: "General", ...registrationPlaceholders };

export const FP_EXPORT_PRODUCT_REQUESTS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_EXPORT_PRODUCT_REQUESTS, description: "Export product change requests to XLSX, CSV, or JSON files for delivery to target systems. Also mark requests as having been exported.", group: "General", ...registrationPlaceholders };

export const FP_CONFIRM_IMPORT: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_CONFIRM_IMPORT, description: "Confirm that a product change request file has been successfully imported into a target system by its operators.", group: "General", ...registrationPlaceholders };

export const FP_EDIT_EXPORT_STATUS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_EDIT_EXPORT_STATUS, description: "Manually change the export or import status of a product change request on the exports page. Requires either FP_EXPORT_PRODUCT_REQUESTS or FP_CONFIRM_IMPORT alongside it.", group: "General", ...registrationPlaceholders };

export const FP_NOTIFICATIONS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_NOTIFICATIONS, description: "Configure the email notification system — set recipients and schedules. Also manually trigger notification sends or simulate them for testing purposes.", group: "Admin", ...registrationPlaceholders };

export const FP_READ_PRODUCT_FILTER: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_PRODUCT_FILTER, description: "Use the product search filter to find products. Provides read-only access to reference data needed for filtering (lookup values, consumable values) without granting full access to the master data configuration area.", group: "General", ...registrationPlaceholders };

/** All application-defined permissions; populated with registered rows at startup. */
export const applicationFunctionalPermissions: FunctionalPermissionSelectType[] = [
    FP_VIEW_DATA_TYPES,
    FP_MANAGE_DATA_TYPES,
    FP_DO_CONFIGURATION,
    FP_VIEW_TARGET_SYSTEMS,
    FP_MANAGE_TARGET_SYSTEMS,
    FP_VIEW_PRODUCT_TYPES,
    FP_MANAGE_PRODUCT_TYPES,
    FP_VIEW_BUSINESS_DOMAINS,
    FP_MANAGE_BUSINESS_DOMAINS,
    FP_VIEW_CONSUMABLES,
    FP_MANAGE_CONSUMABLES,
    FP_VIEW_LOOKUPS,
    FP_MANAGE_LOOKUPS,
    FP_VIEW_PRODUCTS,
    FP_CREATE_PRODUCT,
    FP_UPDATE_PRODUCT,
    FP_DISABLE_PRODUCT,
    FP_REQUEST_PRODUCT_UPDATE,
    FP_CREATE_PRODUCT_COPY,
    FP_VIEW_PRODUCT_EXPORTS,
    FP_EXPORT_PRODUCT_REQUESTS,
    FP_CONFIRM_IMPORT,
    FP_EDIT_EXPORT_STATUS,
    FP_NOTIFICATIONS,
    FP_READ_PRODUCT_FILTER,
];

/** Pure insert-type definitions for the shared `registerFunctionalPermissions()` startup loop. */
export const functionalPermissionDefinitions: FunctionalPermissionInsertType[] = applicationFunctionalPermissions.map((fp) => ({
    functionalPermissionName: fp.functionalPermissionName,
    description: fp.description,
    group: fp.group,
}));
