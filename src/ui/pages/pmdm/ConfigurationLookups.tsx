import { useLocation } from "react-router-dom";
import type { PageMeta } from "@/types/PageType.ts";
import { createLookup, getLookups, setLookupDisabled, updateLookup } from "@/ui/api/Lookups.ts";
import { FP_DO_CONFIGURATION, FP_MANAGE_LOOKUPS, FP_VIEW_LOOKUPS } from "@/ui/auth/functional_permissions.ts";
import { message_CreateLookup, message_DisableLookup, message_UpdateLookup } from "@/types/LookupsType.ts";
import { ConfigurationEntitiesPage } from "@/ui/components/ConfigurationEntitiesPage.tsx";
import type { LookupSummary } from "@/types/ConfigurationTypes.ts";

export const meta: PageMeta = {
    id: "configuration-lookups",
    urn: "urn:bun-starter:ui:page:configuration-lookups",
    path: "/configuration/lookups",
    title: "Lookups",
    description: "View and manage lookups.",
    menu: {
        section: "Configuration",
        order: 50,
        label: "Lookups",
        parent: "configuration-home",
    },
    requiredFunctionalPermissions: [FP_DO_CONFIGURATION.functionalPermissionName, FP_VIEW_LOOKUPS.functionalPermissionName],
};

export function Component() {
    const location = useLocation();
    return (
        <ConfigurationEntitiesPage<LookupSummary>
            urn={meta.urn}
            title={meta.title}
            description={meta.description}
            sectionTitle="LookupsSchema"
            entityLabelSingular="Lookup"
            entityLabelPlural="LookupsSchema"
            viewPermissionName={FP_VIEW_LOOKUPS.functionalPermissionName}
            managePermissionName={FP_MANAGE_LOOKUPS.functionalPermissionName}
            pubSubTopics={[{ and: message_CreateLookup }, { and: message_UpdateLookup }, { and: message_DisableLookup }]}
            extraColumnHeaders={["Enabled values", "Disabled values"]}
            rowHref={(row) => `/configuration/lookups/${encodeURIComponent(row.identifier)}${location.search}`}
            createdEntityHref={(row) => `/configuration/lookups/${encodeURIComponent(row.identifier)}${location.search}`}
            renderExtraCells={(row) => [row.enabledValueCount, row.disabledValueCount]}
            loadPage={async (page, pageSize, includeDisabled) => {
                const payload = await getLookups(page, pageSize, includeDisabled);
                return {
                    rows: payload.lookups,
                    total: payload.total,
                    page: payload.page,
                    pageSize: payload.pageSize,
                    availablePageSizes: payload.availablePageSizes,
                };
            }}
            createEntity={async (name, extraFields) => {
                const payload = await createLookup(name, extraFields?.sourceSystem);
                return payload.lookup;
            }}
            renameEntity={async (identifier, data) => {
                const payload = await updateLookup(identifier, data);
                return payload.lookup;
            }}
            setEntityDisabled={async (identifier, data) => {
                const payload = await setLookupDisabled(identifier, data);
                return payload.lookup;
            }}
            extraCreateFields={[{ key: "sourceSystem", label: "Source system" }]}
        />
    );
}
