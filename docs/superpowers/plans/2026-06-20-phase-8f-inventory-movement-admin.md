# Phase 8F Inventory Movement Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a responsive Grafana-style native inventory operations dashboard with range-based charts, server-side filters, summaries, pagination, relation links, and filtered CSV export.

**Architecture:** Extend the existing dual JSON/Postgres inventory movement repository with a normalized query contract, daily time-series buckets, and reason aggregates. Expose authenticated list and export endpoints through the existing admin router, then build a Tailwind v4 dashboard with dependency-free SVG panels, a desktop ledger table, and mobile movement cards.

**Tech Stack:** Node.js, Express, PostgreSQL, JSON-file persistence, React 18, React Router 6, Tailwind CSS v4, Node test runner.

**Git constraint:** Do not stage, commit, or push. The user will manage Git.

---

## File Map

- Modify `apps/api/src/inventory/inventoryMovementRepository.js`: normalize query options and provide filtered records, summaries, daily series, reason breakdown, pagination, and export rows for both persistence modes.
- Modify `apps/api/src/routes/admin.js`: validate admin request parameters and expose list and CSV export endpoints.
- Create `apps/api/test/adminInventoryMovements.test.js`: cover authentication, filtering, range presets, chart aggregates, pagination, validation, and CSV output.
- Create `apps/web/src/admin/InventoryMovements.jsx`: render the responsive operations dashboard, native SVG charts, movement ledger, and list/export requests.
- Modify `apps/web/src/App.jsx`: register `/admin/inventory/movements` before the inventory overview route.
- Modify `apps/web/src/admin/AdminLayout.jsx`: add the movement history item to the Products submenu and active-route logic.
- Create `apps/web/test/phase8fInventoryMovementsSource.test.js`: cover route, navigation, filters, responsive structures, links, and export filter reuse.
- Modify `docs/enhancementdata2.md`: record Phase 8F completion and update the next-work recommendations.

### Task 1: Repository Query Contract

**Files:**
- Modify: `apps/api/src/inventory/inventoryMovementRepository.js`
- Test: `apps/api/test/adminInventoryMovements.test.js`

- [ ] **Step 1: Create the API test fixture and write a failing repository query test**

Create `apps/api/test/adminInventoryMovements.test.js` with isolated movement storage and deterministic records:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function withMovementStore(run) {
  const previous = process.env.INVENTORY_MOVEMENTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcc-admin-movements-'));
  process.env.INVENTORY_MOVEMENTS_DATA_FILE = path.join(tempDir, 'movements.json');
  delete require.cache[require.resolve('../src/inventory/inventoryMovementRepository')];
  const repository = require('../src/inventory/inventoryMovementRepository');
  try {
    await repository.appendInventoryMovements([
      { id: 'm1', productName: 'Freedom Tee', productSlug: 'freedom-tee', sku: 'FT-BLK-M', size: 'm', reason: 'order_created', source: 'order', orderNumber: 'MCC-1001', quantityChange: -2, createdAt: '2026-06-18T10:00:00.000Z' },
      { id: 'm2', productName: 'Freedom Tee', productSlug: 'freedom-tee', sku: 'FT-BLK-M', size: 'm', reason: 'order_cancelled', source: 'order', orderNumber: 'MCC-1001', quantityChange: 2, createdAt: '2026-06-19T10:00:00.000Z' },
      { id: 'm3', productName: 'Logo Shirt', productSlug: 'logo-shirt', sku: 'LS-WHT-L', size: 'l', reason: 'admin_stock_correction', source: 'admin', orderNumber: '', quantityChange: 5, createdAt: '2026-06-20T10:00:00.000Z' }
    ]);
    await run(repository);
  } finally {
    if (previous === undefined) delete process.env.INVENTORY_MOVEMENTS_DATA_FILE;
    else process.env.INVENTORY_MOVEMENTS_DATA_FILE = previous;
    delete require.cache[require.resolve('../src/inventory/inventoryMovementRepository')];
  }
}

