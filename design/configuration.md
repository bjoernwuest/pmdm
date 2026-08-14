# Configuration Parameter Concept

This document describes how application configuration is defined, validated, stored, and consumed.

## Goals

- Keep all runtime configuration in one central table (`config`).
- Let each service declare its own configuration contract close to the code that uses it.
- Support an interactive setup flow for mandatory values.
- Enforce data-type consistency at declaration time, setup-time parsing, and database schema level.

## Data Model

Configuration entries are persisted in [`src/schema/ConfigSchema.ts`](src/schema/Config.ts) as table `config` with a composite primary key
`(domain, key)`. The table is defined via Drizzle ORM.

Main columns (database column names in parentheses where they differ from the TS property):

- `domain` (`domain`): varchar(255), not null — groups related parameters.
- `key` (`key`): varchar(255), not null — parameter name within the domain.
- `description` (`description`): text, nullable — human-readable explanation.
- `type` (`type`): text, not null — one of the [`ConfigValueTypes`](src/schema/Config.ts:15) values (see Supported Value Types below).
- `value` (`value`): jsonb — the actual configuration value.
- `editInUI` (`edit_in_ui`): boolean, not null, default `true` — whether the admin UI should expose this entry.
- `inputFormat` (`input_format`): text, not null, default `""` — a regex pattern for scalar string/number validation, or a JSON Schema object for `object` types, or an empty string for no constraint.
- `outputFormat` (`output_format`): text, not null, default `""` — optional rendering/display hint.
- `mandatoryForStart` (`mandatory_for_start`): boolean, not null, default `false` — whether startup must block until this entry has a value.

Primary key constraint: `config_domain_key_pk` on `(domain, key)`.

**Important:** The `type` column is stored as `text` in the database — there is no PostgreSQL enum type backing it. The set of allowed values is enforced purely in TypeScript through the [`ConfigValueTypes`](src/schema/ConfigSchema.ts:15) const object, which is the single hand-maintained definition. The typegen script (`scripts/generate_types.ts`) copies it into the generated file [`src/types/_ConfigType.ts`](src/types/_ConfigType.ts:4) — that copy is a build artifact, never edited by hand.

## Supported Value Types

The [`ConfigValueTypes`](src/schema/ConfigSchema.ts:15) const object (with its generated copy in [`src/types/_ConfigType.ts`](src/types/_ConfigType.ts:4)) defines the following allowed types:

- `string`
- `number`
- `boolean`
- `object`
- `string[]`
- `number[]`

Both [`ConfigEntryType`](src/types/Config.ts:22) and [`NewConfigEntryType`](src/types/Config.ts:34) (defined in [`src/types/ConfigSchema.ts`](src/types/Config.ts)) use these types in their `type` field. The type alias [`ConfigEntryDataType`](src/types/Config.ts:10) is exported for convenience.

Type-to-schema mapping is provided by [`schemaForConfigType()`](src/types/Config.ts:44) which maps each [`ConfigValueTypes`](src/schema/Config.ts:15) value to a TypeBox `TSchema`. The setup wizard has its own equivalent function `schemaForType()` defined locally in [`src/apps/setup.ts`](src/apps/setup.ts:35) using Elysia `t` schemas.

## Where Parameters Are Declared

Services declare their parameter definitions in exported `config` objects. Each service file that participates:

- [`src/services/AuthType.ts`](src/services/Auth.ts) — domain `"Authentication and Authorization"`, e.g. `cfgRootUserGroup`
- [`src/services/EntraIDSync.ts`](src/services/EntraIDSync.ts) — domain `"EntraID"`, e.g. `cfgClientId` and several others
- [`src/services/RequestBundlingType.ts`](src/services/RequestBundling.ts) — domain `"Request Bundling"`, e.g. `cfgServerFlushMs`
- [`src/services/AuditLogAPI.ts`](src/services/AuditLog.ts) — domain `"Audit Logging"`, e.g. `cfgFlushIntervalMs`
- [`src/services/ui_config.ts`](src/services/ui_config.ts) — domain `"User Interface"`, e.g. `cfgUserListPageSizes`

