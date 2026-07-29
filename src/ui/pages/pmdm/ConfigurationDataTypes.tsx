import type { PageMeta } from "@/types/PageType.ts";
import { ConfigurationEntitiesPage } from "@/ui/components/ConfigurationEntitiesPage.tsx";
import {
    FP_DO_CONFIGURATION,
    FP_MANAGE_DATA_TYPES,
    FP_VIEW_DATA_TYPES,
} from "@/ui/auth/functional_permissions.ts";
import {
    createDataType,
    getDataTypes,
    setDataTypeDisabled,
    updateDataType,
} from "@/ui/api/DataTypes.ts";
import {
    getBusinessDomains,
} from "@/ui/api/BusinessDomains.ts";
import type {
    DataTypeSummary,
    ConfigurationEntity,
} from "@/types/ConfigurationTypes.ts";
import {
    DataTypeKind,
    message_CreateDataType,
    message_DisableDataType,
    message_UpdateDataType,
} from "@/types/DataTypeType.ts";
import { apiGet } from "@/ui/api";
import { useEffect, useMemo, useState } from "react";

export const meta: PageMeta = {
    id: "configuration-data-types",
    urn: "urn:bun-starter:ui:page:configuration-data-types",
    path: "/configuration/datatypes",
    title: "Data types",
    description: "View and manage data types.",
    menu: {
        section: "Configuration",
        order: 35,
        label: "Data types",
        parent: "configuration-home",
    },
    requiredFunctionalPermissions: [FP_DO_CONFIGURATION.functionalPermissionName, FP_VIEW_DATA_TYPES.functionalPermissionName],
};

/** Kind badge colours for the overview table. */
const kindBadgeClass: Record<string, string> = {
    calculated: "admin-datatype-kind-calculated",
    boolean: "admin-datatype-kind-boolean",
    string: "admin-datatype-kind-string",
    lookup: "admin-datatype-kind-lookup",
    consumable: "admin-datatype-kind-consumable",
    product: "admin-datatype-kind-product",
};

/** Owner dropdown state for create popup. */
type OwnerOption = { identifier: string; name: string };

/** Source option for Lookup/Consumable dropdowns. */
type SourceOption = { identifier: string; name: string };

/**
 * Data-types management page component.
 *
 * Subscribes to these PubSub topics through `ConfigurationEntitiesPage`:
 * - `create.DataType`
 * - `update.DataType`
 * - `disable.DataType`
 *
 * @returns Rendered management page.
 */
