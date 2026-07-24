export function proxyHeadersDerive({ request }: { request: Request }) {
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
