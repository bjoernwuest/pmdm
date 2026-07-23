# 06 — Runtime View

## 6.1 Application Startup Sequence

```
                         main.ts Startup Flow
───────────────────────────────────────────────────────────────► time

[1] initDatabase()
    ├─ Acquire advisory lock (from ADVISORY_LOCK env var)
    ├─ Run Umzug migrations (src/migrations/*.ts, *.sql)
    └─ Release advisory lock

[2] Register Functional Permissions
    └─ import services/auth/FunctionalPermissions.ts
       └─ Top-level awaits register all FP_* constants in DB

[3] Load Application Modules (dynamic imports)
    ├─ import apps/setup.ts
    ├─ import apps/login.ts
    ├─ import apps/api.ts    (auto-loads all route files)
    └─ import apps/ui.ts     (starts ClientBuilder)

[4] setupApp() — Check mandatory config
    ├─ getSetupDemand() walks service files for mandatoryForStart entries
    ├─ If demand exists: spawn standalone Elysia on PORT
    │   └─ Serve setup wizard → poll every 2s → stop when resolved
    └─ If no demand: proceed

[5] Start EntraID Sync
    ├─ startEntraIDSync()
    ├─ Initial delta sync (Microsoft Graph API)
    └─ await syncState.groupsReady (tolerates failure)

[6] Create Elysia App
    ├─ Static file routes: /public/*, /static/public/*
    ├─ injectDb(dbClient) — global derive for DB access
    └─ startAuditLog(dbClient) — begin PubSub subscription

[7] Mount Sub-Applications (order matters)
    ├─ app.use(loginApp)   — /login/* routes (checked first)
    ├─ app.use(apiApp)     — /api/* routes (auth enforced onBeforeHandle)
    └─ app.use(uiApp)      — /* catch-all (redirects to /login or serves SPA)

[8] app.listen(PORT)       — Start HTTP server (default 8000)
```

## 6.2 Authentication Flow

### 6.2.1 OIDC Login Flow

```
Browser                    PMDM Server                    Microsoft EntraID
  │                           │                                │
  │  POST /login              │                                │
  │  (returnTo param)         │                                │
  │──────────────────────────►│                                │
  │                           │ startAuth()                    │
  │                           │  ├─ Generate PKCE challenge    │
  │                           │  ├─ Generate state, nonce      │
  │                           │  ├─ Build auth URL             │
  │                           │  └─ Set temp cookies           │
  │  302 Redirect to EntraID  │                                │
  │◄──────────────────────────│                                │
  │                                                             │
  │  GET /.../authorize       │                                │
  │───────────────────────────────────────────────────────────►│
  │                         User authenticates                  │
  │  302 Redirect with code   │                                │
  │◄───────────────────────────────────────────────────────────│
  │                                                             │
  │  GET /login/oauth2/code/entraid?code=...&state=...         │
  │──────────────────────────►│                                │
  │                           │ finishAuth()                   │
  │                           │  ├─ Validate cookies           │
  │                           │  ├─ Exchange code for tokens   │
  │                           │  │   (authorizationCodeGrant)  │
  │                           │  │◄────────────────────────────│
  │                           │  ├─ Extract oid claim          │
  │                           │  ├─ runInTransaction():        │
  │                           │  │   ├─ Upsert user in DB      │
  │                           │  │   └─ Sync group memberships │
  │                           │  ├─ Generate session ID        │
  │                           │  ├─ Store session in TTLMap    │
  │                           │  ├─ Set SessionID cookie       │
  │                           │  └─ Publish [auth_session,     │
  │                           │              login]             │
  │  302 Redirect to /login/loading (or returnTo)              │
  │◄──────────────────────────│                                │
```

### 6.2.2 API Request Authentication (per-request)

```
Request arrives at /api/*
  │
  ▼
onBeforeHandle — is /api/health or /api/docs/*?
  ├─ Yes → proceed (public)
  └─ No  → isAuthenticated?
            ├─ Yes → proceed
            └─ No  → 401 Unauthorized

isAuthenticated derivation (global derive, priority order):
  1. SessionID cookie → getSession(db, sessionId)
     ├─ Found + not expired → authMethod = "session"
     └─ Not found / expired → continue
  2. X-API-Key header → validateApiKey(db, secret)
     ├─ Valid → authMethod = "apiKey"
     └─ Invalid → continue
  3. Authorization: Bearer header → validateBearerToken(db, token)
     ├─ Valid (token introspection) → authMethod = "bearer"
     └─ Invalid → not authenticated

session / apiKeyAuth / tokenClaims injected into context
```

