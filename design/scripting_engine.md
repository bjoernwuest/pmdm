# Script Execution Context & API — Concept Document

## 1. Overview

All stored JavaScript scripts in this system currently execute via `new Function("use strict"; …)()` with zero parameters — no awareness of the triggering event, the acting user, or the surrounding data. This document defines a unified, sandboxed execution environment in which every script receives a single context object (`ctx`) providing:

- **awareness** of *why* the script runs (trigger cause, affected data type and product request) and *who* triggered it,
- **read-only access** to the domain model via a structured `ScriptApi` backed by the database connection in scope,
- **mitigated runtime** — dangerous globals shadowed, timeout enforced, no mutation capability.

---

## 2. Script Scope

Six categories of stored scripts exist in the system. All six receive the context.

| Category | Stored as | Applies to kinds | Purpose | Return type |
|---|---|---|---|---|
| **calculation** | `config.script` | `calculated` only | Computes the value for the data type | `any` |
| **defaultProvider** | `config.defaultProvider` | `boolean`, `numeric`, `string`, `lookup`, `consumable`, `product` | Computes a pre-filled default value shown to the user; governed by a `mode` (see §5.2) | `any` |
| **filter** | `config.filter` | `lookup`, `consumable`, `product` | Constrains the set of selectable options (e.g. filter lookup values by a condition) | `any[]` |
| **validate** | `config.validate` | `boolean`, `numeric`, `string`, `lookup`, `consumable`, `product` | Validates a user-entered value on the server; returns `true`/`false` | `boolean` |
| **mandatory_script** | `data_types.mandatory_script` / `product_types_data_types.mandatory_script` | all | Determines whether the field is mandatory for the current request context | truthy/falsy |
| **requestorCanEdit_script** | `data_types.requestor_can_edit_script` / `product_types_data_types.requestor_can_edit_script` | all | Determines whether the request creator can edit this field | truthy/falsy |

- `filter` and `validate` scripts are stored in the database but not yet wired to execution points. This concept covers them so they are design-ready when wiring occurs.
- `validate` scripts execute **server-side only**. They receive full `ctx`.

---

## 3. Context Object (`ctx`)

Every script receives exactly one parameter — `ctx`:

```
ctx = {
    trigger:   { cause, dataTypeIdentifier, productRequestIdentifier, pubsubTags },
    principal: { userId, apiKeyIdentifier, isApiKey },
    api:       ScriptApi,
}
```

### 3.1 `trigger` — why the script runs

| Field | Type | Description |
|---|---|---|
| `cause` | `ScriptTriggerCause` | Discriminator (see §5 for per-script mapping) |
| `dataTypeIdentifier` | `string` (uuid) | The data type that prompted this execution. For `calculation` scripts this is the calculated data type itself; for other script types this is the data type whose value was just changed, whose default is being computed, etc. `null` when no specific data type is the trigger (e.g. `product_request_create`). |
| `productRequestIdentifier` | `string` (uuid) | The product request on which the script runs. Always set (a script never executes without a product request context). |
| `pubsubTags` | `string[] \| null` | The PubSub message tags that triggered execution, when applicable. `null` in most cases; filled when scripts are invoked via a PubSub subscription (future). |

`ScriptTriggerCause` values:

| Value | Triggers |
|---|---|
| `"product_request_create"` | PR is being created (initial calculation, defaultProvider with `on_create`, mandatory/requestorCanEdit evaluation) |
| `"product_request_update"` | A value on the PR was updated (recalculation of `on_change` scripts, defaultProvider with `on_change`/`on_change_no_value`) |
| `"product_request_approve"` | A value was approved or approval was cleared (mandatory evaluation, cascade approval checks) |
| `"product_request_importing"` | PR status → importing; all values approved (executes `on_export` calculation scripts) |
| `"product_type_assign"` | Data type assigned to a product type (backfills defaultProvider values into open requests) |

### 3.2 `principal` — who triggered the script

| Field | Type | Description |
|---|---|---|
| `userId` | `string \| null` | The `oid` (uuid) of the authenticated user. `null` for system-triggered execution (e.g. status transition to importing). |
| `apiKeyIdentifier` | `string \| null` | The uuid of the API key if the request originated from API key authentication. Mutually exclusive with `userId` being non-null. |
| `isApiKey` | `boolean` | Convenience flag — `true` when `apiKeyIdentifier` is set. |

