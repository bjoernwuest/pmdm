# pmdm

A small **Product / Master Data Management** application built as a learning project to explore the latest capabilities of *vibe coding*.

## Summary

This application has been developed to learn on latest capabilities of vibe coding. In memory of my first consulting project, the domain I selected is **master data management**.

The app focuses on:
- Maintaining master data structures (product types, data types, lookup types, consumables, target systems)
- Driving product requests and approvals
- Exporting product data to target systems
- A REST API documented via OpenAPI and rendered via Scalar

## Installation and use

### Requirements

- **Docker** (build & run the application container)
- **PostgreSQL**
    - The application creates the database schema automatically on startup (via Drizzle).
- **Microsoft Entra ID** (Azure AD) App Registration for authentication
    - On application start (and periodically afterwards), EntraID is queried for users and groups.
    - It is recommended to configure filters (e.g. group restrictions) for performance and to limit scope.

> Note: The runtime inside the container is Bun (see `Dockerfile`), but you don't need to install Bun locally if you use Docker.

### Database setup

1. Create an empty PostgreSQL database.
2. Put the PostgreSQL connection string into `.env`:

- `DATABASE_URL=postgresql://user:password@localhost:5432/pmdm`

> Note: The app will create tables, indexes, and constraints automatically.

### EntraID app registration setup

Create an app registration in EntraID (Azure Portal):

1. **Create App Registration**
    - Azure Portal → Entra ID → *App registrations* → *New registration*
    - Note:
        - **Application (client) ID** → `ENTRAID_CLIENT_ID`
        - **Directory (tenant) ID** → `ENTRAID_TENANT_ID` (or `common` for multi-tenant)

2. **Create a client secret**
    - App registration → *Certificates & secrets* → *New client secret*
    - Copy the secret value → `ENTRAID_CLIENT_SECRET`

3. **Configure redirect URI**
    - App registration → *Authentication*
    - Add a Web redirect URI:
        - `http://localhost:8000/oauth/callback` (adjust host/port if you changed `APP_URL`)

4. **Configure API audience (JWT `aud`)**
    - This repository uses an API audience to validate bearer tokens.
    - Recommended value:
        - `ENTRAID_API_AUDIENCE=api://<ENTRAID_CLIENT_ID>`
    - Example:
        - If `ENTRAID_CLIENT_ID=b6eaeee3-09bd-4f54-a8b1-d6950b89c18f`
        - then set `ENTRAID_API_AUDIENCE=api://b6eaeee3-09bd-4f54-a8b1-d6950b89c18f`

5. **(Optional) Configure “superuser” group**
    - Create or select a group in EntraID.
    - Enter the group's object ID in the setup wizard (`RootUserGroup` config key).

6. **Configure Microsoft Graph permissions for notifications (optional)**
    - App registration → *API permissions* → *Add a permission*
    - Select *Microsoft Graph* → *Application permissions*
    - Add **Mail.Send**
    - Grant admin consent for the permission
    - **Restrict sender address via Exchange Online PowerShell**:
      By default `Mail.Send` allows sending as any user. Restrict it to the notification sender mailbox:
      ```powershell
      Connect-ExchangeOnline
      New-ApplicationAccessPolicy -AppId "<ENTRAID_CLIENT_ID>" -PolicyScopeGroupId "noreply@contoso.com" -AccessRight RestrictAccess -Description "Restrict Mail.Send to pmdm notification sender"
      ```
      The `-PolicyScopeGroupId` must match the `From` address configured in the notification settings.

### Environment configuration

1. Copy the template:

```bash
cp .env.template .env
```

2. Fill in the required variables in `.env`:

- `DATABASE_URL` — PostgreSQL connection string (required)
- `ADVISORY_LOCK` — PostgreSQL advisory lock ID for migrations (optional; when unset, the application default `-7482650123549836421` from `src/services/Env.ts` is used)

> EntraID credentials and all other application settings are configured through the setup wizard (stored in the database), not in `.env`.

3.# Trusted proxy configuration
The application honors `X-Forwarded-Proto`/`X-Forwarded-Host` request headers **only** when the environment variable `TRUST_PROXY=1` is set. By default (unset), forwarded headers are ignored entirely and the public URL is derived from the incoming request itself.

- Enable `TRUST_PROXY=1` **only** when the application runs behind a reverse proxy that terminates TLS and *sets/overwrites* `X-Forwarded-Proto` and `X-Forwarded-Host` on every request.
- The proxy **must strip** any client-supplied `X-Forwarded-Proto`/`X-Forwarded-Host` headers before setting its own.
- Enabling `TRUST_PROXY` without such a proxy exposes the deployment to host-header spoofing (OIDC `redirect_uri` would be built from attacker-controlled headers).

Example nginx configuration:
```nginx
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
```

### Build and run with Docker

#### Download and run the published image

Published releases provide a Docker image in the **GitHub Container Registry (GHCR)**.

Pull the latest release:

```bash
docker pull ghcr.io/bjoernwuest/pmdm:latest
```

Or pull a specific release version (format: `YYYY-MM-DD_hh:mm`, UTC):

```bash
docker pull ghcr.io/bjoernwuest/pmdm:2026-01-18_16:39
```

Run it on port 8000 (reads config from `.env`):

```bash
docker run --rm -p 8000:8000 --env-file .env ghcr.io/bjoernwuest/pmdm:latest
```

The source repository is at `https://github.com/bjoernwuest/pmdm`.

#### Build locally

Build the container image:

```bash
docker build -t pmdm .
```

Run it on port 8000 (reads config from `.env`):

```bash
docker run --rm -p 8000:8000 --env-file .env pmdm
```

## Contribution

- Raise feature requests or bugs as **GitHub Issues**.
- Propose code changes via **Pull Requests**.

## How to report issues

Please use **GitHub Issues** and include:
- what you expected
- what happened
- steps to reproduce
- logs/screenshots (if applicable)

## License

This project is licensed under the **MIT License**. See [`LICENSE`](./LICENSE).