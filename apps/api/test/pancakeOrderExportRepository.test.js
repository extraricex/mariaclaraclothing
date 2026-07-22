const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadRepositoryWithoutDatabase() {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const modulePath = '../src/integrations/pancake/pancakeOrderExportRepository';
  delete require.cache[require.resolve(modulePath)];
  const repository = require(modulePath);
  if (previous !== undefined) process.env.DATABASE_URL = previous;
  return repository;
}

function loadRepositoryWithMockDatabase(query) {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://mock';
  const postgresPath = '../src/db/postgres';
  const repositoryPath = '../src/integrations/pancake/pancakeOrderExportRepository';
  const postgresResolved = require.resolve(postgresPath);
  const previousPostgres = require.cache[postgresResolved];
  require.cache[postgresResolved] = {
    id: postgresResolved,
    filename: postgresResolved,
    loaded: true,
    exports: { hasDatabaseUrl: () => true, query }
  };
  delete require.cache[require.resolve(repositoryPath)];
  const repository = require(repositoryPath);
  return {
    repository,
    restore() {
      delete require.cache[require.resolve(repositoryPath)];
      if (previousPostgres) require.cache[postgresResolved] = previousPostgres;
      else delete require.cache[postgresResolved];
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  };
}

test('order export repository enqueues each order once and exposes status counts', async () => {
  const repository = loadRepositoryWithoutDatabase();
  repository.resetMemoryForTests();

  await repository.enqueueOrderExport({ orderNumber: 'MCC-1', customer: {}, items: [] });
  await repository.enqueueOrderExport({ orderNumber: 'MCC-1', customer: {}, items: [] });

  let status = await repository.getOrderExportStatus();
  assert.equal(status.summary.queuedCount, 1);
  assert.equal(status.summary.shadowBuiltCount, 0);
  assert.equal(status.recent.length, 1);
  assert.equal(status.recent[0].orderNumber, 'MCC-1');

  await repository.completeShadowExport({
    orderNumber: 'MCC-1',
    mode: 'shadow',
    shopId: 'shop-1',
    warehouseId: 'warehouse-1',
    orderSourceId: 'source-1',
    requestPayload: { custom_id: 'MCC-1' },
    builtAt: '2026-07-07T00:00:00.000Z'
  });

  status = await repository.getOrderExportStatus();
  assert.equal(status.summary.queuedCount, 0);
  assert.equal(status.summary.shadowBuiltCount, 1);
  assert.equal(status.recent[0].status, 'shadow_built');
  assert.equal(status.recent[0].safeErrorCode, '');
});

test('order export repository blocks rows and returns queued work with local order snapshots', async () => {
  const repository = loadRepositoryWithoutDatabase();
  repository.resetMemoryForTests();

  await repository.enqueueOrderExport({ orderNumber: 'MCC-2', customer: { fullName: 'Buyer' }, items: [{ sku: 'SKU' }] });
  const queued = await repository.listQueuedOrderExports({ limit: 10 });
  assert.equal(queued.length, 1);
  assert.equal(queued[0].order.customer.fullName, 'Buyer');

  await repository.blockOrderExport('MCC-2', 'pancake_catalog_not_ready');
  const status = await repository.getOrderExportStatus();
  assert.equal(status.summary.blockedCount, 1);
  assert.equal(status.recent[0].safeErrorCode, 'pancake_catalog_not_ready');
  assert.deepEqual(await repository.listQueuedOrderExports({ limit: 10 }), []);
  assert.equal((await repository.loadOrderExportWorkItem('MCC-2')).orderNumber, 'MCC-2');
});

test('Pancake-origin orders are never queued for outbound website export', async () => {
  const repository = loadRepositoryWithoutDatabase();
  repository.resetMemoryForTests();

  const result = await repository.enqueueOrderExport({
    orderNumber: 'PNK-EXISTING', checkoutChannel: 'pancake_pos',
    status: 'received', customer: {}, items: []
  });

  assert.equal(result, null);
  assert.equal((await repository.getOrderExportStatus()).recent.length, 0);
});

test('controlled Meta test orders are never queued for Pancake export', async () => {
  const repository = loadRepositoryWithoutDatabase();
  repository.resetMemoryForTests();

  const explicitTest = await repository.enqueueOrderExport({
    orderNumber: 'MCC-META-TEST-1', isTestOrder: true,
    status: 'confirmed', customer: {}, items: []
  });
  const metadataTest = await repository.enqueueOrderExport({
    orderNumber: 'MCC-META-TEST-2',
    paymentMetadata: { metaControlledTest: true },
    status: 'confirmed', customer: {}, items: []
  });

  assert.equal(explicitTest, null);
  assert.equal(metadataTest, null);
  assert.equal((await repository.getOrderExportStatus()).recent.length, 0);
});

test('automatic Pancake backfill excludes controlled test orders in SQL', async () => {
  const calls = [];
  const { repository, restore } = loadRepositoryWithMockDatabase(async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [] };
  });
  try {
    assert.equal(await repository.enqueueMissingOrderExports({ limit: 10 }), 0);
  } finally {
    restore();
  }

  assert.match(calls[0].sql, /o\.is_test_order IS NOT TRUE/);
  assert.match(calls[0].sql, /metaControlledTest/);
});