The script author can resolve user/API key metadata by passing the uuid to `api.users.get()` or `api.apiKeys.get()`.

### 3.3 `api` — read-only query API

See §4.

---

## 4. ScriptApi Reference

Every method is **async** — the script body is wrapped in an async IIFE so that `await` can be used at the top level. The `ScriptApi` implementation receives the `DBClient` in scope (transaction client inside `runInTransaction`, pool connection otherwise) and delegates to the existing repository read functions from `src/repo/`.

All entity identifiers are **uuids** (`string`), except for products which are identified by `productNumber` (the primary key of the `products` table).

### 4.1 Current Product Request

| Method | Returns | Description |
|---|---|---|
| `api.request.getValue(dataTypeIdentifier)` | `Promise<any>` | Value of a data type on the current product request, resolved by uuid. `null` if the data type does not exist on this request. |
| `api.request.getAllValues()` | `Promise<Record<string, any>>` | All values on the current request as `{ dataTypeIdentifier: value }`. |
| `api.request.meta()` | `Promise<{ identifier, status, productTypeIdentifier, productTypeName, productNumber, createdBy }>` | Metadata about the current product request. |

### 4.2 Products (master data)

Identified by `productNumber`.

| Method | Returns | Description |
|---|---|---|
| `api.products.get(productNumber)` | `Promise<{ productNumber, productTypeIdentifier, productTypeName, disabled, values: Record<string, any> }>` | Single product enriched with its current values. |
| `api.products.list(filters?)` | `Promise<ProductSummary[]>` | Paginated product list with optional filters. |

### 4.3 Product Requests

Identified by uuid.

| Method | Returns | Description |
|---|---|---|
| `api.productRequests.get(requestIdentifier)` | `Promise<ProductRequestDetail>` | A single product request with its values enriched. |
| `api.productRequests.list(filters?)` | `Promise<ProductRequestSummary[]>` | Product request list filtered by status, product type, creator, etc. |

### 4.4 Data Types

Identified by uuid.

| Method | Returns | Description |
|---|---|---|
| `api.dataTypes.get(identifier)` | `Promise<DataTypeInfo>` | A data type definition including kind, config, mandatory, requestorCanEdit, owner BusinessDomain identifier. |
| `api.dataTypes.list(filters?)` | `Promise<DataTypeInfo[]>` | All data types, optionally filtered by kind or BusinessDomain. |


### 4.5 Users & Groups

Identified by uuid.

| Method | Returns | Description |
|---|---|---|
| `api.users.get(userIdentifier)` | `Promise<UserInfo>` | Single user by identifier. Includes first name, last name, email, disabled flag. |
| `api.users.list(filters?)` | `Promise<UserInfo[]>` | User list, optionally filtered by active/inactive. |
| `api.users.getGroups(userIdentifier)` | `Promise<GroupInfo[]>` | Groups a user belongs to. |
| `api.groups.get(groupIdentifier)` | `Promise<GroupInfo>` | Single group by identifier. |
| `api.groups.list(filters?)` | `Promise<GroupInfo[]>` | All groups. |
| `api.groups.getUsers(groupIdentifier)` | `Promise<UserInfo[]>` | Users belonging to a group. |

### 4.6 Lookups

Lookup definitions identified by uuid; values resolved by the lookup definition's identifier.

| Method | Returns | Description |
|---|---|---|
| `api.lookups.get(identifier)` | `Promise<LookupDefinition>` | A lookup definition (name, description, source system). |
| `api.lookups.getValues(identifier, filters?)` | `Promise<LookupValue[]>` | All values of a lookup. |


### 4.7 Consumables

Same pattern as lookups.

| Method | Returns | Description |
|---|---|---|
| `api.consumables.get(identifier)` | `Promise<ConsumableDefinition>` | A consumable definition. |
| `api.consumables.getValues(identifier, filters?)` | `Promise<ConsumableValue[]>` | All values of a consumable, optionally filtered by `isUsed` or `disabled`. |

### 4.8 Target Systems

Identified by uuid.

| Method | Returns | Description |
|---|---|---|
| `api.targetSystems.get(identifier)` | `Promise<TargetSystemInfo>` | A target system definition. |
| `api.targetSystems.list()` | `Promise<TargetSystemInfo[]>` | All target systems. |

### 4.9 Business Domains

Identified by uuid.

