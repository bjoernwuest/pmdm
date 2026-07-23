// Applications using this template are encouraged to place their functional permission in this file and not in `functional_perms.ts` to achieve stability with upgrades of the template.

/**
 * Canonical functional permission names shared by UI and server-side registration.
 *
 * We use an `as const` object (enum-like) to keep literal string unions and
 * preserve maximum type-safety across build targets.
 */
export const FunctionalPermissionNames = {
    FP_DO_CONFIGURATION: "do_configuration",
    FP_VIEW_TARGET_SYSTEMS: "view_target_systems",
    FP_MANAGE_TARGET_SYSTEMS: "manage_target_systems",
    FP_VIEW_PRODUCT_TYPES: "view_product_types",
    FP_MANAGE_PRODUCT_TYPES: "manage_product_types",
    FP_VIEW_BUSINESS_DOMAINS: "view_business_domains",
    FP_MANAGE_BUSINESS_DOMAINS: "manage_business_domains",
    FP_VIEW_CONSUMABLES: "view_consumables",
    FP_MANAGE_CONSUMABLES: "manage_consumables",
    FP_VIEW_LOOKUPS: "view_lookups",
    FP_MANAGE_LOOKUPS: "manage_lookups",
    FP_VIEW_DATA_TYPES: "view_data_types",
    FP_MANAGE_DATA_TYPES: "manage_data_types",
    FP_VIEW_PRODUCTS: "view_products",
    FP_CREATE_PRODUCT: "create_product",
    FP_UPDATE_PRODUCT: "update_product",
    FP_DISABLE_PRODUCT: "disable_product",
    FP_REQUEST_PRODUCT_UPDATE: "request_product_update",
    FP_CREATE_PRODUCT_COPY: "create_product_copy",
    FP_VIEW_PRODUCT_EXPORTS: "view_product_exports",
    FP_EXPORT_PRODUCT_REQUESTS: "export_product_requests",
    FP_CONFIRM_IMPORT: "confirm_import",
    FP_EDIT_EXPORT_STATUS: "edit_export_status",
    FP_NOTIFICATIONS: "FP_NOTIFICATIONS",
    FP_READ_PRODUCT_FILTER: "read_product_filter",
} as const;


export const FP_DO_CONFIGURATION = { functionalPermissionName: FunctionalPermissionNames.FP_DO_CONFIGURATION } as const;
export const FP_VIEW_TARGET_SYSTEMS = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_TARGET_SYSTEMS } as const;
export const FP_MANAGE_TARGET_SYSTEMS = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_TARGET_SYSTEMS } as const;
export const FP_VIEW_PRODUCT_TYPES = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCT_TYPES } as const;
export const FP_MANAGE_PRODUCT_TYPES = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_PRODUCT_TYPES } as const;
export const FP_VIEW_BUSINESS_DOMAINS = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_BUSINESS_DOMAINS } as const;
export const FP_MANAGE_BUSINESS_DOMAINS = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_BUSINESS_DOMAINS } as const;
export const FP_VIEW_CONSUMABLES = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_CONSUMABLES } as const;
export const FP_MANAGE_CONSUMABLES = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_CONSUMABLES } as const;
export const FP_VIEW_LOOKUPS = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_LOOKUPS } as const;
export const FP_MANAGE_LOOKUPS = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_LOOKUPS } as const;
export const FP_VIEW_DATA_TYPES = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_DATA_TYPES } as const;
export const FP_MANAGE_DATA_TYPES = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_DATA_TYPES } as const;
export const FP_VIEW_PRODUCTS = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCTS } as const;
export const FP_CREATE_PRODUCT = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_PRODUCT } as const;
export const FP_UPDATE_PRODUCT = { functionalPermissionName: FunctionalPermissionNames.FP_UPDATE_PRODUCT } as const;
export const FP_DISABLE_PRODUCT = { functionalPermissionName: FunctionalPermissionNames.FP_DISABLE_PRODUCT } as const;
export const FP_REQUEST_PRODUCT_UPDATE = { functionalPermissionName: FunctionalPermissionNames.FP_REQUEST_PRODUCT_UPDATE } as const;
export const FP_CREATE_PRODUCT_COPY = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_PRODUCT_COPY } as const;
export const FP_VIEW_PRODUCT_EXPORTS = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_PRODUCT_EXPORTS } as const;
export const FP_EXPORT_PRODUCT_REQUESTS = { functionalPermissionName: FunctionalPermissionNames.FP_EXPORT_PRODUCT_REQUESTS } as const;
export const FP_CONFIRM_IMPORT = { functionalPermissionName: FunctionalPermissionNames.FP_CONFIRM_IMPORT } as const;
export const FP_EDIT_EXPORT_STATUS = { functionalPermissionName: FunctionalPermissionNames.FP_EDIT_EXPORT_STATUS } as const;
export const FP_NOTIFICATIONS = { functionalPermissionName: FunctionalPermissionNames.FP_NOTIFICATIONS } as const;
export const FP_READ_PRODUCT_FILTER = { functionalPermissionName: FunctionalPermissionNames.FP_READ_PRODUCT_FILTER } as const;
