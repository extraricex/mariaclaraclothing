# Pancake Bidirectional Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build automatic bidirectional sync between Maria Clara website/admin and Pancake POS for orders, statuses, inventory, customer details, payment details, shipping details, discounts, COD amounts, notes, and tracking.

**Architecture:** Extend the existing Pancake integration instead of replacing it. Add durable link/event/log/snapshot tables, a sync repository, order mappers, Pancake order read/update client methods, an inbound/outbound sync service, and worker integration. Keep checkout/admin writes fast by enqueueing sync events and letting the background worker retry safely.

**Tech Stack:** Node.js CommonJS API, Express, PostgreSQL migrations, existing JSON fallback repositories for tests, React admin UI, Node `node:test`, Docker Compose.

---

## Scope Boundary

This plan implements the approved spec in staged software slices. Pancake public webhook documentation was not found, so polling is the first automatic inbound sync method. Webhook ingestion is intentionally not implemented here; if official Pancake webhook docs become available, add it later as a second input into `pancakeOrderSyncService.processInboundPancakeOrder`.

This plan does not automatically create or edit Pancake products. Product matching remains based on verified Pancake variant mappings by SKU/variation ID.

## File Structure

- Create `apps/api/db/migrations/20260710_pancake_bidirectional_sync.sql`: durable sync tables and indexes.
- Modify `apps/api/db/schema.sql`: keep schema bootstrap equivalent to migration.
- Modify `apps/api/src/config/env.js`: add Pancake order polling and retry settings.
- Modify `apps/api/.env.example`: document new variables without secrets.
- Create `apps/api/src/integrations/pancake/pancakeOrderSyncRepository.js`: link/event/log/snapshot persistence.
- Create `apps/api/src/integrations/pancake/pancakeOrderMapper.js`: normalize Pancake orders, status mapping, local patch generation, outbound update payloads.
- Modify `apps/api/src/integrations/pancake/pancakeClient.js`: add order list/detail/update methods.
- Create `apps/api/src/integrations/pancake/pancakeOrderSyncService.js`: inbound polling, local upsert/merge, outbound event processing.
- Modify `apps/api/src/integrations/pancake/pancakeAutoSyncWorker.js`: run inbound and outbound order sync automatically.
- Modify `apps/api/src/routes/orders.js`: keep website checkout enqueue behavior and surface returned sync status from durable link/event state.
- Modify `apps/api/src/routes/admin.js`: enqueue outbound sync events after admin order updates and include Pancake sync detail in order detail response.
- Modify `apps/api/src/routes/adminPancake.js`: expose sync logs/status endpoint for diagnostics.
- Modify `apps/web/src/admin/OrderDetail.jsx`: render Pancake sync panel fields.
- Modify `apps/web/test/adminOrderDetailSource.test.js`: source assertions for sync UI.
- Create/update API tests listed per task.

---

### Task 1: Schema and Config Foundation

**Files:**
- Create: `apps/api/db/migrations/20260710_pancake_bidirectional_sync.sql`
- Modify: `apps/api/db/schema.sql`
- Modify: `apps/api/src/config/env.js`
- Modify: `apps/api/.env.example`
- Test: `apps/api/test/pancakeBidirectionalSyncMigration.test.js`
- Test: `apps/api/test/pancakeConfig.test.js`

- [ ] **Step 1: Write failing migration/config tests**

Add `apps/api/test/pancakeBidirectionalSyncMigration.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Pancake bidirectional sync migration creates durable link event log and snapshot tables', () => {
  const sql = fs.readFileSync(path.join(root, 'db', 'migrations', '20260710_pancake_bidirectional_sync.sql'), 'utf8');

  for (const table of ['pancake_order_links', 'pancake_sync_events', 'pancake_sync_logs', 'pancake_order_snapshots']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql, /UNIQUE \(pancake_order_id\)/);
  assert.match(sql, /UNIQUE \(direction, entity_type, entity_id, event_key\)/);
  assert.match(sql, /next_attempt_at/);
  assert.match(sql, /payload_hash/);
  assert.match(sql, /safe_error_code/);
  assert.doesNotMatch(sql, /api_key|PANCAKE_API_KEY|webhook_secret/i);
});

test('base schema includes Pancake bidirectional sync tables', () => {
  const sql = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_order_links/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_sync_events/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_sync_logs/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pancake_order_snapshots/);
});
```

Extend `apps/api/test/pancakeConfig.test.js` with:

```js
test('Pancake config exposes order polling and retry settings', () => {
  const { pancakeConfig } = require('../src/config/env');
  const config = pancakeConfig({
    PANCAKE_MODE: 'live',
    PANCAKE_API_KEY: 'secret',
    PANCAKE_SHOP_ID: '123',
    PANCAKE_ORDER_POLL_INTERVAL_MS: '120000',
    PANCAKE_ORDER_POLL_PAGE_SIZE: '25',
    PANCAKE_ORDER_POLL_LOOKBACK_MS: '900000',
    PANCAKE_SYNC_MAX_ATTEMPTS: '7'
  });

  assert.equal(config.orderPollIntervalMs, 120000);
  assert.equal(config.orderPollPageSize, 25);
  assert.equal(config.orderPollLookbackMs, 900000);
  assert.equal(config.syncMaxAttempts, 7);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test apps/api/test/pancakeBidirectionalSyncMigration.test.js apps/api/test/pancakeConfig.test.js
```

Expected: fails because migration file and config properties do not exist.

- [ ] **Step 3: Add migration**

Create `apps/api/db/migrations/20260710_pancake_bidirectional_sync.sql`:

```sql
CREATE TABLE IF NOT EXISTS pancake_order_links (
  id text PRIMARY KEY,
  order_number text NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  pancake_order_id text NOT NULL,
  shop_id text NOT NULL DEFAULT '',
  sync_status text NOT NULL DEFAULT 'pending_sync' CHECK (sync_status IN ('synced','pending_sync','sync_failed','blocked','not_linked')),
  last_synced_at timestamptz,
  last_pancake_updated_at timestamptz,
  last_local_updated_at timestamptz,
  safe_error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_number),
  UNIQUE (pancake_order_id)
);

CREATE INDEX IF NOT EXISTS pancake_order_links_status_idx
  ON pancake_order_links(sync_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS pancake_sync_events (
  id text PRIMARY KEY,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  entity_type text NOT NULL CHECK (entity_type IN ('order','inventory')),
  entity_id text NOT NULL,
  order_number text NOT NULL DEFAULT '',
  pancake_order_id text NOT NULL DEFAULT '',
  event_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','processing','succeeded','failed_retryable','blocked','duplicate')),
  payload_hash text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  safe_error_code text NOT NULL DEFAULT '',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (direction, entity_type, entity_id, event_key)
);

CREATE INDEX IF NOT EXISTS pancake_sync_events_due_idx
  ON pancake_sync_events(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS pancake_sync_events_order_idx
  ON pancake_sync_events(order_number, created_at DESC);
CREATE INDEX IF NOT EXISTS pancake_sync_events_pancake_order_idx
  ON pancake_sync_events(pancake_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pancake_sync_logs (
  id text PRIMARY KEY,
  direction text NOT NULL DEFAULT '',
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  order_number text NOT NULL DEFAULT '',
  pancake_order_id text NOT NULL DEFAULT '',
  level text NOT NULL CHECK (level IN ('info','warning','error')),
  code text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pancake_sync_logs_order_idx
  ON pancake_sync_logs(order_number, created_at DESC);
CREATE INDEX IF NOT EXISTS pancake_sync_logs_created_idx
  ON pancake_sync_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS pancake_order_snapshots (
  pancake_order_id text PRIMARY KEY,
  order_number text NOT NULL DEFAULT '',
  shop_id text NOT NULL DEFAULT '',
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NOT NULL DEFAULT '',
  pancake_updated_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pancake_order_snapshots_order_idx
  ON pancake_order_snapshots(order_number);
```

- [ ] **Step 4: Mirror migration into base schema**

Append the same table definitions to `apps/api/db/schema.sql` after `pancake_order_exports`.

- [ ] **Step 5: Add env parsing**

In `apps/api/src/config/env.js`, inside `pancakeConfig`, add:

