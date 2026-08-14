import { trustProxy } from "@/services/Env.ts";

/**
 * Derives the public URL for OIDC redirect construction.
 *
 * `X-Forwarded-Proto`/`X-Forwarded-Host` are honored only when `TRUST_PROXY=1` is set
 * (see the trusted-proxy configuration section in README.md). Otherwise the forwarded
 * headers are ignored entirely and `request.url` is used as-is, so a directly exposed
 * deployment cannot be tricked into accepting client-supplied forwarded headers.
 */
export function proxyHeadersDerive({ request }: { request: Request }) {
    if (!trustProxy) return { publicUrl: request.url };

    const proto = request.headers.get("X-Forwarded-Proto");
    const host = request.headers.get("X-Forwarded-Host");
    if (!proto && !host) return { publicUrl: request.url };

    const url = new URL(request.url);
    if (proto) {
        const first = proto.split(",")[0]!.trim();
        if (first === "https") url.protocol = "https:";
        else if (first === "http") url.protocol = "http:";
    }
    if (host) url.host = host.split(",")[0]!.trim();

    return { publicUrl: url.toString() };
}