Each entry is typed as [`ConfigEntryType`](src/types/Config.ts:22) (using `satisfies ConfigEntryType`).

Example pattern:

```ts
export const config = {
  cfgExample: {
    domain: "My Service",
    key: "ExampleKey",
    description: "What this parameter controls.",
    type: ConfigValueTypes.number,
    value: undefined,
    inputFormat: "^[1-9][0-9]*$",
    outputFormat: "",
    editInUI: true,
    mandatoryForStart: false,
  },
} satisfies Record<string, ConfigEntryType>;
```

## Lifecycle and Management Flow

### 1) Declaration

A service declares config metadata in its `config` export (see above).

### 2) Discovery of Missing Mandatory Parameters

[`src/services/Setup.ts`](src/services/Setup.ts) contains [`getMissingConfigParameters()`](src/services/Setup.ts:47) which walks [`src/services/*.ts`](src/services/) (skipping itself), dynamically imports each module, and inspects `export const config`.

For each entry where `mandatoryForStart` is `true`, it checks whether the entry already exists in the database via [`getConfigEntriesByKey()`](src/repo/ConfigRepo.ts:28). Missing entries are collected into a `Map<string, ConfigEntryType[]>` keyed by `domain`.

The public function [`getSetupDemand()`](src/services/Setup.ts:94) caches and returns this map. If the map is empty (size 0), no setup is required.

### 3) Setup UI Flow

The default export function `setupApp()` in [`src/apps/setup.ts`](src/apps/setup.ts) checks [`getSetupDemand()`](src/services/Setup.ts:94). If the demand map is empty, it returns immediately (setup is skipped). Otherwise it starts a standalone Elysia server with these endpoints:

- `GET /` — serves the setup wizard HTML page (with the React client bundle at `/setup/client.js`).
- `GET /setup/client.js` — serves the compiled client JavaScript bundle with ETag caching.
- `POST /setup/demand` — accepts `{ setupKey: string }` and returns `{ done: boolean, sections: [...], current: ..., remaining: number }` describing all remaining configuration sections.
- `POST /setup` — accepts `{ setupKey, sectionTitle, values }` (a map of key→raw value for one section). Parses and validates each value, persists via [`upsertConfigEntry()`](src/repo/ConfigRepo.ts:72) inside a transaction via [`runInTransaction()`](src/services/DatabaseDriver.ts), then returns the next demand or `{ done: true }`.

The setup key is a random 50-character alphanumeric token generated by [`getSetupKey()`](src/services/Setup.ts:21) and printed to the console. All setup endpoints check this key for authorization.

The setup server polls every 2 seconds for demand completion and stops automatically when no mandatory entries remain missing.

### 4) Type Parsing + Validation During Setup

Both the setup wizard and the admin API share parsing/validation logic via [`src/services/ConfigSchema.ts`](src/services/Config.ts):

- [`parseConfigValue(type, raw): ConfigValueParseResult`](src/services/Config.ts:7) — parses raw input according to the declared type. Handles coercion for numbers and booleans (including string representations). For `object`, `string[]`, and `number[]` types, it accepts pre-parsed objects or JSON strings, with a comma-split fallback for `string[]`.
- [`validateConfigInputFormat(entry, raw): ConfigValueParseResult`](src/services/Config.ts:48) — validates parsed values against the entry's `inputFormat` regex. For array types, validates each element. Only applies to `string`, `number`, `string[]`, and `number[]` types.
- [`schemaForConfigType(type): TSchema`](src/types/Config.ts:44) — maps type to TypeBox schema for use with `Value.Check()`.

The setup wizard itself defines local `schemaForType()` (Elysia `t`-based) and `parseValue()` functions in [`src/apps/setup.ts`](src/apps/setup.ts).

