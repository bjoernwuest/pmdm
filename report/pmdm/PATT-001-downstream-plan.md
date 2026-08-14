# Downstream Plan: PATT-001 — One error-propagation strategy per layer

## Upstream Change
Reference: `/report/Fix PATT-001 - One error-propagation strategy per layer.md`. Error bodies at catch sites were converted from possibly-serialized `Error` objects to strings in `message` (envelope canonicalized by API-001); the setup wizard's 401 body became JSON `{ error }`.

## Upstream's Own Assessment
"Yes — error bodies for the affected routes changed from possibly-serialized `Error` objects to strings in `message` (the envelope itself was canonicalized by API-001 in the same change set). The setup wizard's 401 body changed from plain text `"Unauthorized"` to `{"error":"Unauthorized"}` (JSON)."

## Applicability to This Project
Affected: No

Evidence:
- Project-wide review of every catch site in pmdm-owned route files (`_crud_API.ts`, `ProductAPI.ts`, `ProductExportAPI.ts`, `LookupsAPI.ts`, `ConsumablesAPI.ts`, `ProductRequestAPI.ts`, `DataTypesAPI.ts`, `ScriptApi.ts`, `NotificationsAPI.ts`, `ProductTypesAPI.ts`): no site passes a raw `Error` object into a response body. Error values enter bodies as `{ error: e.message }` / `{ error: "..." }` strings (e.g. `ProductExportAPI.ts` catch blocks). The `ImportValidationFailure` catch sites return a workbook `Response` (not an error body).
- The setup wizard files are shared and already fixed via the merge.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
