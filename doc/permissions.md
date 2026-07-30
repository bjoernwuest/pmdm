# Functional Permissions Reference

This document catalogs every functional permission in the system, what it guards, and how the permission mechanism works. It is a living reference — update it when permissions are added, removed, or changed.

---

## 1. Overview

The system uses a **group-based functional permission model**. There are no traditional roles. Permissions are granted individually to groups, and users inherit permissions through their group memberships.

**Two authorization paths:**

| Path | Mechanism |
|---|---|
| **Root user group bypass** | Members of the configured root user group (`cfgRootUserGroup`) automatically receive **every** permission — no per-endpoint checks are performed. This is the superuser / administrator path. |
| **Normal path** | User → group memberships → group-permission assignments. Each API endpoint calls `authorize()` with specific required permissions. |

**API keys** can also be granted their own independent set of permissions, separate from any user's group memberships.

**Frontend permission flow:**

1. The browser calls `GET /api/me/context` on load.
2. The response contains `permissionNames: string[]` — all of the user's effective permissions.
3. `src/ui/app.tsx` uses `getVisiblePages()` to filter sidebar navigation links and `getAccessiblePages()` to register only permitted routes.
4. Individual page components perform secondary `permissionNames.includes(...)` checks for fine-grained feature toggling (e.g., showing "Create" buttons, "Edit" controls).

**Server permission checks:**

- The core function is `authorize()` in `src/services/Auth.ts:769`.
- Checks are **inline per-endpoint** — there is no global permission middleware.
- The single global middleware in `src/apps/api.ts:71-87` enforces only **authentication** (not authorization), whitelisting `/api/health` and `/api/docs/*` as public.

---

## 2. Upstream vs. Project-Defined Permissions

Permissions originate from three registration points. Understanding this distinction is important for template upgrades and maintenance:

| Source File | Count | Purpose |
|---|---|---|
| `src/services/auth/FunctionalPermissions.ts` | 13 | **Upstream/template** admin permissions. These survive template upgrades. Cover users, groups, API keys, audit log, configuration, and API documentation. |
| `src/services/auth/ApplicationDefinedFunctionalPermissions.ts` | 24 | **Project-defined** business permissions. Cover product management, master data configuration, exports, notifications, and filtering. |
| `src/services/Auth.ts:662` | 1 | `GRANT_FUNCTIONAL_PERMISSIONS` — special bootstrap superuser permission. Registered separately from the template file. |

**Notable cross-over:** `FP_NOTIFICATIONS` is registered in `ApplicationDefinedFunctionalPermissions.ts` (project-defined) but appears in the **Admin** group alongside upstream permissions, because email notification configuration is an administrative function.

---

## 3. Complete Permission Catalog

### 3.1 System Group

| Constant | String Value | Origin | User-Facing Description | Technical Description | Server Guards | UI Guards |
|---|---|---|---|---|---|---|
| `GRANT_FUNCTIONAL_PERMISSIONS` | `"Grant functional permissions"` | Special | Assign any permission to any group — effectively a superuser capability. Members of the root user group receive this and all other permissions automatically. | Permitted to grant functional permissions to groups. | None — handled implicitly by root user group membership bypass in `authorize()`. Registered at `src/services/Auth.ts:662`. | None |

### 3.2 Admin Group