### 5) Persistence

[`upsertConfigEntry(db, entry)`](src/repo/ConfigRepo.ts:72) in [`src/repo/ConfigRepo.ts`](src/repo/ConfigRepo.ts) inserts or updates by `(domain, key)`. Before writing, it validates the payload shape with [`ConfigEntrySchema`](src/types/_Config.ts:17) (a TypeBox schema generated from the Drizzle model) using `Value.Check()`.

Other repository functions:

- [`getConfigEntriesByKey(db, domain, pattern, opts?)`](src/repo/ConfigRepo.ts:28) — finds entries by exact key match, regex match (`~` operator), or case-insensitive contains (`ILIKE`), with an optional `limit`.
- [`getAllConfigEntries(db, uiOnly?)`](src/repo/ConfigRepo.ts:90) — returns all entries, optionally filtered to `editInUI = true`.
- [`regExFriendly(in)`](src/repo/ConfigRepo.ts:14) — escapes special characters for safe regex use in PostgreSQL.

### 6) Runtime Consumption

Services read values using [`getConfigEntriesByKey()`](src/repo/ConfigRepo.ts:28) and apply local fallback logic where appropriate. For example, [`getUserListPageSizes(db)`](src/services/ui_config.ts:31) in [`src/services/ui_config.ts`](src/services/ui_config.ts) reads the "UserListPageSizes" entry, upserts it with defaults if missing, and parses the result with a validation fallback.

## Admin API Endpoints

Configuration is also exposed through the main API (registered via [`src/api/ConfigSchema.ts`](src/api/Config.ts) in the API app):

- `GET /config` — returns all entries with `editInUI = true`, grouped by domain and sorted. Requires `FP_MANAGE_CONFIGURATION` permission. Returns `{ domains: ConfigDomainGroup[] }` using [`ConfigDomainsResponseSchema`](src/types/Config.ts:96).
- `PUT /config/:domain/:key` — updates a single configuration entry. Requires `FP_MANAGE_CONFIGURATION`. Uses **optimistic locking**: the request body must contain both `value` (new value) and `knownValue` (the value the client last saw). If `knownValue` does not match the current DB value (compared via JSON canonicalization), the endpoint returns `409 Conflict` with `{ error, currentValue }` using [`ConfigUpdateConflictSchema`](src/types/Config.ts:113). On success, it publishes a [`pubsub_ConfigUpdated`](src/types/Config.ts:42) event via [`PubSub`](src/services/PubSub.ts) and returns the updated entry.

### TypeBox Schemas (for route validation & OpenAPI docs)

Defined in [`src/types/ConfigSchema.ts`](src/types/Config.ts):

| Schema | Purpose |
|--------|---------|
| [`ConfigEntryUiSchema`](src/types/Config.ts:79) | Single UI-visible config entry shape |
| [`ConfigDomainGroupSchema`](src/types/Config.ts:90) | Domain + array of entries |
| [`ConfigDomainsResponseSchema`](src/types/Config.ts:96) | `GET /config` response body |
| [`ConfigUpdateBodySchema`](src/types/Config.ts:101) | `PUT /config/:domain/:key` request body |
| [`ConfigParamsSchema`](src/types/Config.ts:107) | `PUT /config/:domain/:key` path params |
| [`ConfigUpdateConflictSchema`](src/types/Config.ts:113) | `409 Conflict` response body |

### Key Types

