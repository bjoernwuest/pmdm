/**
 * Boolean query-parameter parsing shared by the API list routes.
 *
 * Accepts the values the list endpoints have always accepted: `true`, `"true"`, `"1"`
 * (and the boolean `true`), matching the documented includeInactive/includeDisabled contract.
 */
export function parseBooleanQuery(value: unknown): boolean {
    return value === true || value === "true" || value === "1";
}