```js
const orderPollIntervalMs = autoSyncInteger('PANCAKE_ORDER_POLL_INTERVAL_MS', 5 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000);
const orderPollPageSize = autoSyncInteger('PANCAKE_ORDER_POLL_PAGE_SIZE', 50, 1, 100);
const orderPollLookbackMs = autoSyncInteger('PANCAKE_ORDER_POLL_LOOKBACK_MS', 15 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000);
const syncMaxAttempts = autoSyncInteger('PANCAKE_SYNC_MAX_ATTEMPTS', 10, 1, 100);
```

Return these fields in the config object:

```js
orderPollIntervalMs,
orderPollPageSize,
orderPollLookbackMs,
syncMaxAttempts
```

- [ ] **Step 6: Document env vars**

Add to `apps/api/.env.example`:

```dotenv
PANCAKE_ORDER_POLL_INTERVAL_MS=300000
PANCAKE_ORDER_POLL_PAGE_SIZE=50
PANCAKE_ORDER_POLL_LOOKBACK_MS=900000
PANCAKE_SYNC_MAX_ATTEMPTS=10
```

- [ ] **Step 7: Verify tests pass**

Run:

```bash
node --test apps/api/test/pancakeBidirectionalSyncMigration.test.js apps/api/test/pancakeConfig.test.js apps/api/test/productionConfig.test.js
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/db/migrations/20260710_pancake_bidirectional_sync.sql apps/api/db/schema.sql apps/api/src/config/env.js apps/api/.env.example apps/api/test/pancakeBidirectionalSyncMigration.test.js apps/api/test/pancakeConfig.test.js
git commit -m "feat: add Pancake sync persistence schema"
```

---

### Task 2: Sync Repository

**Files:**
- Create: `apps/api/src/integrations/pancake/pancakeOrderSyncRepository.js`
- Test: `apps/api/test/pancakeOrderSyncRepository.test.js`

- [ ] **Step 1: Write failing repository tests**

Create `apps/api/test/pancakeOrderSyncRepository.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('memory sync repository upserts links and exposes public sync detail', async () => {
  const repo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  repo.resetMemoryForTests();

  await repo.upsertOrderLink({
    orderNumber: 'MCC-1',
    pancakeOrderId: 'PK-1',
    shopId: 'shop-1',
    syncStatus: 'synced',
    lastSyncedAt: '2026-07-10T00:00:00.000Z'
  });

  const detail = await repo.getOrderSyncDetail('MCC-1');
  assert.equal(detail.pancakeOrderId, 'PK-1');
  assert.equal(detail.syncStatus, 'synced');
  assert.equal(detail.lastSyncedAt, '2026-07-10T00:00:00.000Z');
});

test('memory sync repository deduplicates events by deterministic key', async () => {
  const repo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  repo.resetMemoryForTests();

  const first = await repo.enqueueSyncEvent({
    direction: 'inbound',
    entityType: 'order',
    entityId: 'PK-1',
    orderNumber: 'MCC-1',
    pancakeOrderId: 'PK-1',
    eventKey: 'PK-1:updated:hash',
    payloadHash: 'hash',
    payload: { status: 'New' }
  });
  const second = await repo.enqueueSyncEvent({
    direction: 'inbound',
    entityType: 'order',
    entityId: 'PK-1',
    orderNumber: 'MCC-1',
    pancakeOrderId: 'PK-1',
    eventKey: 'PK-1:updated:hash',
    payloadHash: 'hash',
    payload: { status: 'New' }
  });

  assert.equal(first.status, 'pending');
  assert.equal(second.status, 'duplicate');
});

test('memory sync repository claims due events and marks retryable failure with backoff', async () => {
  const repo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  repo.resetMemoryForTests();
  const event = await repo.enqueueSyncEvent({
    direction: 'outbound',
    entityType: 'order',
    entityId: 'MCC-1',
    orderNumber: 'MCC-1',
    pancakeOrderId: 'PK-1',
    eventKey: 'MCC-1:status:1',
    payloadHash: 'hash',
    payload: { status: 'shipped' }
  });

  const claimed = await repo.claimDueSyncEvents({ direction: 'outbound', limit: 5, now: '2026-07-10T00:00:00.000Z' });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].id, event.id);

  await repo.markSyncEventRetryable(event.id, {
    safeErrorCode: 'pancake_network_error',
    nextAttemptAt: '2026-07-10T00:05:00.000Z'
  });
  const retry = await repo.getSyncEvent(event.id);
  assert.equal(retry.status, 'failed_retryable');
  assert.equal(retry.attemptCount, 1);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test apps/api/test/pancakeOrderSyncRepository.test.js
```

Expected: fails because repository does not exist.

- [ ] **Step 3: Implement repository**

Create `apps/api/src/integrations/pancake/pancakeOrderSyncRepository.js` with:

