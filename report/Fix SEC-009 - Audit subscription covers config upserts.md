# Fix SEC-009 - Audit subscription covers config upserts; login/logout excluded

## Source
- Finding: SEC-009 (see /report/08-security.md)
- Fix definition: /report/SEC-009-fix-definition.md

## Summary of Change
The audit subscription expression in `src/services/AuditLog.ts` now covers exactly the sanctioned set per the human's directive ("include upsert but exclude login/logout events"): `TAG_UPSERT` was added to the `auditExpression`, so config changes (published with `TAG_UPSERT` from `ConfigRepo`/`UserProfileConfigRepo`) are audited; `TAG_LOGIN`/`TAG_LOGOUT` remain excluded. Failed-authentication auditing was deliberately excluded (the directive does not mandate it, and the boundary is ambiguous — recorded as a decision). The `FP_READ_AUDIT_LOG` permission description now matches the actual coverage (creates, updates, deletes, grants, revokes, disables/enables, config upserts) without claiming login coverage; it propagates to existing deployments via the registration upsert's `onConflictDoUpdate` description update. The startup log line lists the new tag set.

## Files Changed
- `src/services/AuditLog.ts` — `TAG_UPSERT` added to the audit expression; startup log line updated
- `src/services/auth/FunctionalPermissions.ts` — `FP_READ_AUDIT_LOG` description corrected

## Breaking Changes for Downstream Consumers
Yes — the audit log now contains config-upsert entries (new persisted event class); the `FP_READ_AUDIT_LOG` description updates in the database on next start. No API shape change.

## Required Manual Follow-Up
None. (The permission description refresh occurs automatically at startup via `registerFunctionalPermissions`' upsert.)

## Out of Scope Notes
- Failed-authentication audit entries — deliberately excluded per the definition's conservative resolution.
- PATT-003 (double-publish/audit double-count) — separate fix definition, implemented earlier.
- SPEC-002 (dead controls/mock data) — separate fix definition.
- SEC-005 (SSE keyed by user oid) — unchecked.

## Resolved Questions
None.
