import type {FunctionalPermissionSelectType} from "@/types/FunctionalPermissionType.ts";
import { registerFunctionalPermission } from "@/repo/FunctionalPermissionRepo.ts";
import type { DBClient } from "@/services/DatabaseDriver.ts";
import { FunctionalPermissionNames } from "@/ui/auth/functional_permissions.ts";
import { functionalPermissionDefinitions } from "./ApplicationDefinedFunctionalPermissions.ts";

// Built-in functional permissions. Each exported `FP_*` constant is typed
// `FunctionalPermissionSelectType`: its `identifier`/`createdAt`/`updatedAt` start as
// empty-string placeholders and are overwritten with the DB-generated values by
// `registerFunctionalPermissions()` at startup. The placeholders are stripped before the
// INSERT, so the database always assigns the real values.

export const registrationPlaceholders = { identifier: "", createdAt: "", updatedAt: "" } as const;

export const FP_READ_USERS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_USERS, description: "Browse the full list of users in the system and view individual user details (name, groups, permissions). Does not include viewing user profile information.", group: "Admin", ...registrationPlaceholders };

export const FP_READ_GROUPS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_GROUPS, description: "Browse the list of all groups and view individual group details, including which permissions are assigned to each group.", group: "Admin", ...registrationPlaceholders };

export const FP_READ_GROUP_FUNCTIONAL_PERMISSIONS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_GROUP_FUNCTIONAL_PERMISSIONS, description: "See which permissions each group has been granted. Required alongside FP_READ_GROUPS to view permission assignments on group and permission detail screens.", group: "Admin", ...registrationPlaceholders };

export const FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS, description: "Grant or revoke any functional permission to/from any group. This controls who can do what in the system — treat with caution.", group: "Admin", ...registrationPlaceholders };

export const FP_READ_FUNCTIONAL_PERMISSIONS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_FUNCTIONAL_PERMISSIONS, description: "View the complete list of all permissions available in the system and their descriptions. Required to see which permissions exist before assigning them.", group: "Admin", ...registrationPlaceholders };

export const FP_READ_FUNCTIONAL_PERMISSION_GROUPS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_FUNCTIONAL_PERMISSION_GROUPS, description: "Read the groups assigned in the system.", group: "Admin", ...registrationPlaceholders };

export const FP_READ_API_DOCUMENTATION: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_API_DOCUMENTATION, description: "Access the interactive API documentation page (Swagger/OpenAPI) to browse available endpoints and their schemas.", group: "Admin", ...registrationPlaceholders };

export const FP_MANAGE_CONFIGURATION: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_CONFIGURATION, description: "View and modify all application configuration settings — authentication, database, email, feature flags, and any other configurable parameters.", group: "Admin", ...registrationPlaceholders };

export const FP_PROLONG_API_KEYS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_PROLONG_API_KEYS, description: "Manage existing API keys — extend their expiration date, disable or delete them, rename them, and change which permissions they carry.", group: "Admin", ...registrationPlaceholders };

export const FP_CREATE_API_KEYS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_API_KEYS, description: "Create new API keys for programmatic access to the system.", group: "Admin", ...registrationPlaceholders };

export const FP_VIEW_API_KEYS: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_API_KEYS, description: "Browse the list of all API keys and view their details (metadata, permissions, expiration — but not the secret value, which is only shown once at creation).", group: "Admin", ...registrationPlaceholders };

export const FP_READ_AUDIT_LOG: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_AUDIT_LOG, description: "View the system audit log — a chronological record of creates, updates, deletes, grants, revokes, disables/enables, and configuration changes (upserts).", group: "Admin", ...registrationPlaceholders };

export const FP_CLEAR_AUDIT_LOG: FunctionalPermissionSelectType = { functionalPermissionName: FunctionalPermissionNames.FP_CLEAR_AUDIT_LOG, description: "Permanently delete all entries from the audit log. This is a destructive operation — typically restricted to system administrators.", group: "Admin", ...registrationPlaceholders };

const builtInDefinitions = [
    FP_READ_USERS,
    FP_READ_GROUPS,
    FP_READ_GROUP_FUNCTIONAL_PERMISSIONS,
    FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS,
    FP_READ_FUNCTIONAL_PERMISSIONS,
    FP_READ_FUNCTIONAL_PERMISSION_GROUPS,
    FP_READ_API_DOCUMENTATION,
    FP_MANAGE_CONFIGURATION,
    FP_PROLONG_API_KEYS,
    FP_CREATE_API_KEYS,
    FP_VIEW_API_KEYS,
    FP_READ_AUDIT_LOG,
    FP_CLEAR_AUDIT_LOG,
];

/**
 * Registers all built-in and application-defined functional permissions with the given
 * database client and populates the exported `FP_*` constants with the registered rows
 * (DB-generated `identifier`, `createdAt`, `updatedAt`).
 *
 * Called once at startup (from `src/main.ts`) with the startup `DBClient`; replaces the
 * former import-time self-registration against the global connection.
 */
export async function registerFunctionalPermissions(db: DBClient): Promise<void> {
    for (const definition of builtInDefinitions) {
        const registered = await registerFunctionalPermission(db, {
            functionalPermissionName: definition.functionalPermissionName,
            description: definition.description,
            group: definition.group,
        });
        Object.assign(definition, registered);
    }
    for (const definition of functionalPermissionDefinitions) {
        await registerFunctionalPermission(db, definition);
    }
}