| Type | Location | Purpose |
|------|----------|---------|
| [`ConfigEntry`](src/types/_Config.ts:28) | Generated from Drizzle `$inferSelect` | Full DB row shape |
| [`ConfigEntryInsert`](src/types/_Config.ts:41) | Generated from Drizzle `$inferInsert` | Insert shape (optional fields) |
| [`ConfigEntryType`](src/types/Config.ts:22) | `Omit<ConfigEntry, "type"> & { type: ConfigEntryDataType }` | Select model with typed `type` field |
| [`NewConfigEntryType`](src/types/Config.ts:34) | `Omit<ConfigEntryInsert, "type"> & { type: ConfigEntryDataType }` | Insert model with typed `type` field |
| [`ConfigEntryUI`](src/types/Config.ts:38) | `Pick<ConfigEntry, "domain" \| "key" \| "description" \| "type" \| "value" \| "inputFormat" \| "outputFormat">` | Subset exposed to UI |
| [`ConfigDomainGroup`](src/types/Config.ts:63) | `{ domain: string; entries: ConfigEntryUI[] }` | Grouped entries for UI |
| [`ConfigListResponse`](src/types/Config.ts:68) | `{ domains: ConfigDomainGroup[] }` | API list response |
| [`ConfigUpdateRequest`](src/types/Config.ts:72) | `{ value: unknown; knownValue: unknown }` | Optimistic lock update payload |

## PubSub Integration

After a successful update via `PUT /config/:domain/:key`, the server publishes to channel [`pubsub_ConfigUpdated`](src/types/Config.ts:42) (`"config.updated"`) with a payload of `{ domain, key, value, updatedAt }`.

The admin config UI ([`AdminConfigList`](src/ui/pages/AdminConfigList.tsx)) subscribes to `"config.updated"` and automatically reloads entries when notified, keeping the list synchronized across browser tabs.

## Client-Side API

[`src/ui/api/ConfigSchema.ts`](src/ui/api/Config.ts) provides:

- [`getConfigEntries(): Promise<ConfigListResponse>`](src/ui/api/Config.ts:8) — calls `GET /api/config`.
- [`updateConfigEntry(domain, key, data): Promise<ConfigEntryUI>`](src/ui/api/Config.ts:12) — calls `PUT /api/config/:domain/:key` with [`ConfigUpdateRequest`](src/types/Config.ts:72) body.

These use the [`apiGet` / `apiPut`](src/ui/api/index.ts) helpers from the request bundling layer.

## Admin Config List UI

[`src/ui/pages/AdminConfigList.tsx`](src/ui/pages/AdminConfigList.tsx) provides a full admin page (`/admin/config`) for viewing and editing configuration entries. It supports:

- **Inline editing** for `string`, `number`, and `boolean` types with client-side validation (regex `inputFormat` for string/number).
- **JSON editor** (Monaco-based) for `object` type entries, with optional JSON Schema validation via `inputFormat`.
- **Array editor** for `string[]` and `number[]` types, with per-item validation against `inputFormat` regex.
- **Optimistic locking**: on `409 Conflict`, the UI reloads entries and informs the user.
- **PubSub subscription** to `"config.updated"` for real-time synchronization.

## Design Rules

When adding a new configuration parameter:

1. Add it to the owning service `config` export.
2. Use `type: ConfigValueTypes.<kind>` (never raw string literals).
3. Set `mandatoryForStart` to `true` only if startup must block without it.
4. Provide clear `description`; add `inputFormat` if user input should be constrained (regex for scalars/arrays, JSON Schema object for `object` type).
5. Read via repo functions and cast/validate at the use site as needed.

## Operational Notes

- The `type` column is stored as `text` in PostgreSQL (no database enum). The allowed values are enforced by the TypeScript [`ConfigValueTypes`](src/schema/Config.ts:15) const object and validated at the application layer through TypeBox schemas.
- Setup mode exits automatically when no mandatory entries are missing.
- Non-mandatory parameters can still be defined and managed through the admin UI or API without blocking startup.
- Optimistic locking on the `PUT /config/:domain/:key` endpoint uses JSON canonicalization to compare the client's `knownValue` against the current database value. Mismatch returns `409 Conflict`.
- Configuration updates are broadcast via PubSub so that the admin UI stays synchronized across browser tabs/sessions.
