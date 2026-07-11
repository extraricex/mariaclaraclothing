# Pancake POS Phase 1 Connection Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a disabled-by-default, read-only Pancake POS connection foundation and an admin status page without synchronizing or mutating Pancake data.

**Architecture:** Server-only environment configuration owns Pancake secrets. A focused HTTP client performs the official `GET /shops` connection probe, a small PostgreSQL foundation stores redacted health history, authenticated admin endpoints expose only safe status fields, and a new admin page lets an administrator test the connection. No product, inventory, customer, or order synchronization is enabled in this phase.

**Tech Stack:** Node.js, Express, PostgreSQL, React, React Router, Node test runner, Playwright source tests, Docker Compose

---

## File structure

- Create `apps/api/db/migrations/20260704_pancake_connection_foundation.sql`: non-secret connection state and check history.
- Modify `apps/api/db/schema.sql`: keep fresh database creation equivalent to the migration.
- Modify `apps/api/src/config/env.js`: parse and validate Pancake mode and server-only credentials.
- Modify `apps/api/.env.example`: document Pancake variables.
- Modify `docker-compose.yml`: pass Pancake environment variables only to the API container.
- Create `apps/api/src/integrations/pancake/pancakeClient.js`: official Pancake API transport with timeouts and redacted errors.
- Create `apps/api/src/integrations/pancake/pancakeConnectionRepository.js`: persist safe connection-check state with a memory fallback for tests.
- Create `apps/api/src/integrations/pancake/pancakeConnectionService.js`: classify disabled, incomplete, connected, and failed states.
- Create `apps/api/src/routes/adminPancake.js`: status and connection-test subrouter.
- Modify `apps/api/src/routes/admin.js`: mount the subrouter after the existing admin authentication and CSRF middleware.
- Modify `apps/api/src/app.js`: apply the sensitive-action rate limiter to Pancake admin POST requests.
- Create `apps/api/test/pancakeConfig.test.js`: configuration tests.
- Create `apps/api/test/pancakeClient.test.js`: transport and secret-redaction tests.
- Create `apps/api/test/adminPancake.test.js`: authenticated status/connection tests.
- Create `apps/api/test/pancakeMigration.test.js`: migration contract tests.
- Create `apps/web/src/admin/PancakePos.jsx`: read-only admin connection panel.
- Modify `apps/web/src/App.jsx`: add `/admin/pancake`.
- Modify `apps/web/src/admin/AdminLayout.jsx`: add Pancake POS navigation.
- Create `apps/web/test/adminPancakeSource.test.js`: admin route, controls, and safe-data assertions.

### Task 1: Server-only Pancake configuration

**Files:**
- Modify: `apps/api/src/config/env.js`
- Modify: `apps/api/.env.example`
- Modify: `docker-compose.yml`
- Test: `apps/api/test/pancakeConfig.test.js`

- [ ] **Step 1: Write failing configuration tests**

Test these exact behaviors:

```js
test('Pancake defaults to disabled without credentials', () => {
  assert.deepEqual(pancakeConfig({}), {
    mode: 'disabled',
    configured: false,
    apiBaseUrl: 'https://pos.pages.fm/api/v1',
    apiKey: '',
    shopId: '',
    warehouseId: '',
    orderSourceId: '',
    webhookSecret: '',
    timeoutMs: 8000
  });
});

test('Pancake read-only configuration keeps secrets server-side', () => {
  const value = pancakeConfig({
    PANCAKE_MODE: 'read_only',
    PANCAKE_API_KEY: 'secret-key',
    PANCAKE_SHOP_ID: '1234',
    PANCAKE_WEBHOOK_SECRET: 'webhook-secret-with-more-than-32-characters'
  });
  assert.equal(value.configured, true);
  assert.equal(value.mode, 'read_only');
  assert.equal(value.shopId, '1234');
});

test('Pancake rejects unsupported modes and non-official production hosts', () => {
  assert.throws(() => pancakeConfig({ PANCAKE_MODE: 'write_everything' }), /PANCAKE_MODE/);
  assert.throws(() => pancakeConfig({
    APP_ENV: 'production',
    PANCAKE_API_BASE_URL: 'https://example.com/api'
  }), /official Pancake API host/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/pancakeConfig.test.js`

Expected: failure because `pancakeConfig` does not exist.

- [ ] **Step 3: Implement `pancakeConfig` and expose it from `buildEnv`**

Use modes `disabled`, `read_only`, `shadow`, and `live`. Phase 1 only operates in `disabled` or `read_only`; parsing later modes now prevents inconsistent configuration contracts. Set `configured` only when an API key and shop ID exist. Preserve the API key and webhook secret only inside the server configuration object.

- [ ] **Step 4: Document and wire environment variables**

Add:

```dotenv
PANCAKE_MODE=disabled
PANCAKE_API_BASE_URL=https://pos.pages.fm/api/v1
PANCAKE_API_KEY=
PANCAKE_SHOP_ID=
PANCAKE_WAREHOUSE_ID=
PANCAKE_ORDER_SOURCE_ID=
PANCAKE_WEBHOOK_SECRET=
PANCAKE_REQUEST_TIMEOUT_MS=8000
```

Pass the same variables into only the Docker API service. Do not add any `VITE_PANCAKE_*` variable.

- [ ] **Step 5: Run configuration tests and production configuration tests**

Run: `node --test test/pancakeConfig.test.js test/productionConfig.test.js`

Expected: all pass.

### Task 2: Database connection-health foundation

**Files:**
- Create: `apps/api/db/migrations/20260704_pancake_connection_foundation.sql`
- Modify: `apps/api/db/schema.sql`
- Create: `apps/api/test/pancakeMigration.test.js`

- [ ] **Step 1: Write a failing migration contract test**

Assert the migration contains:

```js
assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_connections/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_connection_checks/);
assert.match(sql, /CHECK \(mode IN \('disabled', 'read_only', 'shadow', 'live'\)\)/);
assert.doesNotMatch(sql, /api_key|webhook_secret/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/pancakeMigration.test.js`

Expected: failure because the migration does not exist.

- [ ] **Step 3: Add non-secret tables**

Create `pancake_connections` with one row per shop containing `shop_id`, `warehouse_id`, `order_source_id`, `mode`, `health_status`, `last_checked_at`, `last_connected_at`, `last_error_code`, and timestamps. Create `pancake_connection_checks` with a generated ID, safe status, response duration, safe shop summary JSON, error code, and timestamp. Add indexes for recent checks. Never store request URLs, API keys, webhook secrets, customer data, or raw provider errors.

- [ ] **Step 4: Keep `schema.sql` equivalent**

Copy the same idempotent table and index definitions into `apps/api/db/schema.sql`.

- [ ] **Step 5: Run migration contract and real Docker migration**

Run:

```bash
node --test test/pancakeMigration.test.js
docker compose run --rm api npm run db:migrate
```

Expected: test passes and migration reports `PostgreSQL schema migrated.`

### Task 3: Read-only Pancake API client

**Files:**
- Create: `apps/api/src/integrations/pancake/pancakeClient.js`
- Create: `apps/api/test/pancakeClient.test.js`

- [ ] **Step 1: Write failing client tests**

Cover:

```js
test('listShops calls the official endpoint with the API key', async () => {
  const calls = [];
  const client = createPancakeClient(config, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ success: true, shops: [{ id: 123, name: 'Maria Clara' }] }), { status: 200 });
  });
  assert.equal((await client.listShops()).shops[0].id, 123);
  assert.match(calls[0].url, /^https:\/\/pos\.pages\.fm\/api\/v1\/shops\?api_key=/);
});

test('client errors never expose the API key', async () => {
  const client = createPancakeClient(config, async () => new Response('bad gateway', { status: 502 }));
  await assert.rejects(client.listShops(), (error) => {
    assert.equal(String(error.message).includes(config.apiKey), false);
    return true;
  });
});
```

Also test timeout classification, non-JSON responses, HTTP 401, and `{ success: false }` responses.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/pancakeClient.test.js`

Expected: failure because the client does not exist.

- [ ] **Step 3: Implement the minimal client**

Implement `createPancakeClient(config, fetchImpl = fetch)` with `listShops()`. Use `AbortController`, the configured timeout, `Accept: application/json`, and a `PancakeApiError` containing only a safe code, retryability flag, and HTTP status. Never include the full URL or response body in an error.

- [ ] **Step 4: Run client tests**

Run: `node --test test/pancakeClient.test.js`

Expected: all pass.

### Task 4: Connection state repository and service

**Files:**
- Create: `apps/api/src/integrations/pancake/pancakeConnectionRepository.js`
- Create: `apps/api/src/integrations/pancake/pancakeConnectionService.js`
- Test: `apps/api/test/pancakeClient.test.js`

- [ ] **Step 1: Add failing service tests**

Verify:

- disabled mode returns `disabled` without calling Pancake;
- missing key/shop returns `incomplete` without calling Pancake;
- a matching shop returns `connected` and a safe shop name/ID;
- a missing configured shop returns `shop_not_found`;
- provider failures return a safe `unavailable` result;
- persistence receives no secret-bearing fields.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/pancakeClient.test.js`

Expected: service assertions fail because the modules are missing.

- [ ] **Step 3: Implement repository and service**

The repository writes PostgreSQL when `DATABASE_URL` exists and uses process memory only for isolated tests. `getConnectionStatus()` returns the last safe state. `recordConnectionCheck()` upserts the connection row and appends one history record. `testPancakeConnection()` calls only `listShops`, verifies the configured shop ID, records duration, and returns a secret-free DTO.

