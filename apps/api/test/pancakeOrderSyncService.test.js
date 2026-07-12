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

  const pancakeOrder = {
      id: 'PK-1',
      custom_id: 'MCC-PK-1',
      status: 'New',
      bill_full_name: 'Pancake Buyer',
      bill_phone_number: '09171234567',
      items: [],
      total_price: 1000,
      updated_at: '2026-07-10T00:00:00.000Z'
  };
  const result = await service.processInboundPancakeOrder({
    pancakeOrder,
    orderRepository: orders,
    syncRepository: syncRepo,
    now: () => new Date('2026-07-10T00:02:00.000Z')
  });

  assert.equal(result.status, 'imported');
  assert.equal(orders.orders.get('MCC-PK-1').channel, 'Pancake POS');
  assert.equal((await syncRepo.getOrderSyncDetail('MCC-PK-1')).pancakeOrderId, 'PK-1');

  const duplicate = await service.processInboundPancakeOrder({
    pancakeOrder,
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

test('Pancake status updates preserve authoritative website totals and PayMongo payment state', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({
    orderNumber: 'MCC-PAY', checkoutChannel: 'storefront_checkout', paymentProvider: 'paymongo',
    paymentMethod: 'paymongo', paymentStatus: 'pending_payment', status: 'pending_payment',
    subtotalCents: 64900, shippingFeeCents: 18000, discountTotalCents: 0, totalCents: 82900,
    items: [{ sku: 'SKU-S', quantity: 1 }], cartSnapshot: [{ sku: 'SKU-S', quantity: 1 }],
    customer: {}, address: {}, fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending'
  });
  await syncRepo.upsertOrderLink({ orderNumber: 'MCC-PAY', pancakeOrderId: 'PK-PAY', syncStatus: 'synced' });

  await service.processInboundPancakeOrder({
    pancakeOrder: {
      id: 'PK-PAY', custom_id: 'MCC-PAY', status: 'Confirmed', total_price: 649,
      shipping_fee: 0, payment_method: 'cash_on_delivery', payment_status: 'unpaid',
      items: [], updated_at: '2026-07-12T00:00:00.000Z'
    },
    orderRepository: orders, syncRepository: syncRepo
  });

  const updated = orders.orders.get('MCC-PAY');
  assert.equal(updated.totalCents, 82900);
  assert.equal(updated.shippingFeeCents, 18000);
  assert.equal(updated.items.length, 1);
  assert.equal(updated.paymentMethod, 'paymongo');
  assert.equal(updated.paymentStatus, 'pending_payment');
  assert.equal(updated.status, 'confirmed');
});

test('processInboundPancakeOrder imports native Pancake orders with a deterministic number', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  const pancakeOrder = { id: 98765, status: 0, items: [], total_price: 500, updated_at: '2026-07-10T00:00:00.000Z' };

  const imported = await service.processInboundPancakeOrder({ pancakeOrder, orderRepository: orders, syncRepository: syncRepo });
  const duplicate = await service.processInboundPancakeOrder({ pancakeOrder, orderRepository: orders, syncRepository: syncRepo });

  assert.equal(imported.status, 'imported');
  assert.equal(imported.orderNumber, 'PNK-98765');
  assert.equal(orders.orders.get('PNK-98765').channel, 'Pancake POS');
  assert.equal(duplicate.status, 'duplicate');
});

test('processInboundPancakeOrder applies detail changes with the same Pancake updated timestamp', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({
    orderNumber: 'MCC-2',
    status: 'confirmed',
    fulfillmentStatus: 'unfulfilled',
    paymentStatus: 'cod_pending',
    deliveryStatus: 'pending',
    customer: { fullName: 'Old Name', phone: '1', email: '' },
    address: { addressLine: 'Old address' },
    items: [],
    shippingFeeCents: 0,
    totalCents: 10000,
    trackingNumber: '',
    notes: ''
  });
  await syncRepo.upsertOrderLink({
    orderNumber: 'MCC-2',
    pancakeOrderId: 'PK-2',
    syncStatus: 'synced',
    lastPancakeUpdatedAt: '2026-07-10T00:05:00.000Z'
  });

  const result = await service.processInboundPancakeOrder({
    pancakeOrder: {
      id: 'PK-2',
      custom_id: 'MCC-2',
      status: 'Confirmed',
      bill_full_name: 'New Name',
      bill_phone_number: '09999999999',
      bill_email: 'new@example.com',
      shipping_address: {
        full_address: 'New Street, New Barangay, New City, New Province',
        address: 'New Street',
        barangay: 'New Barangay',
        city: 'New City',
        province: 'New Province',
        post_code: '4103'
      },
      items: [{ variation_info: { name: 'Updated Shirt', sku: 'SKU-NEW', size: 'Large' }, variation_id: 'PV-2', quantity: 3, price: 500 }],
      payment_status: 'paid',
      shipping_fee: 120,
      total_discount: 30,
      total_price: 1590,
      shipping_partner: 'J&T Express',
      tracking_number: 'TRACK-NEW',
      note_print: 'Updated note',
      updated_at: '2026-07-10T00:05:00.000Z'
    },
    orderRepository: orders,
    syncRepository: syncRepo,
    now: () => new Date('2026-07-10T00:06:00.000Z')
  });

  const updated = orders.orders.get('MCC-2');
  assert.equal(result.status, 'updated');
  assert.equal(updated.customer.fullName, 'New Name');
  assert.equal(updated.address.city, 'New City');
  assert.equal(updated.items[0].quantity, 3);
  assert.equal(updated.shippingFeeCents, 12000);
  assert.equal(updated.discountTotalCents, 3000);
  assert.equal(updated.totalCents, 159000);
  assert.equal(updated.paymentStatus, 'paid');
  assert.equal(updated.deliveryMethod, 'J&T Express');
  assert.equal(updated.trackingNumber, 'TRACK-NEW');
});

