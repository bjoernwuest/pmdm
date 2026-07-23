import type {
    TargetSystemDetailResponse,
    TargetSystemsResponse,
} from "@/types/ConfigurationTypes.ts";
import { createConfigurationEntityApiClient, type ConfigurationEntityKnownUpdatedAt } from "@/ui/api/_configuration_entities.ts";

const targetSystemClient = createConfigurationEntityApiClient<TargetSystemsResponse, TargetSystemDetailResponse>("/target_systems");

/**
 * Loads one page of target systems.
 *
 * @param page Zero-based page index.
 * @param pageSize Number of rows per page.
 * @param includeDisabled Whether disabled rows should be included.
 * @returns Paginated target-system response.
 */
export async function getTargetSystems(page: number, pageSize: number, includeDisabled: boolean): Promise<TargetSystemsResponse> {
    return targetSystemClient.getPage(page, pageSize, includeDisabled);
}

/**
 * Creates a target system.
 *
 * @param name Target-system name.
 * @returns Detail response containing the created row.
 */
export async function createTargetSystem(name: string): Promise<TargetSystemDetailResponse> {
    return targetSystemClient.create(name);
}

/**
 * Renames a target system.
 *
 * @param targetSystemIdentifier Target-system identifier.
 * @param data Update payload containing new name and optimistic-lock timestamp.
 * @returns Detail response containing the updated row.
 */
export async function updateTargetSystem(
    targetSystemIdentifier: string,
    data: { name: string } & ConfigurationEntityKnownUpdatedAt,
): Promise<TargetSystemDetailResponse> {
    return targetSystemClient.update(targetSystemIdentifier, data);
}

/**
 * Enables or disables a target system.
 *
 * @param targetSystemIdentifier Target-system identifier.
 * @param data Disabled-state payload with optimistic-lock timestamp.
 * @returns Detail response containing the updated row.
 */
export async function setTargetSystemDisabled(
    targetSystemIdentifier: string,
    data: { disabled: boolean } & ConfigurationEntityKnownUpdatedAt,
): Promise<TargetSystemDetailResponse> {
    return targetSystemClient.setDisabled(targetSystemIdentifier, data);
}

