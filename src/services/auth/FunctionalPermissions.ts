import type { FunctionalPermissionSelectType, FunctionalPermissionInsertType } from "@/types/FunctionalPermissionType.ts";
import { registerFunctionalPermission } from "@/repo/FunctionalPermissionRepo.ts";
import { getDatabaseConnection } from "@/services/DatabaseDriver.ts";
import { FunctionalPermissionNames } from "@/ui/auth/functional_permissions.ts";

// Define and register functional permissions here

const FP_READ_USERS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_USERS, description: "Permitted to read master data of all users - not including user profile", group: "Admin" };
export const FP_READ_USERS = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_USERS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_GROUPS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_GROUPS, description: "Permitted to read all groups", group: "Admin" };
export const FP_READ_GROUPS = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_GROUPS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_GROUP_FUNCTIONAL_PERMISSIONS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_GROUP_FUNCTIONAL_PERMISSIONS, description: "Read the functional permissions of groups.", group: "Admin" };
export const FP_READ_GROUP_FUNCTIONAL_PERMISSIONS = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_GROUP_FUNCTIONAL_PERMISSIONS_DEF) satisfies FunctionalPermissionSelectType;

const FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS, description: "Can add or remove functional permissions from groups.", group: "Admin" };
export const FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS = await registerFunctionalPermission(getDatabaseConnection(), FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_FUNCTIONAL_PERMISSIONS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_FUNCTIONAL_PERMISSIONS, description: "Read the functional permissions in the system.", group: "Admin" };
export const FP_READ_FUNCTIONAL_PERMISSIONS = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_FUNCTIONAL_PERMISSIONS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_FUNCTIONAL_PERMISSION_GROUPS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_FUNCTIONAL_PERMISSION_GROUPS, description: "Read the groups assigned in the system.", group: "Admin" };
export const FP_READ_FUNCTIONAL_PERMISSION_GROUPS = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_FUNCTIONAL_PERMISSION_GROUPS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_API_DOCUMENTATION_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_API_DOCUMENTATION, description: "Permitted to view the API documentation page.", group: "Admin" };
export const FP_READ_API_DOCUMENTATION = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_API_DOCUMENTATION_DEF) satisfies FunctionalPermissionSelectType;

const FP_MANAGE_CONFIGURATION_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_CONFIGURATION, description: "Permitted to view and edit application configuration entries.", group: "Admin" };
export const FP_MANAGE_CONFIGURATION = await registerFunctionalPermission(getDatabaseConnection(), FP_MANAGE_CONFIGURATION_DEF) satisfies FunctionalPermissionSelectType;

const FP_PROLONG_API_KEYS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_PROLONG_API_KEYS, description: "Permitted to prolong, disable, delete and modify API key metadata/permissions.", group: "Admin" };
export const FP_PROLONG_API_KEYS = await registerFunctionalPermission(getDatabaseConnection(), FP_PROLONG_API_KEYS_DEF) satisfies FunctionalPermissionSelectType;

const FP_CREATE_API_KEYS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_API_KEYS, description: "Permitted to create API keys.", group: "Admin" };
export const FP_CREATE_API_KEYS = await registerFunctionalPermission(getDatabaseConnection(), FP_CREATE_API_KEYS_DEF) satisfies FunctionalPermissionSelectType;

const FP_VIEW_API_KEYS_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_API_KEYS, description: "Permitted to view API keys and their details.", group: "Admin" };
export const FP_VIEW_API_KEYS = await registerFunctionalPermission(getDatabaseConnection(), FP_VIEW_API_KEYS_DEF) satisfies FunctionalPermissionSelectType;

const FP_READ_AUDIT_LOG_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_READ_AUDIT_LOG, description: "Permitted to read the audit log.", group: "Admin" };
export const FP_READ_AUDIT_LOG = await registerFunctionalPermission(getDatabaseConnection(), FP_READ_AUDIT_LOG_DEF) satisfies FunctionalPermissionSelectType;

const FP_CLEAR_AUDIT_LOG_DEF: FunctionalPermissionInsertType = { functionalPermissionName: FunctionalPermissionNames.FP_CLEAR_AUDIT_LOG, description: "Permitted to clear the audit log entries.", group: "Admin" };
export const FP_CLEAR_AUDIT_LOG = await registerFunctionalPermission(getDatabaseConnection(), FP_CLEAR_AUDIT_LOG_DEF) satisfies FunctionalPermissionSelectType;

export * from "./ApplicationDefinedFunctionalPermissions.ts";