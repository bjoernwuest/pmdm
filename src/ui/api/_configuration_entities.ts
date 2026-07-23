import { apiGet, apiPatch, apiPost, apiPut } from "./index.ts";

/**
 * Standard optimistic-lock payload used by configuration-entity mutation endpoints.
 */
export type ConfigurationEntityKnownUpdatedAt = {
    knownUpdatedAt: string;
};

/**
 * Creates a typed API client for simple configuration entities.
 *
 * @typeParam TListResponse Response shape of the list endpoint.
 * @typeParam TDetailResponse Response shape of create/update/disable endpoints.
 * @param apiBasePath Base API path without `/api` prefix, e.g. `/business_domains`.
 * @returns API helpers for list/create/update/disable operations.
 */
export function createConfigurationEntityApiClient<TListResponse, TDetailResponse>(apiBasePath: string) {
    return {
        /**
         * Loads one page of rows from the list endpoint.
         *
         * @param page Zero-based page index.
         * @param pageSize Number of rows per page.
         * @param includeDisabled Whether disabled rows should be included.
         * @returns Paginated list response.
         */
        async getPage(page: number, pageSize: number, includeDisabled: boolean): Promise<TListResponse> {
            const includeDisabledParam = includeDisabled ? "&includeDisabled=true" : "";
            return apiGet<TListResponse>(`/api${apiBasePath}?page=${page}&pageSize=${pageSize}${includeDisabledParam}`);
        },

        /**
         * Creates a new row.
         *
         * @param name New entity name.
         * @returns Created-row response.
         */
        async create(name: string): Promise<TDetailResponse> {
            return apiPost<TDetailResponse>(`/api${apiBasePath}`, { name });
        },

        /**
         * Renames an existing row.
         *
         * @param identifier Entity identifier.
         * @param data Mutation payload containing new name and optimistic-lock timestamp.
         * @returns Updated-row response.
         */
        async update(identifier: string, data: { name: string } & ConfigurationEntityKnownUpdatedAt): Promise<TDetailResponse> {
            return apiPut<TDetailResponse>(`/api${apiBasePath}/${encodeURIComponent(identifier)}`, data);
        },

        /**
         * Enables or disables an existing row.
         *
         * @param identifier Entity identifier.
         * @param data Mutation payload containing target disabled-state and optimistic-lock timestamp.
         * @returns Updated-row response.
         */
        async setDisabled(identifier: string, data: { disabled: boolean } & ConfigurationEntityKnownUpdatedAt): Promise<TDetailResponse> {
            return apiPatch<TDetailResponse>(`/api${apiBasePath}/${encodeURIComponent(identifier)}/disabled`, data);
        },
    };
}

