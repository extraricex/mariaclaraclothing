const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const repositoryPath = '../src/inventory/inventoryMovementRepository';
const NOW = new Date('2026-06-20T12:00:00.000Z');
const ADMIN_TOKEN = 'inventory-admin-token';

const MOVEMENTS = [
  movement('movement-1', '2026-05-01T00:00:00.000Z', 'order_created', 'Summer Shirt', 'summer-shirt', 'SUM-S', 'MC-1001', -2),
  movement('movement-2', '2026-05-02T10:00:00.000Z', 'admin_stock_correction', 'Summer Shirt', 'summer-shirt', 'SUM-M', '', 8),
  movement('movement-3', '2026-05-02T10:00:00.000Z', 'order_cancelled', 'Summer Shirt', 'summer-shirt', 'SUM-L', 'MC-1002', 2),
  movement('movement-4', '2026-05-02T23:59:59.999Z', 'order_created', 'Winter Jacket', 'winter-jacket', 'WIN-M', 'MC-1003', -3),
  movement('movement-5', '2026-05-03T00:00:00.000Z', 'order_created', 'Summer Cap', 'summer-cap', 'CAP-1', 'MC-1004', -1)
];

const API_MOVEMENTS = [
  movement('api-1', '2026-06-14T08:00:00.000Z', 'order_created', 'Shirt, "Special"\nEdition', '=shirt-special', '@SHIRT-S', 'MC-2001', -1),
  movement('api-2', '2026-06-15T09:00:00.000Z', 'order_created', 'Basic Shirt', 'basic-shirt', 'SHIRT-M', '+MC-2002', -2),
  movement('api-3', '2026-06-16T10:00:00.000Z', 'order_created', 'Basic Shirt', 'basic-shirt', 'SHIRT-L', 'MC-2003', -3),
  movement('api-4', '2026-06-18T11:00:00.000Z', 'order_cancelled', 'Basic Shirt', 'basic-shirt', 'SHIRT-L', 'MC-2004', 3),
  movement('api-5', '2026-05-01T12:00:00.000Z', 'admin_stock_correction', 'Basic Shirt', 'basic-shirt', 'SHIRT-M', '', 5)
];

