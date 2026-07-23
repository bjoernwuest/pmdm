// Applications using this template are encouraged to place their functional permission in this file and not in `functional_perms.ts` to achieve stability with upgrades of the template.

/**
 * Canonical functional permission names shared by UI and server-side registration.
 *
 * We use an `as const` object (enum-like) to keep literal string unions and
 * preserve maximum type-safety across build targets.
 */
export const FunctionalPermissionNames = {
} as const;
