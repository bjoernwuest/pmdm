# User Profile Concept

## Overview

A **user profile** is a set of per-user configuration overrides for config entries that are marked as user-configurable (`userProfile: true` in the `config` table). Each user can customize their own values, which take precedence over the system-wide defaults when the application reads configuration for that user.

This allows individual users to personalize aspects of the UI (e.g., preferred page sizes) without affecting other users, while still falling back to global defaults when no override is set.

## Data Model

### `config` table extension

The existing `config` table gains a `user_profile` boolean column (default `false`). When `true`, the configuration entry is eligible for per-user overrides.

### `user_profile_config` table (new)

Stores per-user overrides. Primary key is `(domain, key, user_identifier)`.

| Column | Type | Description |
|---|---|---|
| `domain` | `varchar(255)` | Matches `config.domain` |
| `key` | `varchar(255)` | Matches `config.key` |
| `user_identifier` | `uuid` | FK to `users.identifier`, cascades on delete |
| `value` | `jsonb` | The user's override value, same type as `config.value` |

## User Flow

1. An admin marks a config entry as `userProfile: true` (via the existing config management page or during service declaration).
2. Users access their profile page by clicking their avatar in the bottom-left sidebar.
3. The profile page lists all config entries where `userProfile === true`, showing the global default value and the user's current override (if any).
4. Each entry can be edited inline; the user's override is saved to `user_profile_config`. Removing an override falls back to the global default.
5. When the application reads configuration at runtime (e.g., `getUserListPageSizes`), it checks for a user override first, falling back to the global `config` value.

## API Design

### `GET /api/me/config`

Returns all config entries where `userProfile === true`, each with both the global default value and the current user's override (null if not set).

- **Auth:** Any authenticated user.
- **Response:** `{ entries: [{ domain, key, description, type, value (global default), userValue (user override | null), inputFormat, outputFormat }] }`

### `PUT /api/me/config/:domain/:key`

Upserts or deletes the current user's override for a specific config entry.

- **Auth:** Session-only (rejects API key / bearer token).
- **Body:** `{ value: unknown, knownValue?: unknown }` — `knownValue` for optimistic locking.
- **Reset to default:** Send `{ value: null }` to delete the override row.
- **Validation:** Same validation as the admin config endpoint (`parseConfigValue`, `validateConfigInputFormat`, TypeBox schema check).

## Runtime Integration

The `getUserListPageSizes(db, userIdentifier?)` function is the exemplar of the override pattern:

1. Fetch the global config entry (default value).
2. If `userIdentifier` is provided, check for a user override in `user_profile_config`.
3. If an override exists and is non-null, use it; otherwise fall back to the global default.

All API endpoints that call `getUserListPageSizes` pass `claims.oid` as the user identifier.

## Security

- Only the owning user can modify their own profile overrides (enforced by session check on the PUT endpoint).
- Admin users with `FP_MANAGE_CONFIGURATION` can see which entries are user-configurable but cannot modify individual user overrides through the admin config UI.
- The user profile PUT endpoint rejects API key and bearer token auth — only session-based access is permitted.
- Optimistic locking prevents lost updates across multiple browser tabs.

## PubSub

- Tag constant: `TAG_USER_PROFILE_CONFIG = "user_profile_config"`
- Published after each successful user profile config mutation, with tags: `[TAG_USER_PROFILE_CONFIG, domain, key, TAG_UPSERT, TAG_AFTER]` or `[TAG_USER_PROFILE_CONFIG, domain, key, TAG_UPDATE, TAG_AFTER]`.
