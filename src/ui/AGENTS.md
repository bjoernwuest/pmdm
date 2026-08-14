# AI Agent Guidelines: UI Layer

**Precedence:** sub-directory AGENTS.md take precedence over parent AGENTS.md files; this file is the authoritative layer doc for its folder.

This folder contains the **browser-only React frontend** for the application. It is 100% client-side rendered and is responsible for bootstrapping the UI, rendering page layouts, organizing page registrations, and wrapping browser-facing integrations such as API access, PubSub, and server-sent events.

## Files in this folder

- `app.tsx` — the main routed application shell, including navigation, layout, page selection, and auth-aware page visibility.
- `index.tsx` — the browser entry point that mounts React, starts the SSE bridge, and wires global providers.
- `PageRegistry.ts` — the central page registry and navigation logic for all UI pages. Imports auto-discovered pages from `_pageRegistry.generated.ts`.
- `_pageRegistry.generated.ts` — auto-generated at build time by `PageRegistryGenerator.ts`. Lists all pages found in `src/ui/pages/`. Never committed (auto-generated, stub exists for fresh clones).
- `PageTemplate.tsx` — shared page layout/template component used by page files.
- `app_PageRegistry.ts` — the extension point for app-specific page registrations that should survive template updates (escape hatch for pages outside `src/ui/pages/`).
- `pubsub.ts` — browser-side PubSub helpers.
- `saveConfirmation.ts` — shared "three-stream race" save-confirmation helper (`runSaveWithConfirmation`) used by pages for optimistic-locking saves.
- `sse_bridge.ts` — client-side server-sent event bridge logic (EventSource handling).
- `global.d.ts` — global browser type declarations.
- `index.html` — the HTML shell used by the UI bundle.

## UI subdirectories

### `api/`
Client-side API wrappers and transport helpers.

- `index.ts` — re-exports the client API helpers used by the rest of the UI.
- `_client.ts` — low-level API request primitives.
- `_request_bundling.ts` — client-side request bundling queue and NDJSON handling.
- `ApiKeys.ts`, `AuditLog.ts`, `Config.ts`, `UserProfileConfig.ts`, `Users.ts`, `Groups.ts`, `FunctionalPermissions.ts`, `sse_api.ts`, `session.ts` — domain-specific API helpers.
- `errors.ts` — client-side API error helpers.

**Request bundling exception:** `sse_api.ts`'s `syncServerSentEventExpressions` is the single sanctioned
mutation that bypasses request bundling (documented at the call site): the SSE expression filter must
apply immediately and independently of the batching queue. No other client mutation may bypass bundling.

### `auth/`
Frontend helpers for functional-permission-aware navigation and UI access control.

- `functional_permissions.ts` — permission-related UI helpers and shared constants.
- `app_functional_permissions.ts` — app-specific permission integration.

### `pages/`
React page components for dashboard, administration, documentation, detail views, and templates.

- All `.tsx` files anywhere under `src/ui/pages/` (any depth) are auto-discovered at build time and registered as pages. No manual imports or registry edits are needed.
- Each page file must export `meta: PageMeta` and `Component()` (see `@/types/PageType.ts`). Missing exports cause a build failure.
- Non-page utilities (helpers, shared components, etc.) belong outside `src/ui/pages/` — e.g., in `src/ui/components/`.
- `PageTemplate.tsx` lives at `src/ui/PageTemplate.tsx` so it is not treated as a page.

## Guidance

1. Keep all code in this tree **browser compatible**. Do not use Node.js-only APIs or backend-only modules.
2. Use `src/ui/api/` for all API calls. Do **not** call `fetch()` directly from page or component code unless you are extending the transport layer itself.
3. Page registration is now **auto-discovered** from `src/ui/pages/` via build-time code generation. Each `.tsx` file exports `meta` and `Component` and is picked up automatically. See `design/ui-page-registry.md` for the architecture.
4. **Subdirectory convention:** Downstream projects place their pages in a project-specific subdirectory (e.g., `src/ui/pages/myapp/`) to keep them cleanly separated from template pages. This eliminates merge conflicts on `PageRegistry.ts` during template upgrades.
5. **Escape hatch:** `app_PageRegistry.ts` remains for pages that cannot live under `src/ui/pages/` (e.g., conditionally loaded pages). Pages registered there are appended to the auto-discovered list.
6. The generated file `src/ui/_pageRegistry.generated.ts` is never committed. A stub exporting an empty array is committed so the project compiles on a fresh clone.
7. Place shared UI concerns in the appropriate subfolder rather than duplicating logic inside pages.
8. Treat this layer as presentation and composition only; business rules, database access, and mutations belong in `src/services/`, `src/repo/`, and `src/api/`.

