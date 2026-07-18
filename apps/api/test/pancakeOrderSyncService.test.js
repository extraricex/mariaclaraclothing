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

function completeDelivery() {
  return {
    customer: { firstName: 'Maria', lastName: 'Buyer', phone: '09171234567', email: '' },
    address: { houseAddress: '12 Test Street', barangay: 'BUCANDALA IV', city: 'IMUS', province: 'CAVITE' }
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
  assert.equal(orders.orders.get('MCC-1').status, 'confirmed');
  assert.ok(orders.orders.get('MCC-1').tags.includes('missing_delivery_information'));
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
    ...completeDelivery(), fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending'
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
  assert.equal(updated.address.houseAddress, '12 Test Street');
  assert.equal(updated.customer.phone, '09171234567');
});

test('Pancake inbound sync cannot regress a website COD confirmation to pending', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({
    orderNumber: 'MCC-CANCELLED-COD',
    checkoutChannel: 'storefront_checkout',
    paymentMethod: 'cash_on_delivery',
    paymentStatus: 'cod_pending',
    status: 'cancelled',
    fulfillmentStatus: 'cancelled',
    codConfirmationStatus: 'cancelled',
    deliveryStatus: 'cancelled',
    ...completeDelivery(),
    items: []
  });
  await syncRepo.upsertOrderLink({
    orderNumber: 'MCC-CANCELLED-COD',
    pancakeOrderId: 'PK-CANCELLED-COD',
    syncStatus: 'synced'
  });

  await service.processInboundPancakeOrder({
    pancakeOrder: {
      id: 'PK-CANCELLED-COD',
      custom_id: 'MCC-CANCELLED-COD',
      status: 'Cancelled',
      updated_at: '2026-07-18T00:00:00.000Z'
    },
    orderRepository: orders,
    syncRepository: syncRepo
  });

  const updated = orders.orders.get('MCC-CANCELLED-COD');
  assert.equal(updated.status, 'cancelled');
  assert.equal(updated.codConfirmationStatus, 'cancelled');
});

test('partial Pancake status updates preserve complete native POS delivery fields', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({
    orderNumber: 'PNK-COMPLETE',
    checkoutChannel: 'pancake_pos',
    status: 'confirmed',
    fulfillmentStatus: 'unfulfilled',
    deliveryStatus: 'pending',
    paymentStatus: 'cod_pending',
    ...completeDelivery(),
    items: [],
    tags: ['pancake-pos']
  });
  await syncRepo.upsertOrderLink({
    orderNumber: 'PNK-COMPLETE',
    pancakeOrderId: 'PK-COMPLETE',
    syncStatus: 'synced'
  });

  const result = await service.processInboundPancakeOrder({
    pancakeOrder: {
      id: 'PK-COMPLETE',
      custom_id: 'PNK-COMPLETE',
      status: 'Delivered',
      tracking_number: 'TRACK-COMPLETE',
      updated_at: '2026-07-15T00:00:00.000Z'
    },
    orderRepository: orders,
    syncRepository: syncRepo
  });

  const updated = orders.orders.get('PNK-COMPLETE');
  assert.equal(result.status, 'updated');
  assert.equal(updated.status, 'delivered');
  assert.equal(updated.customer.phone, '09171234567');
  assert.equal(updated.address.houseAddress, '12 Test Street');
  assert.equal(updated.address.barangay, 'BUCANDALA IV');
  assert.equal(updated.trackingNumber, 'TRACK-COMPLETE');
  assert.equal(updated.tags.includes('missing_delivery_information'), false);
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
  assert.equal(updated.deliveryStatus, 'pending');
  assert.ok(updated.tags.includes('missing_delivery_information'));
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
  assert.equal(orders.orders.get('MCC-4').status, 'confirmed');
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
  await orders.saveOrder({ orderNumber: 'MCC-1', status: 'shipped', trackingNumber: 'TRACK-1', ...completeDelivery(), notes: '' });
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

test('processOutboundOrderEvents preserves authoritative totals during an address resync', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({
    orderNumber: 'MCC-ADDRESS-RESYNC', status: 'received',
    paymentMethod: 'cash_on_delivery', paymentStatus: 'cod_pending',
    subtotalCents: 64900, shippingFeeCents: 12000, discountTotalCents: 0,
    totalCents: 76900, freeShippingUnlocked: false,
    items: [{ quantity: 1, unitPriceCents: 64900 }],
    ...completeDelivery(), notes: ''
  });
  await syncRepo.upsertOrderLink({
    orderNumber: 'MCC-ADDRESS-RESYNC', pancakeOrderId: 'PK-ADDRESS-RESYNC',
    shopId: 'shop-1', syncStatus: 'pending_sync'
  });
  await syncRepo.enqueueSyncEvent({
    direction: 'outbound', entityType: 'order', entityId: 'MCC-ADDRESS-RESYNC',
    orderNumber: 'MCC-ADDRESS-RESYNC', pancakeOrderId: 'PK-ADDRESS-RESYNC',
    eventKey: 'MCC-ADDRESS-RESYNC:address', payloadHash: 'address-hash',
    payload: { changedFields: ['address'] }
  });
  const calls = [];
  const addressMapping = {
    countryCode: '63',
    province: { id: '63_826', name: 'Cavite' },
    district: { id: '63_8261588', name: 'Imus' },
    commune: { id: '63_82615881238', name: 'Bucandala iv' }
  };

  const result = await service.processOutboundOrderEvents({
    config: { shopId: 'shop-1', syncMaxAttempts: 3 },
    client: {
      updateOrder: async (shopId, pancakeOrderId, payload) => calls.push({ shopId, pancakeOrderId, payload }),
      getOrder: async () => ({
        bill_full_name: 'Maria Buyer',
        bill_phone_number: '09171234567',
        shipping_address: {
          full_name: 'Maria Buyer',
          phone_number: '09171234567',
          address: '12 Test Street',
          full_address: '12 Test Street, Bucandala iv, Imus, Cavite, Philippines',
          province_id: '63_826',
          province_name: 'Cavite',
          district_id: '63_8261588',
          district_name: 'Imus',
          commune_id: '63_82615881238',
          commnue_name: 'Bucandala iv',
          country_code: '63'
        }
      })
    },
    geoResolver: async () => addressMapping,
    orderRepository: orders,
    syncRepository: syncRepo,
    now: () => new Date('2026-07-17T00:00:00.000Z')
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.updatedCount, 1);
  assert.equal(calls[0].payload.shipping_fee, 120);
  assert.equal(calls[0].payload.total_discount, 0);
  assert.equal(calls[0].payload.is_free_shipping, false);
  assert.equal(calls[0].payload.cod, 769);
  assert.equal(calls[0].payload.transfer_money, 0);
  assert.match(calls[0].payload.note_print, /cod_amount=769/);
  assert.equal(649 + calls[0].payload.shipping_fee - calls[0].payload.total_discount, calls[0].payload.cod);
});

test('processOutboundOrderEvents maps failed orders to Pancake waiting-for-confirmation with a marker', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({ orderNumber: 'MCC-UNSUPPORTED', status: 'failed', ...completeDelivery(), notes: '' });
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

  assert.equal(result.updatedCount, 1);
  assert.equal(result.status, 'complete');
  assert.equal(callCount, 1);
});