test('order export repository marks rows sent or failed and excludes sent rows from queued work', async () => {
  const repository = loadRepositoryWithoutDatabase();
  repository.resetMemoryForTests();

  await repository.enqueueOrderExport({ orderNumber: 'MCC-3', customer: {}, items: [] });
  await repository.markOrderExportSent({
    orderNumber: 'MCC-3',
    mode: 'live',
    shopId: 'shop-1',
    warehouseId: 'warehouse-1',
    orderSourceId: 'source-1',
    pancakeOrderId: '987654',
    requestPayload: { custom_id: 'MCC-3' },
    sentAt: '2026-07-08T00:00:00.000Z'
  });

  let status = await repository.getOrderExportStatus();
  assert.equal(status.summary.sentCount, 1);
  assert.equal(status.recent[0].status, 'sent');
  assert.equal(status.recent[0].mode, 'live');
  assert.equal(status.recent[0].pancakeOrderId, '987654');
  assert.deepEqual(await repository.listQueuedOrderExports({ limit: 10 }), []);

  await repository.enqueueOrderExport({ orderNumber: 'MCC-4', customer: {}, items: [] });
  await repository.markOrderExportFailed('MCC-4', 'pancake_http_error');

  status = await repository.getOrderExportStatus();
  assert.equal(status.summary.failedCount, 1);
  assert.equal(status.recent[0].orderNumber, 'MCC-4');
  assert.equal(status.recent[0].safeErrorCode, 'pancake_http_error');
});

test('PayMongo exports wait for verified payment and then become eligible without a duplicate row', async () => {
  const repository = loadRepositoryWithoutDatabase();
  repository.resetMemoryForTests();
  const pending = {
    orderNumber: 'MCC-PAY-WAIT', status: 'pending_payment',
    paymentMethod: 'paymongo', paymentStatus: 'pending_payment', items: []
  };
  await repository.enqueueOrderExport(pending);
  let status = await repository.getOrderExportStatus();
  assert.equal(status.summary.waitingPaymentCount, 1);
  assert.deepEqual(await repository.listQueuedOrderExports({ limit: 10 }), []);

  await repository.enqueueOrderExport({
    ...pending,
    status: 'confirmed',
    paymentStatus: 'paid',
    providerPaymentId: 'pay_verified',
    totalCents: 64900,
    paidAmountCents: 64900
  });
  status = await repository.getOrderExportStatus();
  assert.equal(status.summary.waitingPaymentCount, 0);
  assert.equal(status.summary.queuedCount, 1);
  assert.equal(status.recent.length, 1);
});