| Method | Returns | Description |
|---|---|---|
| `api.businessDomains.get(identifier)` | `Promise<BusinessDomainInfo>` | A business domain definition. |
| `api.businessDomains.list()` | `Promise<BusinessDomainInfo[]>` | All business domains. |

### 4.10 Product Types

Identified by uuid.

| Method | Returns | Description |
|---|---|---|
| `api.productTypes.get(identifier)` | `Promise<ProductTypeInfo>` | A product type definition including its assigned data types. |
| `api.productTypes.list()` | `Promise<ProductTypeInfo[]>` | All product types. |

### 4.11 Permissions

| Method | Returns | Description |
|---|---|---|
| `api.permissions.functional(userIdentifier)` | `Promise<string[]>` | Effective functional permission names for a user (resolved via group memberships). |
| `api.permissions.dataType(dataTypeIdentifier, productTypeIdentifier?)` | `Promise<{ groupIdentifier, groupName, role }[]>` | Groups and their roles (viewer/writer/approver) on a data type, optionally scoped to a product type. |

### 4.12 API Keys

Identified by uuid.

| Method | Returns | Description |
|---|---|---|
| `api.apiKeys.get(apiKeyIdentifier)` | `Promise<ApiKeyInfo>` | An API key by identifier. Includes name, creator, expiry, disabled flag. |
| `api.apiKeys.list()` | `Promise<ApiKeyInfo[]>` | All API keys. |

### 4.13 Previous Approvals (dependencies)

| Method | Returns | Description |
|---|---|---|
| `api.previousApprovals.getDependencies(dataTypeIdentifier, productTypeIdentifier)` | `Promise<string[]>` | Data type uuids that must be approved before the given data type. |
| `api.previousApprovals.getDependants(dataTypeIdentifier, productTypeIdentifier)` | `Promise<string[]>` | Data type uuids that depend on the given data type being approved first. |

### 4.14 Utility

| Method | Returns | Description |
|---|---|---|
| `api.log(level, message)` | `void` | Write a message to the server log. Levels: `"debug"`, `"info"`, `"warn"`, `"error"`. Non-blocking (fire-and-forget). |

### Explicitly excluded

- **Configuration** entries — contain sensitive data (API secrets, database URLs, OIDC client secrets). Not exposed to scripts.
- **Audit log** — internal operation log. Not exposed to scripts.

---

## 5. Execution Scenarios — per Script Category

### 5.1 `calculation` scripts

| Execution point | `ctx.trigger.cause` | `ctx.trigger.dataTypeIdentifier` | `ctx.principal` |
|---|---|---|---|
| Product request creation (non-export mode) | `"product_request_create"` | uuid of this calculated data type | The creating user |
| After a non-calculated value is updated (on_change mode) | `"product_request_update"` | uuid of this calculated data type | The user who made the update |
| Product request status transitions to `importing` (on_export mode) | `"product_request_importing"` | uuid of this calculated data type | `null` (system-driven) |

`productRequestIdentifier` is always the uuid of the product request the script runs on.

**On-export caching:** The existing `recalculateOnExportCalculatedValues` function (`ProductRequestRepo.ts:1465-1515`) already executes all `on_export` scripts when a request transitions to `importing` and persists each result into `ProductRequestsValues.value`. This is the caching mechanism — the computed value is stored in the database and becomes the authoritative value for exports. No additional caching layer is needed.

### 5.2 `defaultProvider` scripts — Mode Enforcement

The `DefaultValueCalculationMode` is enforced according to the following semantics:

| Mode | When it executes | Effect on approval |
|---|---|---|
| `on_create` | Only once — when the product request is first created (new or copy). **Not** re-executed on later value changes. | None (runs before any approval) |
| `on_change_no_value` | (1) On product request creation, AND (2) every time any non-calculated value on the same request changes — **unless** this data type already has a user-assigned value (`value IS NOT NULL`) or is currently approved (`approvedAt IS NOT NULL`). In other words, the default is recalculated only as long as the user has not yet provided or approved a value. | None (only runs when no value/approval exists) |
| `on_change` | (1) On product request creation, AND (2) every time any non-calculated value on the same request changes — **regardless** of whether a value exists or is approved. | **Breaks approval**: when this mode recalculates, any existing approval on this data type is cleared (`approvedBy` → null, `approvedAt` → null). |

The default value result is stored in `ProductRequestsValues.defaultValue`. The `value` column is never overwritten by `defaultProvider` — it remains `null` until the user explicitly enters a value.

