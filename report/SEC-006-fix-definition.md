# Fix Definition: SEC-006 — Proxy headers trusted unconditionally

## Source Finding
08-security.md — `src/utils/ProxyHeaders.ts:1-15` accepts `X-Forwarded-Proto`/`X-Forwarded-Host` from any client; used to build OIDC `redirect_uri` (`Auth.ts:395`, `apps/login.ts:11,29`)

## Human Directive
"SEC-006 — Proxy headers trusted unconditionally - in the fix include instruction on proper configuration of trusted proxy"

## Target End State
`X-Forwarded-Proto`/`X-Forwarded-Host` are honored only when the deployment says a trusted proxy exists. Concretely:

- A configuration switch (env-based, via the ARCH-002 central env module — e.g. a `TRUST_PROXY`/`TRUSTED_PROXY` setting) controls whether `proxyHeadersDerive` trusts forwarded headers. Default (unset/false): the derive ignores `X-Forwarded-*` entirely and `publicUrl` is always `request.url` — safe for directly exposed deployments.
- When enabled, the forwarded headers are processed as today (first list entry wins, proto restricted to http/https), optionally narrowed to an allowlist of proxy addresses if the implementation chooses to support one; the minimum viable gate is the on/off switch.
- The fix includes **instruction on proper configuration of a trusted proxy** (per the human directive): documentation (in `README.md` or the env documentation produced under CFG-001 — coordinate so it lands in one place) explaining: when to enable the setting (only behind a reverse proxy that terminates TLS and *sets/overwrites* `X-Forwarded-Proto`/`X-Forwarded-Host`), that the proxy must strip client-supplied forwarded headers, and an example configuration snippet for a typical proxy (e.g. nginx `proxy_set_header` lines).

## Approach
- Gate the header reads in `proxyHeadersDerive` on the new env-backed setting (read via the central env module once ARCH-002 exists; if implemented before ARCH-002, read `process.env` directly and migrate with ARCH-002).
- Keep the existing parsing semantics (first-entry wins, proto whitelist) for the trusted path.
- Write the operator documentation: what the flag does, what the proxy must do, and the consequence of enabling it without a proxy (host-header poisoning exposure remains if misconfigured — documented explicitly).

## Affected Scope
- `src/utils/ProxyHeaders.ts` — gated trust
- Central env module (ARCH-002) or direct env read — new setting
- `README.md` / env documentation (CFG-001 deliverable) — trusted-proxy configuration instructions
- `.env` example if one exists (verify; do not commit secrets)

## Explicit Constraints
- Default-off: a fresh deployment without the setting must ignore forwarded headers.
- No behavior change for deployments that already run behind a proxy *and* set the new setting — their redirect URIs keep working.
- The human directive is binding: the fix is incomplete without the proxy-configuration instructions.
- Coordinate with TS-004 (mode flags) — the proxy trust setting is independent of dev/prod mode and must not be derived from `devMode`.

## Out of Scope
- SEC-004 (cookie/CSRF posture) — unchecked per its annotation.
- ARCH-002 (env centralization) — separate fix definition; this fix adds one env var to its surface.
- CFG-001 (env documentation) — separate fix definition; the trusted-proxy instructions land in whichever document CFG-001 establishes, or in README.md if CFG-001 lands later.

## Downstream Impact
Yes — new environment variable; deployments behind a reverse proxy must set it to keep OIDC redirects working. One line for downstream: "set TRUST_PROXY (final name per implementation) when running behind a reverse proxy; see the trusted-proxy configuration section."
