import type { ApiInstance } from "@/apps/api.ts";
import { FP_DO_CONFIGURATION, FP_MANAGE_TARGET_SYSTEMS, FP_VIEW_TARGET_SYSTEMS } from "@/services/auth/FunctionalPermissions.ts";
import { count, create, disable, enable, get, getByIdentifier, update } from "@/repo/TargetSystemRepo.ts";
import {
    message_CreateTargetSystem,
    message_DisableTargetSystem,
    message_UpdateTargetSystem,
    TargetSystemsSelectSchema
} from "@/types/TargetSystemType.ts";
import { registerConfigurationEntityRoutes } from "@/api/_crud_API.ts";

/**
 * Registers CRUD endpoints for target-system configuration.
 *
 * Mutating routes trigger PubSub messages through repository methods:
 * - `create.TargetSystem`
 * - `update.TargetSystem`
 * - `disable.TargetSystem`
 *
 * @param app API application instance.
 * @returns Nothing. Routes are attached directly to `app`.
 *
 * Events emitted via `PubSub.publish` by repository mutations:
 * - `message_CreateTargetSystem`
 * - `message_UpdateTargetSystem`
 * - `message_DisableTargetSystem`
 */
// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance): void {
    registerConfigurationEntityRoutes(app, {
        basePath: "/target_systems",
        routeParam: "targetsystemid",
        entityLabel: "Target system",
        listResponseKey: "targetSystems",
        detailResponseKey: "targetSystem",
        entitySchema: TargetSystemsSelectSchema,
        viewPermission: FP_VIEW_TARGET_SYSTEMS,
        managePermission: FP_MANAGE_TARGET_SYSTEMS,
        gatekeeperPermission: FP_DO_CONFIGURATION,
        repo: { count, get, getByIdentifier, create, update, disable, enable, },
        pubSubTags: [ message_CreateTargetSystem, message_UpdateTargetSystem, message_DisableTargetSystem, ],
    });
}