**Implementation note:** `defaultProvider` recalculations are triggered by the same code path that recalculates calculation scripts (`updateProductRequestValue` → after the value update). A `recalculateDefaultValues()` function mirrors `recalculateOnChangeCalculatedValues()` and runs in the same batch. For `on_change_no_value`, the guard checks `value IS NULL AND approvedAt IS NULL`. For `on_change`, the guard only checks the mode (always recalculates) and clears approval.

### 5.3 `mandatory_script` scripts (yesnoscript)

| Execution point | `ctx.trigger.cause` | `ctx.trigger.dataTypeIdentifier` | `ctx.principal` |
|---|---|---|---|
| Product request detail view (enrichment) | `"product_request_create"` (initial view of a new request) or `"product_request_update"` (view after a change) | uuid of the data type being evaluated for mandatory | The viewing user |
| Product request list view (actionable summary) | depends on the list context | uuid of the data type being evaluated | The viewing user |
| Approval gate (single / bulk approve) | `"product_request_approve"` | uuid of the data type being evaluated | The approving user |

### 5.4 `requestorCanEdit_script` scripts (yesnoscript)

| Execution point | `ctx.trigger.cause` | `ctx.trigger.dataTypeIdentifier` | `ctx.principal` |
|---|---|---|---|
| Product request detail view (enrichment) | depends on the view context | uuid of the data type being evaluated | The viewing user |
| Product request list view (actionable summary) | depends on the list filter context | uuid of the data type being evaluated | The viewing user |

### 5.5 `filter` scripts (not yet wired)

| Intended execution point | `ctx.trigger.cause` | `ctx.principal` |
|---|---|---|
| Populating selection dropdowns (lookup/consumable/product pickers) | `"product_request_create"` or `"product_request_update"` | The user editing the value |

Executed on the server when the UI requests the set of available options for a dropdown. Returns the filtered subset.

### 5.6 `validate` scripts (not yet wired)

Validation executes **server-side only**, before persisting a value in `updateProductRequestValue`. The script receives full `ctx` — it can query related data via the API to make cross-field validation decisions.

| Execution point | `ctx.trigger.cause` | `ctx.principal` |
|---|---|---|
| Before persisting a value in `updateProductRequestValue` | `"product_request_update"` | The user submitting the value |

Return `true` for valid, `false` (or any falsy value) for invalid. On invalid, the update is rejected with an error that propagates to the UI.

> The browser-side validation path that was previously proposed is **removed**. The Monaco editor in the UI may still syntax-highlight the script, but execution always happens on the server with full `ctx` available.

---

## 6. Architecture

### 6.1 Layering

```
src/services/ScriptEngine.ts    ← Business logic: script compilation in a
                                     sandboxed environment, context construction,
                                     ScriptApi factory, error handling, timeout
                                     enforcement, log relay.
src/api/ScriptApi.ts            ← Network layer: REST endpoints for script
                                     authoring support (preview execution,
                                     syntax validation).
```

### 6.2 ScriptEngine responsibilities

- **Sandboxed execution**: Compile and run scripts in a mitigated environment (see §8.1).
- **Context factory**: Given the current execution scenario, construct the full `ScriptExecutionContext` including the `ScriptApi` implementation backed by the provided `dbClient`.
- **Timeout enforcement**: Apply a configurable wall-clock timeout per execution (§8.2).
- **Error handling**: Catch runtime script errors, log them with structured metadata (script category, trigger, principal, stack trace), return `null` gracefully.
- **Log relay**: Forward `api.log()` calls to the server's logging infrastructure.

### 6.3 ScriptApi (API layer) responsibilities

- Provide REST endpoints for script authoring support:
    - `POST /api/scripts/preview` — execute a script body in a sandbox against a real product request (`requestId` in the body) and return the result.
    - `POST /api/scripts/validate` — syntax-check a script (parse without executing).
- Gate access via functional permissions (e.g. `FP_MANAGE_DATA_TYPES` or a dedicated `FP_SCRIPT_PREVIEW`).

### 6.4 Execution flow

```
Caller (e.g. createProductRequest, updateProductRequestValue)
  │
  ├─ Builds ScriptExecutionContext via ScriptEngine.buildContext(tx, ...)
  │     └─ Constructs ScriptApiImpl(tx) wrapping the DBClient
  │
  ├─ Calls ScriptEngine.execute(script, ctx)
  │     └─ Compiles: new Function with whitelisted globals (see §8.1)
  │     └─ Wraps in async IIFE for top-level await
  │     └─ Awaits with timeout via Promise.race
  │     └─ On error or timeout: logs, returns null
  │
  └─ Uses result
```

