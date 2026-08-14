# Downstream Plan: ARCH-011 — Declarative detail breadcrumbs resolved generically

## Upstream Change
Reference: `/report/Fix ARCH-011 - Declarative detail breadcrumbs resolved generically.md`. `PageMeta` gained an optional `detailBreadcrumb` capability (`resolveLabel(params)`); the app shell (`src/ui/app.tsx`) resolves detail breadcrumb labels generically instead of per-route `matchPath`/fetch blocks; the three template detail pages declare the capability in their `meta` (API-key detail gained a new breadcrumb).

## Upstream's Own Assessment
"Yes — `PageMeta` gains an optional field; pages that want detail breadcrumbs must declare it. Existing pages without the field type-check unchanged (additive)."

## Applicability to This Project
Affected: No

Evidence:
- This project's `src/ui/app.tsx` (pmdm-modified) already contains the merged generic resolution: `currentPage?.meta.detailBreadcrumb?.resolveLabel` (lines 171-174); the diff against upstream shows zero differences in the breadcrumb/`matchPath`/`resolveLabel` lines (pmdm's divergences are `PRODUCT_NAME`, the `debugFrontend` viewer-context field, and the loading screen).
- `src/types/PageType.ts` carries the merged optional `detailBreadcrumb` field.
- No pmdm-owned page under `src/ui/pages/pmdm/` (or pmdm component) references breadcrumbs or `detailBreadcrumb`; none of them needs the capability. The field is optional and additive, so they type-check unchanged.

## Target End State

## Approach

## Affected Scope

## Anticipated Manual Follow-Up

## Open Questions
