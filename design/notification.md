# Email Notification System — Design

> **Status**: Draft

---

## 1. Overview

The notification system sends **per-user digest emails** about product requests that need the user's action (awaiting provide/approve value) or that recently changed status (importing/done/cancelled). Emails are delivered via Microsoft Graph API `POST /v1.0/users/{from}/sendMail`. The digest runs on a system-wide CRON schedule (`Notification schedule`), and each user can override their personal schedule and notification type preferences via their user profile.

### Notification Types

| Type | Triggers when | Relevant users |
|------|--------------|----------------|
| **Awaiting "Provide value"** | PR is `open` AND user has `writer` role on a data type whose value is `null` (not yet provided) | Users in groups with writer permission on affected data types |
| **Awaiting "Approve value"** | PR is `open` AND user has `approver` role on a data type that is not yet approved (`approvedBy IS NULL`) | Users in groups with approver permission on affected data types |
| **Status transition** | PR is currently in status `importing`, `done`, or `cancelled` | Users in groups with **any** permission (viewer, writer, or approver) on the PR's data types |

Each user receives a **single digest email** containing only the sections relevant to them. Users who have no awaiting items and no transitions since the last digest receive no email.

---

## 2. Configuration

**Domain**: `"Notifications"`

All entries are `mandatoryForStart: false` — the application starts without them. The notification system activates only when all three conditions are met:
1. `Enabled` is `true`
2. `From` has a non-empty value
3. `Notification schedule` has a valid non-empty value (system-level default)

Entries marked `userProfile: true` appear on the user profile page (see `design/userprofile.md`) and can be overridden per user. When a user override exists, it takes precedence over the system default.

### 2.1 System-wide Configuration

| Key | Type | `userProfile` | `editInUI` | Description | Default |
|-----|------|:---:|-----------|-------------|---------|
| `Enabled` | `boolean` | `false` | `true` | Master switch. Must be `true` for the system to run. | `false` |
| `Notification schedule` | `string` | **`true`** | `true` | Default CRON expression for the notification digest. Users can override with their own schedule via their profile. | `""` |
| `From` | `string` | `false` | `true` | Sender email address. Must correspond to an existing user or shared mailbox in the EntraID tenant, and must match the Mail.Send scope restriction (see §9.2). | `""` |
| `Subject` | `string` | `false` | `true` | Email subject line. Supports `{User.Firstname}` and `{User.Lastname}` placeholders. | `"Action required: Product Request digest"` |
| `EmailTemplate` | `string` | `false` | `true` | HTML email body template. See template placeholder table. `inputFormat` is empty (no regex validation — the simulate feature serves as preview). | See §2.6 |
| `BaseURL` | `string` | `false` | `true` | Base URL of the application, used to construct absolute links in emails (e.g. `https://pmdm.example.com`). | `""` |
| `LastDigestAt` | `string` | `false` | **`false`** | Internal timestamp (ISO 8601) of the last digest run. Set automatically by the service — never shown in the UI. | `""` |

### 2.2 User Notification Preferences (`userProfile: true`)

These boolean entries control which notification types a user receives. All default to `true`. Users can disable specific notification types via their profile.

| Key | Type | `userProfile` | `editInUI` | Description | Default |
|-----|------|:---:|-----------|-------------|---------|
| `NotifyOnProvideData` | `boolean` | **`true`** | `true` | Include "Provide value" awaiting items in the digest. | `true` |
| `NotifyOnApprovalPending` | `boolean` | **`true`** | `true` | Include "Approve value" awaiting items in the digest. | `true` |
| `NotifyOnImporting` | `boolean` | **`true`** | `true` | Include `importing` status transitions in the digest. | `true` |
| `NotifyOnDone` | `boolean` | **`true`** | `true` | Include `done` status transitions in the digest. | `true` |
| `NotifyOnCancelled` | `boolean` | **`true`** | `true` | Include `cancelled` status transitions in the digest. | `true` |

**Total: 12 config entries.** 7 system-wide entries + 5 user preference entries. The notification system persists only configuration and templates — no event tracking tables, no PubSub state accumulation.

### 2.3 Per-User Schedule Fallback

The `Notification schedule` is a `userProfile: true` entry. Each user may override the system-wide CRON expression:

