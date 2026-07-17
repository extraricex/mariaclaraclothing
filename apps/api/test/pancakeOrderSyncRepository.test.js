const test = require('node:test');
const assert = require('node:assert/strict');

function memoryRepo() {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const repo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  repo.resetMemoryForTests();
  return { repo, restore: () => { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; } };
}

test('memory sync repository upserts links and exposes public sync detail', async () => {
  const { repo, restore } = memoryRepo();
  try {
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
  } finally {
    restore();
  }
});

test('link upserts preserve timestamps owned by the opposite sync direction', async () => {
  const { repo, restore } = memoryRepo();
  try {
    await repo.upsertOrderLink({
      orderNumber: 'MCC-BOTH', pancakeOrderId: 'PK-BOTH', shopId: 'shop-1',
      syncStatus: 'synced', lastLocalUpdatedAt: '2026-07-10T00:01:00.000Z'
    });
    await repo.upsertOrderLink({
      orderNumber: 'MCC-BOTH', pancakeOrderId: 'PK-BOTH', syncStatus: 'synced',
      lastPancakeUpdatedAt: '2026-07-10T00:02:00.000Z'
    });

    const detail = await repo.getOrderSyncDetail('MCC-BOTH');
    assert.equal(detail.shopId, 'shop-1');
    assert.equal(detail.lastLocalUpdatedAt, '2026-07-10T00:01:00.000Z');
    assert.equal(detail.lastPancakeUpdatedAt, '2026-07-10T00:02:00.000Z');
  } finally {
    restore();
  }
});

test('PostgreSQL link upsert preserves directional timestamps with COALESCE', async () => {
  const { readFile } = require('node:fs/promises');
  const path = require('node:path');
  const source = await readFile(path.join(__dirname, '..', 'src', 'integrations', 'pancake', 'pancakeOrderSyncRepository.js'), 'utf8');
  assert.match(source, /last_pancake_updated_at=COALESCE\(EXCLUDED\.last_pancake_updated_at,pancake_order_links\.last_pancake_updated_at\)/);
  assert.match(source, /last_local_updated_at=COALESCE\(EXCLUDED\.last_local_updated_at,pancake_order_links\.last_local_updated_at\)/);
});

test('memory sync repository deduplicates events by deterministic key', async () => {
  const { repo, restore } = memoryRepo();
  try {
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
  } finally {
    restore();
  }
});

test('memory sync repository lists scoped links and atomically claims one event by id', async () => {
  const { repo, restore } = memoryRepo();
  try {
    await repo.upsertOrderLink({ orderNumber: 'MCC-2', pancakeOrderId: 'PK-2', syncStatus: 'synced' });
    await repo.upsertOrderLink({ orderNumber: 'MCC-1', pancakeOrderId: 'PK-1', syncStatus: 'synced' });
    assert.deepEqual(
      (await repo.listOrderLinks({ orderNumbers: ['MCC-2'] })).map((link) => link.orderNumber),
      ['MCC-2']
    );

    const identity = {
      direction: 'outbound', entityType: 'order', entityId: 'MCC-2', eventKey: 'financial:hash'
    };
    await repo.enqueueSyncEvent({
      ...identity, orderNumber: 'MCC-2', pancakeOrderId: 'PK-2', payloadHash: 'hash', payload: {}
    });
    const stored = await repo.getSyncEventByIdentity(identity);
    const claimed = await repo.claimSyncEventById(stored.id, { now: '2026-07-17T00:00:00.000Z' });
    const duplicateClaim = await repo.claimSyncEventById(stored.id, { now: '2026-07-17T00:00:00.000Z' });
    assert.equal(claimed.status, 'processing');
    assert.equal(duplicateClaim, null);
  } finally {
    restore();
  }
});

test('memory sync repository claims due events and marks retryable failure with backoff', async () => {
  const { repo, restore } = memoryRepo();
  try {
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
  } finally {
    restore();
  }
});

test('memory sync repository summarizes order sync state', async () => {
  const { repo, restore } = memoryRepo();
  try {
    await repo.upsertOrderLink({ orderNumber: 'MCC-1', pancakeOrderId: 'PK-1', syncStatus: 'synced' });
    const event = await repo.enqueueSyncEvent({
      direction: 'outbound',
      entityType: 'order',
      entityId: 'MCC-1',
      orderNumber: 'MCC-1',
      pancakeOrderId: 'PK-1',
      eventKey: 'MCC-1:status',
      payloadHash: 'hash',
      payload: {}
    });
    await repo.claimDueSyncEvents({ direction: 'outbound', now: '2026-07-10T00:00:00.000Z' });
    await repo.markSyncEventRetryable(event.id, { safeErrorCode: 'pancake_network_error', nextAttemptAt: '2026-07-10T00:05:00.000Z' });

    assert.deepEqual(await repo.getOrderSyncSummary(), {
      pendingCount: 0,
      failedCount: 1,
      blockedCount: 0,
      linkedCount: 1
    });
  } finally {
    restore();
  }
});
