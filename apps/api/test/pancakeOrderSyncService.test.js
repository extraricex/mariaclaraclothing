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
