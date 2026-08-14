import { registerFunctionalPermission } from "@/repo/FunctionalPermissionRepo.ts";
import type { DBClient } from "@/services/DatabaseDriver.ts";
import { applicationFunctionalPermissions } from "@/services/auth/ApplicationDefinedFunctionalPermissions.ts";

/**
 * Populates the application-defined `FP_*` placeholder constants with their
 * registered database rows (DB-generated `identifier`, `createdAt`, `updatedAt`).
 *
 * The shared `registerFunctionalPermissions()` startup loop (called from
 * `src/main.ts` before autostart tasks) already persists the pure insert-type
 * definitions; this task re-upserts them (idempotent) to obtain the registered
 * rows and assigns them into the exported constants. Autostart tasks run before
 * the server starts listening, so identifiers are populated before any request
 * is served.
 */
export async function start(db: DBClient): Promise<void> {
    for (const fp of applicationFunctionalPermissions) {
        const registered = await registerFunctionalPermission(db, {
            functionalPermissionName: fp.functionalPermissionName,
            description: fp.description,
            group: fp.group,
        });
        Object.assign(fp, registered);
    }
}