test('processInboundPancakeOrder syncs nested Pancake shipment tracking fields', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({
    orderNumber: 'MCC-TRACK',
    status: 'confirmed',
    fulfillmentStatus: 'unfulfilled',
    deliveryStatus: 'pending',
    customer: {},
    address: {},
    items: [],
    trackingNumber: ''
  });
  await syncRepo.upsertOrderLink({
    orderNumber: 'MCC-TRACK',
    pancakeOrderId: 'PK-TRACK',
    syncStatus: 'synced'
  });

  const result = await service.processInboundPancakeOrder({
    pancakeOrder: {
      id: 'PK-TRACK',
      custom_id: 'MCC-TRACK',
      status: 'Confirmed',
      shipping_info: {
        carrier_name: 'J&T Express',
        tracking_number: 'JT-123',
        shipping_status: 'shipping'
      },
      updated_at: '2026-07-10T00:07:00.000Z'
    },
    orderRepository: orders,
    syncRepository: syncRepo
  });

  const updated = orders.orders.get('MCC-TRACK');
  assert.equal(result.status, 'updated');
  assert.equal(updated.deliveryMethod, 'J&T Express');
  assert.equal(updated.trackingNumber, 'JT-123');
  assert.equal(updated.deliveryStatus, 'out_for_delivery');
});

test('processInboundPancakeOrder ignores older Pancake updates for linked orders', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({ orderNumber: 'MCC-3', status: 'shipped', fulfillmentStatus: 'shipped', deliveryStatus: 'out_for_delivery', customer: {}, address: {}, items: [], trackingNumber: 'NEW' });
  await syncRepo.upsertOrderLink({
    orderNumber: 'MCC-3',
    pancakeOrderId: 'PK-3',
    syncStatus: 'synced',
    lastPancakeUpdatedAt: '2026-07-10T00:10:00.000Z'
  });

  const result = await service.processInboundPancakeOrder({
    pancakeOrder: { id: 'PK-3', custom_id: 'MCC-3', status: 'Delivered', tracking_number: 'OLD', updated_at: '2026-07-10T00:09:59.000Z' },
    orderRepository: orders,
    syncRepository: syncRepo
  });

  assert.equal(result.status, 'stale');
  assert.equal(orders.orders.get('MCC-3').status, 'shipped');
  assert.equal(orders.orders.get('MCC-3').trackingNumber, 'NEW');
});

test('processInboundPancakeOrder matches linked orders by Pancake order ID when custom id is missing', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({ orderNumber: 'MCC-4', status: 'confirmed', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending', customer: {}, address: {}, items: [] });
  await syncRepo.upsertOrderLink({ orderNumber: 'MCC-4', pancakeOrderId: 'PK-4', syncStatus: 'synced' });

  const result = await service.processInboundPancakeOrder({
    pancakeOrder: { id: 'PK-4', status: 'Shipped', tracking_number: 'TRACK-4', updated_at: '2026-07-10T00:15:00.000Z' },
    orderRepository: orders,
    syncRepository: syncRepo
  });

  assert.equal(result.status, 'updated');
  assert.equal(orders.orders.get('MCC-4').status, 'shipped');
  assert.equal(orders.orders.get('MCC-4').trackingNumber, 'TRACK-4');
});

test('pollInboundPancakeOrders fetches every updated order page', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  const requestedPages = [];
  const requestedOptions = [];

  const result = await service.pollInboundPancakeOrders({
    config: { shopId: 'shop-1', orderPollPageSize: 1, orderPollLookbackMs: 60000 },
    client: {
      listOrders: async (_shopId, options) => {
        requestedPages.push(options.pageNumber);
        requestedOptions.push(options);
        return {
          data: [{ id: `PK-${options.pageNumber}`, custom_id: `MCC-PAGE-${options.pageNumber}`, status: 'New', updated_at: `2026-07-10T00:0${options.pageNumber}:00.000Z` }],
          page_number: options.pageNumber,
          total_pages: 2
        };
      }
    },
    orderRepository: orders,
    syncRepository: syncRepo,
    now: () => new Date('2026-07-10T00:10:00.000Z')
  });

  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(requestedOptions[0].updatedSince, '2026-07-10T00:09:00.000Z');
  assert.equal(requestedOptions[0].updatedUntil, '2026-07-10T00:10:00.000Z');
  assert.equal(result.importedCount, 2);
  assert.equal(orders.orders.size, 2);
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
  assert.equal(result.status, 'complete');
  assert.equal(calls[0].pancakeOrderId, 'PK-1');
  assert.equal(calls[0].payload.status, 2);
  assert.equal(calls[0].payload.partner.extend_code, 'TRACK-1');
});

test('processOutboundOrderEvents blocks unsupported-only updates without calling Pancake', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({ orderNumber: 'MCC-UNSUPPORTED', status: 'failed', customer: {}, address: {}, notes: '' });
  await syncRepo.enqueueSyncEvent({
    direction: 'outbound', entityType: 'order', entityId: 'MCC-UNSUPPORTED',
    orderNumber: 'MCC-UNSUPPORTED', pancakeOrderId: 'PK-UNSUPPORTED', eventKey: 'unsupported',
    payloadHash: 'unsupported', payload: { changedFields: ['status'] }
  });
  let callCount = 0;

  const result = await service.processOutboundOrderEvents({
    config: { shopId: 'shop-1' },
    client: { updateOrder: async () => { callCount += 1; } },
    orderRepository: orders,
    syncRepository: syncRepo
  });

  assert.equal(result.blockedCount, 1);
  assert.equal(result.status, 'blocked');
  assert.equal(callCount, 0);
});