| Constant | String Value | Origin | User-Facing Description | Technical Description | Server Guards | UI Guards |
|---|---|---|---|---|---|---|
| `FP_READ_USERS` | `"FP_READ_USERS"` | Upstream | Browse the full list of users in the system and view individual user details (name, groups, permissions). Does not include viewing user profile information. | Permitted to read master data of all users - not including user profile. | `GET /api/users` — `src/api/UserAPI.ts:29`<br>`GET /api/users/:userid` — `src/api/UserAPI.ts:94` | Page: `AdminUserList.tsx:25`<br>Page: `AdminUserDetail.tsx:27`<br>Nav card: `AdministrationHome.tsx:32` |
| `FP_READ_GROUPS` | `"FP_READ_GROUPS"` | Upstream | Browse the list of all groups and view individual group details, including which permissions are assigned to each group. | Permitted to read all groups. | `GET /api/groups` — `src/api/GroupAPI.ts:34`<br>`GET /api/groups/:groupid` — `src/api/GroupAPI.ts:99`<br>`GET /api/groups/:groupid/functionalpermissions` — `src/api/GroupAPI.ts:142` (with FP_READ_GROUP_FUNCTIONAL_PERMISSIONS + FP_READ_FUNCTIONAL_PERMISSIONS)<br>`GET /api/functionalpermissions/:id` — `src/api/FunctionalPermissionAPI.ts:82` (with FP_READ_GROUP_FUNCTIONAL_PERMISSIONS + FP_READ_FUNCTIONAL_PERMISSIONS) | Page: `AdminGroupList.tsx:25`<br>Page: `AdminGroupDetail.tsx:39`<br>Page: `AdminFunctionalPermissionDetail.tsx:92` (`canEditAssignments` check with FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS)<br>Nav card: `AdministrationHome.tsx:32` |
| `FP_READ_GROUP_FUNCTIONAL_PERMISSIONS` | `"FP_READ_GROUP_FUNCTIONAL_PERMISSIONS"` | Upstream | See which permissions each group has been granted. Required alongside `FP_READ_GROUPS` to view permission assignments on group and permission detail screens. | Read the functional permissions of groups. | `GET /api/functionalpermissions/:id` — `src/api/FunctionalPermissionAPI.ts:82` (requires all 3 read perms)<br>`GET /api/groups/:groupid` — `src/api/GroupAPI.ts:99` (conditional: permission data included only if caller has this)<br>`GET /api/groups/:groupid/functionalpermissions` — `src/api/GroupAPI.ts:142` (requires all 3 read perms)<br>`GET /api/users/:userid` — `src/api/UserAPI.ts:94` (conditional: permission display enabled only with this) | None — used for conditional data shaping on the server side |
| `FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS` | `"FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS"` | Upstream | Grant or revoke any functional permission to/from any group. This controls who can do what in the system — treat with caution. | Can add or remove functional permissions from groups. | `POST /api/functionalpermissions/:id/groups` — `src/api/FunctionalPermissionAPI.ts:123`<br>`DELETE /api/functionalpermissions/:id/groups` — `src/api/FunctionalPermissionAPI.ts:169`<br>`POST /api/groups/:groupid/functionalpermissions` — `src/api/GroupAPI.ts:174`<br>`DELETE /api/groups/:groupid/functionalpermissions` — `src/api/GroupAPI.ts:214` | `AdminFunctionalPermissionDetail.tsx:93` (`canEditAssignments` toggle)<br>`AdminGroupDetail.tsx:162` (`canEditPermissions` toggle) |
| `FP_READ_FUNCTIONAL_PERMISSIONS` | `"FP_READ_FUNCTIONAL_PERMISSIONS"` | Upstream | View the complete list of all permissions available in the system and their descriptions. Required to see which permissions exist before assigning them. | Read the functional permissions in the system. | `GET /api/functionalpermissions` — `src/api/FunctionalPermissionAPI.ts:25`<br>`GET /api/functionalpermissions/:id` — `src/api/FunctionalPermissionAPI.ts:82` (requires all 3 read perms)<br>`GET /api/groups/:groupid/functionalpermissions` — `src/api/GroupAPI.ts:142` (requires all 3 read perms)<br>`GET /api/users/:userid` — `src/api/UserAPI.ts:94` (conditional) | Page: `AdminFunctionalPermissionList.tsx:21`<br>Page: `AdminFunctionalPermissionDetail.tsx:29`<br>`AdminGroupDetail.tsx:160` (`canReadFunctionalPermissions` toggle)<br>Nav card: `AdministrationHome.tsx:37` |
| `FP_READ_FUNCTIONAL_PERMISSION_GROUPS` | `"FP_READ_FUNCTIONAL_PERMISSION_GROUPS"` | Upstream | ⚠️ **Dead permission** — this permission is registered but has no effect. No API endpoint or UI page checks it. Granting it does nothing. | Read the groups assigned in the system. | **NONE** — registered in DB but not enforced by any API route | **NONE** — not imported by any page component |
| `FP_READ_API_DOCUMENTATION` | `"FP_READ_API_DOCUMENTATION"` | Upstream | Access the interactive API documentation page (Swagger/OpenAPI) to browse available endpoints and their schemas. | Permitted to view the API documentation page. | None — API docs are whitelisted as public in `src/apps/api.ts:73` middleware. This permission only gates the UI page. | Page: `AdminApiDocumentation.tsx:17`<br>Nav card: `AdministrationHome.tsx:42` |
| `FP_MANAGE_CONFIGURATION` | `"FP_MANAGE_CONFIGURATION"` | Upstream | View and modify all application configuration settings — authentication, database, email, feature flags, and any other configurable parameters. | Permitted to view and edit application configuration entries. | `GET /api/config` — `src/api/ConfigAPI.ts:61`<br>`PUT /api/config/:domain/:key` — `src/api/ConfigAPI.ts:104` | Page: `AdminConfigList.tsx:71`<br>Nav card: `AdministrationHome.tsx:47` |
| `FP_PROLONG_API_KEYS` | `"prolong_api_keys"` | Upstream | Manage existing API keys — extend their expiration date, disable or delete them, rename them, and change which permissions they carry. | Permitted to prolong, disable, delete and modify API key metadata/permissions. | `PUT /api/api_keys/:apikeyid` — `src/api/ApiKeyAPI.ts:267`<br>`PUT /api/api_keys/:apikeyid/prolong` — `src/api/ApiKeyAPI.ts:309`<br>`PUT /api/api_keys/:apikeyid/disable` — `src/api/ApiKeyAPI.ts:365`<br>`PUT /api/api_keys/:apikeyid/permissions` — `src/api/ApiKeyAPI.ts:417`<br>`DELETE /api/api_keys/:apikeyid` — `src/api/ApiKeyAPI.ts:463` | `AdminApiKeyList.tsx:163` (`canManage` toggle)<br>`AdminApiKeyDetail.tsx:91` (`canManage` toggle) |
| `FP_CREATE_API_KEYS` | `"create_api_keys"` | Upstream | Create new API keys for programmatic access to the system. | Permitted to create API keys. | `POST /api/api_keys` — `src/api/ApiKeyAPI.ts:204` | `AdminApiKeyList.tsx:162` (`canCreate` toggle) |
| `FP_VIEW_API_KEYS` | `"view_api_keys"` | Upstream | Browse the list of all API keys and view their details (metadata, permissions, expiration — but **not** the secret value, which is only shown once at creation). | Permitted to view API keys and their details. | `GET /api/api_keys` — `src/api/ApiKeyAPI.ts:46`<br>`GET /api/api_keys/:apikeyid` — `src/api/ApiKeyAPI.ts:126` | Page: `AdminApiKeyList.tsx:59`<br>Page: `AdminApiKeyDetail.tsx:48`<br>Nav card: `AdministrationHome.tsx:52` |
| `FP_READ_AUDIT_LOG` | `"read_audit_log"` | Upstream | View the system audit log — a chronological record of events such as logins, configuration changes, permission changes, and data modifications. | Permitted to read the audit log. | `GET /api/audit-log` — `src/api/AuditLogAPI.ts:14` | Page: `AdminAuditLog.tsx:23` |
| `FP_CLEAR_AUDIT_LOG` | `"clear_audit_log"` | Upstream | Permanently delete all entries from the audit log. This is a destructive operation — typically restricted to system administrators. | Permitted to clear the audit log entries. | `DELETE /api/audit-log` — `src/api/AuditLogAPI.ts:96` | `AdminAuditLog.tsx:58` (`canClear` toggle — shows the "Clear Log" button) |
| `FP_NOTIFICATIONS` | `"FP_NOTIFICATIONS"` | Project | Configure the email notification system — set recipients and schedules. Also manually trigger notification sends or simulate them for testing purposes. | Access to the email notification system configuration and manual send/simulate features. | `GET /api/notifications` — `src/api/NotificationsAPI.ts:31`<br>`GET /api/notifications/email_defaults` — `src/api/NotificationsAPI.ts:78`<br>`POST /api/notifications/simulate` — `src/api/NotificationsAPI.ts:141`<br>`POST /api/notifications/send` — `src/api/NotificationsAPI.ts:175`<br>`POST /api/notifications/send_simulated` — `src/api/NotificationsAPI.ts:208`<br>`PUT /api/notifications/:notificationId` — `src/api/NotificationsAPI.ts:247` | Page: `AdminNotifications.tsx:34`<br>Nav card: `AdministrationHome.tsx:57` |