### 6.2.3 Permission Check Flow

```
Route handler calls authorize(db, tokens, [FP_CREATE_PRODUCT, FP_VIEW_PRODUCTS])
  │
  ▼
Is tokens.apiKeyIdentifier present?
  ├─ Yes → skip root group check (API keys NEVER get root bypass)
  └─ No  → getLoggedinUserObject(db, tokens.oid)
            └─ is user member of cfgRootUserGroup?
                ├─ Yes → return ALL requested permissions
                └─ No  → getMyFunctionalPermissions(db, tokens)
                          ├─ User: getFunctionalPermissionsOfUser(db, user)
                          └─ API key: getApiKeyPermissions(db, apiKeyId)
                        Return intersection(requested, held)
```

**Cache invalidation**:
- `{ and: ["auth_session", "logout"] }` → clear user's permission cache
- `{ and: ["api_key", "update"] }` → clear API key's permission cache

## 6.3 Product CRUD Flow (typical mutation)

```
Browser (UI)                     PMDM Server                    Database
  │                                │                              │
  │ ProductPage: user clicks save │                              │
  │                                │                              │
  │ apiPut("/api/products/:pn",   │                              │
  │   { ..., knownUpdatedAt })    │                              │
  │──► Request Bundling Queue ──► │                              │
  │    (coalesced with other       │                              │
  │     pending mutations)         │                              │
  │                                │                              │
  │   POST /api/request_bundling   │                              │
  │   (NDJSON batch)               │                              │
  │───────────────────────────────►│                              │
  │                                │ Parse & validate sub-requests│
  │                                │ Forward auth headers         │
  │                                │ Dispatch concurrently        │
  │                                │  (internal fetch to          │
  │                                │   PUT /api/products/:pn)     │
  │                                │                              │
  │                                │ ProductAPI route handler     │
  │                                │  ├─ authorize(FP_UPDATE_...) │
  │                                │  ├─ runInTransaction():      │
  │                                │  │   ├─ repo.updateProduct() │
  │                                │  │   │  ├─ Check updatedAt───│──► UPDATE ... WHERE
  │                                │  │   │  │   (optimistic lock)│    identifier=... AND
  │                                │  │   │  │                    │    updatedAt=knownUpdatedAt
  │                                │  │   │  ├─ Update product────│──► UPDATE products SET ...
  │                                │  │   │  ├─ Upsert values─────│──► UPSERT products_values
  │                                │  │   │  └─ Return updated row│◄── RETURNING *
  │                                │  │   └─ If 0 rows → 409      │
  │                                │  └─ repo publishes PubSub    │
  │                                │     ["product", "update"]    │
  │                                │     { identifiers: {         │
  │                                │       product: "5XXXXXX-01"}}│
  │                                │                              │
  │  NDJSON response stream       │                              │
  │◄──────────────────────────────│                              │
  │  { clientRequestId: "r1",    │                              │
  │    status: 200, body: {...}}  │                              │
  │                                │                              │
  │ resolve per-request Promise   │                              │
  │ update UI state               │                              │
```

## 6.4 Product Request Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    Product Request States                    │
│                                                             │
│   ┌──────┐    createRequest    ┌────────────┐               │
│   │ open │───────────────────►│  importing  │               │
│   └──┬───┘                    └──────┬─────┘               │
│      │                               │                      │
│      │ cancelRequest                  │ checkAllApproved()   │
│      ▼                               ▼                      │
│   ┌──────────┐                 ┌──────┐                     │
│   │ cancelled│                 │ done │ (deferred)          │
│   └──────────┘                 └──────┘                     │
│                       create/update Product                 │
│                       create ProductExport rows              │
└─────────────────────────────────────────────────────────────┘
```

### 6.4.1 Create Product Request

```
Browser                          Server
  │                                │
  │ POST /api/products/:pn/        │
  │      request-update            │
  │  { mode: "new",               │
  │    productTypeId, ... }        │
  │───────────────────────────────►│
  │                                │ ProductAPI handler
  │                                │  ├─ authorize(FP_CREATE_PRODUCT)
  │                                │  ├─ runInTransaction():
  │                                │  │   ├─ SELECT ... FOR UPDATE
  │                                │  │   │   ON product_number_state
  │                                │  │   │   (lock + increment)
  │                                │  │   ├─ Generate product number
  │                                │  │   ├─ Calculate default values
  │                                │  │   │   (OnCreate / OnChangeNoValue)
  │                                │  │   ├─ Insert product_requests row
  │                                │  │   ├─ Insert product_requests_values
  │                                │  │   │   (one per data type)
  │                                │  │   └─ Compute actionableSummary
  │                                │  │      { needsValue, needsApproval }
  │                                │  └─ Publish ["ProductRequest",
  │                                │               "create"]
  │  200 { id, productNumber,     │
  │        actionableSummary }     │
  │◄──────────────────────────────│
