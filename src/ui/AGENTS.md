# AI Agent Guidelines: UI Layer

This folder contains the **browser-only React frontend** for the application. It is 100% client-side rendered and is responsible for bootstrapping the UI, rendering page layouts, organizing page registrations, and wrapping browser-facing integrations such as API access, PubSub, and server-sent events.

## Files in this folder

- `app.tsx` — the main routed application shell, including navigation, layout, page selection, and auth-aware page visibility.
- `index.tsx` — the browser entry point that mounts React, starts the SSE bridge, and wires global providers.
- `PageRegistry.ts` — the central page registry and navigation logic for all UI pages.
- `app_PageRegistry.ts` — the extension point for app-specific page registrations that should survive template updates.
- `pubsub.ts` — browser-side PubSub helpers.
- `server_sent_events.ts` — client-side server-sent event bridge logic.
- `global.d.ts` — global browser type declarations.
- `index.html` — the HTML shell used by the UI bundle.

## UI subdirectories

### `api/`
Client-side API wrappers and transport helpers.

- `index.ts` — re-exports the client API helpers used by the rest of the UI.
- `_client.ts` — low-level API request primitives.
- `_request_bundling.ts` — client-side request bundling queue and NDJSON handling.
- `ApiKeys.ts`, `AuditLogAPI.ts`, `ConfigSchema.ts`, `server_sent_events.ts`, `session.ts` — domain-specific API helpers.
- `errors.ts` — client-side API error helpers.

### `auth/`
Frontend helpers for functional-permission-aware navigation and UI access control.

- `functional_permissions.ts` — permission-related UI helpers and shared constants.
- `app_functional_permissions.ts` — app-specific permission integration.

### `pages/`
React page components for dashboard, administration, documentation, detail views, and templates.

- `Dashboard.tsx`, `Doc.tsx` — core landing and help pages.
- `AdministrationHome.tsx` and the `Admin*` files — administration lists, detail screens, and documentation pages.
- `PageTemplate.tsx` — shared page layout/template component.

## Guidance

1. Keep all code in this tree **browser compatible**. Do not use Node.js-only APIs or backend-only modules.
2. Use `src/ui/api/` for all API calls. Do **not** call `fetch()` directly from page or component code unless you are extending the transport layer itself.
3. Keep page registration centralized in `PageRegistry.ts` / `app_PageRegistry.ts` so routing, visibility, and navigation stay consistent.
4. Place shared UI concerns in the appropriate subfolder rather than duplicating logic inside pages.
5. Treat this layer as presentation and composition only; business rules, database access, and mutations belong in `src/services/`, `src/repo/`, and `src/api/`.
6. When adding new pages, update the registry and ensure the matching API and permission helpers stay aligned.