test('queryInventoryMovements filters, summarizes, sorts, and paginates before slicing', async () => {
  await withMovementStore(async ({ queryInventoryMovements }) => {
    const result = await queryInventoryMovements({
      q: 'freedom',
      dateFrom: '2026-06-18',
      dateTo: '2026-06-19',
      sort: 'oldest',
      page: 2,
      pageSize: 1
    });

    assert.deepEqual(result.summary, {
      totalMovements: 2,
      stockAdded: 2,
      stockRemoved: 2,
      netChange: 0
    });
    assert.deepEqual(result.pagination, {
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2
    });
    assert.equal(result.movements[0].id, 'm2');
  });
});
```

- [ ] **Step 2: Run the repository test and verify the expected failure**

Run:

```bash
node --test apps/api/test/adminInventoryMovements.test.js
```

Expected: FAIL because `queryInventoryMovements` is not exported.

- [ ] **Step 3: Add normalized query helpers and JSON-file query behavior**

In `apps/api/src/inventory/inventoryMovementRepository.js`, add these constants and pure helpers:

```js
const VALID_REASONS = new Set(['order_created', 'order_cancelled', 'admin_stock_correction']);
const VALID_SORTS = new Set(['newest', 'oldest']);

function normalizeInventoryMovementQuery(filters = {}, { paginate = true } = {}) {
  const reason = String(filters.reason || '').trim();
  const sort = String(filters.sort || 'newest').trim();
  const page = Number(filters.page || 1);
  const pageSize = Number(filters.pageSize || 25);

  if (reason && !VALID_REASONS.has(reason)) throw validationError('Inventory movement reason is invalid');
  if (!VALID_SORTS.has(sort)) throw validationError('Inventory movement sort is invalid');
  if (paginate && (!Number.isInteger(page) || page < 1)) throw validationError('Inventory movement page is invalid');
  if (paginate && (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)) throw validationError('Inventory movement page size is invalid');

  const dateFrom = normalizeDateBoundary(filters.dateFrom, false);
  const dateTo = normalizeDateBoundary(filters.dateTo, true);
  if (dateFrom && dateTo && dateFrom > dateTo) throw validationError('Inventory movement date range is invalid');

  return {
    q: String(filters.q || '').trim().toLowerCase(),
    reason,
    dateFrom,
    dateTo,
    sort,
    page: paginate ? page : 1,
    pageSize: paginate ? pageSize : 0
  };
}