```

### 6.4.2 Value Provision & Approval

```
Browser                          Server
  │                                │
  │ PATCH /api/product-requests/   │
  │       :id/values/:dataTypeId   │
  │  { value: "new value",        │
  │    knownUpdatedAt }            │
  │───────────────────────────────►│
  │                                │ ProductRequestAPI handler
  │                                │  ├─ authorize by role:
  │                                │  │   Writer: FP_REQUEST_PRODUCT_UPDATE
  │                                │  │   Approver: FP_CREATE_PRODUCT
  │                                │  ├─ runInTransaction():
  │                                │  │   ├─ getEffectivePermissions()
  │                                │  │   │   ├─ Check ProductTypesDataTypePermission
  │                                │  │   │   │   (role, requestorCanEdit, editableOnUpdate, owner)
  │                                │  │   │   └─ Fall back to DataTypePermission
  │                                │  │   ├─ Validate: is field editable?
  │                                │  │   ├─ Update product_requests_values
  │                                │  │   ├─ checkAllApproved()
  │                                │  │   │   └─ If all non-calculated approved
  │                                │  │   │       → auto-advance to "importing"
  │                                │  │   └─ Return updated detail
  │                                │  └─ Publish ["ProductRequestValue", "update"]
  │  200 { ...updatedDetail,      │
  │        actionableSummary }     │
  │◄──────────────────────────────│
```

## 6.5 PubSub / SSE Event Flow

```
                Mutation in Repo
                      │
                      ▼
              repo publishes:
              PubSub.publish(["product", "update"], { identifiers: {...}, data: {...} })
                      │
                      ▼
              ┌─── PubSub Singleton ───┐
              │                        │
              ▼                        ▼
    AuditLog Subscriber        SSE Hub (subscribeAll)
    { or: [create, update,     │
           delete, grant,      │  For each session filter:
           revoke, disable,    │    expressions.some(expr =>
           enabled] }          │      expressionMatches(expr, tags))
       │                       │      │
       ▼                       │      ├─ Match → filter.enqueue(envelope)
    buffer entry              │      └─ No match → skip
       │                       │
       ▼ (every 60s or         │      GET /api/server_sent_events/stream
       500 entries)            │      async generator:
    flush to audit_log         │        while (true) {
       │                       │          event = await filter.next(signal, 25000)
       ▼                       │          if heartbeat → yield "keepalive"
    re-queue on failure         │          if event → yield "event" SSE frame
                               │          if null → break (disconnected/destroyed)
                               │        }
                               │              │
                               ▼              ▼
                         Browser EventSource receives:
                         event: pubsub
                         data: {"tags":["product","update"],"data":{...}}
                               │
                               ▼
                         Client PubSub.dispatch()
                         UI components react to events
```

## 6.6 Request Bundling Flow (Detailed)

```
Domain UI code:
  apiPut("/api/products/:pn", data)  ← developer calls normally
      │
      ▼
  _request_bundling.ts intercepts POST/PUT/PATCH/DELETE
      │
      ▼
  enqueueRequestBundledMutation(url, method, body, headers)
      │
      ├─ Create { url, method, body, headers, clientRequestId }
      ├─ Push to queue[]
      ├─ Create Promise (per-request)
      └─ Schedule flush (if not already scheduled)
           Flush triggers (whichever first):
           ├─ queue.length >= CLIENT_MAX_REQUESTS (10)
           ├─ queued bytes >= CLIENT_MAX_BYTES (1MB)
           └─ oldest item age >= CLIENT_MAX_AGE_MS (250ms)
      │
      ▼
  flushQueue()
      ├─ POST /api/request_bundling
      │   Body: NDJSON { requests: [...] }
      │   Headers: Authorization, X-API-Key, Cookie from original
      ├─ Read NDJSON response stream line by line
      │   For each line:
      │   ├─ Parse JSON
      │   ├─ Match by clientRequestId
      │   ├─ Resolve/reject the corresponding Promise
      │   └─ Remove from inflightMap
      └─ On stream end:
           └─ Any unresolved in inflightMap → reject with 502

  Server (RequestBundlingAPI.ts):
      POST /api/request_bundling
      ├─ Validate body (isRequestBundlingRequestItem for each)
      ├─ Reject nested bundling (URL ending in /api/request_bundling → 400)
      ├─ Forward auth headers to each sub-request
      ├─ Promise.allSettled: concurrent internal fetch for each sub-request
      │   ├─ computeServerTimeoutMs() for each
      │   └─ extractErrorMessage() on failure
      ├─ Buffer results → flush triggers:
      │   ├─ buffer.length >= FLUSH_COUNT (10)
      │   ├─ bufferedBytes >= FLUSH_BYTES (1MB)
      │   └─ flushTimer >= FLUSH_MS (250ms)
      └─ Stream: Content-Type: application/x-ndjson