- [ ] **Step 4: Run service and client tests**

Run: `node --test test/pancakeClient.test.js`

Expected: all pass.

### Task 5: Authenticated admin API

**Files:**
- Create: `apps/api/src/routes/adminPancake.js`
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/api/src/app.js`
- Create: `apps/api/test/adminPancake.test.js`

- [ ] **Step 1: Write failing API tests**

Test:

- `GET /api/admin/integrations/pancake/status` returns 401 without admin authentication;
- authenticated GET returns mode, configured flags, IDs, and last safe check;
- the response serialization never contains the API key or webhook secret;
- `POST /api/admin/integrations/pancake/test-connection` requires authentication and CSRF under cookie sessions;
- disabled/incomplete configurations return a safe state without an external request;
- injected successful client returns connected shop data.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test --test-concurrency=1 test/adminPancake.test.js`

Expected: 404 or missing-router failure.

- [ ] **Step 3: Implement and mount the router**

Export a `createAdminPancakeRouter(dependencies)` factory. Mount it from `admin.js` at `/integrations/pancake` after `router.use(requireAdmin)` and `router.use(requireAdminCsrf)`, so it inherits the project's existing session and CSRF enforcement. The final API path is `/api/admin/integrations/pancake`. Expose only GET `status` and POST `test-connection`; do not expose product, order, customer, inventory, webhook, or provider-write endpoints in Phase 1.

- [ ] **Step 4: Add sensitive-action rate limiting**

Apply the existing admin-sensitive limiter to the connection-test POST route.

- [ ] **Step 5: Run admin API tests**

Run: `node --test --test-concurrency=1 test/adminPancake.test.js test/sessionRoutes.test.js test/security.test.js`

Expected: all pass.

### Task 6: Admin Pancake status page

**Files:**
- Create: `apps/web/src/admin/PancakePos.jsx`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/admin/AdminLayout.jsx`
- Create: `apps/web/test/adminPancakeSource.test.js`

- [ ] **Step 1: Write failing source tests**

Assert:

```js
assert.match(app, /path="pancake" element=\{<PancakePos \/>\}/);
assert.match(layout, /to: '\/admin\/pancake', label: 'Pancake POS'/);
assert.match(page, /\/api\/admin\/integrations\/pancake\/status/);
assert.match(page, /\/api\/admin\/integrations\/pancake\/test-connection/);
assert.match(page, /Test connection/);
assert.match(page, /Read-only foundation/);
assert.doesNotMatch(page, /API key.*value=/i);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/adminPancakeSource.test.js test/adminNavigationSource.test.js`

Expected: failure because the page and route do not exist.

- [ ] **Step 3: Build the status page**

Render cards for integration mode, credentials configured, shop ID, warehouse ID, order-source ID, last check, last successful connection, and safe error code. Include one `Test connection` button. Explain that credentials are server-managed and that Phase 1 does not sync inventory or orders. Use existing admin components/classes and responsive grid patterns; do not redesign the admin UI.

- [ ] **Step 4: Add route and navigation**

Add Pancake POS to desktop and mobile admin navigation and route `/admin/pancake` before the catch-all behavior.

- [ ] **Step 5: Run web source tests and build**

Run:

```bash
node --test test/adminPancakeSource.test.js test/adminNavigationSource.test.js
npm run build
```

Expected: all tests pass and Vite builds successfully.

### Task 7: Full verification and deployment

**Files:**
- Verify: `apps/api/test/*.test.js`
- Verify: `apps/web/test/*.test.js`
- Verify: Docker services

- [ ] **Step 1: Run complete tests**

Run the API suite serially and all web tests. Expected: zero failures; environment-dependent PostgreSQL tests may remain explicitly skipped.

- [ ] **Step 2: Verify secret boundaries**

Search the web bundle and admin API responses for configured test API keys and webhook secrets. Expected: no matches.

- [ ] **Step 3: Build and recreate Docker**

Run:

```bash
docker compose build
docker compose up -d --force-recreate
docker compose ps
```

Expected: PostgreSQL healthy and API/web containers running.

- [ ] **Step 4: Run migration and deployed health checks**

Run the migration, call `/api/health`, authenticate admin, load `/admin/pancake`, and verify that an unconfigured environment displays `Disabled` or `Incomplete` without making an external Pancake request.

- [ ] **Step 5: Commit Phase 1 on `codex-edits` only after verification**

```bash
git add apps/api apps/web docker-compose.yml docs/superpowers/plans/2026-07-04-pancake-phase-1-connection-foundation.md
git commit -m "feat: add Pancake POS connection foundation"
```

Do not merge or push unless the user separately requests it.