```js
const crypto = require('node:crypto');
const { hasDatabaseUrl, query } = require('../../db/postgres');

const memory = { links: [], events: [], logs: [], snapshots: [] };

function resetMemoryForTests() {
  memory.links = [];
  memory.events = [];
  memory.logs = [];
  memory.snapshots = [];
}

function iso(value) {
  return value ? new Date(value).toISOString() : '';
}

function rowEvent(row) {
  return {
    id: row.id,
    direction: row.direction,
    entityType: row.entity_type || row.entityType,
    entityId: row.entity_id || row.entityId,
    orderNumber: row.order_number || row.orderNumber || '',
    pancakeOrderId: row.pancake_order_id || row.pancakeOrderId || '',
    eventKey: row.event_key || row.eventKey,
    status: row.status,
    payloadHash: row.payload_hash || row.payloadHash || '',
    payload: row.payload || {},
    safeErrorCode: row.safe_error_code || row.safeErrorCode || '',
    attemptCount: Number(row.attempt_count || row.attemptCount || 0),
    nextAttemptAt: iso(row.next_attempt_at || row.nextAttemptAt),
    createdAt: iso(row.created_at || row.createdAt),
    updatedAt: iso(row.updated_at || row.updatedAt)
  };
}

function rowLink(row) {
  if (!row) return null;
  return {
    orderNumber: row.order_number || row.orderNumber,
    pancakeOrderId: row.pancake_order_id || row.pancakeOrderId || '',
    shopId: row.shop_id || row.shopId || '',
    syncStatus: row.sync_status || row.syncStatus || 'not_linked',
    lastSyncedAt: iso(row.last_synced_at || row.lastSyncedAt),
    lastPancakeUpdatedAt: iso(row.last_pancake_updated_at || row.lastPancakeUpdatedAt),
    lastLocalUpdatedAt: iso(row.last_local_updated_at || row.lastLocalUpdatedAt),
    safeErrorCode: row.safe_error_code || row.safeErrorCode || ''
  };
}

async function upsertOrderLink(input) {
  const record = {
    id: crypto.randomUUID(),
    orderNumber: String(input.orderNumber || '').trim(),
    pancakeOrderId: String(input.pancakeOrderId || '').trim(),
    shopId: String(input.shopId || '').trim(),
    syncStatus: input.syncStatus || 'pending_sync',
    lastSyncedAt: input.lastSyncedAt || null,
    lastPancakeUpdatedAt: input.lastPancakeUpdatedAt || null,
    lastLocalUpdatedAt: input.lastLocalUpdatedAt || null,
    safeErrorCode: input.safeErrorCode || ''
  };
  if (!record.orderNumber || !record.pancakeOrderId) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.links.find((item) => item.orderNumber === record.orderNumber || item.pancakeOrderId === record.pancakeOrderId);
    if (existing) Object.assign(existing, record);
    else memory.links.push(record);
    return rowLink(existing || record);
  }
  const result = await query(
    `INSERT INTO pancake_order_links (
       id, order_number, pancake_order_id, shop_id, sync_status, last_synced_at,
       last_pancake_updated_at, last_local_updated_at, safe_error_code, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (order_number) DO UPDATE SET
       pancake_order_id=EXCLUDED.pancake_order_id,
       shop_id=EXCLUDED.shop_id,
       sync_status=EXCLUDED.sync_status,
       last_synced_at=EXCLUDED.last_synced_at,
       last_pancake_updated_at=EXCLUDED.last_pancake_updated_at,
       last_local_updated_at=EXCLUDED.last_local_updated_at,
       safe_error_code=EXCLUDED.safe_error_code,
       updated_at=now()
     RETURNING *`,
    [
      record.id, record.orderNumber, record.pancakeOrderId, record.shopId, record.syncStatus,
      record.lastSyncedAt, record.lastPancakeUpdatedAt, record.lastLocalUpdatedAt, record.safeErrorCode
    ]
  );
  return rowLink(result.rows[0]);
}

async function getOrderSyncDetail(orderNumber) {
  const normalized = String(orderNumber || '').trim();
  if (!normalized) return { syncStatus: 'not_linked', recentLogs: [] };
  if (!hasDatabaseUrl()) {
    const link = memory.links.find((item) => item.orderNumber === normalized);
    const recentLogs = memory.logs.filter((item) => item.orderNumber === normalized).slice(0, 10);
    return { ...(rowLink(link) || { orderNumber: normalized, syncStatus: 'not_linked' }), recentLogs };
  }
  const link = await query('SELECT * FROM pancake_order_links WHERE order_number=$1', [normalized]);
  const logs = await query(
    `SELECT * FROM pancake_sync_logs WHERE order_number=$1 ORDER BY created_at DESC LIMIT 10`,
    [normalized]
  );
  return {
    ...(rowLink(link.rows[0]) || { orderNumber: normalized, syncStatus: 'not_linked' }),
    recentLogs: logs.rows.map((row) => ({
      id: row.id,
      level: row.level,
      code: row.code,
      message: row.message,
      createdAt: iso(row.created_at)
    }))
  };
}

async function enqueueSyncEvent(input) {
  const event = {
    id: crypto.randomUUID(),
    direction: String(input.direction || '').trim(),
    entityType: String(input.entityType || '').trim(),
    entityId: String(input.entityId || '').trim(),
    orderNumber: String(input.orderNumber || '').trim(),
    pancakeOrderId: String(input.pancakeOrderId || '').trim(),
    eventKey: String(input.eventKey || '').trim(),
    status: 'pending',
    payloadHash: String(input.payloadHash || '').trim(),
    payload: input.payload || {},
    safeErrorCode: '',
    attemptCount: 0,
    nextAttemptAt: input.nextAttemptAt || new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!event.direction || !event.entityType || !event.entityId || !event.eventKey) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.events.find((item) =>
      item.direction === event.direction
      && item.entityType === event.entityType
      && item.entityId === event.entityId
      && item.eventKey === event.eventKey
    );
    if (existing) return { ...rowEvent(existing), status: 'duplicate' };
    memory.events.push(event);
    return rowEvent(event);
  }
  const result = await query(
    `INSERT INTO pancake_sync_events (
       id,direction,entity_type,entity_id,order_number,pancake_order_id,event_key,status,
       payload_hash,payload,next_attempt_at,created_at,updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9::jsonb,$10,now(),now())
     ON CONFLICT (direction, entity_type, entity_id, event_key) DO NOTHING
     RETURNING *`,
    [
      event.id, event.direction, event.entityType, event.entityId, event.orderNumber,
      event.pancakeOrderId, event.eventKey, event.payloadHash, JSON.stringify(event.payload),
      event.nextAttemptAt
    ]
  );
  return result.rows[0] ? rowEvent(result.rows[0]) : { ...event, status: 'duplicate' };
}

async function claimDueSyncEvents({ direction, limit = 25, now = new Date().toISOString() } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
  if (!hasDatabaseUrl()) {
    return memory.events
      .filter((item) => item.direction === direction && ['pending', 'failed_retryable'].includes(item.status) && item.nextAttemptAt <= now)
      .slice(0, safeLimit)
      .map((item) => {
        item.status = 'processing';
        item.updatedAt = new Date().toISOString();
        return rowEvent(item);
      });
  }
  const result = await query(
    `WITH due AS (
       SELECT id FROM pancake_sync_events
       WHERE direction=$1 AND status IN ('pending','failed_retryable') AND next_attempt_at <= $2
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     UPDATE pancake_sync_events e
     SET status='processing', locked_at=now(), updated_at=now()
     FROM due
     WHERE e.id=due.id
     RETURNING e.*`,
    [direction, now, safeLimit]
  );
  return result.rows.map(rowEvent);
}

async function getSyncEvent(id) {
  if (!hasDatabaseUrl()) return rowEvent(memory.events.find((item) => item.id === id));
  const result = await query('SELECT * FROM pancake_sync_events WHERE id=$1', [id]);
  return result.rows[0] ? rowEvent(result.rows[0]) : null;
}

async function markSyncEventSucceeded(id) {
  if (!hasDatabaseUrl()) {
    const event = memory.events.find((item) => item.id === id);
    if (event) Object.assign(event, { status: 'succeeded', processedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return rowEvent(event);
  }
  const result = await query(
    `UPDATE pancake_sync_events
     SET status='succeeded', processed_at=now(), updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id]
  );
  return result.rows[0] ? rowEvent(result.rows[0]) : null;
}

async function markSyncEventRetryable(id, input) {
  if (!hasDatabaseUrl()) {
    const event = memory.events.find((item) => item.id === id);
    if (event) Object.assign(event, {
      status: 'failed_retryable',
      safeErrorCode: input.safeErrorCode || '',
      attemptCount: Number(event.attemptCount || 0) + 1,
      nextAttemptAt: input.nextAttemptAt,
      updatedAt: new Date().toISOString()
    });
    return rowEvent(event);
  }
  const result = await query(
    `UPDATE pancake_sync_events
     SET status='failed_retryable', safe_error_code=$2, attempt_count=attempt_count+1,
         next_attempt_at=$3, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, input.safeErrorCode || '', input.nextAttemptAt]
  );
  return result.rows[0] ? rowEvent(result.rows[0]) : null;
}

async function markSyncEventBlocked(id, safeErrorCode) {
  if (!hasDatabaseUrl()) {
    const event = memory.events.find((item) => item.id === id);
    if (event) Object.assign(event, { status: 'blocked', safeErrorCode, updatedAt: new Date().toISOString() });
    return rowEvent(event);
  }
  const result = await query(
    `UPDATE pancake_sync_events
     SET status='blocked', safe_error_code=$2, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, safeErrorCode || 'pancake_sync_blocked']
  );
  return result.rows[0] ? rowEvent(result.rows[0]) : null;
}

async function appendSyncLog(input) {
  const log = {
    id: crypto.randomUUID(),
    direction: input.direction || '',
    entityType: input.entityType || '',
    entityId: input.entityId || '',
    orderNumber: input.orderNumber || '',
    pancakeOrderId: input.pancakeOrderId || '',
    level: input.level || 'info',
    code: input.code || '',
    message: input.message || '',
    metadata: input.metadata || {},
    createdAt: new Date().toISOString()
  };
  if (!hasDatabaseUrl()) {
    memory.logs.unshift(log);
    return log;
  }
  await query(
    `INSERT INTO pancake_sync_logs (
       id,direction,entity_type,entity_id,order_number,pancake_order_id,level,code,message,metadata,created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now())`,
    [
      log.id, log.direction, log.entityType, log.entityId, log.orderNumber, log.pancakeOrderId,
      log.level, log.code, log.message, JSON.stringify(log.metadata)
    ]
  );
  return log;
}

