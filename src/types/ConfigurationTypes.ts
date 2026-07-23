export type ConfigurationEntity = {
    identifier: string;
    name: string;
    disabled: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: string | null;
    updatedBy: string | null;
};

/**
 * Generic paginated response for simple configuration entities.
 */
export type ConfigurationEntitiesResponse<TKey extends string> = {
    [K in TKey]: ConfigurationEntity[];
} & {
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
    includeDisabled: boolean;
};

/**
 * Generic detail response for one configuration entity.
 */
export type ConfigurationEntityDetailResponse<TKey extends string> = {
    [K in TKey]: ConfigurationEntity;
};

export type TargetSystemsResponse = ConfigurationEntitiesResponse<"targetSystems">;

export type TargetSystemDetailResponse = ConfigurationEntityDetailResponse<"targetSystem">;

export type BusinessDomainsResponse = ConfigurationEntitiesResponse<"businessDomains">;

export type BusinessDomainDetailResponse = ConfigurationEntityDetailResponse<"businessDomain">;

export type ProductTypesResponse = ConfigurationEntitiesResponse<"productTypes">;

export type ProductTypeDetailResponse = ConfigurationEntityDetailResponse<"productType">;

export type ConsumableEntity = ConfigurationEntity & {
    description: string | null;
};

export type LookupEntity = ConfigurationEntity & {
    description: string | null;
    sourceSystem: string;
};

export type ConsumableSummary = ConsumableEntity & {
    enabledValueCount: number;
    disabledValueCount: number;
    usedValueCount: number;
};

export type LookupSummary = LookupEntity & {
    enabledValueCount: number;
    disabledValueCount: number;
};

export type ConsumableValue = {
    identifier: string;
    name: string;
    disabled: boolean;
    createdAt: string;
    updatedAt: string;
    isUsed: boolean;
    consumableIdentifier: string;
};

export type LookupValue = {
    identifier: string;
    name: string;
    disabled: boolean;
    createdAt: string;
    updatedAt: string;
    sourceSystemIdentifier: string | null;
    lookupIdentifier: string;
};

export type ConsumablesResponse = {
    consumables: ConsumableSummary[];
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
    includeDisabled: boolean;
};

export type ConsumableDetailResponse = {
    consumable: ConsumableEntity;
};

export type ConsumableValuesResponse = {
    values: ConsumableValue[];
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
    includeDisabled: boolean;
    showUsed: boolean;
};

export type LookupResponse = {
    lookups: LookupSummary[];
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
    includeDisabled: boolean;
};

export type LookupDetailResponse = {
    lookup: LookupEntity;
};

export type LookupValuesResponse = {
    values: LookupValue[];
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
    includeDisabled: boolean;
};

/** Data type summary row shown on the overview page. */
export type DataTypeSummary = ConfigurationEntity & {
    kind: string;
    owner: string;
};

/** Data type detail shape including full config and owner name. */
export type DataTypeEntity = DataTypeSummary & {
    description: string | null;
    mandatory: boolean | string;
    requestorCanEdit: boolean | string;
    config: Record<string, unknown>;
    ownerBusinessDomainName: string | null;
};

/** One data type group-role permission assignment. */
export type DataTypePermissionEntry = {
    dataTypeIdentifier: string;
    groupIdentifier: string;
    groupName: string;
    role: "viewer" | "writer" | "approver";
    showByDefault: boolean;
    createdAt: string;
    createdBy: string;
};

/** Response shape for the data type list endpoint. */
export type DataTypesResponse = {
    dataTypes: DataTypeSummary[];
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
    includeDisabled: boolean;
};

/** Response shape for data type detail / create / update endpoints. */
export type DataTypeDetailResponse = {
    dataType: DataTypeEntity;
};

/** Response shape for data type permissions list. */
export type DataTypePermissionsResponse = {
    permissions: DataTypePermissionEntry[];
};

/** Response shape for granting a permission. */
export type DataTypeGrantPermissionResponse = {
    permission: DataTypePermissionEntry;
};

