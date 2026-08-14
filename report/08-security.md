# 08 — Security

## Rubric
Root AGENTS.md requires permissions always checked on the server, `cfgRootUserGroup` as the only permission bypass, narrowly scoped SSE, and auditability of security-relevant events. Good means: secrets out of version control, cryptographic randomness for tokens, constant-time comparisons, no trust in client-supplied proxy headers, no SSRF via server-side fetching, and session/cookie posture that does not depend on an undocumented flag combination.

### [SEC-001] Setup key uses non-cryptographic RNG and non-constant-time comparison
- **Location(s):** `src/services/Setup.ts:21-29` (`Math.random()` for the 50-char setup key); `src/apps/setup.ts:145,170` compare with `!==`; the setup server listens on the public port until setup completes (`setup.ts:228-235`)
- **Description:** The setup key, which gates write access to all mandatory configuration, is generated with `Math.random()` and compared non-constant-time.
- **Why it matters:** Predictable tokens and timing-unsafe comparison on an unauthenticated endpoint.
- **Related findings:** ARCH-006

### [SEC-002] Sessions are in-memory only
- **Location(s):** `src/services/Auth.ts:156-160` (`sessionStore` is a process-local `TTLMap`); refresh tokens held in memory in plaintext (`:516`)
- **Description:** Session state is not persisted; the design docs do not describe this limitation.
- **Why it matters:** A restart logs out all users; horizontal scaling is impossible; token-at-rest exposure if memory is dumped.
- **Related findings:** CPLX-004

### [SEC-003] Bearer-token introspection per request, uncached
- **Location(s):** `src/services/Auth.ts:332-352` introspects on every request with no result cache
- **Description:** Each bearer request triggers an external introspection round-trip.
- **Why it matters:** Amplifies latency and dependence on the identity provider; combined with an unindexed API-key scan (DATA-001), both auth paths degrade together.
- **Related findings:** DATA-001, PATT-005

### [SEC-004] Cookie/CSRF posture depends on a flag combination; GET-based state changes
- **Location(s):** `Auth.ts:413,574` (`secure: !devMode`); no `__Host-` prefix; `SameSite=Lax` only; GET-based state changes at `src/apps/login.ts:67-87` (`/login/logout`, `/login/local-logout`)
- **Description:** In a deployment that is production (no `DEV_MODE`) but served over HTTP by a misconfigured proxy, Secure cookies are set and browsers refuse to send them — fail-open confusion; logout is a GET and only Lax-protected.
- **Why it matters:** Logout CSRF; cookie behavior depends on an env-flag matrix with no single source of truth.
- **Related findings:** TS-004

### [SEC-005] SSE stream keyed by user `oid`, not session
- **Location(s):** `src/api/ServerSentEventAPI.ts:27-35` (`session_user:<oid>`); stale comment at `:21-26` mentions SessionID which is never used
- **Description:** Two sessions of the same user share one SSE filter/queue.
- **Why it matters:** Cross-session event leakage between a user's devices; the comment documents behavior that does not exist.
- **Related findings:** DOC-007

### [SEC-006] Proxy headers trusted unconditionally
- **Location(s):** `src/utils/ProxyHeaders.ts:1-15` accepts `X-Forwarded-Proto`/`X-Forwarded-Host` from any client; used to build OIDC `redirect_uri` (`Auth.ts:395`, `apps/login.ts:11,29`)
- **Description:** No trusted-proxy allowlist; any client can spoof the forwarded host.
- **Why it matters:** Host-header poisoning redirects the OIDC authorization code to an attacker-controlled origin when the app is directly exposed.
- **Related findings:** —

### [SEC-007] Request bundling forwards arbitrary absolute URLs with caller credentials
- **Location(s):** `src/api/RequestBundlingAPI.ts:202` fetches any `http(s)://` URL verbatim, attaching the caller's `Authorization`/`Cookie` headers (`:221-223`)
- **Description:** An authenticated caller can direct the server to fetch an arbitrary URL carrying their session credentials.
- **Why it matters:** SSRF and credential exfiltration via a first-party endpoint.
- **Related findings:** API-005

### [SEC-008] Undocumented unauthenticated static mount
- **Location(s):** `src/main.ts:37` (`Bun.file(\`./public/${params["*"]}\`)`) in addition to the documented `static/public/` (`:39`); root AGENTS.md lists only `static/public/` as unauthenticated
- **Description:** A second public mount point exists that is not documented; traversal safety depends on `Bun.file` path normalization of `..` segments.
- **Why it matters:** Unknown attack surface; the intended public file set is ambiguous.
- **Related findings:** ARCH-009, DOC-003

### [SEC-009] Audit-log gaps for security-relevant events
- **Location(s):** logins/logouts publish tags (`Auth.ts:580,624`) but `AuditLog.ts:115` only audits create/update/delete/grant/revoke/disable/enable tags; failed auth attempts (`apps/api.ts:78-86`) are never logged; config changes publish `TAG_UPSERT` (`ConfigRepo.ts:89-95`), which is not in the audit expression list — despite `FP_READ_AUDIT_LOG`'s description claiming "logins, configuration changes" (`FunctionalPermissions.ts:41`)
- **Description:** The audit trail does not cover events its own permission description promises.
- **Why it matters:** Security investigations lack failed-auth and config-change history; the advertised feature is partly unimplemented.
- **Related findings:** SPEC-002, PATT-003

### [SEC-010] Server-stored regexes compiled in the browser; partial-number acceptance on save
- **Location(s):** `AdminConfigList.tsx:160,199,542` and `UserProfileConfigList.tsx:110` compile `new RegExp(entry.inputFormat)` from server-provided config; `AdminConfigList.tsx:531` and `UserProfileConfigList.tsx:254` accept `parseFloat("1abc") → 1` (regex check at `AdminConfigList.tsx:505` only runs in `handleChange`, not authoritatively on save)
- **Description:** Client compiles attacker-influenced (any `FP_MANAGE_CONFIGURATION` holder) regexes; save-path numeric validation accepts partial numbers.
- **Why it matters:** ReDoS vector for every admin browser; invalid numeric values can be persisted.
- **Related findings:** SPEC-007