test('a created but unverified Pancake order retains its external ID for retry', async () => {
  const repository = loadRepositoryWithoutDatabase();
  repository.resetMemoryForTests();
  await repository.enqueueOrderExport({ orderNumber: 'MCC-CREATED', status: 'confirmed', items: [] });
  await repository.markOrderExportCreated({
    orderNumber: 'MCC-CREATED', pancakeOrderId: 'PK-EXISTING', createdAt: '2026-07-18T00:00:00Z'
  });
  await repository.markOrderExportVerificationFailed({
    orderNumber: 'MCC-CREATED', pancakeOrderId: 'PK-EXISTING',
    safeErrorCode: 'pancake_timeout', providerVerification: { valid: false }
  });
  const work = await repository.loadOrderExportWorkItem('MCC-CREATED');
  assert.equal(work.status, 'created_unverified');
  assert.equal(work.pancakeOrderId, 'PK-EXISTING');
  const status = await repository.getOrderExportStatus();
  assert.equal(status.summary.createdUnverifiedCount, 1);
});

test('order export repository loads one unsent export work item by order number', async () => {
  const repository = loadRepositoryWithoutDatabase();
  repository.resetMemoryForTests();

  await repository.enqueueOrderExport({ orderNumber: 'MCC-5', customer: { fullName: 'Buyer' }, items: [{ sku: 'SKU-5' }] });
  const item = await repository.loadOrderExportWorkItem('MCC-5');
  assert.equal(item.orderNumber, 'MCC-5');
  assert.equal(item.order.customer.fullName, 'Buyer');

  await repository.markOrderExportSent({
    orderNumber: 'MCC-5',
    mode: 'live',
    pancakeOrderId: '987',
    sentAt: '2026-07-08T00:00:00.000Z'
  });
  assert.equal(await repository.loadOrderExportWorkItem('MCC-5'), null);
});

test('order export repository prioritizes newest unsent website orders', async () => {
  const calls = [];
  const { repository, restore } = loadRepositoryWithMockDatabase(async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [] };
  });
  try {
    await repository.listQueuedOrderExports({ limit: 10 });
  } finally {
    restore();
  }

  assert.match(calls[0].sql, /ORDER BY o\.placed_at DESC, e\.queued_at DESC/);
  assert.match(calls[0].sql, /o\.status <> 'cancelled'/);
  assert.match(calls[0].sql, /checkout_channel/);
  assert.match(calls[0].sql, /o\.is_test_order IS NOT TRUE/);
  assert.match(calls[0].sql, /metaControlledTest/);
  assert.doesNotMatch(calls[0].sql, /'blocked'/);
});

test('order export repository skips cancelled and pre-cutover orders', async () => {
  const repository = loadRepositoryWithoutDatabase();
  repository.resetMemoryForTests();
  await repository.enqueueOrderExport({ orderNumber: 'MCC-OLD', status: 'confirmed', placedAt: '2026-07-11T00:00:00Z', items: [] });
  await repository.enqueueOrderExport({ orderNumber: 'MCC-NEW', status: 'confirmed', placedAt: '2026-07-12T01:00:00Z', items: [] });
  await repository.enqueueOrderExport({ orderNumber: 'MCC-CANCELLED', status: 'cancelled', placedAt: '2026-07-12T02:00:00Z', items: [] });

  const queued = await repository.listQueuedOrderExports({ placedAfter: '2026-07-12T00:00:00Z' });
  assert.deepEqual(queued.map((item) => item.orderNumber), ['MCC-NEW']);
  await repository.markOrderExportSkipped('MCC-NEW');
  assert.deepEqual(await repository.listQueuedOrderExports({ placedAfter: '2026-07-12T00:00:00Z' }), []);
});

test('Pancake export schema allows the skipped cutover audit state', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '20260712_pancake_export_cutover.sql'),
    'utf8'
  );
  assert.match(migration, /'skipped'/);
  assert.match(migration, /pancake_order_exports_status_check/);
});