```

## 6.7 Configuration Edit Flow

```
AdminConfigList page                     PMDM Server
  │                                        │
  │ User edits config value               │
  │ Sets knownValue to current DB value   │
  │                                        │
  │ PUT /api/config/:domain/:key           │
  │  { value: newValue,                    │
  │    knownValue: oldValue }              │
  │───────────────────────────────────────►│
  │                                        │ ConfigAPI handler
  │                                        │  ├─ authorize(FP_*)
  │                                        │  ├─ validateConfigInputFormat()
  │                                        │  ├─ Compare knownValue ↔ DB value
  │                                        │  │   (JSON canonicalization)
  │                                        │  ├─ Mismatch → 409 Conflict
  │                                        │  │   { error: "Conflict",
  │                                        │  │     currentValue: dbValue }
  │                                        │  ├─ Match → upsertConfigEntry()
  │                                        │  └─ Publish ["ConfigEntry", "update"]
  │                                        │
  │  200 OK / 409 Conflict                │
  │◄──────────────────────────────────────│
  │                                        │
  │ On 409:                                │
  │  Show conflict dialog                 │
  │  Offer to reload current value        │
```

## 6.8 EntraID Sync Flow

```
Startup / Cron schedule / Login event
  │
  ▼
startEntraIDSync()
  ├─ Read EntraID config from DB
  │   (ClientID, ClientSecret, TenantID, DeltaLinks)
  ├─ If SyncInterval ≠ "off":
  │   └─ Schedule cron job at configured interval
  ├─ Create MS Graph client (ClientSecretCredential)
  ├─ Delta-based sync:
  │   ├─ GET /users/delta (with stored delta link)
  │   │   └─ Upsert users in DB (upsertUsers)
  │   ├─ GET /groups/delta (with stored delta link)
  │   │   └─ Upsert groups in DB (upsertGroups)
  │   └─ Store new delta links in DB
  ├─ membershipSync(userId):
  │   └─ GET /users/:id/memberOf
  │       └─ setUserMemberships(db, userId, groupIds)
  │           └─ deleteObsoleteUserGroupAssignments()
  ├─ Publish ["user", "upsert"] / ["group", "upsert"]
  └─ Return { groupsReady: Promise<void> }

Login-triggered sync:
  On login → publish ["auth_session", "login"]
    └─ EntraIDSync subscriber triggers membershipSync()
```

## 6.9 Session Lifecycle

```
Session created                    Session refreshed                  Session expired
     │                                   │                                │
     ▼                                   ▼                                ▼
TTLMap.set(sessionId,             refreshSession()                 TTLMap entry
  { expiresAt: now+900s })         ├─ inFlightRefreshes              auto-purged on
     │                             │   dedup check                  next get/cleanup
     ▼                             ├─ refreshTokenGrant()               │
getSession() called               ├─ Update session                          ▼
  ├─ Read from TTLMap             │   tokens + expiry            getSession()
  ├─ Check expiry                 └─ Publish [auth_session,        returns undefined
  ├─ Near expiry (<15min)?        │             update]               │
  │   ├─ Yes → auto-refresh              │                       API returns 401
  │   └─ No  → return session          ┌─▼──────────┐           Browser redirects
  └─ Update last read timestamp       │ PubSub event│               to /login
    (sliding window)                   │ triggers:   │
                                       │ cache clear │
                                       └─────────────┘
```