> **Note:** `FP_NOTIFICATIONS` is registered in `ApplicationDefinedFunctionalPermissions.ts:77-78` (project-defined) but grouped as **Admin** — the only project permission in this group.

### 3.3 Configuration Group

All permissions in this group are **Project** origin (`src/services/auth/ApplicationDefinedFunctionalPermissions.ts`).

| Constant | String Value | User-Facing Description | Technical Description | Server Guards | UI Guards |
|---|---|---|---|---|---|
| `FP_DO_CONFIGURATION` | `"do_configuration"` | Access the master data configuration area. This is a **prerequisite** for **all** configuration entities — every endpoint for target systems, business domains, product types, data types, lookups, and consumables requires `FP_DO_CONFIGURATION` alongside the domain-specific view or manage permission. | Access the master data configuration area. Required alongside domain-specific permissions for lookups and consumables. | **All configuration entity endpoints** (list, detail, create, update, disable) require FP_DO_CONFIGURATION via the `gatekeeperPermission` mechanism in `src/api/_crud_API.ts`:<br>Target systems: `TargetSystemsAPI.ts:38`<br>Business domains: `BusinessDomainsAPI.ts:34`<br>Product types: `ProductTypesAPI.ts:73`<br>Data types: `DataTypesAPI.ts:56`<br>Lookups: `LookupsAPI.ts:242,276,304` (custom sub-routes)<br>Consumables: `ConsumablesAPI.ts:242,276,304` (custom sub-routes)<br>Lookup values CRUD: `LookupsAPI.ts:435,486,522,561`<br>Consumable values CRUD: `ConsumablesAPI.ts:435,486,522,561`<br>Data types sub-routes: `DataTypesAPI.ts:92,129,187,234`<br>Product types sub-routes: `ProductTypesAPI.ts:97,154,195,...` (all 18 sub-routes) | Page: `ConfigurationHome.tsx:26`<br>Page: `ConfigurationTargetSystems.tsx:28`<br>Page: `ConfigurationBusinessDomains.tsx:28`<br>Page: `ConfigurationProductTypes.tsx:32`<br>Page: `ConfigurationDataTypes.tsx:42`<br>Page: `ConfigurationLookups.tsx`<br>Page: `ConfigurationConsumables.tsx`<br>Page: `ConfigurationProductTypesDataTypesTargetSystems.tsx:84`<br>Page: `ConfigurationProductTypesDataTypes.tsx:70`<br>Page: `ConfigurationConsumableDetail.tsx:53`<br>Page: `ConfigurationLookupDetail.tsx:53`<br>Page: `ConfigurationDataTypeDetail.tsx:66` |
| `FP_VIEW_TARGET_SYSTEMS` | `"view_target_systems"` | View the list of target systems — the external systems that product change requests get exported to. Requires `FP_DO_CONFIGURATION` alongside this permission. | Permitted to view target systems. | All target system endpoints are gated by `FP_DO_CONFIGURATION` (gatekeeper) via `TargetSystemsAPI.ts:38`:<br>`GET /api/target_systems` — via `src/api/_crud_API.ts:183`<br>`GET /api/target_systems/:id` — via `src/api/_crud_API.ts:251` | Page: `ConfigurationTargetSystems.tsx:28`<br>Nav card: `ConfigurationHome.tsx:35` |
| `FP_MANAGE_TARGET_SYSTEMS` | `"manage_target_systems"` | Create, edit, enable, or disable target system definitions. Requires `FP_DO_CONFIGURATION` alongside this permission. | Create, edit, enable, or disable target system definitions. | All target system endpoints are gated by `FP_DO_CONFIGURATION` (gatekeeper) via `TargetSystemsAPI.ts:38`:<br>`POST /api/target_systems` — via `src/api/_crud_API.ts:286`<br>`PUT /api/target_systems/:id` — via `src/api/_crud_API.ts:327`<br>`PATCH /api/target_systems/:id/disabled` — via `src/api/_crud_API.ts:378` | None — manage controls rendered conditionally on detail pages |
| `FP_VIEW_PRODUCT_TYPES` | `"view_product_types"` | View product type definitions and their data type assignments. Requires `FP_DO_CONFIGURATION` alongside this permission. | View product type definitions and their data type assignments. | All product type endpoints are gated by `FP_DO_CONFIGURATION` (gatekeeper) via `ProductTypesAPI.ts:73`:<br>`GET /api/product_types` — via `src/api/_crud_API.ts:188`<br>`GET /api/product_types/:id` — via `src/api/_crud_API.ts:251`<br>`GET /api/product_types/:id/datatypes` — `src/api/ProductTypesAPI.ts:97`<br>`GET /api/product_types/:id/datatypes_assignment` — `src/api/ProductTypesAPI.ts:284` | Page: `ConfigurationProductTypes.tsx:32`<br>Page: `ConfigurationProductTypesDataTypesTargetSystems.tsx:84`<br>Page: `ConfigurationProductTypesDataTypes.tsx:70`<br>Nav card: `ConfigurationHome.tsx:40` |
| `FP_MANAGE_PRODUCT_TYPES` | `"manage_product_types"` | Create, edit, enable, or disable product types. Also assign and reorder data types on product types. Requires `FP_DO_CONFIGURATION` alongside this permission. | Create, edit, enable, or disable product types. Also assign and reorder data types on product types. | All product type endpoints are gated by `FP_DO_CONFIGURATION` (gatekeeper) via `ProductTypesAPI.ts:73`:<br>`POST /api/product_types` — via `src/api/_crud_API.ts:286`<br>`PUT /api/product_types/:id` — via `src/api/_crud_API.ts:327`<br>`PATCH /api/product_types/:id/disabled` — via `src/api/_crud_API.ts:378`<br>Additional sub-routes at `ProductTypesAPI.ts:154,195,233,346,396,443,535,602,650,751,799,878,935` | None — manage controls rendered conditionally |
| `FP_VIEW_BUSINESS_DOMAINS` | `"view_business_domains"` | View business domain definitions — categories used to organize products. Requires `FP_DO_CONFIGURATION` alongside this permission. | View business domain definitions — categories used to organize products. | All business domain endpoints are gated by `FP_DO_CONFIGURATION` (gatekeeper) via `BusinessDomainsAPI.ts:34`:<br>`GET /api/business_domains` — via `src/api/_crud_API.ts:188`<br>`GET /api/business_domains/:id` — via `src/api/_crud_API.ts:251` | Page: `ConfigurationBusinessDomains.tsx:28`<br>Nav card: `ConfigurationHome.tsx:45` |
| `FP_MANAGE_BUSINESS_DOMAINS` | `"manage_business_domains"` | Create, edit, enable, or disable business domain definitions. Requires `FP_DO_CONFIGURATION` alongside this permission. | Create, edit, enable, or disable business domain definitions. | All business domain endpoints are gated by `FP_DO_CONFIGURATION` (gatekeeper) via `BusinessDomainsAPI.ts:34`:<br>`POST /api/business_domains` — via `src/api/_crud_API.ts:286`<br>`PUT /api/business_domains/:id` — via `src/api/_crud_API.ts:327`<br>`PATCH /api/business_domains/:id/disabled` — via `src/api/_crud_API.ts:378` | None — manage controls rendered conditionally |
| `FP_VIEW_CONSUMABLES` | `"view_consumables"` | View consumable master data definitions and their values. Requires `FP_DO_CONFIGURATION` alongside this permission. Also accessible via `FP_READ_PRODUCT_FILTER` for active values only. | View consumable master data definitions and their values. Requires FP_DO_CONFIGURATION alongside this permission. | `GET /api/consumables` — `src/api/ConsumablesAPI.ts:234` (FP_DO_CONFIGURATION also required at line 242)<br>`GET /api/consumables/:id` — `src/api/ConsumablesAPI.ts:276` (FP_DO_CONFIGURATION also required)<br>`GET /api/consumables/values/active` — `src/api/ConsumablesAPI.ts:435` (also accepts FP_READ_PRODUCT_FILTER) | Page: `ConfigurationConsumables.tsx`<br>Page: `ConfigurationConsumableDetail.tsx:53` (FP_DO_CONFIGURATION also required)<br>Nav card: `ConfigurationHome.tsx:50` |
| `FP_MANAGE_CONSUMABLES` | `"manage_consumables"` | Create, edit, enable, or disable consumable master data and their values. Requires `FP_DO_CONFIGURATION` alongside this permission. | Create, edit, enable, or disable consumable master data and their values. Requires FP_DO_CONFIGURATION alongside this permission. | `POST /api/consumables` — `src/api/ConsumablesAPI.ts:304` (FP_DO_CONFIGURATION also required)<br>`PUT /api/consumables/:id` — `src/api/ConsumablesAPI.ts:304`<br>Values CRUD — `src/api/ConsumablesAPI.ts:486,522,561` (FP_DO_CONFIGURATION also required) | None — manage controls rendered conditionally |
| `FP_VIEW_LOOKUPS` | `"view_lookups"` | View lookup table definitions and their values. Requires `FP_DO_CONFIGURATION` alongside this permission. Also accessible via `FP_READ_PRODUCT_FILTER` for active values only. | View lookup table definitions and their values. Requires FP_DO_CONFIGURATION alongside this permission. | `GET /api/lookups` — `src/api/LookupsAPI.ts:226` (FP_DO_CONFIGURATION also required at line 252)<br>`GET /api/lookups/:id` — `src/api/LookupsAPI.ts:286` (FP_DO_CONFIGURATION also required)<br>`GET /api/lookups/values/active` — `src/api/LookupsAPI.ts:445` (also accepts FP_READ_PRODUCT_FILTER) | Page: `ConfigurationLookups.tsx`<br>Page: `ConfigurationLookupDetail.tsx:53` (FP_DO_CONFIGURATION also required)<br>Nav card: `ConfigurationHome.tsx:55` |
| `FP_MANAGE_LOOKUPS` | `"manage_lookups"` | Create, edit, enable, or disable lookup tables and their values. Requires `FP_DO_CONFIGURATION` alongside this permission. | Create, edit, enable, or disable lookup tables and their values. Requires FP_DO_CONFIGURATION alongside this permission. | `POST /api/lookups` — `src/api/LookupsAPI.ts:314` (FP_DO_CONFIGURATION also required)<br>`PUT /api/lookups/:id` — `src/api/LookupsAPI.ts:314`<br>Values CRUD — `src/api/LookupsAPI.ts:486,522,561` (FP_DO_CONFIGURATION also required) | None — manage controls rendered conditionally |
| `FP_VIEW_DATA_TYPES` | `"view_data_types"` | View data type definitions — the field types available for product type configuration. Requires `FP_DO_CONFIGURATION` alongside this permission. | View data type definitions — the field types available for product type configuration. | All data type endpoints are gated by `FP_DO_CONFIGURATION` (gatekeeper) via `DataTypesAPI.ts:56`:<br>`GET /api/data_types` — via `src/api/_crud_API.ts:188`<br>`GET /api/data_types/:id` — via `src/api/_crud_API.ts:251`<br>`GET /api/data_types/:id/permissions` — `DataTypesAPI.ts:92` (FP_DO_CONFIGURATION also required) | Page: `ConfigurationDataTypes.tsx:42`<br>Page: `ConfigurationDataTypeDetail.tsx:66` (FP_DO_CONFIGURATION also required) |
| `FP_MANAGE_DATA_TYPES` | `"manage_data_types"` | Create, edit, enable, or disable data types. Also grants access to **script execution** and **script log** features — this permission doubles as the gateway for running and managing data processing scripts. Requires `FP_DO_CONFIGURATION` alongside this permission. | Create, edit, enable, or disable data types. Also grants access to script execution and script log features. | All data type endpoints are gated by `FP_DO_CONFIGURATION` (gatekeeper) via `DataTypesAPI.ts:56`:<br>`POST /api/data_types` — via `src/api/_crud_API.ts:286`<br>`PUT /api/data_types/:id` — via `src/api/_crud_API.ts:327`<br>`PATCH /api/data_types/:id/disabled` — via `src/api/_crud_API.ts:378`<br>`POST/PATCH/DELETE /api/data_types/:id/permissions` — `DataTypesAPI.ts:129,187,234` (FP_DO_CONFIGURATION also required)<br>`GET /api/script_log` — `src/api/ScriptLogAPI.ts:12`<br>`DELETE /api/script_log` — `src/api/ScriptLogAPI.ts:121`<br>`POST /api/script/*` — `src/api/ScriptApi.ts:46`<br>`DELETE /api/script/:scriptId` — `src/api/ScriptApi.ts:98` | Page: `AdminScriptLog.tsx:24`<br>`ConfigurationDataTypeDetail.tsx` (conditional) |

