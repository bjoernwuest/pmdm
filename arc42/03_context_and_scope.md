# 03 — Context and Scope

## 3.1 System Context Diagram

```
                            ┌─────────────────────────────┐
                            │   Microsoft EntraID (Azure)   │
                            │   ┌───────────────────────┐  │
                            │   │ OIDC Identity Provider│  │
                            │   │ Microsoft Graph API   │  │
                            │   └──────────┬────────────┘  │
                            └──────────────┼───────────────┘
                                           │ OIDC / OAuth2.1
                                           │ (HTTPS)
                                           ▼
┌──────────────┐    HTTPS     ┌──────────────────────────────┐    TCP/5432    ┌──────────────┐
│   Browser    │◄────────────►│          PMDM Server          │◄─────────────►│  PostgreSQL  │
│   (React     │              │                              │               │   Database   │
│    SPA)      │              │  Bun + Elysia.js + Drizzle    │               │              │
│              │              │                              │               │              │
│  ┌─────────┐ │              │  /api/*          REST API     │               │              │
│  │ SSE      │◄──── SSE ────│  /login/*        OIDC flow    │               │              │
│  │ Client   │ │              │  /public/*       Static assets│               │              │
│  └─────────┘ │              │  /               UI shell     │               │              │
│              │              │  /setup          Setup wizard │               │              │
└──────────────┘              └──────────────────────────────┘               └──────────────┘
                                           │
                                           │ HTTPS
                                           ▼
                              ┌──────────────────────────────┐
                              │      External Systems         │
                              │  (via REST API + API Keys)    │
                              │                              │
                              │  Product data consumers       │
                              │  Integration middleware        │
                              │  Target systems               │
                              └──────────────────────────────┘
```

## 3.2 External Interfaces

### 3.2.1 Microsoft EntraID (Azure Active Directory)

| Aspect | Detail |
|--------|--------|
| Purpose | User authentication (OIDC) and identity synchronization |
| Protocol | OIDC / OAuth2.1 with PKCE |
| Endpoints | Authorization, Token, Token Introspection, End Session |
| Sync mechanism | Microsoft Graph API delta queries for users and groups |
| Configuration | ClientID, ClientSecret, TenantID stored in database `config` table under domain `EntraID` |
| Config keys | `ClientID`, `ClientSecret`, `TenantID`, `SyncInterval` |

### 3.2.2 PostgreSQL Database

| Aspect | Detail |
|--------|--------|
| Purpose | Persistent storage for all application data |
| Connection | `postgresql://` connection string in `DATABASE_URL` env var |
| Driver | `postgres` npm package (v3.x), max 10 connections |
| ORM | Drizzle ORM (v0.45.x) |
| Migrations | Umzug programmatic migrations, run at startup with advisory lock |
| Advisory lock | Unique 64-bit integer from `ADVISORY_LOCK` env var (prevents concurrent migration runs) |

### 3.2.3 External System Integrations (API Consumers)

| Aspect | Detail |
|--------|--------|
| Purpose | Programmatic access to product data, configuration, and administration |
| Authentication | API keys (X-API-Key header) or Bearer tokens |
| Documentation | OpenAPI/Swagger UI at `/api/docs`, `llms.txt` at `/api/docs/llms.txt` |
| Rate limiting | Not implemented |

### 3.2.4 Browser Client

| Aspect | Detail |
|--------|--------|
| Purpose | Human interface for all application functionality |
| Rendering | 100% client-side (React 19 SPA) |
| Real-time updates | Server-Sent Events (EventSource API) with PubSub bridge |
| Request optimization | Transparent request bundling for mutations (NDJSON streaming) |
| Caching | ETag-based long-lived caching for JS bundle |

## 3.3 Business Domain Scope

### 3.3.1 Core Domain: Product Management

- **Product Types** — Define the schema for a class of products (e.g., "Laptop", "Monitor"). Each product type has assigned data types, target systems, and group-based permissions.
- **Data Types** — Define typed fields with validation rules, default values, and lookup/consumable references. Seven data kinds: `calculated`, `boolean`, `numeric`, `string`, `lookup`, `consumable`, `product`.
- **Products** — Instances of a product type with values for each assigned data type. Identified by `productNumber` (text, not UUID).
- **Product Requests** — Workflow objects for creating or updating products. Status lifecycle: `open` → `importing` → `done` / `cancelled`.
- **Product Exports** — Track the export status of approved product requests to target systems and subsequent import confirmation.

### 3.3.2 Configuration Domain

- **Business Domains** — Organizational categories for grouping data types.
- **Consumables** — Predefined selectable values for data fields.
- **Lookups** — Reference data tables (key-value pairs) for data fields.
- **Target Systems** — External systems that receive exported product data.

### 3.3.3 Administration Domain

- **Users** — Imported from EntraID. Can be assigned to groups.
- **Groups** — Imported from EntraID. Can be assigned functional permissions.
- **API Keys** — Long-lived authentication tokens for programmatic API access. Configurable length and validity.
- **Functional Permissions** — Fine-grained permission constants (e.g., `FP_VIEW_PRODUCTS`, `FP_CREATE_PRODUCT`). Assigned to groups.
- **Configuration Entries** — Runtime parameters stored in the database. Editable via admin UI with optimistic locking.
- **Audit Log** — Immutable log of all mutating operations across the system.
- **Notifications** — Email digest notifications for product request status changes. Configured via admin UI with HTML template support.

### 3.3.4 UI Page Map

```
PMDM
├── Administration
│   ├── Administration Home
│   ├── Users (list → detail)
│   ├── Groups (list → detail)
│   ├── Functional Permissions (list → detail)
│   ├── API Keys (list → detail)
│   ├── Configuration Entries (list)
│   ├── Audit Log
│   ├── Notifications
│   └── API Documentation
├── Configuration
│   ├── Configuration Home
│   ├── Target Systems
│   ├── Product Types (→ Data Type Assignments → Target System Assignments)
│   ├── Business Domains
│   ├── Consumables (list → detail)
│   ├── Lookups (list → detail)
│   └── Data Types (list → detail)
├── Products
│   ├── Products (list → detail)
│   ├── Product Exports
│   └── Open Product Requests (list → detail)
└── General
    └── Dashboard
```

## 3.4 Out of Scope

The following are explicitly **not** part of PMDM:

- **User registration / password management** — Authentication is exclusively via EntraID.
- **Local user accounts** — All users are sourced from EntraID.
- **Multi-tenancy** — The application serves a single organization.
- **Content Management** — No CMS capabilities. Pages are static React components.
- **Externally triggered notifications** — No webhook-based or third-party notification triggers. Email notifications are internal via Microsoft Graph.
- **File / media storage** — No binary file upload or storage beyond XLSX import/export.
- **Workflow engine** — The product request workflow is a hardcoded state machine, not a generic workflow engine.
- **Reporting / analytics** — No built-in reporting dashboards beyond the product list with query builder.
- **Mobile app** — No native mobile client. The browser UI is responsive but not optimized for mobile.
- **Rate limiting / throttling** — Not implemented.
- **Horizontal scaling** — The application is a single process; no clustering or load balancing is built in.
- **GDPR / data retention policies** — No automated data purging or anonymization.