test('inventory movement list and export require admin authentication', async () => {
  await withAdminMovementApp(API_MOVEMENTS, async (port) => {
    const listResponse = await fetch(`http://127.0.0.1:${port}/api/admin/inventory-movements`);
    const exportResponse = await fetch(`http://127.0.0.1:${port}/api/admin/inventory-movements/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });

    assert.equal(listResponse.status, 401);
    assert.equal(exportResponse.status, 401);
  });
});

test('lists combined filtered movements with aggregate data and pagination', async () => {
  await withAdminMovementApp(API_MOVEMENTS, async (port) => {
    const response = await adminFetch(port, '/api/admin/inventory-movements?q=shirt&reason=order_created&range=90d&sort=oldest&page=2&pageSize=1');
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(result.movements.map(({ id }) => id), ['api-2']);
    assert.deepEqual(result.summary, { totalMovements: 3, stockAdded: 0, stockRemoved: 6, netChange: -6 });
    assert.equal(result.dailySeries.length, 90);
    assert.deepEqual(result.reasonBreakdown, [
      { reason: 'order_created', movementCount: 3, quantityMagnitude: 6 },
      { reason: 'order_cancelled', movementCount: 0, quantityMagnitude: 0 },
      { reason: 'admin_stock_correction', movementCount: 0, quantityMagnitude: 0 }
    ]);
    assert.deepEqual(result.pagination, { page: 2, pageSize: 1, totalItems: 3, totalPages: 3 });
  });
});

test('list accepts explicit paired dates and rejects invalid filters with repository messages', async () => {
  await withAdminMovementApp(API_MOVEMENTS, async (port) => {
    const datedResponse = await adminFetch(port, '/api/admin/inventory-movements?dateFrom=2026-06-15&dateTo=2026-06-16&sort=oldest');
    assert.equal(datedResponse.status, 200);
    assert.deepEqual((await datedResponse.json()).movements.map(({ id }) => id), ['api-2', 'api-3']);

    for (const [query, message] of [
      ['range=14d', /range/],
      ['reason=return', /reason/],
      ['dateFrom=2026-06-15', /dateFrom.*dateTo/],
      ['page=0', /page/]
    ]) {
      const response = await adminFetch(port, `/api/admin/inventory-movements?${query}`);
      const body = await response.json();
      assert.equal(response.status, 400, query);
      assert.match(body.error, message, query);
    }
  });
});

test('exports all date-filtered movements as safely escaped CSV independent of pagination fields', async () => {
  await withAdminMovementApp(API_MOVEMENTS, async (port) => {
    const response = await adminFetch(port, '/api/admin/inventory-movements/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'order_created',
        dateFrom: '2026-06-14',
        dateTo: '2026-06-16',
        sort: 'oldest',
        page: 2,
        pageSize: 1
      })
    });
    const csv = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/csv;\s*charset=utf-8$/i);
    assert.match(response.headers.get('content-disposition'), /^attachment; filename="inventory-movements-\d{4}-\d{2}-\d{2}\.csv"$/);
    assert.equal(csv.split('\n')[0], 'Date,Product,Product Slug,SKU,Size,Reason,Source,Order Number,Quantity Change');
    assert.match(csv, /"2026-06-14T08:00:00\.000Z","Shirt, ""Special""\nEdition","'=shirt-special","'@SHIRT-S","m","order_created","test","MC-2001","-1"/);
    assert.match(csv, /"2026-06-15T09:00:00\.000Z","Basic Shirt","basic-shirt","SHIRT-M","m","order_created","test","'\+MC-2002","-2"/);
    assert.match(csv, /"2026-06-16T10:00:00\.000Z"/);
    assert.doesNotMatch(csv, /2026-06-18T11:00:00\.000Z|2026-05-01T12:00:00\.000Z/);
  });
});

test('export accepts explicit paired dates and propagates invalid filter errors', async () => {
  await withAdminMovementApp(API_MOVEMENTS, async (port) => {
    const response = await adminFetch(port, '/api/admin/inventory-movements/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dateFrom: '2026-06-15', dateTo: '2026-06-16', sort: 'newest' })
    });
    const csv = await response.text();
    assert.equal(response.status, 200);
    assert.match(csv, /2026-06-15T09:00:00\.000Z/);
    assert.match(csv, /2026-06-16T10:00:00\.000Z/);
    assert.doesNotMatch(csv, /2026-06-14T08:00:00\.000Z/);

    const invalid = await adminFetch(port, '/api/admin/inventory-movements/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ range: '14d' })
    });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /range/);
  });
});

test('queries combined search, date, oldest sort and pagination with an unpaginated summary', async () => {
  await withMovementStore(MOVEMENTS, async ({ queryInventoryMovements }) => {
    const result = await queryInventoryMovements({
      q: 'SUMMER',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-02',
      sort: 'oldest',
      page: '2',
      pageSize: '2'
    });

    assert.deepEqual(result.movements.map(({ id }) => id), ['movement-3']);
    assert.deepEqual(result.summary, {
      totalMovements: 3,
      stockAdded: 10,
      stockRemoved: 2,
      netChange: 8
    });
    assert.deepEqual(result.pagination, { page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
  });
});

test('filters movements by each supported exact reason', async () => {
  await withMovementStore(MOVEMENTS, async ({ queryInventoryMovements }) => {
    const cases = [
      ['order_created', ['movement-5', 'movement-4', 'movement-1']],
      ['order_cancelled', ['movement-3']],
      ['admin_stock_correction', ['movement-2']]
    ];

    for (const [reason, expectedIds] of cases) {
      const result = await queryInventoryMovements({ reason, range: '90d' }, { now: NOW });
      assert.deepEqual(result.movements.map(({ id }) => id), expectedIds, reason);
    }
  });
});

test('searches each supported field independently and case-insensitively', async () => {
  const searchMovements = [
    movement('search-name', '2026-05-01T00:00:00.000Z', 'order_created', 'NameNeedle', 'slug-one', 'SKU-ONE', 'ORDER-ONE', -1),
    movement('search-slug', '2026-05-01T00:00:01.000Z', 'order_created', 'Product Two', 'SlugNeedle', 'SKU-TWO', 'ORDER-TWO', -1),
    movement('search-sku', '2026-05-01T00:00:02.000Z', 'order_created', 'Product Three', 'slug-three', 'SkuNeedle', 'ORDER-THREE', -1),
    movement('search-order', '2026-05-01T00:00:03.000Z', 'order_created', 'Product Four', 'slug-four', 'SKU-FOUR', 'OrderNeedle', -1)
  ];

  await withMovementStore(searchMovements, async ({ queryInventoryMovements }) => {
    const cases = [
      ['nameneed', 'search-name'],
      ['slugneed', 'search-slug'],
      ['skuneed', 'search-sku'],
      ['orderneed', 'search-order']
    ];

    for (const [q, expectedId] of cases) {
      const result = await queryInventoryMovements({ q, range: '90d' }, { now: NOW });
      assert.deepEqual(result.movements.map(({ id }) => id), [expectedId], q);
    }
  });
});

test('legacy listing keeps exact orderNumber and sku filters', async () => {
  await withMovementStore(MOVEMENTS, async ({ listInventoryMovements }) => {
    const exact = await listInventoryMovements({ orderNumber: 'MC-1002', sku: 'SUM-L' });
    const partial = await listInventoryMovements({ orderNumber: 'MC-100', sku: 'SUM' });

    assert.deepEqual(exact.map(({ id }) => id), ['movement-3']);
    assert.deepEqual(partial, []);
  });
});

test('uses id as a stable sort tie break in the requested direction', async () => {
  await withMovementStore(MOVEMENTS, async ({ queryInventoryMovements }) => {
    const newest = await queryInventoryMovements({ q: 'summer-shirt', dateFrom: '2026-05-02', dateTo: '2026-05-02' });
    const oldest = await queryInventoryMovements({ q: 'summer-shirt', dateFrom: '2026-05-02', dateTo: '2026-05-02', sort: 'oldest' });

    assert.deepEqual(newest.movements.map(({ id }) => id), ['movement-3', 'movement-2']);
    assert.deepEqual(oldest.movements.map(({ id }) => id), ['movement-2', 'movement-3']);
  });
});

test('paginate false returns every filtered row', async () => {
  await withMovementStore(MOVEMENTS, async ({ queryInventoryMovements }) => {
    const result = await queryInventoryMovements(
      { q: 'MC-', range: '90d', page: 2, pageSize: 1 },
      { paginate: false, now: NOW }
    );

    assert.deepEqual(result.movements.map(({ id }) => id), ['movement-5', 'movement-4', 'movement-3', 'movement-1']);
    assert.deepEqual(result.pagination, { page: 1, pageSize: 25, totalItems: 4, totalPages: 1 });
  });
});

test('normalizes defaults and UTC date boundaries', () => {
  const { normalizeInventoryMovementQuery } = require(repositoryPath);
  assert.deepEqual(normalizeInventoryMovementQuery({ dateFrom: '2024-02-29', dateTo: '2026-05-02' }), {
    q: '',
    reason: '',
    sort: 'newest',
    page: 1,
    pageSize: 25,
    range: 'custom',
    dateFrom: '2024-02-29T00:00:00.000Z',
    dateTo: '2026-05-02T23:59:59.999Z',
    paginate: true
  });

  const numeric = normalizeInventoryMovementQuery({ page: 2, pageSize: 50 }, { now: NOW });
  assert.equal(numeric.page, 2);
  assert.equal(numeric.pageSize, 50);
  assert.equal(numeric.range, '30d');
  assert.equal(numeric.dateFrom, '2026-05-22T00:00:00.000Z');
  assert.equal(numeric.dateTo, '2026-06-20T23:59:59.999Z');
});

test('normalizes 7d and 90d presets to inclusive UTC boundaries', () => {
  const { normalizeInventoryMovementQuery } = require(repositoryPath);
  const sevenDays = normalizeInventoryMovementQuery({ range: '7d' }, { now: NOW });
  const ninetyDays = normalizeInventoryMovementQuery({ range: '90d' }, { now: NOW });

  assert.deepEqual(
    [sevenDays.range, sevenDays.dateFrom, sevenDays.dateTo],
    ['7d', '2026-06-14T00:00:00.000Z', '2026-06-20T23:59:59.999Z']
  );
  assert.deepEqual(
    [ninetyDays.range, ninetyDays.dateFrom, ninetyDays.dateTo],
    ['90d', '2026-03-23T00:00:00.000Z', '2026-06-20T23:59:59.999Z']
  );
});

test('rejects invalid preset clocks with status 400', () => {
  const { normalizeInventoryMovementQuery } = require(repositoryPath);

  for (const now of [new Date('invalid'), '2026-06-20', null, {}]) {
    assert.throws(
      () => normalizeInventoryMovementQuery({}, { now }),
      (error) => error.status === 400 && /now.*valid Date/.test(error.message),
      String(now)
    );
  }
});

test('paired custom dates override a supplied preset', () => {
  const { normalizeInventoryMovementQuery } = require(repositoryPath);
  const normalized = normalizeInventoryMovementQuery({
    range: 'unsupported-but-overridden',
    dateFrom: '2026-05-01',
    dateTo: '2026-05-03'
  }, { now: NOW });

  assert.equal(normalized.range, 'custom');
  assert.equal(normalized.dateFrom, '2026-05-01T00:00:00.000Z');
  assert.equal(normalized.dateTo, '2026-05-03T23:59:59.999Z');
});

test('rejects invalid query values with status 400 and clear messages', () => {
  const { normalizeInventoryMovementQuery } = require(repositoryPath);
  const cases = [
    [{ reason: 'return' }, /reason/],
    [{ sort: 'ascending' }, /sort/],
    [{ range: '14d' }, /range.*7d.*30d.*90d/],
    [{ page: 0 }, /page/],
    [{ page: '0' }, /page/],
    [{ page: '1.5' }, /page/],
    [{ pageSize: 0 }, /pageSize/],
    [{ pageSize: '101' }, /pageSize/],
    [{ pageSize: 'zero' }, /pageSize/],
    [{ dateFrom: '05-01-2026' }, /dateFrom/],
    [{ dateFrom: '2026-02-30' }, /dateFrom/],
    [{ dateTo: '2025-13-01' }, /dateTo/],
    [{ dateFrom: '2026-05-02' }, /dateFrom.*dateTo/],
    [{ dateTo: '2026-05-02' }, /dateFrom.*dateTo/],
    [{ dateFrom: '2026-05-03', dateTo: '2026-05-02' }, /dateFrom.*dateTo/]
  ];

  for (const [filters, message] of cases) {
    assert.throws(
      () => normalizeInventoryMovementQuery(filters),
      (error) => error.status === 400 && message.test(error.message),
      JSON.stringify(filters)
    );
  }
});

test('returns zero-filled daily series and stable reason breakdown from all filtered rows', async () => {
  const chartMovements = [
    movement('chart-1', '2026-06-18T01:00:00.000Z', 'order_created', 'A', 'a', 'A', 'O-1', -3),
    movement('chart-2', '2026-06-18T23:00:00.000Z', 'admin_stock_correction', 'A', 'a', 'A', '', 8),
    movement('chart-3', '2026-06-20T12:00:00.000Z', 'order_created', 'A', 'a', 'A', 'O-2', -2)
  ];

  await withMovementStore(chartMovements, async ({ queryInventoryMovements }) => {
    const result = await queryInventoryMovements({ range: '7d', pageSize: 1 }, { now: NOW });

    assert.equal(result.dailySeries.length, 7);
    assert.deepEqual(result.dailySeries[0], { date: '2026-06-14', stockAdded: 0, stockRemoved: 0, netChange: 0 });
    assert.deepEqual(result.dailySeries[4], { date: '2026-06-18', stockAdded: 8, stockRemoved: 3, netChange: 5 });
    assert.deepEqual(result.dailySeries[6], { date: '2026-06-20', stockAdded: 0, stockRemoved: 2, netChange: -2 });
    assert.deepEqual(result.reasonBreakdown, [
      { reason: 'order_created', movementCount: 2, quantityMagnitude: 5 },
      { reason: 'order_cancelled', movementCount: 0, quantityMagnitude: 0 },
      { reason: 'admin_stock_correction', movementCount: 1, quantityMagnitude: 8 }
    ]);
    assert.equal(result.movements.length, 1);
    assert.deepEqual(result.summary, { totalMovements: 3, stockAdded: 8, stockRemoved: 5, netChange: 3 });
  });
});

test('default, 7d and 90d query results expose exact zero-filled date ranges', async () => {
  await withMovementStore([], async ({ queryInventoryMovements }) => {
    for (const [range, length, firstDate] of [
      [undefined, 30, '2026-05-22'],
      ['7d', 7, '2026-06-14'],
      ['90d', 90, '2026-03-23']
    ]) {
      const result = await queryInventoryMovements(range ? { range } : {}, { now: NOW });
      assert.equal(result.dailySeries.length, length);
      assert.equal(result.dailySeries[0].date, firstDate);
      assert.equal(result.dailySeries.at(-1).date, '2026-06-20');
    }
  });
});

test('rejects non-decimal string syntax for page and pageSize', () => {
  const { normalizeInventoryMovementQuery } = require(repositoryPath);
  const invalidValues = ['1e2', '0x10', '+2', '-2', '1.0', ' 2 ', '   '];

  for (const name of ['page', 'pageSize']) {
    for (const value of invalidValues) {
      assert.throws(
        () => normalizeInventoryMovementQuery({ [name]: value }),
        (error) => error.status === 400 && error.message.includes(name),
        `${name}=${JSON.stringify(value)}`
      );
    }
  }
});

test('builds parameterized Postgres queries with literal ILIKE escaping', () => {
  const {
    buildPostgresInventoryMovementQueries,
    normalizeInventoryMovementQuery
  } = require(repositoryPath);
  const normalized = normalizeInventoryMovementQuery({
    q: 'path\\to_100%',
    reason: 'admin_stock_correction',
    dateFrom: '2026-05-01',
    dateTo: '2026-05-02',
    sort: 'oldest',
    page: 3,
    pageSize: 10
  });
  const queries = buildPostgresInventoryMovementQueries(normalized);

  assert.deepEqual(queries.aggregate.values, [
    '%path\\\\to\\_100\\%%',
    'admin_stock_correction',
    '2026-05-01T00:00:00.000Z',
    '2026-05-02T23:59:59.999Z'
  ]);
  assert.match(queries.aggregate.text, /product_name ILIKE \$1 ESCAPE E'\\\\'/);
  assert.match(queries.aggregate.text, /product_slug ILIKE \$1 ESCAPE E'\\\\'/);
  assert.match(queries.aggregate.text, /sku ILIKE \$1 ESCAPE E'\\\\'/);
  assert.match(queries.aggregate.text, /order_number ILIKE \$1 ESCAPE E'\\\\'/);
  assert.match(queries.aggregate.text, /reason = \$2/);
  assert.match(queries.aggregate.text, /created_at >= \$3/);
  assert.match(queries.aggregate.text, /created_at <= \$4/);
  assert.match(queries.records.text, /ORDER BY created_at ASC, id ASC/);
  assert.match(queries.records.text, /LIMIT \$5 OFFSET \$6/);
  assert.deepEqual(queries.records.values, [...queries.aggregate.values, 10, 20]);
  assert.deepEqual(queries.daily.values, queries.aggregate.values);
  assert.match(queries.daily.text, /DATE_TRUNC\('day', created_at AT TIME ZONE 'UTC'\)/);
  assert.match(
    queries.daily.text,
    /COALESCE\s*\(\s*SUM\s*\(\s*CASE\s+WHEN\s+quantity_change\s*>\s*0\s+THEN\s+quantity_change\s+ELSE\s+0\s+END\s*\)\s*,\s*0\s*\)\s+AS\s+stock_added/i
  );
  assert.match(
    queries.daily.text,
    /COALESCE\s*\(\s*SUM\s*\(\s*CASE\s+WHEN\s+quantity_change\s*<\s*0\s+THEN\s+-\s*quantity_change\s+ELSE\s+0\s+END\s*\)\s*,\s*0\s*\)\s+AS\s+stock_removed/i
  );
  assert.match(
    queries.daily.text,
    /COALESCE\s*\(\s*SUM\s*\(\s*quantity_change\s*\)\s*,\s*0\s*\)\s+AS\s+net_change/i
  );
  assert.match(queries.daily.text, /created_at >= \$3/);
  assert.match(queries.daily.text, /created_at <= \$4/);
  assert.deepEqual(queries.reasons.values, queries.aggregate.values);
  assert.match(queries.reasons.text, /COUNT\s*\(\s*\*\s*\)\s*::\s*integer\s+AS\s+movement_count/i);
  assert.match(
    queries.reasons.text,
    /COALESCE\s*\(\s*SUM\s*\(\s*ABS\s*\(\s*quantity_change\s*\)\s*\)\s*,\s*0\s*\)\s+AS\s+quantity_magnitude/i
  );
  assert.match(queries.reasons.text, /GROUP BY reason/);
  assert.match(queries.reasons.text, /reason = \$2/);
});

test('omits LIMIT and OFFSET from unpaginated Postgres records query', () => {
  const {
    buildPostgresInventoryMovementQueries,
    normalizeInventoryMovementQuery
  } = require(repositoryPath);
  const normalized = normalizeInventoryMovementQuery(
    { q: 'literal%' },
    { paginate: false, now: NOW }
  );
  const queries = buildPostgresInventoryMovementQueries(normalized);

  assert.doesNotMatch(queries.records.text, /LIMIT|OFFSET/);
  assert.deepEqual(queries.records.values, [
    '%literal\\%%',
    '2026-05-22T00:00:00.000Z',
    '2026-06-20T23:59:59.999Z'
  ]);
  assert.deepEqual(queries.daily.values, queries.records.values);
  assert.deepEqual(queries.reasons.values, queries.records.values);
});

test('maps realistic Postgres rows from one repeatable-read transaction', async () => {
  const {
    normalizeInventoryMovementQuery,
    queryPostgresInventoryMovements
  } = require(repositoryPath);
  const normalized = normalizeInventoryMovementQuery({
    dateFrom: '2026-06-18',
    dateTo: '2026-06-20',
    pageSize: 1
  });
  const calls = [];
  let inTransaction = false;
  const responses = [
    { rows: [{ total_movements: '2', stock_added: '4', stock_removed: '3', net_change: '1' }] },
    { rows: [{
      id: 'pg-2', order_number: '', source: 'admin', reason: 'admin_stock_correction',
      product_slug: 'shirt', product_name: 'Shirt', sku: 'SHIRT-M', size: 'm',
      quantity_change: 4, created_at: new Date('2026-06-20T03:00:00.000Z')
    }] },
    { rows: [{ date: '2026-06-18', stock_added: '0', stock_removed: '3', net_change: '-3' }] },
    { rows: [{ reason: 'order_created', movement_count: '1', quantity_magnitude: '3' }] }
  ];
  const client = {
    async query(text, values) {
      assert.equal(inTransaction, true);
      calls.push({ text, values, client });
      if (calls.length === 1) return { rows: [] };
      return responses[calls.length - 2];
    }
  };
  const fakeTransaction = async (callback) => {
    inTransaction = true;
    try {
      return await callback(client);
    } finally {
      inTransaction = false;
    }
  };

  const result = await queryPostgresInventoryMovements(normalized, fakeTransaction);

  assert.equal(calls.length, 5);
  assert.match(calls[0].text, /^SET TRANSACTION ISOLATION LEVEL REPEATABLE READ$/i);
  assert.ok(calls.slice(1).every((call) => call.client === client));
  assert.deepEqual(result, {
    movements: [{
      id: 'pg-2', orderNumber: '', source: 'admin', reason: 'admin_stock_correction',
      productSlug: 'shirt', productName: 'Shirt', sku: 'SHIRT-M', size: 'm',
      quantityChange: 4, createdAt: '2026-06-20T03:00:00.000Z'
    }],
    summary: { totalMovements: 2, stockAdded: 4, stockRemoved: 3, netChange: 1 },
    dailySeries: [
      { date: '2026-06-18', stockAdded: 0, stockRemoved: 3, netChange: -3 },
      { date: '2026-06-19', stockAdded: 0, stockRemoved: 0, netChange: 0 },
      { date: '2026-06-20', stockAdded: 0, stockRemoved: 0, netChange: 0 }
    ],
    reasonBreakdown: [
      { reason: 'order_created', movementCount: 1, quantityMagnitude: 3 },
      { reason: 'order_cancelled', movementCount: 0, quantityMagnitude: 0 },
      { reason: 'admin_stock_correction', movementCount: 0, quantityMagnitude: 0 }
    ],
    pagination: { page: 1, pageSize: 1, totalItems: 2, totalPages: 2 }
  });
});

test('schema indexes inventory movement date and reason-date range queries', async () => {
  const schema = await fs.readFile(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

  assert.match(schema, /CREATE INDEX IF NOT EXISTS inventory_movements_created_at_idx ON inventory_movements\(created_at DESC\);/);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS inventory_movements_reason_created_at_idx ON inventory_movements\(reason, created_at DESC\);/);
});

function movement(id, createdAt, reason, productName, productSlug, sku, orderNumber, quantityChange) {
  return { id, createdAt, reason, productName, productSlug, sku, orderNumber, quantityChange, source: 'test', size: 'm' };
}

async function withMovementStore(movements, callback) {
  const previousFile = process.env.INVENTORY_MOVEMENTS_DATA_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-inventory-movements-'));
  process.env.INVENTORY_MOVEMENTS_DATA_FILE = path.join(tempDir, 'movements.json');
  await fs.writeFile(process.env.INVENTORY_MOVEMENTS_DATA_FILE, JSON.stringify({ movements }));
  delete require.cache[require.resolve(repositoryPath)];

  try {
    await callback(require(repositoryPath));
  } finally {
    if (previousFile === undefined) delete process.env.INVENTORY_MOVEMENTS_DATA_FILE;
    else process.env.INVENTORY_MOVEMENTS_DATA_FILE = previousFile;
    delete require.cache[require.resolve(repositoryPath)];
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function withAdminMovementApp(movements, callback) {
  const previousMovementsFile = process.env.INVENTORY_MOVEMENTS_DATA_FILE;
  const previousCredentialsFile = process.env.ADMIN_CREDENTIALS_FILE;
  const previousAdminToken = process.env.ADMIN_TOKEN;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-inventory-api-'));
  process.env.INVENTORY_MOVEMENTS_DATA_FILE = path.join(tempDir, 'movements.json');
  process.env.ADMIN_CREDENTIALS_FILE = path.join(tempDir, 'admin-credentials.json');
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  await fs.writeFile(process.env.INVENTORY_MOVEMENTS_DATA_FILE, JSON.stringify({ movements }));

  for (const modulePath of [
    '../src/app',
    '../src/routes/admin',
    '../src/settings/storeSettingsRepository',
    repositoryPath
  ]) {
    delete require.cache[require.resolve(modulePath)];
  }

  const app = require('../src/app').createApp();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    await callback(server.address().port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    restoreEnv('INVENTORY_MOVEMENTS_DATA_FILE', previousMovementsFile);
    restoreEnv('ADMIN_CREDENTIALS_FILE', previousCredentialsFile);
    restoreEnv('ADMIN_TOKEN', previousAdminToken);
    for (const modulePath of [
      '../src/app',
      '../src/routes/admin',
      '../src/settings/storeSettingsRepository',
      repositoryPath
    ]) {
      delete require.cache[require.resolve(modulePath)];
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function adminFetch(port, pathname, options = {}) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`,
      ...(options.headers || {})
    }
  });
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