### 6.5 DBClient injection

The caller passes the DBClient that is in scope:
- Inside `runInTransaction`: the transaction client (`tx`). Scripts see uncommitted data written by prior steps in the same transaction — consistent with the surrounding business logic.
- Outside a transaction (e.g. REST endpoint for script preview, future cron triggers): `getDatabaseConnection()`. Scripts see committed data.

### 6.6 Scripts do not trigger further scripts

A script's output (its return value written to `ProductRequestsValues.value` or `defaultValue`) never triggers another round of script execution. Specifically:
- Changing a calculated value does **not** trigger recalculation of other calculated values (existing guard: `kind !== DataTypeKind.Calculated`).
- A defaultProvider recalculation does **not** trigger calculation scripts — only user-initiated value changes (via `updateProductRequestValue`) do.
- This prevents infinite loops and cascading side effects. Scripts that depend on other calculated values should read those values via `ctx.api.request.getValue()` within their own script.

---

## 7. Script Writing Patterns

### 7.1 Basic calculation referencing another value

```javascript
const lookupVal = await ctx.api.request.getValue('uuid-of-lookup-dt');
if (!lookupVal) return null;
return 'Derived: ' + String(lookupVal).toUpperCase();
```

### 7.2 Default value based on product type

```javascript
const meta = await ctx.api.request.meta();
const pt = await ctx.api.productTypes.get(meta.productTypeIdentifier);
const category = await ctx.api.request.getValue('uuid-of-category-dt');
if (category === pt.name) return 100;
return 0;
```

### 7.3 Mandatory only if a condition is met

```javascript
const regClass = await ctx.api.request.getValue('uuid-of-regulatory-class-dt');
return regClass === 'regulated';
```

### 7.4 Filter available lookup values

```javascript
const meta = await ctx.api.request.meta();
const pt = await ctx.api.productTypes.get(meta.productTypeIdentifier);
const values = await ctx.api.lookups.getValues('lookup-uuid');
return values.filter(v => v.name.startsWith(pt.name[0]));
```

### 7.5 Trigger-aware calculation

```javascript
if (ctx.trigger.cause === 'product_request_create') {
    return 'Awaiting input...';
}
const source = await ctx.api.request.getValue('uuid-of-source-dt');
return source ? source * 2 : null;
```

### 7.6 Debug logging

```javascript
ctx.api.log('info', 'Calculating for request ' + ctx.trigger.productRequestIdentifier);
const v = await ctx.api.request.getValue('uuid-of-some-dt');
return v ? v.toUpperCase() : null;
```

---

## 8. Execution Environment & Constraints

### 8.1 Mitigated execution environment (sandbox)

Scripts execute via `new Function()` but in a mitigated scope — dangerous Node.js and browser globals are shadowed to `undefined`. The function is constructed with explicit parameter names for both the context and each shadowed global:

```
new Function(
    "ctx",
    "process", "require", "global", "globalThis",
    "console", "fetch", "eval", "Function",
    "setTimeout", "setInterval", "setImmediate",
    "clearTimeout", "clearInterval", "clearImmediate",
    "XMLHttpRequest", "WebSocket",
    "module", "exports", "__dirname", "__filename",
    "return (async () => { ${scriptBody} })();"
);
```

Each shadowed parameter is passed as `undefined` at call time. The script body is wrapped in an async IIFE so that top-level `await` is available.

**Standard library available** (NOT shadowed): `Object`, `Array`, `String`, `Number`, `Boolean`, `Date`, `RegExp`, `Math`, `JSON`, `Map`, `Set`, `WeakMap`, `WeakSet`, `Symbol`, `Promise`, `Error`, `SyntaxError`, `TypeError`, `RangeError`, `ReferenceError`, `URIError`, `ArrayBuffer`, `DataView`, `Int8Array`, `Uint8Array`, `Uint8ClampedArray`, `Int16Array`, `Uint16Array`, `Int32Array`, `Uint32Array`, `Float32Array`, `Float64Array`, `isNaN`, `isFinite`, `parseInt`, `parseFloat`, `encodeURI`, `decodeURI`, `encodeURIComponent`, `decodeURIComponent`, `NaN`, `Infinity`, `undefined`, `null`.

