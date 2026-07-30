import { FunctionalPermissionNames as FPN } from "./app_functional_permissions.ts";

/**
 * Canonical functional permission names shared by UI and server-side registration.
 *
 * We use an `as const` object (enum-like) to keep literal string unions and
 * preserve maximum type-safety across build targets.
 */
export const FunctionalPermissionNames = {
    FP_READ_USERS: "FP_READ_USERS",
    FP_READ_GROUPS: "FP_READ_GROUPS",
    FP_READ_GROUP_FUNCTIONAL_PERMISSIONS: "FP_READ_GROUP_FUNCTIONAL_PERMISSIONS",
    FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS: "FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS",
    FP_READ_FUNCTIONAL_PERMISSIONS: "FP_READ_FUNCTIONAL_PERMISSIONS",
    FP_READ_FUNCTIONAL_PERMISSION_GROUPS: "FP_READ_FUNCTIONAL_PERMISSION_GROUPS",
    FP_READ_API_DOCUMENTATION: "FP_READ_API_DOCUMENTATION",
    FP_MANAGE_CONFIGURATION: "FP_MANAGE_CONFIGURATION",
    FP_PROLONG_API_KEYS: "prolong_api_keys",
    FP_CREATE_API_KEYS: "create_api_keys",
    FP_VIEW_API_KEYS: "view_api_keys",
    GRANT_FUNCTIONAL_PERMISSIONS: "Grant functional permissions",
    FP_READ_AUDIT_LOG: "read_audit_log",
    FP_CLEAR_AUDIT_LOG: "clear_audit_log",
    ...FPN
} as const;

export type FunctionalPermissionName = (typeof FunctionalPermissionNames)[keyof typeof FunctionalPermissionNames];

export const ALL_FUNCTIONAL_PERMISSION_NAMES: readonly FunctionalPermissionName[] =
    Object.values(FunctionalPermissionNames) as FunctionalPermissionName[];

const functionalPermissionNameSet = new Set<FunctionalPermissionName>(ALL_FUNCTIONAL_PERMISSION_NAMES);

/** Runtime type guard for values coming from external systems (e.g. DB/API). */
export function isFunctionalPermissionName(value: unknown): value is FunctionalPermissionName {
    return typeof value === "string" && functionalPermissionNameSet.has(value as FunctionalPermissionName);
}

/** UI-side helpers preserving existing `*.functionalPermissionName` usage pattern. */
export const FP_READ_USERS = { functionalPermissionName: FunctionalPermissionNames.FP_READ_USERS } as const;
export const FP_READ_GROUPS = { functionalPermissionName: FunctionalPermissionNames.FP_READ_GROUPS } as const;
export const FP_READ_GROUP_FUNCTIONAL_PERMISSIONS = { functionalPermissionName: FunctionalPermissionNames.FP_READ_GROUP_FUNCTIONAL_PERMISSIONS } as const;
export const FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS = { functionalPermissionName: FunctionalPermissionNames.FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS } as const;
export const FP_READ_FUNCTIONAL_PERMISSIONS = { functionalPermissionName: FunctionalPermissionNames.FP_READ_FUNCTIONAL_PERMISSIONS } as const;
export const FP_READ_FUNCTIONAL_PERMISSION_GROUPS = { functionalPermissionName: FunctionalPermissionNames.FP_READ_FUNCTIONAL_PERMISSION_GROUPS } as const;
export const FP_READ_API_DOCUMENTATION = { functionalPermissionName: FunctionalPermissionNames.FP_READ_API_DOCUMENTATION } as const;
export const FP_MANAGE_CONFIGURATION = { functionalPermissionName: FunctionalPermissionNames.FP_MANAGE_CONFIGURATION } as const;
export const FP_PROLONG_API_KEYS = { functionalPermissionName: FunctionalPermissionNames.FP_PROLONG_API_KEYS } as const;
export const FP_CREATE_API_KEYS = { functionalPermissionName: FunctionalPermissionNames.FP_CREATE_API_KEYS } as const;
export const FP_VIEW_API_KEYS = { functionalPermissionName: FunctionalPermissionNames.FP_VIEW_API_KEYS } as const;
export const FP_READ_AUDIT_LOG = { functionalPermissionName: FunctionalPermissionNames.FP_READ_AUDIT_LOG } as const;
export const FP_CLEAR_AUDIT_LOG = { functionalPermissionName: FunctionalPermissionNames.FP_CLEAR_AUDIT_LOG } as const;

export * from "./app_functional_permissions.ts";
