import type { PageMeta } from "@/types/PageType.ts";
import {
    createBusinessDomain,
    getBusinessDomains,
    setBusinessDomainDisabled,
    updateBusinessDomain,
} from "@/ui/api/BusinessDomains.ts";
import {
    FP_DO_CONFIGURATION,
    FP_MANAGE_BUSINESS_DOMAINS,
    FP_VIEW_BUSINESS_DOMAINS,
} from "@/ui/auth/functional_permissions.ts";
import { message_CreateBusinessDomain, message_DisableBusinessDomain, message_UpdateBusinessDomain } from "@/types/BusinessDomainType.ts";
import { createConfigurationEntityPage } from "@/ui/pages/_configuration_entity_page_factory.tsx";

export const meta: PageMeta = {
    id: "configuration-business-domains",
    urn: "urn:bun-starter:ui:page:configuration-business-domains",
    path: "/configuration/business-domains",
    title: "Business domains",
    description: "View and manage business domains.",
    menu: {
        section: "Configuration",
        order: 30,
        label: "Business domains",
        parent: "configuration-home",
    },
    requiredFunctionalPermissions: [FP_DO_CONFIGURATION.functionalPermissionName, FP_VIEW_BUSINESS_DOMAINS.functionalPermissionName],
};

const page = createConfigurationEntityPage({
    meta,
    sectionTitle: "Business domains",
    entityLabelSingular: "Business domain",
    entityLabelPlural: "Business domains",
    viewPermissionName: FP_VIEW_BUSINESS_DOMAINS.functionalPermissionName,
    managePermissionName: FP_MANAGE_BUSINESS_DOMAINS.functionalPermissionName,
    pubSubTopics: [{ and: message_CreateBusinessDomain }, { and: message_UpdateBusinessDomain }, { and: message_DisableBusinessDomain }],
    adapters: {
        loadPage: async (page, pageSize, includeDisabled) => {
            const payload = await getBusinessDomains(page, pageSize, includeDisabled);
            return {
                rows: payload.businessDomains,
                total: payload.total,
                page: payload.page,
                pageSize: payload.pageSize,
                availablePageSizes: payload.availablePageSizes,
            };
        },
        createEntity: async (name) => {
            const payload = await createBusinessDomain(name);
            return payload.businessDomain;
        },
        renameEntity: async (identifier, data) => {
            const payload = await updateBusinessDomain(identifier, data);
            return payload.businessDomain;
        },
        setEntityDisabled: async (identifier, data) => {
            const payload = await setBusinessDomainDisabled(identifier, data);
            return payload.businessDomain;
        },
    },
});

/**
 * Business-domain management page component.
 *
 * Subscribes to these PubSub topics through `ConfigurationEntitiesPage`:
 * - `message_CreateBusinessDomain`
 * - `message_UpdateBusinessDomain`
 * - `message_DisableBusinessDomain`
 *
 * @returns Rendered management page.
 */
export function Component() { return page.Component(); }


