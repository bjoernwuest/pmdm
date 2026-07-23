import { useLocation } from "react-router-dom";
import type { PageMeta } from "@/types/PageType.ts";
import { createConsumable, getConsumables, setConsumableDisabled, updateConsumable } from "@/ui/api/Consumables.ts";
import { FP_DO_CONFIGURATION, FP_MANAGE_CONSUMABLES, FP_VIEW_CONSUMABLES } from "@/ui/auth/functional_permissions.ts";
import { message_CreateConsumable, message_DisableConsumable, message_UpdateConsumable } from "@/types/ConsumableType.ts";
import { ConfigurationEntitiesPage } from "./ConfigurationEntitiesPage.tsx";
import type { ConsumableSummary } from "@/types/ConfigurationTypes.ts";

export const meta: PageMeta = {
    id: "configuration-consumables",
    urn: "urn:bun-starter:ui:page:configuration-consumables",
    path: "/configuration/consumables",
    title: "Consumables",
    description: "View and manage consumables.",
    menu: {
        section: "Configuration",
        order: 40,
        label: "Consumables",
        parent: "configuration-home",
    },
    requiredFunctionalPermissions: [FP_DO_CONFIGURATION.functionalPermissionName, FP_VIEW_CONSUMABLES.functionalPermissionName],
};

export function Component() {
    const location = useLocation();
    return (
        <ConfigurationEntitiesPage<ConsumableSummary>
            urn={meta.urn}
            title={meta.title}
            description={meta.description}
            sectionTitle="Consumables"
            entityLabelSingular="Consumable"
            entityLabelPlural="Consumables"
            viewPermissionName={FP_VIEW_CONSUMABLES.functionalPermissionName}
            managePermissionName={FP_MANAGE_CONSUMABLES.functionalPermissionName}
            pubSubTopics={[{ and: message_CreateConsumable }, { and: message_UpdateConsumable }, { and: message_DisableConsumable }]}
            extraColumnHeaders={["Enabled values", "Disabled values", "Used values"]}
            rowHref={(row) => `/configuration/consumables/${encodeURIComponent(row.identifier)}${location.search}`}
            createdEntityHref={(row) => `/configuration/consumables/${encodeURIComponent(row.identifier)}${location.search}`}
            renderExtraCells={(row) => [row.enabledValueCount, row.disabledValueCount, row.usedValueCount]}
            loadPage={async (page, pageSize, includeDisabled) => {
                const payload = await getConsumables(page, pageSize, includeDisabled);
                return {
                    rows: payload.consumables,
                    total: payload.total,
                    page: payload.page,
                    pageSize: payload.pageSize,
                    availablePageSizes: payload.availablePageSizes,
                };
            }}
            createEntity={async (name) => {
                const payload = await createConsumable(name);
                return payload.consumable;
            }}
            renameEntity={async (identifier, data) => {
                const payload = await updateConsumable(identifier, data);
                return payload.consumable;
            }}
            setEntityDisabled={async (identifier, data) => {
                const payload = await setConsumableDisabled(identifier, data);
                return payload.consumable;
            }}
        />
    );
}

