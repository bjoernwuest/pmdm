// Elysia-compatible cookie helpers.

export interface CookieOptions {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
    maxAge?: number;
    domain?: string;
}

/**
 * Get a cookie value from the request.
 */
export function getCookie(request: Request, name: string): string | undefined {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return undefined;

    const cookies = cookieHeader.split(";").map(c => c.trim());
    for (const cookie of cookies) {
        const [key, ...valueParts] = cookie.split("=");
        if (key === name) {
            return decodeURIComponent(valueParts.join("="));
        }
    }
    return undefined;
}

/**
 * Build a Set-Cookie header value.
 */
export function buildSetCookieHeader(name: string, value: string, options: CookieOptions = {}): string {
    let cookie = `${name}=${encodeURIComponent(value)}`;

    if (options.path) cookie += `; Path=${options.path}`;
    if (options.maxAge !== undefined) cookie += `; Max-Age=${options.maxAge}`;
    if (options.domain) cookie += `; Domain=${options.domain}`;
    if (options.httpOnly) cookie += "; HttpOnly";
    if (options.secure) cookie += "; Secure";
    if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;

    return cookie;
}

/**
 * Build a Set-Cookie header to delete a cookie.
 */
export function buildDeleteCookieHeader(name: string, options: CookieOptions = {}): string {
    return buildSetCookieHeader(name, "", { ...options, maxAge: 0 });
}
