# Downstream Plan: API-005 — Request bundling executes sub-requests sequentially

## Upstream Change
Reference: `/report/Fix API-005 - Request bundling executes sub-requests sequentially.md`. The server-side request-bundling dispatcher (`src/api/RequestBundlingAPI.ts`) now executes bundled sub-requests strictly sequentially (each awaited before the next starts; per-request NDJSON results still stream as they complete), instead of concurrent execution. The client-side bundling queue (`src/ui/api/_request_bundling.ts`) was unchanged.

## Upstream's Own Assessment
"Yes — behavioral change: bundles now execute strictly sequentially (slower wall-clock for independent mutations, deterministic for dependent ones). Clients relying on concurrent execution (none should, per the documented contract) are affected. Request bundling now guarantees in-order sequential execution as documented."

## Applicability to This Project
Affected: No

Evidence:
- `src/api/RequestBundlingAPI.ts` and `src/ui/api/_request_bundling.ts` are byte-identical to upstream's fixed versions (diff against `bun-starter` shows no differences) — the merged fix already applies here.
- This project's own UI wrappers (`src/ui/api/*.ts`, e.g. `Products.ts`, `Consumables.ts`, `Notifications.ts`) do not implement any bundling logic; they use the shared helpers from `src/ui/api/index.ts` (`apiGet`/`apiPut`/`apiPost`/bundled mutation helpers), which route through the unchanged shared queue.
- No pmdm-owned code depends on concurrent execution of bundled sub-requests; the domain mutations are independent and the documented contract is sequential.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