### 3.4 General Group

All permissions in this group are **Project** origin (`src/services/auth/ApplicationDefinedFunctionalPermissions.ts`).

| Constant | String Value | User-Facing Description | Technical Description | Server Guards | UI Guards |
|---|---|---|---|---|---|
| `FP_VIEW_PRODUCTS` | `"view_products"` | Search for and view products and their detailed field values. Also view product change requests and their details. This is the foundational permission for anyone working with product data. | Permitted to view products. | `GET /api/products` — `src/api/ProductAPI.ts:47`<br>`GET /api/products/:productNumber` — `src/api/ProductAPI.ts:144`<br>`GET /api/products/:productNumber/values` — `src/api/ProductAPI.ts:272`<br>`GET /api/product_requests` — `src/api/ProductRequestAPI.ts:166`<br>`GET /api/product_requests/:requestId` — `src/api/ProductRequestAPI.ts:278`<br>`GET /api/product_requests/:requestId/values` — `src/api/ProductRequestAPI.ts:316,364,412` | Page: `OpenProductRequestsPage.tsx:41`<br>Page: `ProductDetailPage.tsx`<br>Page: `ProductRequestDetailPage.tsx` |
| `FP_CREATE_PRODUCT` | `"create_product"` | Create brand-new products and import products from files (such as XLSX or CSV). Also create new product change requests. | Permitted to create and import products. | `POST /api/products` — `src/api/ProductAPI.ts:188`<br>`POST /api/products/import` — `src/api/ProductAPI.ts:305`<br>`POST /api/product_requests` (action: create new) — `src/api/ProductRequestAPI.ts:53` | `OpenProductRequestsPage.tsx:241` (shows "Create" button) |
| `FP_UPDATE_PRODUCT` | `"update_product"` | Edit existing product data — modify field values on a product directly. | Permitted to update products. | `PUT /api/products/:productNumber` — `src/api/ProductAPI.ts:351` | None — edit controls rendered conditionally on product detail page |
| `FP_DISABLE_PRODUCT` | `"disable_product"` | Mark products as disabled (inactive) or re-enable previously disabled products. | Permitted to disable/enable products. | `PATCH /api/products/:productNumber/disabled` — `src/api/ProductAPI.ts:395` | None — disable controls rendered conditionally on product detail page |
| `FP_REQUEST_PRODUCT_UPDATE` | `"request_product_update"` | Submit a request that a product's data be updated — creates a product change request rather than modifying the product directly. This is the workflow-oriented alternative to `FP_UPDATE_PRODUCT`. | Permitted to request updates on products. | `POST /api/products/:productNumber/request-update` — `src/api/ProductAPI.ts:436`<br>`POST /api/product_requests` (action: request update) — `src/api/ProductRequestAPI.ts:59` | `ProductDetailPage.tsx` (shows "Request Update" button) |
| `FP_CREATE_PRODUCT_COPY` | `"create_product_copy"` | Create a duplicate of an existing product — copies the product number base with all its field values. | Permitted to create copies of products. | `POST /api/products/:productNumber/copy` — `src/api/ProductAPI.ts:478`<br>`POST /api/product_requests` (action: create copy) — `src/api/ProductRequestAPI.ts:65` | `ProductDetailPage.tsx` (shows "Copy" button) |
| `FP_VIEW_PRODUCT_EXPORTS` | `"view_product_exports"` | Access the product exports management page and view the list of pending product change requests awaiting export to target systems. | View the product exports management page and list of pending exports. | `GET /api/product_exports` — `src/api/ProductExportAPI.ts:39` | Page: `ProductExportsPage.tsx` |
| `FP_EXPORT_PRODUCT_REQUESTS` | `"export_product_requests"` | Export product change requests to XLSX, CSV, or JSON files for delivery to target systems. Also mark requests as having been exported. | Export product requests to XLSX/CSV/JSON for a target system. Also marks the export as 'exported'. | `GET /api/product_exports/export` — `src/api/ProductExportAPI.ts:103`<br>`POST /api/product_exports/import` (row-level check) — `src/api/ProductExportAPI.ts:215`<br>`PATCH /api/product_exports/:reqId/:tsId/exported` (requires FP_EDIT_EXPORT_STATUS too) — `src/api/ProductExportAPI.ts:380` | `ProductExportsPage.tsx` (controls visibility) |
| `FP_CONFIRM_IMPORT` | `"confirm_import"` | Confirm that a product change request file has been successfully imported into a target system by its operators. Also used during bulk import validation. | Confirm that a product request was successfully imported into a target system. | `POST /api/product_exports/import` (row-level check) — `src/api/ProductExportAPI.ts:215`<br>`PATCH /api/product_exports/:reqId/:tsId/imported` (requires FP_EDIT_EXPORT_STATUS too) — `src/api/ProductExportAPI.ts:463` | `ProductExportsPage.tsx` (controls visibility) |
| `FP_EDIT_EXPORT_STATUS` | `"edit_export_status"` | Manually change the export or import status of a product change request on the exports page. Requires either `FP_EXPORT_PRODUCT_REQUESTS` or `FP_CONFIRM_IMPORT` alongside it — having this permission alone has no effect. | Change the export status dropdown on the product exports page. | `PATCH /api/product_exports/:reqId/:tsId/exported` (with FP_EXPORT_PRODUCT_REQUESTS) — `src/api/ProductExportAPI.ts:380`<br>`PATCH /api/product_exports/:reqId/:tsId/imported` (with FP_CONFIRM_IMPORT) — `src/api/ProductExportAPI.ts:463` | `ProductExportsPage.tsx` (controls visibility) |
| `FP_READ_PRODUCT_FILTER` | `"read_product_filter"` | Use the product search filter to find products. Provides read-only access to reference data needed for filtering (lookup values, consumable values) without granting full access to the master data configuration area. Does NOT grant access to product types. | Use the product search filter to find products. Provides read-only access to reference data needed for filtering (lookup values, consumable values) without granting full access to the master data configuration area. | `GET /api/lookups/values/active` — `src/api/LookupsAPI.ts:445` (alternative to FP_VIEW_LOOKUPS)<br>`GET /api/consumables/values/active` — `src/api/ConsumablesAPI.ts:435` (alternative to FP_VIEW_CONSUMABLES) | None |