1. The service reads the user's personal `Notification schedule` from `user_profile_config`.
2. If the user has a valid CRON expression → use it to determine whether the current digest run includes this user (CRON pattern matching: does the current time match the user's schedule?).
3. If the user's override is missing, empty, or an **invalid CRON expression** → fall back to the system-wide `Notification schedule` default.
4. If both the user override and the system default are invalid/missing → the user receives no scheduled digest (but out-of-sequence delivery still works).

The system-wide CRON drives the croner. On each trigger, the service evaluates each candidate user's personal schedule via CRON pattern matching against the current time. No per-user `lastDigestAt` tracking is required — only one global `LastDigestAt` config entry exists, used solely for the SQL transition query (§5.1).

### 2.4 Config inputFormat Values

| Key | `inputFormat` |
|-----|--------------|
| `Enabled` | (boolean type — no inputFormat) |
| `Notification schedule` | `"^((?i)@(yearly\|annually\|monthly\|weekly\|daily\|midnight\|hourly)\|^\\s*([^ ]+\\s+){4,6}[^ ]+\\s*\|^(?i)off)$"` (same as EntraID SyncInterval) |
| `From` | `"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"` |
| `Subject` | `""` (free text) |
| `EmailTemplate` | `""` (free text, HTML) |
| `BaseURL` | `"^https?://[^\\s/$.?#].[^\\s]*$"` |
| `LastDigestAt` | `""` (internal, `editInUI: false`) |
| `NotifyOn*` (×5) | (boolean type — no inputFormat) |

### 2.5 API Exposure

The `/api/notifications/config` endpoint returns all 11 user-facing entries (`editInUI: true`). `LastDigestAt` is excluded. The service reads `LastDigestAt` internally via `getConfigEntriesByKey()`.

User notification preferences (§2.2) are also exposed through the user profile API (`/api/me/config`) — users can toggle notification types from their profile page without admin access.

### 2.6 Default Email Template

```html
<p>Dear {User.Firstname},</p>

<p>you have following product requests awaiting your contribution:</p>

{awaiting}

<p>Following product requests evolved in the workflow:</p>

{transitions}

<p>—<br>Your Product Management Team</p>
```

### 2.7 Template Placeholders

| Placeholder | Replaced with |
|-------------|---------------|
| `{User.Firstname}` | User's first name |
| `{User.Lastname}` | User's last name |
| `{awaiting}` | HTML table of awaiting PRs (see §6.1) or `"None"` if empty |
| `{transitions}` | HTML table of status transition PRs (see §6.2) or `"None"` if empty |

Templates are stored as HTML strings. The `{awaiting}` and `{transitions}` placeholders are replaced with generated `<table>` fragments before sending.

---

## 3. Functional Permission

### New permission: `FP_NOTIFICATIONS`

```typescript
// src/ui/auth/functional_permissions.ts
FP_NOTIFICATIONS = "FP_NOTIFICATIONS"

// src/services/auth/FunctionalPermissions.ts
{ functionalPermissionName: "FP_NOTIFICATIONS", description: "Access to the email notification system configuration and manual send/simulate features.", group: "Admin" }
```

The `AdminNotifications.tsx` page requires `FP_NOTIFICATIONS`. The backend CRON service runs without any user FP check (it's server-internal).

---

## 4. Service Architecture

### New file: `src/services/Notifications.ts`

Follows the **EntraID Sync pattern**: exports a `config` object, registers its entries at startup, and starts a `croner`-based scheduler.

**Dependency**: Reuses `getGraphClient(db)` from `EntraIDSync.ts` to send emails. The notification system therefore requires the EntraID configuration (`ClientID`, `ClientSecret`, `TenantID`) to be set — even if EntraID user/group sync is not active.

#### 4.1 Startup (`init(db)`)

```
function init(db: DBClient):
    1. Upsert all 12 config entries (Pattern A: seed on startup)
    2. Read Enabled, Notification schedule, From values
    3. If any missing or Enabled != true → abort (log info, return)
    4. Start croner on the system-wide Notification schedule:
       new Cron(systemCronExpr, () => sendDigest(db))
```

The system-wide `Notification schedule` drives the croner. On each trigger, `sendDigest` evaluates per-user schedules via CRON pattern matching (see §4.2 step 6a) — a user is only included if the current time matches their personal schedule expression (falling back to the system default).

#### 4.2 `sendDigest(db)`

```
function sendDigest(db: DBClient):
    1. Guard against concurrent runs (syncRunning flag, like EntraIDSync)
    2. Query transitions since system-level lastDigestAt:
       SELECT * FROM product_requests
       WHERE status IN ('importing', 'done', 'cancelled')
         AND updatedAt > COALESCE(lastDigestAt, '1970-01-01')
    3. Query all open PRs, compute awaiting per user (see §5.2)
    4. For each transitioned PR, resolve which users (viewers, writers, or approvers — any permission) should be notified about the transition
    5. Merge awaiting + transitions per user
    6. For each candidate user, apply per-user filters:
       a. Read user's personal Notification schedule from user_profile_config.
          - If valid: check if current time matches the user's CRON expression.
          - If missing or invalid CRON: fall back to system-wide schedule.
          - Skip user if the current time does not match (user is not yet due).
       b. Read user's notification type preferences (§2.2) from user_profile_config,
          falling back to system defaults if not set.
          - Skip "Provide value" items if NotifyOnProvideData is false.
          - Skip "Approve value" items if NotifyOnApprovalPending is false.
          - Skip importing transitions if NotifyOnImporting is false.
          - Skip done transitions if NotifyOnDone is false.
          - Skip cancelled transitions if NotifyOnCancelled is false.
       c. If no notification items remain after filtering → skip this user.
    7. For each remaining user, if user has write or approve permission on at least one PR:
       a. Build "awaiting" table HTML (§6.1) — only includes PRs where user is writer (provide) or approver (approve), never viewer-only
       b. Build "transitions" table HTML (§6.2) — includes PRs where user has any permission (viewer, writer, or approver)
       c. Substitute placeholders into EmailTemplate and Subject
       d. Call sendEmail(from, user.email, subject, htmlBody)
    8. Update system-level LastDigestAt config entry to now()
    9. Handle errors: log per-email failures, continue processing other users
```

**Note on timestamp-based transition detection**: A PR that transitioned to `importing`/`done`/`cancelled` earlier but was updated for other reasons (e.g. value tweak) since `lastDigestAt` will appear in the transitions table again. This is an accepted trade-off for simplicity — the digest says "evolved in the workflow" which reasonably covers any change.

**Permission model summary**:
- **Awaiting sections**: scoped to users with `writer` (Provide value) or `approver` (Approve value) — viewers excluded.
- **Transitions section**: scoped to users with **any** role (viewer, writer, or approver) on the PR.
- **Email delivery**: only users holding at least one `writer` or `approver` permission anywhere receive the digest. Pure viewers (viewer-only across all data types) receive no email, even if they have transition items.

#### 4.3 `sendToUser(db, fromEmail, userIds?, groupIds?)`

Out-of-sequence delivery (called from API). Same logic as `sendDigest` but scoped to specific users and/or groups.

- **If `userIds` is provided**: sends digest only to those specific users.
- **If `groupIds` is provided**: sends digest to all enabled members of those groups.
- **If both are provided**: sends to the union (specific users + all members of specified groups).
- **If neither is provided**: sends to all users with pending items (same full scope as cron run).

Does NOT update `LastDigestAt` — manual sends are independent of the scheduled digest cycle.

#### 4.4 `simulateEmail(db, userId?, groupId?)`

Generates the digest email content for preview without sending.

- **By userId**: Uses the user's real group memberships to build the permission lookup. Returns the fully rendered HTML.
- **By groupId**: Builds a synthetic permission lookup where the "user" is a member of only that single group. Returns the rendered HTML with generic placeholders for user name fields.

Returns the HTML content as a string so the UI can display a preview.

---

## 5. Repository

### New file: `src/repo/NotificationRepo.ts`

All database queries for the notification system. Uses the patterns established in `ProductRequestRepo.ts` (permission resolution via `buildPermissionLookup` and `computeActionableSummary`).

#### 5.1 `getTransitionedProductRequests(db, lastDigestAt: string | null)`

Queries product requests whose status is `importing`, `done`, or `cancelled` and which were updated since the last digest run.

```sql
SELECT pr.identifier, pr.product_number, pr.status, pr.product_type, pr.updated_at
FROM product_requests pr
WHERE pr.status IN ('importing', 'done', 'cancelled')
  AND (pr.updated_at > :lastDigestAt OR :lastDigestAt IS NULL)
ORDER BY pr.updated_at ASC
```

Returns: `Array<{ requestId, productNumber, productType, newStatus }>`.

Enriches results with `productTypeName` via a join on `product_types`.

On the **first run** (`lastDigestAt` is null/empty), this query returns ALL historical transitions — which could be noisy. The service should handle this: on first run, set `lastDigestAt = now()` and skip transition reporting. Subsequent runs will only pick up actual recent changes.

#### 5.2 `getAwaitingPerUser(db): Map<UserId, AwaitingInfo>`

Core query. Returns a map from user ID to their awaiting items.

**Algorithm:**
1. Load all open PRs: `SELECT * FROM product_requests WHERE status = 'open'`
2. Collect distinct `productType` identifiers
3. Load all users (active, not disabled) with their group memberships
4. Walk through the permission hierarchy to determine, for each open PR, which users are writers and which are approvers:

```
For each open PR (with productType PT):
  For each data type DT assigned to this PR (from product_requests_values):
    a. Find groups with writer/approver role in ProductTypesDataTypePermission (PT-level, overrides)
    b. If not found in PT-level, fall back to DataTypePermission (data-type-level)
    c. Map groups → users via user_groups
    
    For each writer-user:
      Check: is value null (needs value)?
        AND is the user the creator with requestorCanEdit? OR has writer role?
        AND (if update request) editableOnUpdate is true?
      → If yes, add PR to user's "awaitingProvide"
    
    For each approver-user:
      Check: is approvedBy null AND data type is not Calculated?
      → If yes, add PR to user's "awaitingApprove"
```

**Return type:**
```typescript
type AwaitingPerUser = Map<string, {
    awaitingProvide: { requestId: string; productNumber: string; productTypeName: string }[];
    awaitingApprove: { requestId: string; productNumber: string; productTypeName: string }[];
}>
```

#### 5.3 `getTransitionsPerUser(db, transitionEvents[], allUsers[]): Map<UserId, TransitionInfo>`

Given a list of transition events (from §5.1), determines which users should be notified about each transition.

For each transitioned PR (with productType PT):
  For each data type DT in the PR:
    Resolve groups with **any** permission — viewer, writer, or approver (PT-level → DT-level fallback)
    Map groups → users
    Add PR to each identified user's transition list

**Return type:**
```typescript
type TransitionsPerUser = Map<string, {
    transitions: { requestId: string; productNumber: string; newStatus: string; productTypeName: string }[];
}>
```

#### 5.4 `getUsersWithRelevantGroups(db): User[]`

Returns only users who belong to at least one group that has any permission (viewer, writer, or approver) on any data type. This avoids checking users who can never receive notifications.

### Performance Considerations

The "inverted query" approach is used in §5.2: permission-to-user resolution is done per group (not per user), then users are mapped in bulk. For a typical setup with ~100 users, ~50 open PRs, and ~10 groups, this is well within acceptable execution time for a cron job.

The existing `buildPermissionLookup()` from `ProductRequestRepo.ts` can be reused to batch permission resolution across product types. The `computeActionableSummary()` function provides the needsValue/needsApproval logic per PR per user.

For **group simulation** (§4.4), a variant of `buildPermissionLookup()` is needed that accepts explicit group IDs instead of resolving from a real user's memberships. The existing function signature can be extended with an optional `groupIds: string[]` parameter that overrides the user-based resolution.

---

## 6. Email Construction

### 6.1 Awaiting Table (`{awaiting}`)

```html
<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse">
  <thead>
    <tr><th>Product Number</th><th>Awaiting</th><th>Link</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>5000001-01</td>
      <td>Provide value</td>
      <td><a href="{baseURL}/product-requests/{id}">Open request</a></td>
    </tr>
    <tr>
      <td>5000002-01</td>
      <td>Approve value</td>
      <td><a href="{baseURL}/product-requests/{id}">Open request</a></td>
    </tr>
  </tbody>
</table>
```

**Sorting**: primary by "Awaiting" column (`Provide value` before `Approve value`), secondary by `productNumber` ascending.

### 6.2 Transitions Table (`{transitions}`)

```html
<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse">
  <thead>
    <tr><th>Product Number</th><th>New Status</th><th>Link</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>5000003-01</td>
      <td>importing</td>
      <td><a href="{baseURL}/product-requests/{id}">View request</a></td>
    </tr>
    <tr>
      <td>5000004-01</td>
      <td>done</td>
      <td><a href="{baseURL}/products/{productNumber}">View product</a></td>
    </tr>
    <tr>
      <td>5000005-01</td>
      <td>cancelled</td>
      <td><a href="{baseURL}/product-requests/{id}">View request</a></td>
    </tr>
  </tbody>
</table>
```

**Link logic**:
- Status `importing` or `cancelled` → link to `/product-requests/{requestId}`
- Status `done` → link to `/products/{productNumber}`

**Sorting**: primary by "New Status" in order `importing` → `done` → `cancelled`, secondary by `productNumber` ascending.

### 6.3 MS Graph sendMail Call

```typescript
async function sendEmail(fromEmail: string, toEmail: string, subject: string, htmlBody: string, db: DBClient) {
    const graphClient = getGraphClient(db);  // reuses EntraID's client
    await graphClient.api(`/users/${fromEmail}/sendMail`).post({
        message: {
            subject,
            body: { contentType: "HTML", content: htmlBody },
            toRecipients: [{ emailAddress: { address: toEmail } }],
        },
        saveToSentItems: false,
    });
}
```

Errors are caught per-recipient; a single failed send does not abort the digest for other users.

---

## 7. API Routes

### New file: `src/api/NotificationsAPI.ts`

#### `GET /api/notifications/config`
Returns all notification config entries. Requires `FP_NOTIFICATIONS`.

#### `PUT /api/notifications/config/:key`
Updates a single notification config entry (optimistic locking via `updatedAt`). Requires `FP_NOTIFICATIONS`.
Body: `{ value: <new value>, updatedAt: string }`
Returns 409 on conflict.

#### `POST /api/notifications/send`
Out-of-sequence delivery. Requires `FP_NOTIFICATIONS`.
Body: `{ userIds?: string[], groupIds?: string[] }`
- If `userIds` is provided: sends digest only to those specific users
- If `groupIds` is provided: sends digest to all enabled members of those groups
- If both: union of specified users and group members
- If neither: sends to all users with pending items (same full scope as cron run)
Returns `{ sentTo: number }` (count of emails sent)

#### `POST /api/notifications/simulate`
Preview the digest email. Requires `FP_NOTIFICATIONS`.
Body: `{ userId?: string, groupId?: string }` — exactly one of `userId` or `groupId` must be provided.

- **By userId**: Evaluate permissions for that user (all their real group memberships).
- **By groupId**: Evaluate permissions as if a hypothetical user belonged **only** to that single group. This is a "what-if" simulation — it answers "what would someone in this group see?"

Returns `{ html: string, subject: string, simulatedFor: { type: "user" | "group", identifier: string, name: string } }` — the rendered email content ready for preview.

When simulating for a group, `{User.Firstname}` in the template resolves to `"Member of <GroupName>"` and the `To:` field shows a placeholder address.

---

## 8. UI Page

### New file: `src/ui/pages/AdminNotifications.tsx`

Registered in `src/ui/PageRegistry.ts` (template page, admin section).

```typescript
export const meta: PageMeta = {
    id: "admin-notifications",
    urn: "urn:bun-starter:ui:page:admin-notifications",
    path: "/admin/notifications",
    title: "Notifications",
    description: "Configure email notifications for product request workflows.",
    menu: {
        section: "Administration",
        order: 55,
        label: "Notifications",
        parent: "admin-home",
    },
    requiredFunctionalPermissions: [FP_NOTIFICATIONS.functionalPermissionName],
};
```

### 8.1 Section: Configuration

System-wide settings (admin-only, requires `FP_NOTIFICATIONS`):

- **Enabled** toggle (boolean)
- **Notification schedule** text input with CRON validation — system-wide default. Users can override via their profile (see §2.3).
- **From** text input (email address validation)
- **Subject** text input with placeholder hint text
- **Email Template** — Monaco HTML editor for editing the HTML template
- **Base URL** text input

User notification defaults (admin sets system-wide defaults; users can override via their profile):

- **Notify on provide data** toggle — default for `NotifyOnProvideData`
- **Notify on approval pending** toggle — default for `NotifyOnApprovalPending`
- **Notify on importing** toggle — default for `NotifyOnImporting`
- **Notify on done** toggle — default for `NotifyOnDone`
- **Notify on cancelled** toggle — default for `NotifyOnCancelled`

Save button per field (inline editing, like AdminConfigList). The user profile page (accessed via avatar → Profile) also surfaces these 5 toggles plus `Notification schedule` for per-user customization.

### 8.2 Section: Manual Send (Out-of-Sequence Delivery)

- Multi-select dropdown for users (searchable, shows name + email)
- Multi-select dropdown for groups (searchable)
- "Send to all" button (sends to every user with pending items)
- "Send to selected" button (sends to the union of selected users and group members)
- Confirmation dialog before sending
- Loading indicator during send
- Success message: "Email sent to N recipient(s)"

### 8.3 Section: Simulate

- Toggle between "Simulate for user" and "Simulate for group" modes
- **User mode**: searchable user dropdown (name + email) → evaluates permissions from all groups the user belongs to
- **Group mode**: searchable group dropdown → evaluates permissions as if the "user" were a member of only that group
- "Simulate" button
- Results panel showing:
  - **Subject**: rendered subject line
  - **Preview**: rendered HTML email content in an iframe or sanitized `<div>` (use `dangerouslySetInnerHTML` only after server-side rendering — the server returns fully rendered HTML)
  - **Metadata**: number of awaiting items, number of transitions, simulated identity (user name or group name)

UI uses the existing `src/ui/api/` helpers (`_client.ts` for the POST/PUT calls) following the request-bundling pattern for mutations.

---

## 9. EntraID App Registration — Mail.Send Setup

The notification system sends email via Microsoft Graph API using the `Mail.Send` application permission. This requires configuration in the Entra ID (Azure AD) app registration.

### 9.1 Grant Mail.Send Permission

1. Open the Entra ID app registration used by the application (same as for user/group sync)
2. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**
3. Select **Mail.Send** and click **Add permissions**
4. Click **Grant admin consent** (this is an application permission — it requires admin consent, not delegated user consent)

### 9.2 Restrict Mail.Send to a Specific Sender Address

By default, `Mail.Send` application permission allows the app to send as **any** user in the tenant. To restrict to a single sender address (e.g. `notifications@yourdomain.com`):

1. Create a mail-enabled security group in Exchange Online containing only the sender mailbox:
   ```powershell
   New-DistributionGroup -Name "SystemMailboxGroup" -PrimarySmtpAddress "system-mailbox-group@yourdomain.de" -Type Security
   Add-DistributionGroupMember -Identity "SystemMailboxGroup" -Member "notifications@yourdomain.de"
   ```

2. Apply an application access policy:
   ```powershell
   New-ApplicationAccessPolicy -AppId "DEINE-ENTRA-CLIENT-ID" -PolicyScopeGroupId "system-mailbox-group@yourdomain.de" -AccessRight RestrictAccess -Description "App darf nur als notifications@yourdomain.de senden"
   ```

3. Verify the policy:
   ```powershell
   Get-ApplicationAccessPolicy -AppId "DEINE-ENTRA-CLIENT-ID"
   ```

   Expected output shows the policy with `AccessRight: RestrictAccess` and the group ID.

4. **Important**: Application access policies can take up to **24 hours** to propagate in Exchange Online. Test after this period using the simulate feature.

**Without this restriction**, the app could send email as any user in the tenant — a significant security risk.

### 9.3 Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `ErrorAccessDenied` | `Mail.Send` permission not granted or not admin-consented | Grant + admin-consent `Mail.Send` |
| `ErrorSendAsDenied` | The `From` address does not match the restricted scope, or the application access policy has not propagated | Verify group membership and wait for propagation |
| `ErrorInvalidRecipients` | The `toRecipients` address is malformed | Validate recipient email format before sending |
| `Request_ResourceNotFound` | The `From` email address does not exist in the tenant | Create a shared mailbox or user for the sender address |

---

## 10. Risks and Edge Cases

| Scenario | Handling |
|----------|----------|
| `Notification schedule` expression is invalid (system-level) | Log warning, don't start scheduler (same pattern as EntraIDSync) |
| User's personal `Notification schedule` override is invalid | Fall back to system-wide default schedule (see §2.3) |
| MS Graph API rate limiting (10,000 requests/10 min) | The system sends one email per user per digest. For >10,000 users, batch with delays. |
| User has no email address | Skip user, log warning |
| `BaseURL` is empty | Links are rendered without href, or omit the link column |
| Template contains invalid HTML | The simulate feature serves as live preview; mutations wrap in basic sanitization |
| Concurrent digest runs | Guard with `syncRunning` boolean flag (same as EntraIDSync) |
| First run after enabling (no prior `LastDigestAt`) | Set `LastDigestAt = now()` after first run; first run reports no transitions (only awaiting). This avoids flooding users with all historical transitions. |
| PR updated after transition (non-status change) | May appear again in a subsequent digest. Accepted trade-off for SQL-simplicity. The digest says "evolved in the workflow" which reasonably covers any change. |
| Template has no `{awaiting}` or `{transitions}` placeholder | The section is simply omitted if the placeholder is absent. If both are absent, the email is still sent with just the greeting/signature. |
