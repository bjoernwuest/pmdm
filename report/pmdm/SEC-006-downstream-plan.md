# Downstream Plan: SEC-006 — Gate forwarded-header trust behind TRUST_PROXY

## Upstream Change
Reference: `/report/Fix SEC-006 - Gate forwarded-header trust behind TRUST_PROXY.md`. New environment variable `TRUST_PROXY`: forwarded headers (`X-Forwarded-Proto`/`X-Forwarded-Host`) are honored only when `TRUST_PROXY=1`; unset ⇒ ignored (public URL derived from the request itself).

## Upstream's Own Assessment
"Yes — new environment variable `TRUST_PROXY`. Deployments behind a reverse proxy must set `TRUST_PROXY=1` to keep OIDC redirects working (previously forwarded headers were always honored). Fresh deployments without the setting ignore forwarded headers."

## Applicability to This Project
Affected: No

Evidence:
- The implementation is shared and merged: `src/services/Env.ts:58` (`trustProxy` accessor) and `src/utils/ProxyHeaders.ts:12` (gate). No pmdm-owned file reads forwarded headers directly (project-wide search: only the two shared files).
- This project's `README.md` already carries a trusted-proxy configuration section matching the fixed behavior (`TRUST_PROXY=1` only behind a TLS-terminating reverse proxy that overwrites both headers).
- This project's local `.env`/`.env.template` do not set `TRUST_PROXY`, which is the fixed default (headers ignored); deployments behind a proxy must add the variable — a configuration note, not a code change.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