test('processOutboundOrderEvents retains failed updates for retry and exposes sync failure detail', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({
    orderNumber: 'MCC-FAIL-1', status: 'cancelled', paymentMethod: 'paymongo', paymentStatus: 'paid',
    totalCents: 72900, paidAmountCents: 72900, ...completeDelivery(), notes: ''
  });
  await syncRepo.upsertOrderLink({
    orderNumber: 'MCC-FAIL-1', pancakeOrderId: 'PK-FAIL-1', shopId: 'shop-1', syncStatus: 'pending_sync'
  });
  await syncRepo.enqueueSyncEvent({
    direction: 'outbound', entityType: 'order', entityId: 'MCC-FAIL-1',
    orderNumber: 'MCC-FAIL-1', pancakeOrderId: 'PK-FAIL-1', eventKey: 'cancel-fail',
    payload: { changedFields: ['status'] }
  });
  const providerError = new Error('provider unavailable');
  providerError.code = 'pancake_http_error';

  const result = await service.processOutboundOrderEvents({
    config: { shopId: 'shop-1' },
    client: { updateOrder: async () => { throw providerError; } },
    orderRepository: orders,
    syncRepository: syncRepo,
    now: () => new Date('2026-07-12T00:00:00.000Z')
  });
  const detail = await syncRepo.getOrderSyncDetail('MCC-FAIL-1');

  assert.equal(result.status, 'failed');
  assert.equal(detail.syncStatus, 'sync_failed');
  assert.equal(detail.statusSyncStatus, 'sync_failed');
  assert.equal(detail.statusSyncError, 'pancake_http_error');
  assert.ok(detail.recentLogs.some((log) => log.code === 'pancake_order_cancellation_failed'));
});

test('processOutboundOrderEvents reconciles an unpaid cancellation already removed in Pancake', async () => {
  const syncRepo = require('../src/integrations/pancake/pancakeOrderSyncRepository');
  const service = require('../src/integrations/pancake/pancakeOrderSyncService');
  syncRepo.resetMemoryForTests();
  const orders = memoryOrderRepo();
  await orders.saveOrder({
    orderNumber: 'MCC-REMOVED-1', status: 'cancelled', paymentMethod: 'paymongo',
    paymentStatus: 'expired', ...completeDelivery(), notes: ''
  });
  await syncRepo.upsertOrderLink({
    orderNumber: 'MCC-REMOVED-1', pancakeOrderId: 'PK-REMOVED-1', shopId: 'shop-1', syncStatus: 'sync_failed'
  });
  const event = await syncRepo.enqueueSyncEvent({
    direction: 'outbound', entityType: 'order', entityId: 'MCC-REMOVED-1',
    orderNumber: 'MCC-REMOVED-1', pancakeOrderId: 'PK-REMOVED-1', eventKey: 'expired',
    payload: { changedFields: ['paymentStatus', 'status'] }
  });
  await syncRepo.markSyncEventRetryable(event.id, {
    safeErrorCode: 'pancake_http_error',
    nextAttemptAt: '2026-07-13T10:59:00.000Z'
  });
  let updateCalls = 0;

  const result = await service.processOutboundOrderEvents({
    config: { shopId: 'shop-1' },
    client: {
      getOrder: async () => ({ id: 'PK-REMOVED-1', status: 7 }),
      updateOrder: async () => { updateCalls += 1; }
    },
    orderRepository: orders,
    syncRepository: syncRepo,
    now: () => new Date('2026-07-13T11:00:00.000Z')
  });
  const detail = await syncRepo.getOrderSyncDetail('MCC-REMOVED-1');

  assert.equal(result.status, 'complete');
  assert.equal(result.updatedCount, 1);
  assert.equal(updateCalls, 0);
  assert.equal(detail.syncStatus, 'synced');
  assert.equal(detail.paymentSyncStatus, 'synced');
  assert.equal(detail.statusSyncStatus, 'synced');
  assert.equal(detail.paymentSyncError, '');
  assert.equal(detail.statusSyncError, '');
  assert.ok(detail.recentLogs.some((log) => /already applied/.test(log.message)));
});