function normalizeDateBoundary(value, endOfDay) {
  if (!value) return '';
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw validationError('Inventory movement date is invalid');
  const iso = `${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw validationError('Inventory movement date is invalid');
  }
  return iso;
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function movementSearchText(movement) {
  return [movement.productName, movement.productSlug, movement.sku, movement.orderNumber]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
}

function summarizeMovements(movements) {
  return movements.reduce((summary, movement) => {
    const change = Number(movement.quantityChange || 0);
    summary.totalMovements += 1;
    if (change > 0) summary.stockAdded += change;
    if (change < 0) summary.stockRemoved += Math.abs(change);
    summary.netChange += change;
    return summary;
  }, { totalMovements: 0, stockAdded: 0, stockRemoved: 0, netChange: 0 });
}
```

Add `queryInventoryMovements` and preserve `listInventoryMovements` for existing callers:

```js
async function queryInventoryMovements(filters = {}, options = {}) {
  const normalized = normalizeInventoryMovementQuery(filters, options);
  if (usePostgresMovements()) return queryPostgresMovements(normalized, options);

  const store = await readMovementStore();
  const filtered = store.movements
    .filter((movement) => !normalized.q || movementSearchText(movement).includes(normalized.q))
    .filter((movement) => !normalized.reason || movement.reason === normalized.reason)
    .filter((movement) => !normalized.dateFrom || String(movement.createdAt || '') >= normalized.dateFrom)
    .filter((movement) => !normalized.dateTo || String(movement.createdAt || '') <= normalized.dateTo)
    .sort((a, b) => normalized.sort === 'oldest'
      ? String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      : String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const summary = summarizeMovements(filtered);
  const totalItems = filtered.length;
  const movements = options.paginate === false
    ? filtered
    : filtered.slice((normalized.page - 1) * normalized.pageSize, normalized.page * normalized.pageSize);

  return {
    movements,
    summary,
    pagination: {
      page: normalized.page,
      pageSize: normalized.pageSize,
      totalItems,
      totalPages: normalized.pageSize ? Math.ceil(totalItems / normalized.pageSize) : 0
    }
  };
}
```

Export `queryInventoryMovements` and `normalizeInventoryMovementQuery`. Keep the current exact-match behavior of `listInventoryMovements` so order-creation tests do not change.

- [ ] **Step 4: Add parameterized Postgres filtering, count, and aggregate queries**

Implement `queryPostgresMovements` using a shared condition builder. Use `ILIKE` for `q`, exact equality for `reason`, timestamp comparisons for dates, and an allowlisted `ASC` or `DESC` literal. Execute:

```sql
SELECT * FROM inventory_movements
WHERE (...parameterized conditions...)
ORDER BY created_at DESC, id DESC
LIMIT $n OFFSET $n_plus_1
```

```sql
SELECT
  COUNT(*)::integer AS total_movements,
  COALESCE(SUM(CASE WHEN quantity_change > 0 THEN quantity_change ELSE 0 END), 0)::integer AS stock_added,
  COALESCE(SUM(CASE WHEN quantity_change < 0 THEN ABS(quantity_change) ELSE 0 END), 0)::integer AS stock_removed,
  COALESCE(SUM(quantity_change), 0)::integer AS net_change
FROM inventory_movements
WHERE (...same parameterized conditions...)
```

The aggregate count is also `pagination.totalItems`. When `{ paginate: false }` is passed, omit `LIMIT` and `OFFSET`.

- [ ] **Step 5: Run focused repository tests**

Run:

```bash
node --test apps/api/test/adminInventoryMovements.test.js apps/api/test/inventoryMovements.test.js
```

Expected: PASS, including the existing order-deduction regressions.

### Task 1B: Range Presets And Chart Aggregates

**Files:**
- Modify: `apps/api/src/inventory/inventoryMovementRepository.js`
- Modify: `apps/api/test/adminInventoryMovements.test.js`

- [ ] **Step 1: Write failing tests for range normalization and chart aggregates**

Add deterministic tests using `{ now: new Date('2026-06-20T12:00:00.000Z') }` in the repository query options:

```js
test('defaults to 30 UTC days and zero-fills daily chart buckets', async () => {
  await withMovementStore(async ({ queryInventoryMovements }) => {
    const result = await queryInventoryMovements({}, {
      now: new Date('2026-06-20T12:00:00.000Z')
    });

    assert.equal(result.dailySeries.length, 30);
    assert.equal(result.dailySeries[0].date, '2026-05-22');
    assert.equal(result.dailySeries.at(-1).date, '2026-06-20');
    assert.deepEqual(result.dailySeries.find((day) => day.date === '2026-06-18'), {
      date: '2026-06-18', stockAdded: 0, stockRemoved: 2, netChange: -2
    });
  });
});

test('supports range presets and returns stable reason breakdown', async () => {
  await withMovementStore(async ({ queryInventoryMovements }) => {
    const result = await queryInventoryMovements({ range: '7d' }, {
      now: new Date('2026-06-20T12:00:00.000Z')
    });
    assert.equal(result.dailySeries.length, 7);
    assert.deepEqual(result.reasonBreakdown.map((item) => item.reason), [
      'order_created', 'order_cancelled', 'admin_stock_correction'
    ]);
    assert.deepEqual(result.reasonBreakdown[0], {
      reason: 'order_created', movementCount: 1, quantityMagnitude: 2
    });
  });
});
```

Add table-driven rejection tests for an unsupported range and custom input containing only one date. Add a test proving explicit paired dates take precedence over `range`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test apps/api/test/adminInventoryMovements.test.js
```

Expected: FAIL because the current result has no `dailySeries` or `reasonBreakdown`, no range validation, and no default 30-day boundary.

- [ ] **Step 3: Normalize preset and custom ranges**

Add constants and helpers:

```js
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const REASON_ORDER = ['order_created', 'order_cancelled', 'admin_stock_correction'];

function resolveMovementDateRange(filters, now = new Date()) {
  const rawFrom = String(filters.dateFrom || '').trim();
  const rawTo = String(filters.dateTo || '').trim();
  const range = String(filters.range || '30d').trim();
  if (Boolean(rawFrom) !== Boolean(rawTo)) {
    throw validationError('Inventory movement custom range requires both dates');
  }
  if (rawFrom && rawTo) {
    return {
      range: 'custom',
      dateFrom: normalizeDateBoundary(rawFrom, false),
      dateTo: normalizeDateBoundary(rawTo, true)
    };
  }
  if (!RANGE_DAYS[range]) throw validationError('Inventory movement range is invalid');
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (RANGE_DAYS[range] - 1));
  return {
    range,
    dateFrom: `${start.toISOString().slice(0, 10)}T00:00:00.000Z`,
    dateTo: `${end.toISOString().slice(0, 10)}T23:59:59.999Z`
  };
}
```

Call this helper from `normalizeInventoryMovementQuery(filters, options)` using `options.now`, include `range` in the normalized object, and retain the reversed-range validation for explicit dates.

- [ ] **Step 4: Add shared zero-fill and reason-fill helpers**

```js
function buildDailySeries(movements, dateFrom, dateTo) {
  const byDate = new Map();
  for (const movement of movements) {
    const date = String(movement.createdAt || '').slice(0, 10);
    const row = byDate.get(date) || { date, stockAdded: 0, stockRemoved: 0, netChange: 0 };
    const change = Number(movement.quantityChange || 0);
    if (change > 0) row.stockAdded += change;
    if (change < 0) row.stockRemoved += Math.abs(change);
    row.netChange += change;
    byDate.set(date, row);
  }
  const rows = [];
  const cursor = new Date(dateFrom);
  const endDate = dateTo.slice(0, 10);
  while (cursor.toISOString().slice(0, 10) <= endDate) {
    const date = cursor.toISOString().slice(0, 10);
    rows.push(byDate.get(date) || { date, stockAdded: 0, stockRemoved: 0, netChange: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

function buildReasonBreakdown(movements) {
  return REASON_ORDER.map((reason) => {
    const matching = movements.filter((movement) => movement.reason === reason);
    return {
      reason,
      movementCount: matching.length,
      quantityMagnitude: matching.reduce((sum, movement) => sum + Math.abs(Number(movement.quantityChange || 0)), 0)
    };
  });
}
```

Use these helpers after filtering in JSON mode. For Postgres, add parameterized `DATE(created_at AT TIME ZONE 'UTC')` and `reason` aggregate queries with the same conditions, then pass returned aggregate rows through zero-fill helpers so both persistence modes have identical response shapes. Do not interpolate user values or range lengths into SQL.

- [ ] **Step 5: Return chart aggregates before pagination**

Every paginated query result must include:

```js
return {
  movements,
  summary,
  dailySeries,
  reasonBreakdown,
  pagination
};
```

When `{ paginate: false }` is used for CSV export, retain filters and ordering; chart fields may remain in the repository result but are ignored by the route.

- [ ] **Step 6: Run repository and legacy movement tests**

Run:

```bash
node --test apps/api/test/adminInventoryMovements.test.js apps/api/test/inventoryMovements.test.js
```

Expected: PASS.

### Task 2: Authenticated List And CSV Export API

**Files:**
- Modify: `apps/api/src/routes/admin.js`
- Test: `apps/api/test/adminInventoryMovements.test.js`

- [ ] **Step 1: Add failing endpoint tests**

Extend the test file with an app server helper and tests that assert:

```js
test('admin inventory movements require authentication', async () => {
  await withAdminServer(async ({ port }) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/inventory-movements`);
    assert.equal(response.status, 401);
  });
});

test('admin inventory movements return filtered summaries and pagination', async () => {
  await withAdminServer(async ({ port, token }) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/admin/inventory-movements?q=FT-BLK&reason=order_created&page=1&pageSize=25`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.movements.length, 1);
    assert.equal(body.summary.stockRemoved, 2);
    assert.equal(body.pagination.totalItems, 1);
    assert.equal(body.dailySeries.length, 30);
    assert.equal(body.reasonBreakdown.length, 3);
  });
});

test('inventory movement CSV exports every filtered row with escaped values', async () => {
  await withAdminServer(async ({ port, token }) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/inventory-movements/export`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'Freedom', sort: 'oldest' })
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/);
    assert.match(response.headers.get('content-disposition'), /inventory-movements-2026-/);
    const csv = await response.text();
    assert.match(csv, /^Date,Product,Product Slug,SKU,Size,Reason,Source,Order Number,Quantity Change/m);
    assert.match(csv, /Freedom Tee/);
  });
});
```

The server helper must isolate `INVENTORY_MOVEMENTS_DATA_FILE`, clear the app/admin/repository module caches, use the configured test admin token, and restore all environment variables in `finally`.

Use this concrete helper in the test file:

```js
async function withAdminServer(run) {
  const previous = {
    movements: process.env.INVENTORY_MOVEMENTS_DATA_FILE,
    credentials: process.env.ADMIN_CREDENTIALS_FILE,
    token: process.env.ADMIN_TOKEN
  };
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcc-admin-movement-api-'));
  process.env.INVENTORY_MOVEMENTS_DATA_FILE = path.join(tempDir, 'movements.json');
  process.env.ADMIN_CREDENTIALS_FILE = path.join(tempDir, 'admin-credentials.json');
  process.env.ADMIN_TOKEN = 'inventory-admin-token';
  [
    '../src/app',
    '../src/routes/admin',
    '../src/settings/storeSettingsRepository',
    '../src/inventory/inventoryMovementRepository'
  ].forEach((modulePath) => {
    delete require.cache[require.resolve(modulePath)];
  });
  const repository = require('../src/inventory/inventoryMovementRepository');
  await repository.appendInventoryMovements([
    { id: 'm1', productName: 'Freedom Tee', productSlug: 'freedom-tee', sku: 'FT-BLK-M', size: 'm', reason: 'order_created', source: 'order', orderNumber: 'MCC-1001', quantityChange: -2, createdAt: '2026-06-18T10:00:00.000Z' },
    { id: 'm2', productName: 'Freedom Tee', productSlug: 'freedom-tee', sku: 'FT-BLK-M', size: 'm', reason: 'order_cancelled', source: 'order', orderNumber: 'MCC-1001', quantityChange: 2, createdAt: '2026-06-19T10:00:00.000Z' }
  ]);
  const app = require('../src/app').createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run({ port: server.address().port, token: 'inventory-admin-token' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv('INVENTORY_MOVEMENTS_DATA_FILE', previous.movements);
    restoreEnv('ADMIN_CREDENTIALS_FILE', previous.credentials);
    restoreEnv('ADMIN_TOKEN', previous.token);
  }
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
```

- [ ] **Step 2: Run endpoint tests and verify failure**

Run:

```bash
node --test apps/api/test/adminInventoryMovements.test.js
```

Expected: FAIL with `404` for the new endpoints.

- [ ] **Step 3: Add the authenticated list endpoint before parameterized inventory routes**

Update the repository import in `apps/api/src/routes/admin.js`:

```js
const {
  appendInventoryMovements,
  queryInventoryMovements
} = require('../inventory/inventoryMovementRepository');
```

Add the route after `router.get('/session', ...)`:

```js
router.get('/inventory-movements', async (req, res, next) => {
  try {
    return res.json(await queryInventoryMovements({
      q: req.query.q,
      reason: req.query.reason,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      range: req.query.range,
      sort: req.query.sort,
      page: req.query.page,
      pageSize: req.query.pageSize
    }));
  } catch (error) {
    return next(error);
  }
});
```

- [ ] **Step 4: Add CSV serialization and the export endpoint**

Add focused helpers near the other route helpers:

```js
const INVENTORY_MOVEMENT_CSV_COLUMNS = [
  ['Date', 'createdAt'],
  ['Product', 'productName'],
  ['Product Slug', 'productSlug'],
  ['SKU', 'sku'],
  ['Size', 'size'],
  ['Reason', 'reason'],
  ['Source', 'source'],
  ['Order Number', 'orderNumber'],
  ['Quantity Change', 'quantityChange']
];

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function inventoryMovementsCsv(movements) {
  return [
    INVENTORY_MOVEMENT_CSV_COLUMNS.map(([label]) => label).join(','),
    ...movements.map((movement) => INVENTORY_MOVEMENT_CSV_COLUMNS
      .map(([, key]) => csvCell(movement[key]))
      .join(','))
  ].join('\n');
}
```

Add the endpoint:

```js
router.post('/inventory-movements/export', async (req, res, next) => {
  try {
    const result = await queryInventoryMovements({
      q: req.body?.q,
      reason: req.body?.reason,
      dateFrom: req.body?.dateFrom,
      dateTo: req.body?.dateTo,
      range: req.body?.range,
      sort: req.body?.sort
    }, { paginate: false });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="inventory-movements-${date}.csv"`);
    return res.send(inventoryMovementsCsv(result.movements));
  } catch (error) {
    return next(error);
  }
});
```

- [ ] **Step 5: Add invalid-query assertions**

Test `400` responses for `reason=unknown`, `range=365d`, `sort=sideways`, `page=0`, `pageSize=101`, malformed dates, a custom range missing one boundary, and `dateFrom` after `dateTo`. Assert the JSON body contains the corresponding repository validation message.

- [ ] **Step 6: Run API tests**

Run:

```bash
node --test apps/api/test/adminInventoryMovements.test.js apps/api/test/inventoryMovements.test.js apps/api/test/adminOrders.test.js apps/api/test/adminProducts.test.js
```

Expected: PASS.

### Task 3: Responsive Grafana-Style Operations Dashboard

**Files:**
- Create: `apps/web/src/admin/InventoryMovements.jsx`
- Create: `apps/web/test/phase8fInventoryMovementsSource.test.js`

- [ ] **Step 1: Write a failing source regression test**

Create the source test:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('inventory operations dashboard charts, filters, paginates, exports, and renders responsive records', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'InventoryMovements.jsx'), 'utf8');

  assert.match(source, /\/api\/admin\/inventory-movements/);
  assert.match(source, /\/api\/admin\/inventory-movements\/export/);
  assert.match(source, /Total movements/);
  assert.match(source, /Stock added/);
  assert.match(source, /Stock removed/);
  assert.match(source, /Net change/);
  assert.match(source, /MovementTrendChart/);
  assert.match(source, /ReasonDonutChart/);
  assert.match(source, /dailySeries/);
  assert.match(source, /reasonBreakdown/);
  assert.match(source, /RANGE_OPTIONS/);
  assert.match(source, /7 days/);
  assert.match(source, /30 days/);
  assert.match(source, /90 days/);
  assert.match(source, /Custom range/);
  assert.match(source, /No movement data/);
  assert.match(source, /<svg/);
  assert.match(source, /Search product, SKU, or order/);
  assert.match(source, /dateFrom/);
  assert.match(source, /dateTo/);
  assert.match(source, /REASON_OPTIONS/);
  assert.match(source, /hidden sm:block/);
  assert.match(source, /sm:hidden/);
  assert.match(source, /encodeURIComponent\(movement\.productSlug\)/);
  assert.match(source, /encodeURIComponent\(movement\.orderNumber\)/);
  assert.match(source, /pageSize/);
  assert.match(source, /Export CSV/);
  assert.match(source, /No inventory movements match/);
});
```

- [ ] **Step 2: Run the source test and verify failure**

Run:

```bash
node --test apps/web/test/phase8fInventoryMovementsSource.test.js
```

Expected: FAIL with `ENOENT` for `InventoryMovements.jsx`.

- [ ] **Step 3: Create state, filter, and API-loading behavior**

Create `InventoryMovements.jsx` using `useCallback`, `useEffect`, and `useState`. Define:

```js
const REASON_OPTIONS = [
  ['', 'All reasons'],
  ['order_created', 'Order created'],
  ['order_cancelled', 'Order cancelled'],
  ['admin_stock_correction', 'Admin stock correction']
];
const SORT_OPTIONS = [['newest', 'Newest first'], ['oldest', 'Oldest first']];
const RANGE_OPTIONS = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['custom', 'Custom range']];
const PAGE_SIZE = 25;

function activeFilters({ query, reason, range, dateFrom, dateTo, sort }) {
  return range === 'custom'
    ? { q: query.trim(), reason, dateFrom, dateTo, sort }
    : { q: query.trim(), reason, range, sort };
}
```

Track `movements`, `summary`, `dailySeries`, `reasonBreakdown`, `pagination`, `query`, `reason`, `range` (default `30d`), `dateFrom`, `dateTo`, `sort`, `page`, `loading`, `exporting`, and `message`. Build URL parameters from non-empty filters plus `page` and `pageSize`, fetch with `adminJson`, and reset `page` to `1` in every filter change handler. Only submit custom dates when `range === 'custom'` and require both dates before loading.

Export with the same `activeFilters` helper:

```js
await adminDownload(
  '/api/admin/inventory-movements/export',
  activeFilters({ query, reason, range, dateFrom, dateTo, sort }),
  `inventory-movements-${new Date().toISOString().slice(0, 10)}.csv`
);
```

- [ ] **Step 4: Build the approved Tailwind monitoring panels and filters**

Use the existing theme tokens, not new hard-coded colors. The structure must use:

```jsx
<div className="mx-auto w-full max-w-[1500px]">
  <div className="flex flex-wrap items-end justify-between gap-4">...</div>
  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">...</div>
  <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">...</div>
  <div className="mt-6 grid gap-3 border border-line bg-paper p-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_repeat(3,minmax(150px,auto))]">...</div>
</div>
```

Summary values display signed changes clearly. Monitoring panels use dark neutral Tailwind classes inside the existing light admin shell, visible legends, and text totals. Disable export while `exporting` is true. Give every input an explicit label or `aria-label`.

- [ ] **Step 5: Add dependency-free responsive SVG charts**

Define `MovementTrendChart({ dailySeries })` and `ReasonDonutChart({ reasonBreakdown })` in `InventoryMovements.jsx`. The trend chart maps daily values into a responsive SVG `viewBox`, draws separate orange and green polylines, and exposes a visible legend and first/last date labels. The donut chart uses SVG circle segments with `strokeDasharray` and `strokeDashoffset`, plus a text legend showing each reason count. Use movement count for donut proportions. Both components return the text `No movement data` when every series value or reason count is zero. Add `aria-label` and `<title>` elements so the charts do not communicate only through color.

- [ ] **Step 6: Build the desktop table and mobile cards**

Render the table in `hidden sm:block` and the cards in `sm:hidden`. Both presentations must show date, product, SKU/size, reason, source, order, and signed change.

Use encoded admin links:

```jsx
<Link to={`/admin/products/${encodeURIComponent(movement.productSlug)}`}>{movement.productName}</Link>
<Link to={`/admin/orders/${encodeURIComponent(movement.orderNumber)}`}>#{movement.orderNumber}</Link>
```

Only render a link when its identifier exists. Use `text-emerald-700` for positive changes and `text-accent-deep` for negative changes, while retaining the `+` or `-` sign in text.

- [ ] **Step 7: Add pagination, loading, error, and empty states**

Render previous/next controls using `pagination.page` and `pagination.totalPages`. Disable boundaries and loading transitions. Show `No inventory movements match the current filters.` when loading is false and the result is empty. Keep current records visible if an export fails.

- [ ] **Step 8: Run the source test and production build**

Run:

```bash
node --test apps/web/test/phase8fInventoryMovementsSource.test.js
npm run build:web
```

Expected: source test PASS and Vite production build succeeds.

### Task 4: Route And Navigation Integration

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/admin/AdminLayout.jsx`
- Modify: `apps/web/test/phase8fInventoryMovementsSource.test.js`
- Modify: `apps/web/test/adminNavigationSource.test.js`

- [ ] **Step 1: Add failing route and navigation assertions**

Extend the Phase 8F test to read `App.jsx` and `AdminLayout.jsx` and assert:

```js
assert.match(appSource, /import InventoryMovements from '.\/admin\/InventoryMovements\.jsx'/);
assert.match(appSource, /path="inventory\/movements" element=\{<InventoryMovements \/>\}/);
assert.match(layoutSource, /\/admin\/inventory\/movements/);
assert.match(layoutSource, /Movement history/);
```

Extend `adminNavigationSource.test.js` with the movement route and label assertions.

- [ ] **Step 2: Run navigation tests and verify failure**

Run:

```bash
node --test apps/web/test/phase8fInventoryMovementsSource.test.js apps/web/test/adminNavigationSource.test.js
```

Expected: FAIL because the route and submenu item are absent.

- [ ] **Step 3: Register the route**

In `apps/web/src/App.jsx`, import the page and register it next to inventory:

```jsx
import InventoryMovements from './admin/InventoryMovements.jsx';

<Route path="inventory" element={<Inventory />} />
<Route path="inventory/movements" element={<InventoryMovements />} />
```

- [ ] **Step 4: Add the Products submenu item and mobile access**

Update `PRODUCT_SUBNAV`:

```js
const PRODUCT_SUBNAV = [
  { to: '/admin/products', label: 'All products', end: true },
  { to: '/admin/collections', label: 'Collections' },
  { to: '/admin/inventory', label: 'Inventory', end: true },
  { to: '/admin/inventory/movements', label: 'Movement history' }
];
```

The existing `productsActive` prefix check already covers the new route. Add Inventory and Movement history to `MOBILE_NAV` so the destination is reachable without relying on the hidden desktop submenu.

- [ ] **Step 5: Run route, navigation, and build verification**

Run:

```bash
node --test apps/web/test/phase8fInventoryMovementsSource.test.js apps/web/test/adminNavigationSource.test.js
npm run build:web
```

Expected: all tests PASS and the production build succeeds.

### Task 5: Roadmap And Full Verification

**Files:**
- Modify: `docs/enhancementdata2.md`
- Test: all focused Phase 8F and affected regression tests

- [ ] **Step 1: Update the roadmap status and add Phase 8F**

Change the top status so it no longer stops at Phase 7A. Add a Phase 8F section after Phase 8E containing:

```markdown
### Phase 8F: Inventory Movement Admin

Status: Finished. Admin staff can now monitor stock flow and movement reasons, then search, filter, paginate, and export inventory movement history from a dedicated responsive operations dashboard, with consistent JSON-file and Postgres query behavior.

Deliverables:

- Add an authenticated inventory movement list and filtered CSV export. Finished.
- Show filtered summaries, daily movement trends, reason distribution, and pagination. Finished.
- Add 7-day, 30-day, 90-day, and custom range controls. Finished.
- Add responsive monitoring panels, desktop table, and mobile card presentations. Finished.
- Link movement records to related products and orders. Finished.
```

Remove the inventory movement admin screen from `Current Recommendations`. Keep real provider integration and promo analytics as the next recommendations.

- [ ] **Step 2: Run focused API and web tests**

Run:

```bash
node --test apps/api/test/adminInventoryMovements.test.js apps/api/test/inventoryMovements.test.js apps/api/test/adminOrders.test.js apps/api/test/adminProducts.test.js
node --test apps/web/test/phase8fInventoryMovementsSource.test.js apps/web/test/adminNavigationSource.test.js
```

Expected: all tests PASS.

- [ ] **Step 3: Run the broader regressions affected by movement recording and admin navigation**

Run:

```bash
node --test apps/api/test/promoFullFlow.test.js apps/api/test/adminJntExport.test.js apps/api/test/defaultDiscounts.test.js
node --test apps/web/test/phase8aOrderStatusHistorySource.test.js apps/web/test/adminProductsSource.test.js apps/web/test/phase7RoadmapSource.test.js
```

Expected: all tests PASS.

- [ ] **Step 4: Build and inspect the final diff**

Run:

```bash
npm run build:web
git diff --check
git status --short
```

Expected: Vite production build succeeds, `git diff --check` prints no errors, and Git status shows only the user's existing changes plus the Phase 8F files. Do not stage, commit, or push.
