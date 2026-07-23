import type { PageMeta } from "@/types/PageType.ts";
import {
    createTargetSystem,
    getTargetSystems,
    setTargetSystemDisabled,
    updateTargetSystem,
} from "@/ui/api/TargetSystems.ts";
import {
    FP_DO_CONFIGURATION,
    FP_MANAGE_TARGET_SYSTEMS,
    FP_VIEW_TARGET_SYSTEMS,
} from "@/ui/auth/functional_permissions.ts";
import { message_CreateTargetSystem, message_DisableTargetSystem, message_UpdateTargetSystem } from "@/types/TargetSystemType.ts";
import { createConfigurationEntityPage } from "@/ui/pages/_configuration_entity_page_factory.tsx";

export const meta: PageMeta = {
    id: "configuration-target-systems",
    urn: "urn:bun-starter:ui:page:configuration-target-systems",
    path: "/configuration/target-systems",
    title: "Target systems",
    description: "View and manage target systems.",
    menu: {
        section: "Configuration",
        order: 20,
        label: "Target systems",
        parent: "configuration-home",
    },
    requiredFunctionalPermissions: [FP_DO_CONFIGURATION.functionalPermissionName, FP_VIEW_TARGET_SYSTEMS.functionalPermissionName],
};

const page = createConfigurationEntityPage({
    meta,
    sectionTitle: "Target systems",
    entityLabelSingular: "Target system",
    entityLabelPlural: "Target systems",
    viewPermissionName: FP_VIEW_TARGET_SYSTEMS.functionalPermissionName,
    managePermissionName: FP_MANAGE_TARGET_SYSTEMS.functionalPermissionName,
    pubSubTopics: [{ and: message_CreateTargetSystem }, { and: message_UpdateTargetSystem }, { and: message_DisableTargetSystem }],
    adapters: {
        loadPage: async (page, pageSize, includeDisabled) => {
            const payload = await getTargetSystems(page, pageSize, includeDisabled);
            return {
                rows: payload.targetSystems,
                total: payload.total,
                page: payload.page,
                pageSize: payload.pageSize,
                availablePageSizes: payload.availablePageSizes,
            };
        },
        createEntity: async (name) => {
            const payload = await createTargetSystem(name);
            return payload.targetSystem;
        },
        renameEntity: async (identifier, data) => {
            const payload = await updateTargetSystem(identifier, data);
            return payload.targetSystem;
        },
        setEntityDisabled: async (identifier, data) => {
            const payload = await setTargetSystemDisabled(identifier, data);
            return payload.targetSystem;
        },
    },
});

/**
 * Target-system management page component.
 *
 * Subscribes to these PubSub topics through `ConfigurationEntitiesPage`:
 * - `message_CreateTargetSystem`
 * - `message_UpdateTargetSystem`
 * - `message_DisableTargetSystem`
 *
 * @returns Rendered management page.
 */
export function Component() { return page.Component(); }