---

## 4. Special Permission Behaviors

### `FP_READ_PRODUCT_FILTER` as Alternative Credential

This permission acts as an **alternative** to the primary view permissions (`FP_VIEW_LOOKUPS`, `FP_VIEW_CONSUMABLES`) on specific endpoints. It is designed for users who need to search and filter products but should not have full access to the master data configuration area. Note: `FP_READ_PRODUCT_FILTER` no longer grants access to product types — use `FP_VIEW_PRODUCT_TYPES` for that. Affected endpoints:

- `GET /api/lookups/values/active`
- `GET /api/consumables/values/active`

### `FP_DO_CONFIGURATION` as Gatekeeper

For **all** configuration entity endpoints (target systems, business domains, product types, data types, lookups, and consumables), the caller must hold **both** `FP_DO_CONFIGURATION` AND the domain-specific permission (view or manage). If a user has the domain permission but NOT `FP_DO_CONFIGURATION`, those endpoints will return `403 Forbidden`.

For entities using the generic CRUD route factory (`TargetSystemsAPI`, `BusinessDomainsAPI`, `DataTypesAPI`, `ProductTypesAPI`), the gatekeeper check is enforced via the `gatekeeperPermission` option in `src/api/_crud_API.ts` — applied to all five standard endpoints (list, detail, create, update, disable). Custom sub-routes in `DataTypesAPI.ts` and `ProductTypesAPI.ts` also include inline FP_DO_CONFIGURATION checks.

