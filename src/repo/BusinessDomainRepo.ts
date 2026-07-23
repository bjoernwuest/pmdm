import { message_CreateBusinessDomain, message_DisableBusinessDomain, message_UpdateBusinessDomain } from "@/types/BusinessDomainType.ts";
import { BusinessDomains } from "@/schema/BusinessDomainSchema.ts";
import { createConfigurationRepository } from "./_crud_Repo.ts";

/**
 * Returns the total number of business domains.
 *
 * By default, disabled business domains are excluded from the count.
 *
 * @param db Database client instance.
 * @param includeDisabled Whether disabled business domains should be included.
 * @returns Total number of matching business domains.
 */
export const BusinessDomainRepo = createConfigurationRepository(BusinessDomains, { create: message_CreateBusinessDomain, update: message_UpdateBusinessDomain, disable: message_DisableBusinessDomain, });

export const { count, get, getByIdentifier, create, update, disable, enable } = BusinessDomainRepo;
