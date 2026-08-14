# Downstream Plan: SEC-009 — Audit subscription covers config upserts

## Upstream Change
Reference: `/report/Fix SEC-009 - Audit subscription covers config upserts.md`. The audit log now contains config-upsert entries (new persisted event class); the `FP_READ_AUDIT_LOG` description updates in the database on next start. No API shape change.

## Upstream's Own Assessment
"Yes — the audit log now contains config-upsert entries (new persisted event class); the `FP_READ_AUDIT_LOG` description updates in the database on next start. No API shape change."

## Applicability to This Project
Affected: No

Evidence:
- `src/services/AuditLog.ts` and `src/autostart/audit-log.ts` are byte-identical to upstream's fixed versions (diff: no differences).
- The `FP_READ_AUDIT_LOG` description update happens automatically at startup via the shared functional-permission registration (upsert-by-name updates the description column) — no pmdm code change needed; pmdm's app-defined permissions are registered through the same mechanism (see the ARCH-003 adaptation).
- No pmdm-owned subscriber consumes audit-log events in a way the new event class would break (pmdm's own `message_*` subscriptions use pmdm-defined tags only).

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