For lookups and consumables (which predate the `gatekeeperPermission` mechanism), FP_DO_CONFIGURATION is checked inline on custom sub-routes at:

- `src/api/LookupsAPI.ts:242,276,304,435,486,522,561`
- `src/api/ConsumablesAPI.ts:242,276,304,435,486,522,561`

### `GRANT_FUNCTIONAL_PERMISSIONS` — Bootstrap Superuser

This permission is registered at `src/services/Auth.ts:662` and is never checked explicitly in any API route. It is handled implicitly: members of the configured root user group (`cfgRootUserGroup`) bypass all permission checks in `authorize()` and receive every permission automatically. The permission exists primarily so it appears in the permission system and can be granted to the root group.

### `FP_READ_FUNCTIONAL_PERMISSION_GROUPS` — Dead Permission

This permission is registered in the database (via `src/services/auth/FunctionalPermissions.ts:23-24`) and can be granted to groups, but **no API endpoint or UI page enforces it**. Granting it has zero effect. It remains in the system for forward compatibility and should not cause concern — it simply does not gate anything.

### `FP_MANAGE_DATA_TYPES` Overload

In addition to data types CRUD, this permission also guards:

- `GET /api/script_log` — view script execution logs (`src/api/ScriptLogAPI.ts:12`)
- `DELETE /api/script_log` — clear script logs (`src/api/ScriptLogAPI.ts:121`)
- `POST /api/script/*` — execute scripts (`src/api/ScriptApi.ts:46`)
- `DELETE /api/script/:scriptId` — delete script definitions (`src/api/ScriptApi.ts:98`)

