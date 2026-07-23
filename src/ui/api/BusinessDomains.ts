import type {
    BusinessDomainDetailResponse,
    BusinessDomainsResponse,
} from "@/types/ConfigurationTypes.ts";
import { createConfigurationEntityApiClient, type ConfigurationEntityKnownUpdatedAt } from "@/ui/api/_configuration_entities.ts";

const businessDomainClient = createConfigurationEntityApiClient<BusinessDomainsResponse, BusinessDomainDetailResponse>("/business_domains");

/**
 * Loads one page of business domains.
 *
 * @param page Zero-based page index.
 * @param pageSize Number of rows per page.
 * @param includeDisabled Whether disabled rows should be included.
 * @returns Paginated business-domain response.
 */
export async function getBusinessDomains(page: number, pageSize: number, includeDisabled: boolean): Promise<BusinessDomainsResponse> {
    return businessDomainClient.getPage(page, pageSize, includeDisabled);
}

/**
 * Creates a business domain.
 *
 * @param name Business-domain name.
 * @returns Detail response containing the created row.
 */
export async function createBusinessDomain(name: string): Promise<BusinessDomainDetailResponse> {
    return businessDomainClient.create(name);
}

/**
 * Renames a business domain.
 *
 * @param businessDomainIdentifier Business-domain identifier.
 * @param data Update payload containing new name and optimistic-lock timestamp.
 * @returns Detail response containing the updated row.
 */
export async function updateBusinessDomain(
    businessDomainIdentifier: string,
    data: { name: string } & ConfigurationEntityKnownUpdatedAt,
): Promise<BusinessDomainDetailResponse> {
    return businessDomainClient.update(businessDomainIdentifier, data);
}

/**
 * Enables or disables a business domain.
 *
 * @param businessDomainIdentifier Business-domain identifier.
 * @param data Disabled-state payload with optimistic-lock timestamp.
 * @returns Detail response containing the updated row.
 */
export async function setBusinessDomainDisabled(
    businessDomainIdentifier: string,
    data: { disabled: boolean } & ConfigurationEntityKnownUpdatedAt,
): Promise<BusinessDomainDetailResponse> {
    return businessDomainClient.setDisabled(businessDomainIdentifier, data);
}