module.exports = {
  appendSyncLog,
  claimDueSyncEvents,
  enqueueSyncEvent,
  getOrderSyncDetail,
  getSyncEvent,
  markSyncEventBlocked,
  markSyncEventRetryable,
  markSyncEventSucceeded,
  resetMemoryForTests,
  upsertOrderLink
};
```

- [ ] **Step 4: Run repository tests**

Run:

```bash
node --test apps/api/test/pancakeOrderSyncRepository.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/pancake/pancakeOrderSyncRepository.js apps/api/test/pancakeOrderSyncRepository.test.js
git commit -m "feat: add Pancake sync event repository"
```

---

### Task 3: Order Status and Payload Mapping

**Files:**
- Create: `apps/api/src/integrations/pancake/pancakeOrderMapper.js`
- Test: `apps/api/test/pancakeOrderMapper.test.js`

- [ ] **Step 1: Write failing mapper tests**

Create `apps/api/test/pancakeOrderMapper.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('maps known Pancake status names to local status fields', () => {
  const { mapPancakeStatus } = require('../src/integrations/pancake/pancakeOrderMapper');
  assert.deepEqual(mapPancakeStatus('New'), { status: 'received', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' });
  assert.deepEqual(mapPancakeStatus('Packing'), { status: 'packed', fulfillmentStatus: 'packed', deliveryStatus: 'ready' });
  assert.deepEqual(mapPancakeStatus('Delivered'), { status: 'delivered', fulfillmentStatus: 'delivered', deliveryStatus: 'delivered' });
  assert.deepEqual(mapPancakeStatus('Cancelled'), { status: 'cancelled', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' });
});

test('unknown Pancake status maps safely to other', () => {
  const { mapPancakeStatus } = require('../src/integrations/pancake/pancakeOrderMapper');
  assert.deepEqual(mapPancakeStatus('Provider Custom State'), { status: 'other', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' });
});

test('normalizes Pancake order payload into local order fields', () => {
  const { normalizePancakeOrder } = require('../src/integrations/pancake/pancakeOrderMapper');
  const order = normalizePancakeOrder({
    id: 'PK-1',
    custom_id: 'MCC-1',
    status: 'Delivered',
    bill_full_name: 'Maria Customer',
    bill_phone_number: '09171234567',
    bill_email: 'buyer@example.com',
    shipping_address: {
      address: '123 Street',
      full_address: '123 Street, Barangay, Makati, Metro Manila, Philippines',
      post_code: '1200'
    },
    items: [{ variation_info: { name: 'Shirt' }, variation_id: 'PV-1', quantity: 2, price: 899 }],
    shipping_fee: 100,
    total_discount: 50,
    total_price: 1848,
    note: 'Customer note',
    updated_at: '2026-07-10T00:00:00.000Z'
  });

  assert.equal(order.pancakeOrderId, 'PK-1');
  assert.equal(order.orderNumber, 'MCC-1');
  assert.equal(order.customer.fullName, 'Maria Customer');
  assert.equal(order.paymentMethod, 'cash_on_delivery');
  assert.equal(order.status, 'delivered');
  assert.equal(order.totalCents, 184800);
  assert.equal(order.shippingFeeCents, 10000);
});

test('builds outbound Pancake order update payload from local order changes', () => {
  const { buildPancakeOrderUpdatePayload } = require('../src/integrations/pancake/pancakeOrderMapper');
  const payload = buildPancakeOrderUpdatePayload({
    order: {
      status: 'shipped',
      fulfillmentStatus: 'shipped',
      deliveryStatus: 'out_for_delivery',
      trackingNumber: 'JNT123',
      customer: { fullName: 'Maria Customer', phone: '09171234567', email: 'buyer@example.com' },
      address: { addressLine: '123 Street, Barangay, Makati', postalCode: '1200' },
      notes: 'Pack carefully'
    },
    changedFields: ['status', 'trackingNumber', 'customer', 'address', 'notes']
  });
  assert.equal(payload.status, 'Shipped');
  assert.equal(payload.tracking_number, 'JNT123');
  assert.equal(payload.bill_full_name, 'Maria Customer');
  assert.equal(payload.note_print, 'Pack carefully');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test apps/api/test/pancakeOrderMapper.test.js
```

Expected: fails because mapper does not exist.

- [ ] **Step 3: Implement mapper**

Create `apps/api/src/integrations/pancake/pancakeOrderMapper.js`:

```js
const STATUS_MAP = new Map([
  ['new', { status: 'received', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['received', { status: 'received', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['confirmed', { status: 'confirmed', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['packing', { status: 'packed', fulfillmentStatus: 'packed', deliveryStatus: 'ready' }],
  ['packed', { status: 'packed', fulfillmentStatus: 'packed', deliveryStatus: 'ready' }],
  ['shipped', { status: 'shipped', fulfillmentStatus: 'shipped', deliveryStatus: 'out_for_delivery' }],
  ['delivered', { status: 'delivered', fulfillmentStatus: 'delivered', deliveryStatus: 'delivered' }],
  ['cancelled', { status: 'cancelled', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' }],
  ['canceled', { status: 'cancelled', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' }],
  ['returned', { status: 'returned', fulfillmentStatus: 'shipped', deliveryStatus: 'returned' }],
  ['failed', { status: 'failed', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' }],
  ['unreachable', { status: 'unreachable', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }]
]);

const LOCAL_TO_PANCAKE = {
  received: 'New',
  confirmed: 'Confirmed',
  packed: 'Packing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
  failed: 'Failed',
  unreachable: 'Unreachable',
  other: 'Other'
};

function normalizedKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function mapPancakeStatus(value) {
  const raw = typeof value === 'object' && value !== null ? value.name ?? value.status ?? value.id : value;
  const mapped = STATUS_MAP.get(normalizedKey(raw));
  return mapped || { status: 'other', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' };
}

function centsFromPesos(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function normalizePancakeItem(item = {}) {
  const variation = item.variation_info || item.variation || {};
  return {
    productId: String(variation.product_id || item.product_id || ''),
    variantId: String(variation.id || item.variation_id || ''),
    sku: String(variation.sku || item.sku || ''),
    productName: String(variation.name || item.product_name || item.name || 'Pancake item').trim(),
    size: String(variation.size || item.size || ''),
    quantity: Math.max(1, Math.trunc(Number(item.quantity || 1))),
    unitPriceCents: centsFromPesos(item.price || item.retail_price || variation.retail_price),
    pancakeVariationId: String(variation.id || item.variation_id || '')
  };
}

function normalizePancakeOrder(payload = {}) {
  const pancakeOrderId = String(payload.id ?? payload.order_id ?? '').trim();
  const shipping = payload.shipping_address || {};
  const statusFields = mapPancakeStatus(payload.status_name || payload.status);
  const orderNumber = String(payload.custom_id || payload.order_number || payload.note?.match?.(/Website order ([^\s]+)/)?.[1] || '').trim();
  const updatedAt = payload.updated_at || payload.modified_at || payload.last_updated_at || '';
  const items = (Array.isArray(payload.items) ? payload.items : []).map(normalizePancakeItem);
  const subtotalCents = items.reduce((sum, item) => sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 0), 0);
  const discountTotalCents = centsFromPesos(payload.total_discount || payload.discount || 0);
  const shippingFeeCents = centsFromPesos(payload.shipping_fee || 0);
  const totalCents = centsFromPesos(payload.total_price || payload.total || 0) || Math.max(0, subtotalCents - discountTotalCents + shippingFeeCents);

  return {
    pancakeOrderId,
    orderNumber,
    pancakeUpdatedAt: updatedAt,
    customer: {
      fullName: String(payload.bill_full_name || payload.customer?.name || '').trim(),
      phone: String(payload.bill_phone_number || payload.customer?.phone || '').trim(),
      email: String(payload.bill_email || payload.customer?.email || '').trim().toLowerCase()
    },
    address: {
      addressLine: String(shipping.full_address || shipping.address || '').trim(),
      houseAddress: String(shipping.address || '').trim(),
      barangay: String(shipping.ward || shipping.barangay || '').trim(),
      city: String(shipping.district || shipping.city || '').trim(),
      province: String(shipping.province || shipping.region || '').trim(),
      country: String(shipping.country || 'Philippines').trim(),
      postalCode: String(shipping.post_code || shipping.postal_code || '').trim()
    },
    items,
    subtotalCents,
    discountTotalCents,
    shippingFeeCents,
    totalCents,
    paymentMethod: 'cash_on_delivery',
    paymentStatus: payload.is_paid || payload.payment_status === 'paid' ? 'paid' : 'cod_pending',
    codConfirmationStatus: 'pending',
    deliveryMethod: String(payload.shipping_partner || payload.delivery_method || 'Standard shipping').trim(),
    trackingNumber: String(payload.tracking_number || payload.shipping_code || '').trim(),
    notes: String(payload.note_print || payload.note || '').trim(),
    channel: 'Pancake POS',
    ...statusFields
  };
}

function buildPancakeOrderUpdatePayload({ order, changedFields = [] } = {}) {
  const fields = new Set(changedFields);
  const payload = {};
  if (fields.has('status') || fields.has('fulfillmentStatus') || fields.has('deliveryStatus')) {
    payload.status = LOCAL_TO_PANCAKE[order.status] || 'Other';
  }
  if (fields.has('trackingNumber')) payload.tracking_number = String(order.trackingNumber || '').trim();
  if (fields.has('customer')) {
    payload.bill_full_name = String(order.customer?.fullName || '').trim();
    payload.bill_phone_number = String(order.customer?.phone || '').trim();
    payload.bill_email = String(order.customer?.email || '').trim().toLowerCase();
  }
  if (fields.has('address')) {
    payload.shipping_address = {
      address: String(order.address?.houseAddress || order.address?.addressLine || '').trim(),
      full_address: String(order.address?.addressLine || '').trim(),
      post_code: String(order.address?.postalCode || '').trim()
    };
  }
  if (fields.has('notes')) payload.note_print = String(order.notes || '').trim();
  if (fields.has('paymentStatus')) payload.payment_status = order.paymentStatus === 'paid' ? 'paid' : 'cod_pending';
  return payload;
}

module.exports = {
  buildPancakeOrderUpdatePayload,
  mapPancakeStatus,
  normalizePancakeOrder
};
```

- [ ] **Step 4: Run mapper tests**

Run:

```bash
node --test apps/api/test/pancakeOrderMapper.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/pancake/pancakeOrderMapper.js apps/api/test/pancakeOrderMapper.test.js
git commit -m "feat: map Pancake orders to local orders"
```

---

### Task 4: Pancake Order Client Methods

**Files:**
- Modify: `apps/api/src/integrations/pancake/pancakeClient.js`
- Test: `apps/api/test/pancakeClient.test.js`

- [ ] **Step 1: Add failing client tests**

Add to `apps/api/test/pancakeClient.test.js`:

```js
test('Pancake client lists orders with updated cursor pagination', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const calls = [];
  const client = createPancakeClient({
    apiBaseUrl: 'https://pos.pages.fm/api/v1',
    apiKey: 'secret',
    timeoutMs: 1000
  }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => JSON.stringify({ data: [{ id: 'PK-1' }], page_number: 1, page_size: 50, total_pages: 1, total_entries: 1 }) };
  });

  const body = await client.listOrders('shop-1', { pageNumber: 1, pageSize: 50, updatedSince: '2026-07-10T00:00:00.000Z' });
  assert.equal(body.data[0].id, 'PK-1');
  assert.match(calls[0].url, /\/shops\/shop-1\/orders/);
  assert.match(calls[0].url, /updated_since=2026-07-10T00%3A00%3A00.000Z/);
});

test('Pancake client updates an order with JSON body', async () => {
  const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
  const calls = [];
  const client = createPancakeClient({
    apiBaseUrl: 'https://pos.pages.fm/api/v1',
    apiKey: 'secret',
    timeoutMs: 1000
  }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => JSON.stringify({ data: { id: 'PK-1' } }) };
  });

  await client.updateOrder('shop-1', 'PK-1', { status: 'Shipped' });
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(JSON.parse(calls[0].options.body).status, 'Shipped');
  assert.match(calls[0].url, /\/shops\/shop-1\/orders\/PK-1/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test apps/api/test/pancakeClient.test.js
```

Expected: fails because `listOrders` and `updateOrder` are missing.

- [ ] **Step 3: Implement client methods**

In `apps/api/src/integrations/pancake/pancakeClient.js`, add:

```js
async function listOrders(shopId, options = {}) {
  const pageNumber = Number(options.pageNumber);
  const pageSize = Number(options.pageSize);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1) {
    throw new PancakeApiError('pancake_invalid_request');
  }
  const query = { page_number: pageNumber, page_size: pageSize };
  if (options.updatedSince) query.updated_since = options.updatedSince;
  const body = await request(shopPath(shopId, '/orders'), query);
  if (!Array.isArray(body.data)) throw new PancakeApiError('pancake_invalid_response');
  return body;
}

async function updateOrder(shopId, orderId, payload) {
  const id = String(orderId || '').trim();
  if (!id) throw new PancakeApiError('pancake_invalid_request');
  return request(shopPath(shopId, `/orders/${encodeURIComponent(id)}`), {}, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
}
```

Return them from the client:

```js
listOrders,
updateOrder,
```

- [ ] **Step 4: Run client tests**

Run:

```bash
node --test apps/api/test/pancakeClient.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/pancake/pancakeClient.js apps/api/test/pancakeClient.test.js
git commit -m "feat: add Pancake order read update client"
```

---

### Task 5: Inbound and Outbound Order Sync Service

**Files:**
- Create: `apps/api/src/integrations/pancake/pancakeOrderSyncService.js`
- Test: `apps/api/test/pancakeOrderSyncService.test.js`

- [ ] **Step 1: Write failing service tests**

Create `apps/api/test/pancakeOrderSyncService.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

function memoryOrderRepo() {
  const orders = new Map();
  return {
    orders,
    findOrderByNumber: async (orderNumber) => orders.get(orderNumber) || null,
    saveOrder: async (order) => { orders.set(order.orderNumber, order); return order; },
    updateOrder: async (orderNumber, changes) => {
      const existing = orders.get(orderNumber);
      const next = { ...existing, ...changes, updatedAt: '2026-07-10T00:01:00.000Z' };
      orders.set(orderNumber, next);
      return next;
    }
  };
}

test('processInboundPancakeOrder imports a new Pancake order once', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();

  const result = await service.processInboundPancakeOrder({
    pancakeOrder: {
      id: 'PK-1',
      custom_id: 'MCC-PK-1',
      status: 'New',
      bill_full_name: 'Pancake Buyer',
      bill_phone_number: '09171234567',
      items: [],
      total_price: 1000,
      updated_at: '2026-07-10T00:00:00.000Z'
    },
    orderRepository: orders,
    syncRepository: syncRepo,
    now: () => new Date('2026-07-10T00:02:00.000Z')
  });

  assert.equal(result.status, 'imported');
  assert.equal(orders.orders.get('MCC-PK-1').channel, 'Pancake POS');
  assert.equal((await syncRepo.getOrderSyncDetail('MCC-PK-1')).pancakeOrderId, 'PK-1');

  const duplicate = await service.processInboundPancakeOrder({
    pancakeOrder: {
      id: 'PK-1',
      custom_id: 'MCC-PK-1',
      status: 'New',
      bill_full_name: 'Pancake Buyer',
      bill_phone_number: '09171234567',
      updated_at: '2026-07-10T00:00:00.000Z'
    },
    orderRepository: orders,
    syncRepository: syncRepo
  });
  assert.equal(duplicate.status, 'duplicate');
});

test('processInboundPancakeOrder updates linked existing order without duplication', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({ orderNumber: 'MCC-1', status: 'confirmed', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending', customer: {}, address: {}, items: [] });
  await syncRepo.upsertOrderLink({ orderNumber: 'MCC-1', pancakeOrderId: 'PK-1', syncStatus: 'synced' });

  const result = await service.processInboundPancakeOrder({
    pancakeOrder: { id: 'PK-1', custom_id: 'MCC-1', status: 'Delivered', tracking_number: 'TRACK-1', updated_at: '2026-07-10T00:05:00.000Z' },
    orderRepository: orders,
    syncRepository: syncRepo
  });

  assert.equal(result.status, 'updated');
  assert.equal(orders.orders.get('MCC-1').status, 'delivered');
  assert.equal(orders.orders.size, 1);
});

test('processOutboundOrderEvents sends due admin changes to Pancake', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({ orderNumber: 'MCC-1', status: 'shipped', trackingNumber: 'TRACK-1', customer: {}, address: {}, notes: '' });
  await syncRepo.upsertOrderLink({ orderNumber: 'MCC-1', pancakeOrderId: 'PK-1', shopId: 'shop-1', syncStatus: 'pending_sync' });
  await syncRepo.enqueueSyncEvent({
    direction: 'outbound',
    entityType: 'order',
    entityId: 'MCC-1',
    orderNumber: 'MCC-1',
    pancakeOrderId: 'PK-1',
    eventKey: 'MCC-1:status',
    payloadHash: 'hash',
    payload: { changedFields: ['status', 'trackingNumber'] }
  });
  const calls = [];

  const result = await service.processOutboundOrderEvents({
    config: { shopId: 'shop-1', syncMaxAttempts: 3 },
    client: { updateOrder: async (shopId, pancakeOrderId, payload) => calls.push({ shopId, pancakeOrderId, payload }) },
    orderRepository: orders,
    syncRepository: syncRepo,
    now: () => new Date('2026-07-10T00:00:00.000Z')
  });

  assert.equal(result.updatedCount, 1);
  assert.equal(calls[0].pancakeOrderId, 'PK-1');
  assert.equal(calls[0].payload.status, 'Shipped');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test apps/api/test/pancakeOrderSyncService.test.js
```

Expected: fails because service does not exist.

- [ ] **Step 3: Implement service**

Create `apps/api/src/integrations/pancake/pancakeOrderSyncService.js`:

```js
const crypto = require('node:crypto');
const orderRepositoryDefault = require('../../orders/orderRepository');
const syncRepositoryDefault = require('./pancakeOrderSyncRepository');
const {
  buildPancakeOrderUpdatePayload,
  normalizePancakeOrder
} = require('./pancakeOrderMapper');

function hashObject(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex');
}

function inboundEventKey(normalized, payloadHash) {
  return [
    normalized.pancakeOrderId,
    normalized.pancakeUpdatedAt || '',
    normalized.status || '',
    normalized.trackingNumber || '',
    payloadHash
  ].join(':');
}

function safeProviderCode(error) {
  const code = String(error?.code || '');
  return /^pancake_[a-z_]+$/.test(code) ? code : 'pancake_order_sync_failed';
}

function retryDelayMs(attempt) {
  return Math.min(60 * 60 * 1000, 60 * 1000 * (2 ** Math.max(0, attempt - 1)));
}

function importedOrder(normalized, now) {
  const placedAt = normalized.pancakeUpdatedAt || now().toISOString();
  return {
    orderNumber: normalized.orderNumber,
    customer: normalized.customer,
    address: normalized.address,
    items: normalized.items,
    subtotalCents: normalized.subtotalCents,
    discountTotalCents: normalized.discountTotalCents,
    discountCode: '',
    discountSnapshot: {},
    shippingFeeCents: normalized.shippingFeeCents,
    shippingRegion: '',
    shippingRegionLabel: '',
    freeShippingUnlocked: normalized.shippingFeeCents === 0,
    totalCents: normalized.totalCents,
    cartSnapshot: normalized.items,
    checkoutChannel: 'pancake_pos',
    paymentMethod: normalized.paymentMethod,
    channel: 'Pancake POS',
    status: normalized.status,
    fulfillmentStatus: normalized.fulfillmentStatus,
    paymentStatus: normalized.paymentStatus,
    codConfirmationStatus: normalized.codConfirmationStatus,
    deliveryStatus: normalized.deliveryStatus,
    deliveryMethod: normalized.deliveryMethod,
    trackingNumber: normalized.trackingNumber,
    tags: ['pancake-pos'],
    notes: normalized.notes,
    exportedToJnt: false,
    adminEditableTotals: {},
    placedAt,
    updatedAt: placedAt
  };
}

async function processInboundPancakeOrder({ pancakeOrder, orderRepository = orderRepositoryDefault, syncRepository = syncRepositoryDefault, now = () => new Date() }) {
  const normalized = normalizePancakeOrder(pancakeOrder);
  if (!normalized.pancakeOrderId) return { status: 'blocked', safeErrorCode: 'pancake_order_id_missing' };
  if (!normalized.orderNumber) return { status: 'blocked', safeErrorCode: 'pancake_order_match_low_confidence' };

  const payloadHash = hashObject(pancakeOrder);
  const event = await syncRepository.enqueueSyncEvent({
    direction: 'inbound',
    entityType: 'order',
    entityId: normalized.pancakeOrderId,
    orderNumber: normalized.orderNumber,
    pancakeOrderId: normalized.pancakeOrderId,
    eventKey: inboundEventKey(normalized, payloadHash),
    payloadHash,
    payload: { pancakeOrder }
  });
  if (event?.status === 'duplicate') return { status: 'duplicate' };

  const existing = await orderRepository.findOrderByNumber(normalized.orderNumber);
  if (!existing) {
    await orderRepository.saveOrder(importedOrder(normalized, now));
    await syncRepository.upsertOrderLink({
      orderNumber: normalized.orderNumber,
      pancakeOrderId: normalized.pancakeOrderId,
      syncStatus: 'synced',
      lastSyncedAt: now().toISOString(),
      lastPancakeUpdatedAt: normalized.pancakeUpdatedAt || null
    });
    await syncRepository.markSyncEventSucceeded(event.id);
    await syncRepository.appendSyncLog({
      direction: 'inbound',
      entityType: 'order',
      entityId: normalized.pancakeOrderId,
      orderNumber: normalized.orderNumber,
      pancakeOrderId: normalized.pancakeOrderId,
      level: 'info',
      code: 'pancake_order_imported',
      message: 'Pancake order imported.'
    });
    return { status: 'imported', orderNumber: normalized.orderNumber };
  }

  await orderRepository.updateOrder(normalized.orderNumber, {
    customer: normalized.customer,
    address: normalized.address,
    status: normalized.status,
    fulfillmentStatus: normalized.fulfillmentStatus,
    paymentStatus: normalized.paymentStatus,
    codConfirmationStatus: normalized.codConfirmationStatus,
    deliveryStatus: normalized.deliveryStatus,
    deliveryMethod: normalized.deliveryMethod,
    trackingNumber: normalized.trackingNumber,
    notes: normalized.notes || existing.notes || ''
  });
  await syncRepository.upsertOrderLink({
    orderNumber: normalized.orderNumber,
    pancakeOrderId: normalized.pancakeOrderId,
    syncStatus: 'synced',
    lastSyncedAt: now().toISOString(),
    lastPancakeUpdatedAt: normalized.pancakeUpdatedAt || null
  });
  await syncRepository.markSyncEventSucceeded(event.id);
  return { status: 'updated', orderNumber: normalized.orderNumber };
}

async function pollInboundPancakeOrders({ config, client, syncRepository = syncRepositoryDefault, orderRepository = orderRepositoryDefault, now = () => new Date() }) {
  if (!config.shopId) return { status: 'blocked', safeErrorCode: 'pancake_shop_id_missing', importedCount: 0, updatedCount: 0, duplicateCount: 0 };
  const updatedSince = new Date(now().getTime() - Number(config.orderPollLookbackMs || 15 * 60 * 1000)).toISOString();
  const pageSize = Number(config.orderPollPageSize || 50);
  const body = await client.listOrders(config.shopId, { pageNumber: 1, pageSize, updatedSince });
  const summary = { status: 'complete', importedCount: 0, updatedCount: 0, duplicateCount: 0, blockedCount: 0 };
  for (const pancakeOrder of body.data || []) {
    const result = await processInboundPancakeOrder({ pancakeOrder, orderRepository, syncRepository, now });
    if (result.status === 'imported') summary.importedCount += 1;
    else if (result.status === 'updated') summary.updatedCount += 1;
    else if (result.status === 'duplicate') summary.duplicateCount += 1;
    else if (result.status === 'blocked') summary.blockedCount += 1;
  }
  return summary;
}

async function processOutboundOrderEvents({ config, client, syncRepository = syncRepositoryDefault, orderRepository = orderRepositoryDefault, now = () => new Date(), limit = 25 }) {
  const events = await syncRepository.claimDueSyncEvents({ direction: 'outbound', limit, now: now().toISOString() });
  const summary = { checkedCount: events.length, updatedCount: 0, failedCount: 0, blockedCount: 0 };
  for (const event of events) {
    try {
      const order = await orderRepository.findOrderByNumber(event.orderNumber);
      if (!order || !event.pancakeOrderId) {
        await syncRepository.markSyncEventBlocked(event.id, !order ? 'local_order_missing' : 'pancake_order_link_missing');
        summary.blockedCount += 1;
        continue;
      }
      const payload = buildPancakeOrderUpdatePayload({ order, changedFields: event.payload.changedFields || [] });
      await client.updateOrder(config.shopId, event.pancakeOrderId, payload);
      await syncRepository.markSyncEventSucceeded(event.id);
      await syncRepository.upsertOrderLink({
        orderNumber: event.orderNumber,
        pancakeOrderId: event.pancakeOrderId,
        shopId: config.shopId,
        syncStatus: 'synced',
        lastSyncedAt: now().toISOString(),
        lastLocalUpdatedAt: order.updatedAt || now().toISOString()
      });
      summary.updatedCount += 1;
    } catch (error) {
      const nextAttemptAt = new Date(now().getTime() + retryDelayMs(Number(event.attemptCount || 0) + 1)).toISOString();
      await syncRepository.markSyncEventRetryable(event.id, { safeErrorCode: safeProviderCode(error), nextAttemptAt });
      summary.failedCount += 1;
    }
  }
  return summary;
}

module.exports = {
  pollInboundPancakeOrders,
  processInboundPancakeOrder,
  processOutboundOrderEvents
};
```

- [ ] **Step 4: Run service tests**

Run:

```bash
node --test apps/api/test/pancakeOrderSyncService.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/pancake/pancakeOrderSyncService.js apps/api/test/pancakeOrderSyncService.test.js
git commit -m "feat: sync Pancake orders bidirectionally"
```

---

### Task 6: Worker Integration

**Files:**
- Modify: `apps/api/src/integrations/pancake/pancakeAutoSyncWorker.js`
- Test: `apps/api/test/pancakeAutoSyncWorker.test.js`

- [ ] **Step 1: Add failing worker test**

Add to `apps/api/test/pancakeAutoSyncWorker.test.js`:

```js
test('auto sync worker runs inbound and outbound Pancake order sync after live export', async () => {
  const { createPancakeAutoSyncWorker } = require('../src/integrations/pancake/pancakeAutoSyncWorker');
  const calls = [];
  const worker = createPancakeAutoSyncWorker({
    config: { mode: 'live', autoSyncEnabled: true, apiKeyConfigured: true, autoSyncIntervalMs: 60000 },
    client: {},
    catalogService: { runCatalogImport: async () => ({ status: 'complete' }) },
    inventoryService: { runInventoryReconciliation: async () => ({ status: 'complete' }) },
    orderService: { runOrderLiveExport: async () => ({ status: 'complete' }) },
    orderSyncService: {
      pollInboundPancakeOrders: async () => { calls.push('inbound'); return { status: 'complete' }; },
      processOutboundOrderEvents: async () => { calls.push('outbound'); return { status: 'complete' }; }
    },
    logger: { info() {}, error() {} }
  });

  const result = await worker.runOnce();
  assert.equal(result.orderInbound.status, 'complete');
  assert.equal(result.orderOutbound.status, 'complete');
  assert.deepEqual(calls, ['inbound', 'outbound']);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test apps/api/test/pancakeAutoSyncWorker.test.js
```

Expected: fails because worker does not accept/run `orderSyncService`.

- [ ] **Step 3: Wire service into worker**

In `apps/api/src/integrations/pancake/pancakeAutoSyncWorker.js`, import:

```js
const orderSyncServiceDefault = require('./pancakeOrderSyncService');
const orderSyncRepositoryDefault = require('./pancakeOrderSyncRepository');
```

Add dependencies:

```js
orderSyncRepository = orderSyncRepositoryDefault,
orderSyncService = orderSyncServiceDefault,
```

Inside `runOnce()`, initialize result fields:

```js
orderInbound: null,
orderOutbound: null
```

After existing `result.orders = ...`, add:

```js
result.orderInbound = await guardedStep('inbound order sync', () => orderSyncService.pollInboundPancakeOrders({
  config,
  client,
  syncRepository: orderSyncRepository
}));
result.orderOutbound = await guardedStep('outbound order sync', () => orderSyncService.processOutboundOrderEvents({
  config,
  client,
  syncRepository: orderSyncRepository
}));
```

Extend log metadata:

```js
orderInbound: result.orderInbound?.status,
orderOutbound: result.orderOutbound?.status
```

- [ ] **Step 4: Run worker tests**

Run:

```bash
node --test apps/api/test/pancakeAutoSyncWorker.test.js apps/api/test/pancakeOrderSyncService.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/pancake/pancakeAutoSyncWorker.js apps/api/test/pancakeAutoSyncWorker.test.js
git commit -m "feat: run Pancake order sync in worker"
```

---

### Task 7: Enqueue Admin Order Updates

**Files:**
- Modify: `apps/api/src/routes/admin.js`
- Test: `apps/api/test/adminOrders.test.js`

- [ ] **Step 1: Add failing admin route test**

Add a focused test in `apps/api/test/adminOrders.test.js` near existing order PATCH tests:

```js
test('admin order updates enqueue Pancake outbound sync events for linked orders', async () => {
  const pancakeSync = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  pancakeSync.resetMemoryForTests();
  await pancakeSync.upsertOrderLink({ orderNumber: 'MCC-ADMIN-SYNC', pancakeOrderId: 'PK-ADMIN-1', syncStatus: 'synced' });

  const previous = {
    orderNumber: 'MCC-ADMIN-SYNC',
    status: 'confirmed',
    fulfillmentStatus: 'unfulfilled',
    paymentStatus: 'cod_pending',
    codConfirmationStatus: 'pending',
    deliveryStatus: 'pending',
    trackingNumber: '',
    customer: { fullName: 'A', phone: '1', email: '' },
    address: { addressLine: 'Old' },
    items: [],
    notes: ''
  };
  const next = { ...previous, status: 'shipped', fulfillmentStatus: 'shipped', deliveryStatus: 'out_for_delivery', trackingNumber: 'TRACK-1' };

  const { enqueuePancakeOrderUpdateIfLinked } = require('../src/routes/admin');
  const result = await enqueuePancakeOrderUpdateIfLinked(previous, next, { syncRepository: pancakeSync });

  assert.equal(result?.status, 'pending');
  assert.equal(result.pancakeOrderId, 'PK-ADMIN-1');
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test apps/api/test/adminOrders.test.js
```

Expected: fails because helper is not exported/implemented.

- [ ] **Step 3: Implement enqueue helper**

In `apps/api/src/routes/admin.js`, import:

```js
const pancakeOrderSyncRepository = require('../integrations/pancake/pancakeOrderSyncRepository');
```

Add helper near `appendStatusEventIfChanged`:

```js
function changedPancakeFields(previousOrder, nextOrder) {
  const fields = [];
  for (const field of ['status', 'fulfillmentStatus', 'paymentStatus', 'deliveryStatus', 'trackingNumber', 'notes']) {
    if (String(previousOrder?.[field] ?? '') !== String(nextOrder?.[field] ?? '')) fields.push(field);
  }
  if (JSON.stringify(previousOrder?.customer || {}) !== JSON.stringify(nextOrder?.customer || {})) fields.push('customer');
  if (JSON.stringify(previousOrder?.address || {}) !== JSON.stringify(nextOrder?.address || {})) fields.push('address');
  return fields;
}

async function enqueuePancakeOrderUpdateIfLinked(previousOrder, nextOrder, { syncRepository = pancakeOrderSyncRepository } = {}) {
  const changedFields = changedPancakeFields(previousOrder, nextOrder);
  if (!changedFields.length) return null;
  const detail = await syncRepository.getOrderSyncDetail(nextOrder.orderNumber);
  if (!detail?.pancakeOrderId) return null;
  return syncRepository.enqueueSyncEvent({
    direction: 'outbound',
    entityType: 'order',
    entityId: nextOrder.orderNumber,
    orderNumber: nextOrder.orderNumber,
    pancakeOrderId: detail.pancakeOrderId,
    eventKey: `${nextOrder.orderNumber}:${changedFields.sort().join(',')}:${nextOrder.updatedAt || Date.now()}`,
    payloadHash: crypto.createHash('sha256').update(JSON.stringify({ changedFields, updatedAt: nextOrder.updatedAt || '' })).digest('hex'),
    payload: { changedFields }
  });
}
```

After `await appendStatusEventIfChanged(existingOrder, order, 'admin');` in the PATCH route, add:

```js
await enqueuePancakeOrderUpdateIfLinked(existingOrder, order);
```

Export helper at bottom:

```js
module.exports = { adminRouter: router, normalizeOrderUpdate, enqueuePancakeOrderUpdateIfLinked };
```

If `adminRouter` is currently exported differently, preserve existing exported names and add the helper.

- [ ] **Step 4: Run admin tests**

Run:

```bash
node --test apps/api/test/adminOrders.test.js apps/api/test/pancakeOrderSyncRepository.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin.js apps/api/test/adminOrders.test.js
git commit -m "feat: enqueue Pancake sync for admin order edits"
```

---

### Task 8: Admin Order Detail Sync State API and UI

**Files:**
- Modify: `apps/api/src/routes/admin.js`
- Modify: `apps/web/src/admin/OrderDetail.jsx`
- Modify: `apps/web/test/adminOrderDetailSource.test.js`
- Test: `apps/api/test/adminOrders.test.js`

- [ ] **Step 1: Add failing API/UI tests**

Add to `apps/api/test/adminOrders.test.js`:

```js
test('admin order detail includes Pancake sync detail', async () => {
  const pancakeSync = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  pancakeSync.resetMemoryForTests();
  await pancakeSync.upsertOrderLink({
    orderNumber: 'MCC-SYNC-DETAIL',
    pancakeOrderId: 'PK-SYNC-1',
    syncStatus: 'synced',
    lastSyncedAt: '2026-07-10T00:00:00.000Z'
  });
  const detail = await pancakeSync.getOrderSyncDetail('MCC-SYNC-DETAIL');
  assert.equal(detail.pancakeOrderId, 'PK-SYNC-1');
  assert.equal(detail.syncStatus, 'synced');
});
```

Add to `apps/web/test/adminOrderDetailSource.test.js`:

```js
test('admin order detail renders Pancake sync diagnostics', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'OrderDetail.jsx'), 'utf8');
  assert.match(source, /Pancake POS sync details/);
  assert.match(source, /pancakeSyncDetail/);
  assert.match(source, /Pancake order ID/);
  assert.match(source, /Last synced/);
  assert.match(source, /Last sync error/);
  assert.match(source, /Product mapping status/);
  assert.match(source, /Inventory sync status/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test apps/api/test/adminOrders.test.js apps/web/test/adminOrderDetailSource.test.js
```

Expected: web source test fails until UI is updated.

- [ ] **Step 3: Include sync detail in API response**

In `apps/api/src/routes/admin.js`, import `pancakeOrderSyncRepository` as in Task 7. In `router.get('/orders/:orderNumber')`, change response to:

```js
const pancakeSyncDetail = await pancakeOrderSyncRepository.getOrderSyncDetail(order.orderNumber);
return res.json({
  order: {
    ...order,
    pancakeSyncDetail,
    notifications: await listOrderNotifications(order.orderNumber)
  }
});
```

- [ ] **Step 4: Render UI panel**

In `apps/web/src/admin/OrderDetail.jsx`, derive:

```js
const pancakeSyncDetail = order.pancakeSyncDetail || {};
```

Add a `DetailCard` in the existing lower grid:

```jsx
<DetailCard title="Pancake POS sync details" className="xl:col-span-4">
  <dl>
    <InfoRow label="Pancake order ID" value={fallback(pancakeSyncDetail.pancakeOrderId, 'Not linked')} strong />
    <InfoRow label="Sync status" value={titleCase(pancakeSyncDetail.syncStatus || pancakeSyncLabel || 'not_linked')} />
    <InfoRow label="Last synced" value={pancakeSyncDetail.lastSyncedAt ? new Date(pancakeSyncDetail.lastSyncedAt).toLocaleString('en-PH') : 'Never'} />
    <InfoRow label="Last sync error" value={fallback(pancakeSyncDetail.safeErrorCode, 'No error')} />
    <InfoRow label="Product mapping status" value={pancakeSyncDetail.productMappingStatus || 'Uses verified SKU mapping'} />
    <InfoRow label="Inventory sync status" value={pancakeSyncDetail.inventorySyncStatus || 'Uses Pancake stock reconciliation'} />
  </dl>
  {Array.isArray(pancakeSyncDetail.recentLogs) && pancakeSyncDetail.recentLogs.length > 0 && (
    <div className="mt-3 space-y-2">
      {pancakeSyncDetail.recentLogs.slice(0, 3).map((log) => (
        <p key={log.id || log.createdAt} className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-2 text-xs text-[var(--admin-muted)]">
          {log.code || log.message || 'Sync log'} · {log.createdAt ? new Date(log.createdAt).toLocaleString('en-PH') : 'Date unavailable'}
        </p>
      ))}
    </div>
  )}
</DetailCard>
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test apps/api/test/adminOrders.test.js apps/web/test/adminOrderDetailSource.test.js
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin.js apps/api/test/adminOrders.test.js apps/web/src/admin/OrderDetail.jsx apps/web/test/adminOrderDetailSource.test.js
git commit -m "feat: show Pancake sync state on orders"
```

---

### Task 9: Pancake Admin Status Endpoint

**Files:**
- Modify: `apps/api/src/routes/adminPancake.js`
- Test: `apps/api/test/adminPancake.test.js`

- [ ] **Step 1: Add failing route test**

Add to `apps/api/test/adminPancake.test.js`:

```js
test('Pancake admin status includes bidirectional sync summary', async () => {
  const syncRepository = {
    getOrderSyncSummary: async () => ({
      pendingCount: 1,
      failedCount: 2,
      blockedCount: 3,
      linkedCount: 4
    })
  };
  assert.deepEqual(await syncRepository.getOrderSyncSummary(), {
    pendingCount: 1,
    failedCount: 2,
    blockedCount: 3,
    linkedCount: 4
  });
});
```

- [ ] **Step 2: Implement summary repository method**

Add to `pancakeOrderSyncRepository.js`:

```js
async function getOrderSyncSummary() {
  if (!hasDatabaseUrl()) {
    return {
      pendingCount: memory.events.filter((event) => event.status === 'pending').length,
      failedCount: memory.events.filter((event) => event.status === 'failed_retryable').length,
      blockedCount: memory.events.filter((event) => event.status === 'blocked').length,
      linkedCount: memory.links.length
    };
  }
  const events = await query(
    `SELECT status,count(*)::integer AS count FROM pancake_sync_events GROUP BY status`
  );
  const links = await query('SELECT count(*)::integer AS count FROM pancake_order_links');
  const count = (status) => events.rows.find((row) => row.status === status)?.count || 0;
  return {
    pendingCount: count('pending'),
    failedCount: count('failed_retryable'),
    blockedCount: count('blocked'),
    linkedCount: links.rows[0]?.count || 0
  };
}
```

Export it.

- [ ] **Step 3: Include summary in admin Pancake status route**

In `apps/api/src/routes/adminPancake.js`, inject `orderSyncRepository` defaulting to `pancakeOrderSyncRepository`. In `/status`, include:

```js
const orderSync = await orderSyncRepository.getOrderSyncSummary();
return res.json({ pancake: { ...pancake, orderSync } });
```

- [ ] **Step 4: Run tests**

Run:

```bash
node --test apps/api/test/adminPancake.test.js apps/api/test/pancakeOrderSyncRepository.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/adminPancake.js apps/api/src/integrations/pancake/pancakeOrderSyncRepository.js apps/api/test/adminPancake.test.js
git commit -m "feat: expose Pancake bidirectional sync summary"
```

---

### Task 10: Full Verification and Docker Rebuild

**Files:**
- No new files.

- [ ] **Step 1: Run focused API tests**

Run:

```bash
node --test apps/api/test/pancakeBidirectionalSyncMigration.test.js apps/api/test/pancakeConfig.test.js apps/api/test/pancakeOrderSyncRepository.test.js apps/api/test/pancakeOrderMapper.test.js apps/api/test/pancakeClient.test.js apps/api/test/pancakeOrderSyncService.test.js apps/api/test/pancakeAutoSyncWorker.test.js apps/api/test/adminOrders.test.js apps/api/test/adminPancake.test.js
```

Expected: all pass.

- [ ] **Step 2: Run full API tests**

Run:

```bash
npm test
```

Expected: all pass.

- [ ] **Step 3: Run web source tests**

Run:

```bash
node --test apps/web/test/*.test.js
```

Expected: all pass.

- [ ] **Step 4: Build web**

Run:

```bash
npm run build:web
```

Expected: Vite build succeeds.

- [ ] **Step 5: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 6: Rebuild and restart Docker**

Run:

```bash
docker compose build
docker compose up -d
docker compose ps
```

Expected: `postgres`, `api`, and `web` are running; Postgres is healthy.

- [ ] **Step 7: Commit final verification notes if docs changed**

If no docs changed in this task, skip commit. If adding rollout notes, commit:

```bash
git add docs
git commit -m "docs: add Pancake sync rollout notes"
```

---

## Spec Coverage Self-Review

- Website order to Pancake: existing export path plus Task 1/2/5/6 maintain durable link/event state and retry.
- Pancake order to website/admin: Task 3/5/6 implement polling, normalization, import, update, and duplicate protection.
- Status auto sync: Task 3 maps statuses; Task 5 processes inbound/outbound; Task 7 enqueues admin changes.
- Inventory auto sync: existing Pancake inventory reconciliation remains in worker; Task 6 preserves it in the cycle.
- Product matching: existing verified mapping stays the source; Task 3 never matches by name only.
- Automatic sync method: Task 6 integrates polling into backend worker; no manual button required.
- Duplicate prevention: Task 1 unique constraints and Task 2 event deduplication.
- Sync logs: Task 1/2 add logs; Task 8 displays recent logs.
- Error handling/retry: Task 2 retry fields and Task 5 retryable outbound handling.
- Admin details: Task 8 renders Pancake order ID, sync status, last sync, error, mapping, and inventory status.
- Customer/delivery/payment/shipping: Task 3 normalizes/builds fields and Task 5 syncs them.
- Env vars: Task 1 documents new config.
- Testing: Tasks 1-10 define automated and final verification commands.
