# Fix SEC-006 - Gate forwarded-header trust behind TRUST_PROXY

## Source
- Finding: SEC-006 (see /report/08-security.md)
- Fix definition: /report/SEC-006-fix-definition.md

## Summary of Change
`proxyHeadersDerive` in `src/utils/ProxyHeaders.ts` now honors `X-Forwarded-Proto`/`X-Forwarded-Host` only when the new `TRUST_PROXY` env switch is enabled; unset (default) means the derive ignores forwarded headers entirely and `publicUrl` is always `request.url`. The switch is read from the ARCH-002 central env module (`src/services/Env.ts`, `trustProxy`). Existing parsing semantics (first list entry wins, proto restricted to http/https) are unchanged for the trusted path. README.md gained a trusted-proxy configuration section (per the human directive: when to enable, that the proxy must strip client-supplied forwarded headers, and an example nginx `proxy_set_header` snippet).

## Files Changed
- `src/utils/ProxyHeaders.ts` — forwarded-header reads gated on `trustProxy`
- `src/services/Env.ts` — new `trustProxy` accessor (`TRUST_PROXY=1`)
- `README.md` — trusted-proxy configuration instructions with example proxy config

## Breaking Changes for Downstream Consumers
Yes — new environment variable `TRUST_PROXY`. Deployments behind a reverse proxy must set `TRUST_PROXY=1` to keep OIDC redirects working (previously forwarded headers were always honored). Fresh deployments without the setting ignore forwarded headers. See the trusted-proxy configuration section in README.md.

## Required Manual Follow-Up
None.

## Out of Scope Notes
- SEC-004 (cookie/CSRF posture) — unchecked per its annotation; proxy trust is independent of dev/prod mode.
- ARCH-002 (env centralization) — separate fix definition, implemented first; this fix added one env var to its surface.
- CFG-001 (env documentation table) — separate fix definition; the trusted-proxy instructions landed in README.md here since CFG-001 lands later and will reference them.

## Resolved Questions
None.
