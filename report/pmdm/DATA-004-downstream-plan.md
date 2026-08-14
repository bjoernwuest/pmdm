# Downstream Plan: DATA-004 — Set-based reads replace N+1 loops

## Upstream Change
Reference: `/report/Fix DATA-004 - Set-based reads replace N+1 loops.md`. New repo exports (`getApiKeyFunctionalPermissionsForKeys`, `getFunctionalPermissionsOfGroups`, `getGroupsAssignedToFunctionalPermissions`) replaced per-entity read loops in upstream route files. No API contract change; only intra-response array ordering may differ.

## Upstream's Own Assessment
"Yes — new repo exports (`getApiKeyFunctionalPermissionsForKeys`, `getFunctionalPermissionsOfGroups`, `getGroupsAssignedToFunctionalPermissions`); route files updated. No API contract change. Note: the ordering of permission arrays within the two responses is now determined by the set-based queries' join order (same elements, possibly different order than the previous per-entity loop order)."

## Applicability to This Project
Affected: No

Evidence:
- The shared repo and route files are byte-identical to upstream's fixed versions (`src/repo/ApiKeyRepo.ts`, `src/repo/FunctionalPermissionRepo.ts`, and the consuming route files); the set-based reads are already in effect here via the merge.
- No pmdm-owned file implements the cited per-entity read loops for API-key or group functional permissions, and no pmdm-owned file imports or shadows the new exports.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
