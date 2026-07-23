# 01 — Introduction and Goals

## 1.1 What Is PMDM?

PMDM (Product Master Data Management) is a web application for managing structured product data across an organization. It provides:

- **Product catalog management** — Create, view, update, and disable products with typed data fields organized by product type.
- **Product request workflow** — A multi-step approval workflow where users submit requests to create or update products, approvers review values, and completed requests flow into the product catalog.
- **Product export/import** — Track the export of approved product requests to external target systems and subsequent import confirmation.
- **Configuration management** — Administer product types, data types, target systems, business domains, consumables, and lookups — the building blocks that define the product data model.
- **Administration** — Manage users, groups, API keys, functional permissions, audit logs, and runtime configuration through a web interface.
- **API-first design** — All functionality is accessible via REST APIs with OpenAPI documentation and API key authentication for integration with external systems.

The application is a single-process Bun server serving both the REST API and a 100% client-side rendered React frontend.

## 1.2 Business Goals

| ID | Goal | Description |
|----|------|-------------|
| BG1 | Centralized product data | Provide a single source of truth for product master data, eliminating spreadsheets and ad-hoc data stores. |
| BG2 | Governed data quality | Enforce typed data fields, validation rules, and approval workflows to ensure product data is correct and complete before it reaches downstream systems. |
| BG3 | Flexible data model | Allow administrators to define product types (schemas) with custom data fields (data types) and target systems without code changes. |
| BG4 | Access-controlled collaboration | Enable role-based access control so that viewers, writers, and approvers can interact with product data at appropriate permission levels. |
| BG5 | Automated sync | Synchronize users and groups from Microsoft EntraID (Azure AD) so that identity and membership management stays aligned with the organization's directory. |
| BG6 | API-driven integration | Expose all operations as REST endpoints with API key authentication, enabling external systems to query and mutate product data programmatically. |
| BG7 | Audit trail | Record all mutations across the system for compliance and troubleshooting. |

## 1.3 Stakeholders

| Role | Interest | Contact Channel |
|------|----------|-----------------|
| Product data managers | Create/manage product types, data types, and configuration | Web UI |
| Product data editors | Create products, submit update requests | Web UI |
| Approvers | Review and approve product request values | Web UI |
| Administrators | Manage users, groups, permissions, API keys, runtime config | Web UI |
| Integration developers | Consume the REST API for automated product data operations | API documentation, API keys |
| Operations / DevOps | Deploy, monitor, and maintain the application | Server logs, health endpoint |
| Security team | Ensure authentication, authorization, and audit compliance | Audit log, EntraID integration |

## 1.4 Quality Goals

The following quality goals drive architectural decisions. Each is assigned a priority level (High / Medium / Low).

| ID | Quality Goal | Priority | Description |
|----|-------------|----------|-------------|
| Q1 | Security | High | All endpoints (except health and public docs) require authentication. Fine-grained functional permissions control every operation. API keys provide programmatic access without session cookies. The root user group is the only permission bypass. |
| Q2 | Data integrity | High | Serializable database transactions for multi-step mutations. Optimistic locking via `updatedAt` prevents lost updates. PubSub events are published only after successful persistence. |
| Q3 | Auditability | High | Every mutation (create, update, delete, grant, revoke, disable, enable) is recorded in the audit log with actor identity, resource identifiers, and timestamps. |
| Q4 | Maintainability | High | Strict layered architecture with explicit import bans between layers. Generic CRUD factories reduce boilerplate for configuration entities. Centralized type definitions with auto-generation from Drizzle schemas. |
| Q5 | Configurability | High | All runtime parameters (auth settings, API key length, audit batch size, request bundling thresholds, EntraID credentials) are stored in the database and editable via the admin UI. A setup wizard blocks startup until mandatory configuration is provided. |
| Q6 | Real-time updates | Medium | Server-Sent Events (SSE) bridge PubSub events to browser clients so that UI state updates without polling. Tag-based event filtering ensures clients only receive relevant events. |
| Q7 | Performance | Medium | Request bundling coalesces multiple client mutations into a single HTTP request. Client-side rendering eliminates server-side rendering overhead. ETag-based long-lived caching for client JS bundles. |
| Q8 | Testability | Medium | `bun test` for unit tests. Playwright for end-to-end tests with real EntraID authentication. Separate `.env.test` for test credentials. |
| Q9 | Deployability | Low | Single Bun process. No containerization required (direct runtime). Umzug programmatic migrations run at startup. `.env` file for environment-specific configuration. |

## 1.5 Stakeholder Requirements (Business Constraints)

- The application must authenticate users via Microsoft EntraID (OIDC/OAuth2.1).
- The application must synchronize users and group memberships from EntraID.
- Configuration must be editable at runtime without restarting the server.
- API access must be available via long-lived API keys with configurable length and validity.
- The frontend must work in modern browsers without server-side rendering.
- All UI text must be in English.