export function Component() {
    const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
    const [lookupOptions, setLookupOptions] = useState<SourceOption[]>([]);
    const [consumableOptions, setConsumableOptions] = useState<SourceOption[]>([]);

    // Fetch business domains for the owner dropdown on mount
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const payload = await getBusinessDomains(0, 9999, false);
                if (!cancelled) {
                    setOwnerOptions(payload.businessDomains.map((d) => ({ identifier: d.identifier, name: d.name })));
                }
            } catch {
                // Ignore load errors; dropdown stays empty
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Fetch lookup and consumable lists for source dropdown on mount
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const [lookupsPayload, consumablesPayload] = await Promise.all([
                    apiGet<{ lookups: { lookup: { identifier: string; name: string }; enabledValueCount: number; disabledValueCount: number }[] }>(`/api/lookups?page=0&pageSize=9999`),
                    apiGet<{ consumables: { consumable: { identifier: string; name: string }; enabledValueCount: number; disabledValueCount: number; usedValueCount: number }[] }>(`/api/consumables?page=0&pageSize=9999`),
                ]);
                if (!cancelled) {
                    setLookupOptions(lookupsPayload.lookups.map((l) => ({ identifier: l.lookup.identifier, name: l.lookup.name })));
                    setConsumableOptions(consumablesPayload.consumables.map((c) => ({ identifier: c.consumable.identifier, name: c.consumable.name })));
                }
            } catch {
                // Ignore load errors; dropdown stays empty
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const kindOptions = Object.values(DataTypeKind);

    const ownerNameMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const opt of ownerOptions) map.set(opt.identifier, opt.name);
        return map;
    }, [ownerOptions]);

    return (
        <ConfigurationEntitiesPage<DataTypeSummary>
            urn={meta.urn}
            title={meta.title}
            description={meta.description}
            sectionTitle="Data types"
            entityLabelSingular="Data type"
            entityLabelPlural="Data types"
            viewPermissionName={FP_VIEW_DATA_TYPES.functionalPermissionName}
            managePermissionName={FP_MANAGE_DATA_TYPES.functionalPermissionName}
            pubSubTopics={[{ and: message_CreateDataType }, { and: message_UpdateDataType }, { and: message_DisableDataType }]}
            extraColumnHeaders={["Kind", "Owner"]}
            extraColumnSortAccessor={{
                Kind: (row) => row.kind,
                Owner: (row) => ownerNameMap.get(row.owner) ?? row.owner ?? "",
            }}
            renderExtraCells={(row) => [
                <span key={`${row.identifier}-kind`} className={`mui-pill ${kindBadgeClass[row.kind] ?? "admin-datatype-kind-default"}`}>
                    {row.kind}
                </span>,
                <span key={`${row.identifier}-owner`}>
                    {ownerNameMap.get(row.owner) ?? row.owner ?? <span style={{ fontStyle: "italic", color: "var(--text-color-secondary)" }}>—</span>}
                </span>,
            ]}
            rowHref={(row) => `/configuration/datatypes/${encodeURIComponent(row.identifier)}`}
            createdEntityHref={(row) => `/configuration/datatypes/${encodeURIComponent(row.identifier)}`}
            renderCreateFields={({ values, onChange }) => {
                const currentKind = values.kind ?? kindOptions[0];
                return (
                    <>
                        <label>
                            Kind
                            <select
                                value={currentKind}
                                onChange={(event) => onChange("kind", event.target.value)}
                            >
                                {kindOptions.map((kind) => (
                                    <option key={kind} value={kind}>{kind}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Owner
                            <select
                                value={values.owner ?? ""}
                                onChange={(event) => onChange("owner", event.target.value)}
                            >
                                <option value="" disabled>Select business domain...</option>
                                {ownerOptions.map((domain) => (
                                    <option key={domain.identifier} value={domain.identifier}>{domain.name}</option>
                                ))}
                            </select>
                        </label>
                        {currentKind === DataTypeKind.Lookup ? (
                            <label>
                                Source Lookup
                                <select
                                    value={values.sourceLookup ?? ""}
                                    onChange={(event) => onChange("sourceLookup", event.target.value)}
                                >
                                    <option value="">-- None --</option>
                                    {lookupOptions.map((opt) => (
                                        <option key={opt.identifier} value={opt.identifier}>{opt.name}</option>
                                    ))}
                                </select>
                            </label>
                        ) : null}
                        {currentKind === DataTypeKind.Consumable ? (
                            <label>
                                Source Consumable
                                <select
                                    value={values.sourceConsumable ?? ""}
                                    onChange={(event) => onChange("sourceConsumable", event.target.value)}
                                >
                                    <option value="">-- None --</option>
                                    {consumableOptions.map((opt) => (
                                        <option key={opt.identifier} value={opt.identifier}>{opt.name}</option>
                                    ))}
                                </select>
                            </label>
                        ) : null}
                    </>
                );
            }}
            loadPage={async (page, pageSize, includeDisabled) => {
                const payload = await getDataTypes(page, pageSize, includeDisabled);
                return {
                    rows: payload.dataTypes.map((item: any) => ({
                        ...item.dataType,
                    })) as DataTypeSummary[],
                    total: payload.total,
                    page: payload.page,
                    pageSize: payload.pageSize,
                    availablePageSizes: payload.availablePageSizes,
                };
            }}
            createEntity={async (name, extraFields) => {
                const kind = extraFields?.kind ?? kindOptions[0] ?? "calculated";
                const owner = extraFields?.owner ?? "";
                if (!owner) throw new Error("Owner business domain is required");

                // Build config; config is mandatory for all data type kinds
                let config: Record<string, unknown> = {};
                if (kind === DataTypeKind.Lookup) {
                    if (!extraFields?.sourceLookup) throw new Error("A source Lookup must be selected for Lookup data types");
                    config = { source: extraFields.sourceLookup };
                } else if (kind === DataTypeKind.Consumable) {
                    if (!extraFields?.sourceConsumable) throw new Error("A source Consumable must be selected for Consumable data types");
                    config = { source: extraFields.sourceConsumable };
                }

                const payload = await createDataType({ name, kind, owner, config });
                return payload.dataType;
            }}
            renameEntity={async (identifier, data) => {
                const payload = await updateDataType(identifier, data);
                return payload.dataType;
            }}
            setEntityDisabled={async (identifier, data) => {
                const payload = await setDataTypeDisabled(identifier, data);
                return payload.dataType;
            }}
        />
    );
}
