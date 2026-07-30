import type { FunctionalPermissionSelectType, FunctionalPermissionInsertType } from "@/types/FunctionalPermissionType.ts";
import { registerFunctionalPermission } from "@/repo/FunctionalPermissionRepo.ts";
import { getDatabaseConnection } from "@/services/DatabaseDriver.ts";
import { FunctionalPermissionNames } from "@/ui/auth/functional_permissions.ts";

// Define and register functional permissions here

const FP_READ_USERS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_USERS, description: "Browse the full list of users in the system and view individual user details (name, groups, permissions). Does not include viewing user profile information.", group: "Admin" };
export const FP_READ_USERS = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_USERS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_GROUPS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_GROUPS, description: "Browse the list of all groups and view individual group details, including which permissions are assigned to each group.", group: "Admin" };
export const FP_READ_GROUPS = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_GROUPS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_GROUP_FUNCTIONAL_PERMISSIONS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_GROUP_FUNCTIONAL_PERMISSIONS, description: "See which permissions each group has been granted. Required alongside FP_READ_GROUPS to view permission assignments on group and permission detail screens.", group: "Admin" };
export const FP_READ_GROUP_FUNCTIONAL_PERMISSIONS = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_GROUP_FUNCTIONAL_PERMISSIONS_DEF) satisfies FunctionalPermissionSelectType;

const FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS, description: "Grant or revoke any functional permission to/from any group. This controls who can do what in the system — treat with caution.", group: "Admin" };
export const FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS = await registerFunctionalPermission(getDatabaseConnection(), FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_FUNCTIONAL_PERMISSIONS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_FUNCTIONAL_PERMISSIONS, description: "View the complete list of all permissions available in the system and their descriptions. Required to see which permissions exist before assigning them.", group: "Admin" };
export const FP_READ_FUNCTIONAL_PERMISSIONS = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_FUNCTIONAL_PERMISSIONS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_API_DOCUMENTATION_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_API_DOCUMENTATION, description: "Access the interactive API documentation page (Swagger/OpenAPI) to browse available endpoints and their schemas.", group: "Admin" };
export const FP_READ_API_DOCUMENTATION = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_API_DOCUMENTATION_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_CONFIGURATION_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_CONFIGURATION, description: "View and modify all application configuration settings — authentication, database, email, feature flags, and any other configurable parameters.", group: "Admin" };
export const FP_MANAGE_CONFIGURATION = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_CONFIGURATION_DEF) satisfies FunctionalPermissionSelectType;

const FP_PROLONG_API_KEYS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_PROLONG_API_KEYS, description: "Manage existing API keys — extend their expiration date, disable or delete them, rename them, and change which permissions they carry.", group: "Admin" };
export const FP_PROLONG_API_KEYS = await registerFunctionalPermission(getDatabaseConnection(), FP_PROLONG_API_KEYS_DEF) satisfies FunctionalPermissionSelectType;

const FP_CREATE_API_KEYS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_API_KEYS, description: "Create new API keys for programmatic access to the system.", group: "Admin" };
export const FP_CREATE_API_KEYS = await registerFunctionalPermission(getDatabaseConnection(), FP_CREATE_API_KEYS_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_API_KEYS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_API_KEYS, description: "Browse the list of all API keys and view their details (metadata, permissions, expiration — but not the secret value, which is only shown once at creation).", group: "Admin" };
export const FP_VIEW_API_KEYS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_API_KEYS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_AUDIT_LOG_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_AUDIT_LOG, description: "View the system audit log — a chronological record of events such as logins, configuration changes, permission changes, and data modifications.", group: "Admin" };
export const FP_READ_AUDIT_LOG = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_AUDIT_LOG_DEF) satisfies FunctionalPermissionSelectType;

const FP_CLEAR_AUDIT_LOG_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_CLEAR_AUDIT_LOG, description: "Permanently delete all entries from the audit log. This is a destructive operation — typically restricted to system administrators.", group: "Admin" };
export const FP_CLEAR_AUDIT_LOG = await registerFunctionalPermission(getDatabaseConnection(), FP_CLEAR_AUDIT_LOG_DEF) satisfies FunctionalPermissionSelectType;

export * from "./ApplicationDefinedFunctionalPermissions.ts";