/**
 * Translates a user-entered search term into a PostgreSQL `ILIKE` pattern.
 *
 * Semantics:
 * - `*` matches zero or more characters.
 * - `?` matches exactly one character.
 * - Any other text matches literally, anywhere in the target value (implicit
 *   leading/trailing `%`).
 *
 * Literal `\`, `%`, and `_` are escaped so they are matched verbatim; `\` is escaped
 * first to keep the escape sequences unambiguous. PostgreSQL's `LIKE`/`ILIKE` default
 * escape character is `\` and the result is passed as a bound parameter, so no explicit
 * `ESCAPE` clause is required.
 *
 * @param {string} input - Raw search term entered by the user.
 * @return {string} The bound `ILIKE` pattern, or `""` when the input is empty/whitespace only.
 */
export function wildcardToLikePattern(input: string): string {
    const trimmed = input.trim();
    if (trimmed.length === 0) return "";
    const escaped = trimmed
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_")
        .replace(/\*/g, "%")
        .replace(/\?/g, "_");
    return `%${escaped}%`;
}