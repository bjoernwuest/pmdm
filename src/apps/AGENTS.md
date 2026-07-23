# AI Agent Guidelines: Application Entry Points

This folder contains the **Elysia sub-application definitions** that compose the running server. These files wire together routing, authentication, setup, and the client-side UI bundle; they should stay focused on application bootstrap and composition, not business logic.

## Files in this folder

- `api.ts` — creates the main REST API application, mounts auto-loaded route modules from `src/api/`, and applies API-wide auth, docs, and context setup.
- `login.ts` — serves the OAuth/OpenID login application used to start user authentication and return control to the UI.
- `setup.ts` — serves the setup wizard application that runs when mandatory configuration is missing and guides initial system configuration.
- `ui.ts` — serves the main client-side React application bundle.

## Guidance

1. Keep these files limited to **app composition, middleware, mounting, and bootstrapping**.
2. Do **not** place repository mutations or domain business logic here; delegate those concerns to `src/services/`, `src/repo/`, and `src/api/`.
3. When changing one app entry point, make sure its related route, service, and UI layers still match the expected startup flow and prefixes.