**Accepted residual risk:** The `Function.prototype.constructor` escape path (`[].constructor.constructor("return 1")()`) is not blocked because it would require replacing `Object` and `Array` with proxies, which breaks common JavaScript patterns and would make scripts confusing to write. Script authors are trusted data type administrators who can already configure any data type's behavior. The mitigations above block the most common accidental or naive escape vectors while keeping scripts idiomatic.

### 8.2 Script limitations (configurable)

Script execution limits are stored as configuration entries (domain `"script_engine"`, not mandatory for system startup, editable via the UI):

| Config key | Type | Default | Description |
|---|---|---|---|
| `calculationTimeoutMs` | `number` | `5000` | Maximum wall-clock time (ms) for a `calculation` script. Exceeded → script aborted, `null` returned. |
| `defaultProviderTimeoutMs` | `number` | `3000` | Maximum wall-clock time (ms) for a `defaultProvider` script. |
| `mandatoryScriptTimeoutMs` | `number` | `1000` | Maximum wall-clock time (ms) for a `mandatory_script` / `requestorCanEdit_script`. |
| `filterTimeoutMs` | `number` | `2000` | Maximum wall-clock time (ms) for a `filter` script. |
| `validateTimeoutMs` | `number` | `2000` | Maximum wall-clock time (ms) for a `validate` script. |

Timeout is enforced via `Promise.race()`:
```javascript
const result = await Promise.race([
    scriptFn(ctx, ...shadowedUndefineds),
    new Promise((_, reject) => setTimeout(() => reject(new ScriptTimeoutError()), timeoutMs)),
]);
```

When the timeout fires, the script's async execution continues in the background but its result is discarded and `null` is returned.

**Memory limit:** Not enforced per-script. The Node.js/Bun process-wide `--max-old-space-size` flag is the only memory control. This is an accepted limitation.

---

## 9. Relation to Existing Code

| Existing function / location | Impact |
|---|---|
| `executeScript()` in `ProductRequestRepo.ts` (line 2059) | Replaced by `ScriptEngine.execute()`. The sandboxed `new Function` call and timeout logic live in the engine. |
| `resolveYesNoScript()`, `resolveMandatory()`, `resolveRequestorCanEdit()` in `ProductRequestRepo.ts` | Updated to pass `ScriptExecutionContext` (built once per request/view). These become callers of `ScriptEngine.buildContext()` + `ScriptEngine.execute()`. |
| Direct `new Function()` in `ProductTypeRepo.ts` (line 148) — executes defaultProvider during `assignDataType()` | Replaced by `ScriptEngine.execute()`. Receives context with `cause: "product_type_assign"`. |
| `recalculateOnChangeCalculatedValues()` in `ProductRequestRepo.ts` | Updated to (a) accept `changedDataTypeIdentifier` and pass it into the trigger, (b) call `ScriptEngine.buildContext()` once before the loop, (c) call `ScriptEngine.execute()` per script. |
| `recalculateOnExportCalculatedValues()` in `ProductRequestRepo.ts` | Updated to call `ScriptEngine.buildContext()` once before the loop, and `ScriptEngine.execute()` per script. |
| `createProductRequest()` in `ProductRequestRepo.ts` | Updated to build context once and pass it to `ScriptEngine.execute()` for both `calculation` and `defaultProvider` scripts. |
| (new) `recalculateDefaultValues()` in `ProductRequestRepo.ts` | New function mirroring `recalculateOnChangeCalculatedValues()` for `defaultProvider` with `on_change` / `on_change_no_value` modes. Called from `updateProductRequestValue` after the value update. Enforces mode semantics (§5.2). |
| `getProductRequest()`, `computeActionableSummary()` | `resolveMandatory`/`resolveRequestorCanEdit` calls updated to pass context. |
| `approveProductRequestValue()` | `resolveMandatory` call updated to pass context with `"product_request_approve"` trigger cause. |
| `filter` / `validate` scripts | Not yet wired. Context design is ready when they are wired. |

---

## 10. Open Design Question

**Script timeout enforcement without worker threads:** Scripts run on the main thread. The `Promise.race`-based timeout detects runaway scripts and discards their result, but does not halt their execution — an infinite loop will still block the event loop. This is accepted since script authors are trusted data type administrators. If event-loop blockage becomes a problem, the only mitigation is manual intervention (restart) or pre-emptive code review of submitted scripts.
