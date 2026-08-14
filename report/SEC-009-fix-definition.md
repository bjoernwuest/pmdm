# Fix Definition: SEC-009 — Audit-log gaps for security-relevant events

## Source Finding
08-security.md — logins/logouts publish tags (`Auth.ts:580,624`) but `AuditLog.ts:115` only audits create/update/delete/grant/revoke/disable/enable tags; failed auth attempts (`apps/api.ts:78-86`) are never logged; config changes publish `TAG_UPSERT` (`ConfigRepo.ts:89-95`), which is not in the audit expression list — despite `FP_READ_AUDIT_LOG`'s description claiming "logins, configuration changes" (`FunctionalPermissions.ts:41`)

## Human Directive
"SEC-009 — Audit-log gaps for security-relevant events - include upsert but exclude login/logout events"

## Target End State
The audit subscription expression in `src/services/AuditLog.ts` covers exactly the sanctioned set:

- **Included:** `TAG_UPSERT` is added to the audit expression, so config changes (published with `TAG_UPSERT` from `ConfigRepo.ts:89-95` and `UserProfileConfigRepo.ts:41`) are audited — closing the "configuration changes" gap.
- **Excluded (binding per directive):** login and logout events are *not* added to the audit trail, even though `Auth.ts:580,624` publish `TAG_LOGIN`/`TAG_LOGOUT`. The audit expression must not match them.
- **Failed authentication attempts** (`apps/api.ts:78-86`): the finding lists this as a gap; the directive's exclusion covers login/logout *events* — failed-auth logging is not a login event, but the directive does not mandate it either. The conservative resolution: add an audit entry for failed authentications only if it can be done without logging credentials or creating log-spam amplification; since the directive does not ask for it and the boundary is ambiguous, failed-auth auditing is **excluded** from this fix's scope (see Out of Scope) and the gap is recorded as a deliberate decision.
- The `FP_READ_AUDIT_LOG` permission description ("...logins, configuration changes...") is corrected to match reality: it describes the audited event classes (creates, updates, deletes, grants, revokes, disables/enables, config upserts) without claiming login coverage.

## Approach
Add `TAG_UPSERT` to the `auditExpression` in `startAuditLog`; keep `TAG_LOGIN`/`TAG_LOGOUT` out. Update the `FP_READ_AUDIT_LOG_DEF` description in `src/services/auth/FunctionalPermissions.ts:41` to describe the actual coverage (note: permission descriptions are upserted at registration; verify the description refresh reaches existing deployments via `registerFunctionalPermission`'s `onConflictDoUpdate`, which already updates description — confirmed by the upsert in `FunctionalPermissionRepo.ts:158-166`). Update the audit-log startup log line to list the new tag set.

## Affected Scope
- `src/services/AuditLog.ts` — audit expression + log line
- `src/services/auth/FunctionalPermissions.ts` — `FP_READ_AUDIT_LOG` description text
- `src/services/AGENTS.md` PubSub section — if it enumerates audited tags, update (verify at implementation)

## Explicit Constraints
- Binding scope from the human: "include upsert but exclude login/logout events".
- No auditing of credential material or tokens in payloads; audit entries keep their current shape (topic + payload as stored today).
- The permission-description change must propagate to existing databases via the normal registration upsert.

## Out of Scope
- Failed-authentication audit entries — deliberately excluded (see Target End State); if desired later, it needs its own finding/decision.
- PATT-003 (double-publish/audit double-count) — separate fix definition.
- SPEC-002 (dead controls/mock data) — separate fix definition.
- SEC-005 (SSE keyed by user oid) — unchecked.

## Downstream Impact
Yes — audit log will contain config-upsert entries (new event class persisted); the `FP_READ_AUDIT_LOG` description changes in the database on next start. No API shape change.
