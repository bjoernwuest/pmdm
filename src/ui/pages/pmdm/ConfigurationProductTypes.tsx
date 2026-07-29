import type { PageMeta } from "@/types/PageType.ts";
import {
    createProductType,
    getProductTypes,
    setProductTypeDisabled,
    updateProductType,
} from "@/ui/api/ProductTypes.ts";
import {
    FP_DO_CONFIGURATION,
    FP_MANAGE_PRODUCT_TYPES,
    FP_VIEW_PRODUCT_TYPES,
} from "@/ui/auth/app_functional_permissions.ts";
import {
    message_CreateProductType,
    message_DisableProductType,
    message_UpdateProductType,
} from "@/types/ProductTypeType.ts";
import { createConfigurationEntityPage } from "@/ui/components/_configuration_entity_page_factory.tsx";

export const meta: PageMeta = {
    id: "configuration-product-types",
    urn: "urn:bun-starter:ui:page:configuration-product-types",
    path: "/configuration/product-types",
    title: "Product types",
    description: "View and manage product types.",
    menu: {
        section: "Configuration",
        order: 25,
        label: "Product types",
        parent: "configuration-home",
    },
    requiredFunctionalPermissions: [FP_DO_CONFIGURATION.functionalPermissionName, FP_VIEW_PRODUCT_TYPES.functionalPermissionName],
};

const page = createConfigurationEntityPage({
    meta,
    sectionTitle: "Product types",
    entityLabelSingular: "Product type",
    entityLabelPlural: "Product types",
    viewPermissionName: FP_VIEW_PRODUCT_TYPES.functionalPermissionName,
    managePermissionName: FP_MANAGE_PRODUCT_TYPES.functionalPermissionName,
    pubSubTopics: [{ and: message_CreateProductType }, { and: message_UpdateProductType }, { and: message_DisableProductType }],
    rowHref: (row) => `/configuration/product-types/${row.identifier}/datatypes`,
    adapters: {
        loadPage: async (page, pageSize, includeDisabled) => {
            const payload = await getProductTypes(page, pageSize, includeDisabled);
            return {
                rows: payload.productTypes,
                total: payload.total,
                page: payload.page,
                pageSize: payload.pageSize,
                availablePageSizes: payload.availablePageSizes,
            };
        },
        createEntity: async (name) => {
            const payload = await createProductType(name);
            return payload.productType;
        },
        renameEntity: async (identifier, data) => {
            const payload = await updateProductType(identifier, data);
            return payload.productType;
        },
        setEntityDisabled: async (identifier, data) => {
            const payload = await setProductTypeDisabled(identifier, data);
            return payload.productType;
        },
    },
});

/**
 * Product-type management page component.
 *
 * Subscribes to these PubSub topics through `ConfigurationEntitiesPage`:
 * - `message_CreateProductType`
 * - `message_UpdateProductType`
 * - `message_DisableProductType`
 *
 * @returns Rendered management page.
 */
export function Component() { return page.Component(); }