Granting `FP_MANAGE_DATA_TYPES` therefore also grants script execution and log management capabilities. There is no separate permission for script management.

### `FP_EDIT_EXPORT_STATUS` Requires a Companion

This permission must be combined with either `FP_EXPORT_PRODUCT_REQUESTS` or `FP_CONFIRM_IMPORT` on the same endpoint. Both permissions are checked together:

- `PATCH /api/product_exports/:reqId/:tsId/exported` requires `FP_EXPORT_PRODUCT_REQUESTS` **and** `FP_EDIT_EXPORT_STATUS`
- `PATCH /api/product_exports/:reqId/:tsId/imported` requires `FP_CONFIRM_IMPORT` **and** `FP_EDIT_EXPORT_STATUS`

Having `FP_EDIT_EXPORT_STATUS` without the companion permission has no effect.

### `FP_NOTIFICATIONS` is Project-Defined but Admin-Grouped

Unlike all other project-defined permissions (which live in Configuration or General groups), `FP_NOTIFICATIONS` appears in the **Admin** group. Its registration is in `src/services/auth/ApplicationDefinedFunctionalPermissions.ts:77-78` but its group is set to `"Admin"` because email notification configuration is considered an administrative function.

---

## 5. Permission Checking Mechanism

### Server-Side: `authorize()` in `src/services/Auth.ts:769-787`

The `authorize(DBClient, tokens, permissions)` function is called inline by every protected API route handler. The call chain:

1. **Empty request:** If no permissions are requested, returns `[]` immediately.
2. **API key detection:** Checks `tokens.apiKeyIdentifier` to distinguish session auth from API key auth.
3. **Root user bypass (session auth only):** Fetches the user and checks membership in the configured root user group. If the user is a root group member, returns the **requested permissions** immediately — no further checks. API keys do NOT get this bypass.
4. **Resolve effective permissions:** Calls `getMyFunctionalPermissions(DBClient, tokens)`:
   - **Session auth:** If user is a root group member, returns ALL permissions from the database. Otherwise, resolves user → group memberships → permission grants via the `functional_permissions_of_group` junction table.
   - **API key auth:** Queries `getApiKeyPermissions()` which consults the `api_keys_functional_permissions` table. Results are cached for 24 hours via TTLMap.
