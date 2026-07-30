import type { ApiInstance } from "@/apps/api.ts";
import { FP_DO_CONFIGURATION, FP_MANAGE_BUSINESS_DOMAINS, FP_VIEW_BUSINESS_DOMAINS } from "@/services/auth/FunctionalPermissions.ts";
import { count, create, disable, enable, get, getByIdentifier, update } from "@/repo/BusinessDomainRepo.ts";
import { BusinessDomainsSelectSchema, message_CreateBusinessDomain, message_DisableBusinessDomain, message_UpdateBusinessDomain } from "@/types/BusinessDomainType.ts";
import { registerConfigurationEntityRoutes } from "@/api/_crud_API.ts";

/**
 * Registers CRUD endpoints for business-domain configuration.
 *
 * Mutating routes trigger PubSub messages through repository methods:
 * - `create.BusinessDomain`
 * - `update.BusinessDomain`
 * - `disable.BusinessDomain`
 *
 * @param app API application instance.
 * @returns Nothing. Routes are attached directly to `app`.
 *
 * Events emitted via `PubSub.publish` by repository mutations:
 * - `message_CreateBusinessDomain`
 * - `message_UpdateBusinessDomain`
 * - `message_DisableBusinessDomain`
 */
// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance): void {
    registerConfigurationEntityRoutes(app, {
        basePath: "/business_domains",
        routeParam: "businessdomainid",
        entityLabel: "Business domain",
        listResponseKey: "businessDomains",
        detailResponseKey: "businessDomain",
        entitySchema: BusinessDomainsSelectSchema,
        viewPermission: FP_VIEW_BUSINESS_DOMAINS,
        managePermission: FP_MANAGE_BUSINESS_DOMAINS,
        gatekeeperPermission: FP_DO_CONFIGURATION,
        repo: { count, get, getByIdentifier, create, update, disable, enable, },
        pubSubTags: [ message_CreateBusinessDomain, message_UpdateBusinessDomain, message_DisableBusinessDomain, ],
    });
}
