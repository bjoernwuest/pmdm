import type { ConfigurationEntity } from "@/types/ConfigurationTypes.ts";
import type { PageMeta } from "@/types/PageType.ts";
import type { TagExpression } from "@/types/PubSubType";
import { ConfigurationEntitiesPage } from "@/ui/components/ConfigurationEntitiesPage.tsx";
import type { ReactElement } from "react";

/**
 * Normalized page payload expected by `ConfigurationEntitiesPage`.
 */
export type ConfigurationEntityPagePayload<T extends ConfigurationEntity = ConfigurationEntity> = {
    rows: T[];
    total: number;
    page: number;
    pageSize: number;
    availablePageSizes: number[];
};

/**
 * Operation adapters passed into one generated configuration page.
 */
export type ConfigurationEntityPageAdapters<T extends ConfigurationEntity = ConfigurationEntity> = {
    loadPage: (page: number, pageSize: number, includeDisabled: boolean) => Promise<ConfigurationEntityPagePayload<T>>;
    createEntity: (name: string) => Promise<T>;
    renameEntity: (identifier: string, data: { name: string; knownUpdatedAt: string }) => Promise<T>;
    setEntityDisabled: (identifier: string, data: { disabled: boolean; knownUpdatedAt: string }) => Promise<T>;
};

/**
 * Static configuration used to generate one configuration-entity page.
 */
export type ConfigurationEntityPageDefinition<T extends ConfigurationEntity = ConfigurationEntity> = {
    meta: PageMeta;
    sectionTitle: string;
    entityLabelSingular: string;
    entityLabelPlural: string;
    viewPermissionName: string;
    managePermissionName: string;
    pubSubTopics: readonly TagExpression[];
    adapters: ConfigurationEntityPageAdapters<T>;
    /** Optional function returning a navigation href for each row. When provided, clicking the row navigates to that path. */
    rowHref?: (row: T) => string;
    /** Optional extra column headers rendered after the standard columns. */
    extraColumnHeaders?: readonly string[];
    /** Optional extra cells rendered per row after the standard columns. */
    renderExtraCells?: (row: T) => React.ReactNode[];
};

/**
 * Creates `{ meta, Component }` exports for simple configuration pages.
 *
 * The resulting component subscribes to all given `pubSubTopics` through
 * `ConfigurationEntitiesPage`, which reacts to repository-emitted events from:
 * - create topic (e.g. `create.BusinessDomain`)
 * - update topic (e.g. `update.BusinessDomain`)
 * - disable/enable topic (e.g. `disable.BusinessDomain`)
 *
 * @typeParam T Row type shown by the page.
 * @param definition Static page metadata and data adapters.
 * @returns A page module object with `meta` and `Component`.
 */
export function createConfigurationEntityPage<T extends ConfigurationEntity = ConfigurationEntity>(
    definition: ConfigurationEntityPageDefinition<T>,
): { meta: PageMeta; Component: () => ReactElement } {
    const Component = () => (
        <ConfigurationEntitiesPage
            urn={definition.meta.urn}
            title={definition.meta.title}
            description={definition.meta.description}
            sectionTitle={definition.sectionTitle}
            entityLabelSingular={definition.entityLabelSingular}
            entityLabelPlural={definition.entityLabelPlural}
            viewPermissionName={definition.viewPermissionName}
            managePermissionName={definition.managePermissionName}
            pubSubTopics={definition.pubSubTopics}
            loadPage={definition.adapters.loadPage}
            createEntity={definition.adapters.createEntity}
            renameEntity={definition.adapters.renameEntity}
            setEntityDisabled={definition.adapters.setEntityDisabled}
            rowHref={definition.rowHref}
            extraColumnHeaders={definition.extraColumnHeaders}
            renderExtraCells={definition.renderExtraCells}
        />
    );

    return {
        meta: definition.meta,
        Component,
    };
}