5. **Intersection:** Filters the caller's effective permissions against the requested permissions by matching `identifier`. Returns the intersection.
6. **Route handler response:** If the intersection is insufficient, the route handler returns `403 Forbidden` with the names of the required permissions.

### Frontend-Side: `GET /api/me/context`

1. `src/ui/app.tsx:313-332` fetches `GET /api/me/context` on mount.
2. The handler in `src/api/MeAPI.ts:8-25` calls `getMyFunctionalPermissions()` (not `authorize()`) — returns the user's **full** permission set unfiltered.
3. The response includes `permissionNames: string[]` — all permission string values.
4. `getVisiblePages(permissionNames)` filters the sidebar navigation links.
5. `getAccessiblePages(permissionNames)` filters which routes are registered.
6. Individual page components perform secondary checks like `viewerContext.permissionNames.includes(FP_SOME_PERM.functionalPermissionName)` for fine-grained feature toggling (showing/hiding buttons, edit controls, action menus).

---

## 6. Permission Groups Summary

| Group | Permissions |
|---|---|
| **System** | `GRANT_FUNCTIONAL_PERMISSIONS` |
| **Admin** | `FP_READ_USERS`, `FP_READ_GROUPS`, `FP_READ_GROUP_FUNCTIONAL_PERMISSIONS`, `FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS`, `FP_READ_FUNCTIONAL_PERMISSIONS`, `FP_READ_FUNCTIONAL_PERMISSION_GROUPS`, `FP_READ_API_DOCUMENTATION`, `FP_MANAGE_CONFIGURATION`, `FP_PROLONG_API_KEYS`, `FP_CREATE_API_KEYS`, `FP_VIEW_API_KEYS`, `FP_READ_AUDIT_LOG`, `FP_CLEAR_AUDIT_LOG`, `FP_NOTIFICATIONS` |
| **Configuration** | `FP_DO_CONFIGURATION`, `FP_VIEW_TARGET_SYSTEMS`, `FP_MANAGE_TARGET_SYSTEMS`, `FP_VIEW_PRODUCT_TYPES`, `FP_MANAGE_PRODUCT_TYPES`, `FP_VIEW_BUSINESS_DOMAINS`, `FP_MANAGE_BUSINESS_DOMAINS`, `FP_VIEW_CONSUMABLES`, `FP_MANAGE_CONSUMABLES`, `FP_VIEW_LOOKUPS`, `FP_MANAGE_LOOKUPS`, `FP_VIEW_DATA_TYPES`, `FP_MANAGE_DATA_TYPES` |
| **General** | `FP_VIEW_PRODUCTS`, `FP_CREATE_PRODUCT`, `FP_UPDATE_PRODUCT`, `FP_DISABLE_PRODUCT`, `FP_REQUEST_PRODUCT_UPDATE`, `FP_CREATE_PRODUCT_COPY`, `FP_VIEW_PRODUCT_EXPORTS`, `FP_EXPORT_PRODUCT_REQUESTS`, `FP_CONFIRM_IMPORT`, `FP_EDIT_EXPORT_STATUS`, `FP_READ_PRODUCT_FILTER` |

---

## 7. Key Source Files

| File | Role |
|---|---|
| `src/services/auth/FunctionalPermissions.ts` | Registers 13 upstream/template permissions at startup. Exports `*` from `ApplicationDefinedFunctionalPermissions.ts`. |
| `src/services/auth/ApplicationDefinedFunctionalPermissions.ts` | Registers 24 project-defined permissions at startup. |
| `src/services/Auth.ts` | Core authorization engine: `authorize()` (line 769), `getMyFunctionalPermissions()` (line 741), `isMemberOfRootUserGroup()` (line 699). Also registers `GRANT_FUNCTIONAL_PERMISSIONS` (line 662). |
| `src/ui/auth/functional_permissions.ts` | Canonical permission name constants (merged upstream + project) and UI helper objects (`{ functionalPermissionName: "..." }`). |
| `src/ui/auth/app_functional_permissions.ts` | Project-defined permission name constants, spread-merged into `functional_permissions.ts`. |
| `src/schema/FunctionalPermissionSchema.ts` | Drizzle ORM schema: `functional_permissions` table (definitions) and `functional_permissions_of_group` junction table (assignments). |
| `src/repo/FunctionalPermissionRepo.ts` | Data access layer: `grantFunctionalPermissionToGroup()`, `revokeFunctionalPermissionFromGroup()`, `getFunctionalPermissionsOfUser()`, `registerFunctionalPermission()`. |
| `src/api/MeAPI.ts` | `GET /api/me/context` — returns the current user's full permission set to the frontend. |
| `src/api/_crud_API.ts` | Generic CRUD route factory (`registerConfigurationEntityRoutes()`) with integrated `viewPermission` / `managePermission` / `alternativeListViewPermissions` checks. Used by TargetSystems, BusinessDomains, DataTypes. |
| `src/ui/app.tsx` | Frontend shell: fetches permissions via `/api/me/context`, stores in `ViewerContext.permissionNames`, filters pages and routes. |
| `src/ui/PageRegistry.ts` | Navigation logic: `getVisiblePages()` and `getAccessiblePages()` filter based on `permissionNames`. |
| `src/apps/api.ts` | API application setup: global authentication middleware (lines 71-87), no global authorization middleware. |
