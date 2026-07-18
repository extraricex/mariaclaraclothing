const test = require('node:test');
const assert = require('node:assert/strict');

function order(overrides = {}) {
  return {
    orderNumber: 'MCC-1001',
    customer: { fullName: 'Maria Buyer', phone: '09171234567', email: 'buyer@example.com' },
    address: {
      houseAddress: '12 Test St',
      addressLine: '12 Test St, BUCANDALA IV, IMUS, CAVITE, Philippines',
      barangay: 'BUCANDALA IV',
      city: 'IMUS',
      province: 'CAVITE',
      postalCode: '4103',
      country: 'Philippines'
    },
    items: [{
      productId: 'catalog-shirt',
      productName: 'Real Shirt',
      variantId: 'catalog-shirt-0',
      sku: 'SHIRT-S',
      size: 'Small',
      quantity: 2,
      unitPriceCents: 70000,
      externalPosVariantId: 'pv-1'
    }],
    shippingFeeCents: 8000,
    discountTotalCents: 10000,
    freeShippingUnlocked: false,
    paymentMethod: 'cash_on_delivery',
    checkoutChannel: 'storefront_checkout',
    notes: 'Leave at guard',
    placedAt: '2026-07-07T10:00:00.000Z',
    ...overrides
  };
}

function readiness(overrides = {}) {
  return {
    ready: true,
    shopId: '123',
    warehouseId: 'wh-1',
    orderSourceId: 'source-1',
    priceUnitStatus: 'confirmed_pesos',
    latestCatalog: { status: 'complete', conflictCount: 0 },
    mappings: [{
      localSku: 'SHIRT-S',
      normalizedSku: 'SHIRT-S',
      pancakeProductId: 'pp-1',
      pancakeVariationId: 'pv-1'
    }],
    ...overrides
  };
}

function addressMapping() {
  return {
    countryCode: '63',
    province: { id: '63_826', code: '', name: 'Cavite' },
    district: { id: '63_8261588', code: '', name: 'Imus' },
    commune: { id: '63_82615881238', code: '', name: 'Bucandala iv' },
    mappingStatus: 'resolved'
  };
}

function verifiedProviderOrder(input = order()) {
  return {
    id: '987654',
    bill_full_name: input.customer.fullName,
    bill_phone_number: input.customer.phone,
    bill_email: input.customer.email,
    shipping_address: {
      full_name: input.customer.fullName,
      phone_number: input.customer.phone,
      address: input.address.houseAddress,
      full_address: `${input.address.houseAddress}, Bucandala iv, Imus, Cavite, 4103, Philippines`,
      province_id: '63_826',
      province_name: 'Cavite',
      district_id: '63_8261588',
      district_name: 'Imus',
      commune_id: '63_82615881238',
      commnue_name: 'Bucandala iv',
      country_code: '63',
      post_code: '4103'
    }
  };
}

const resolveAddress = async () => addressMapping();

test('builds a Pancake shadow order payload from a mapped COD order', () => {
  const { buildPancakeOrderPayload } = require('../src/integrations/pancake/pancakeOrderExportService');
  const payload = buildPancakeOrderPayload(order(), readiness(), addressMapping());

  assert.equal(payload.shop_id, 123);
  assert.equal(payload.warehouse_id, 'wh-1');
  assert.equal(payload.custom_id, 'MCC-1001');
  assert.equal(payload.bill_full_name, 'Maria Buyer');
  assert.equal(payload.bill_phone_number, '09171234567');
  assert.equal(payload.bill_email, 'buyer@example.com');
  assert.equal(payload.shipping_address.full_name, 'Maria Buyer');
  assert.equal(payload.shipping_address.phone_number, '09171234567');
  assert.equal(payload.shipping_address.address, '12 Test St');
  assert.match(payload.shipping_address.full_address, /BUCANDALA IV/);
  assert.equal(payload.shipping_address.commnue_name, 'Bucandala iv');
  assert.equal(payload.shipping_address.commune_id, '63_82615881238');
  assert.equal(payload.shipping_address.district_name, 'Imus');
  assert.equal(payload.shipping_address.district_id, '63_8261588');
  assert.equal(payload.shipping_address.province_name, 'Cavite');
  assert.equal(payload.shipping_address.province_id, '63_826');
  assert.equal(payload.shipping_address.post_code, '4103');
  assert.equal(payload.shipping_address.country_code, '63');
  assert.equal(payload.items[0].product_id, 'pp-1');
  assert.equal(payload.items[0].variation_id, 'pv-1');
  assert.equal(payload.items[0].quantity, 2);
  assert.equal(payload.items[0].variation_info.retail_price, 700);
  assert.equal(payload.shipping_fee, 80);
  assert.equal(payload.total_discount, 100);
  assert.equal(payload.is_free_shipping, false);
  assert.equal(payload.received_at_shop, false);
  assert.equal(payload.status, 0);
  assert.equal(payload.cod, 1380);
  assert.equal(payload.transfer_money, 0);
  assert.match(payload.note, /MCC-1001/);
  assert.match(payload.note, /storefront_checkout/);
  assert.doesNotMatch(payload.note_print, /Leave at guard/);
  assert.match(payload.note_print, /payment_method=cash_on_delivery/);
  assert.match(payload.note_print, /cod_amount=1380/);
});

test('blocks pending PayMongo and exports only after a verified paid amount', () => {
  const { buildPancakeOrderPayload } = require('../src/integrations/pancake/pancakeOrderExportService');
  assert.throws(() => buildPancakeOrderPayload(order({
    paymentMethod: 'paymongo', paymentStatus: 'pending_payment', totalCents: 148000,
    providerCheckoutSessionId: 'cs_test_1'
  }), readiness(), addressMapping()), (error) => error.code === 'pancake_order_waiting_payment');

  const paid = buildPancakeOrderPayload(order({
    paymentMethod: 'paymongo', paymentStatus: 'paid', totalCents: 148000,
    paidAmountCents: 148000, providerCheckoutSessionId: 'cs_test_1', providerPaymentId: 'pay_test_1'
  }), readiness(), addressMapping());
  assert.equal(paid.cod, 0);
  assert.equal(paid.transfer_money, 1480);
  assert.match(paid.shipping_address.full_address, /BUCANDALA IV/);
  assert.match(paid.note_print, /payment_status=paid/);
  assert.match(paid.note_print, /paymongo_payment_id=pay_test_1/);
});

test('redacts phone and email in stored shadow review payloads', () => {
  const { redactPancakeOrderPayload } = require('../src/integrations/pancake/pancakeOrderExportService');
  const redacted = redactPancakeOrderPayload(buildFixturePayload());

  assert.equal(redacted.bill_phone_number, '0917****567');
  assert.equal(redacted.bill_email, 'b***r@example.com');
  assert.equal(redacted.shipping_address.phone_number, '0917****567');
  assert.equal(redacted.custom_id, 'MCC-1001');
});

test('blocks shadow payloads until price unit and mappings are ready', () => {
  const { buildPancakeOrderPayload } = require('../src/integrations/pancake/pancakeOrderExportService');

  assert.throws(
    () => buildPancakeOrderPayload(order(), readiness({ priceUnitStatus: 'unknown' })),
    (error) => error.code === 'pancake_price_unit_not_confirmed'
  );
  assert.throws(
    () => buildPancakeOrderPayload(order(), readiness({ latestCatalog: { status: 'complete', conflictCount: 1 } })),
    (error) => error.code === 'pancake_catalog_conflicts_open'
  );
  assert.throws(
    () => buildPancakeOrderPayload(order(), readiness({ mappings: [] })),
    (error) => error.code === 'pancake_order_item_mapping_missing'
  );
  assert.throws(
    () => buildPancakeOrderPayload(order(), readiness({ warehouseId: '' })),
    (error) => error.code === 'pancake_references_incomplete'
  );
  assert.throws(
    () => buildPancakeOrderPayload(order({ address: { houseAddress: '', barangay: '', city: '', province: '' } }), readiness()),
    (error) => error.code === 'pancake_order_delivery_incomplete'
  );
});

test('shadow build completes mapped exports and blocks invalid orders', async () => {
  const { runOrderShadowBuild } = require('../src/integrations/pancake/pancakeOrderExportService');
  const calls = [];
  const repository = {
    loadOrderExportReadiness: async () => readiness(),
    listQueuedOrderExports: async () => [
      { orderNumber: 'MCC-1001', order: order() },
      { orderNumber: 'MCC-1002', order: order({ orderNumber: 'MCC-1002', items: [{ sku: 'MISSING', quantity: 1, unitPriceCents: 50000 }] }) }
    ],
    completeShadowExport: async (record) => calls.push(['complete', record]),
    blockOrderExport: async (orderNumber, code) => calls.push(['block', orderNumber, code])
  };

  const result = await runOrderShadowBuild({
    config: { mode: 'shadow' },
    repository,
    geoResolver: resolveAddress,
    now: () => new Date('2026-07-07T00:00:00Z')
  });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.summary, { checkedCount: 2, builtCount: 1, blockedCount: 1, failedCount: 0 });
  assert.equal(calls[0][0], 'complete');
  assert.equal(calls[0][1].orderNumber, 'MCC-1001');
  assert.equal(calls[0][1].requestPayload.bill_phone_number, '0917****567');
  assert.deepEqual(calls[1], ['block', 'MCC-1002', 'pancake_order_item_mapping_missing']);
});

test('shadow build asks the repository to queue existing local orders before processing', async () => {
  const { runOrderShadowBuild } = require('../src/integrations/pancake/pancakeOrderExportService');
  const calls = [];
  const repository = {
    enqueueMissingOrderExports: async () => calls.push('enqueueMissing'),
    loadOrderExportReadiness: async () => readiness(),
    listQueuedOrderExports: async () => [],
    completeShadowExport: async () => {},
    blockOrderExport: async () => {}
  };

  await runOrderShadowBuild({ config: { mode: 'shadow' }, repository, geoResolver: resolveAddress });
  assert.deepEqual(calls, ['enqueueMissing']);
});

test('live export sends mapped queued orders to Pancake and marks them sent', async () => {
  const { runOrderLiveExport } = require('../src/integrations/pancake/pancakeOrderExportService');
  const calls = [];
  const repository = {
    enqueueMissingOrderExports: async () => calls.push(['enqueueMissing']),
    loadOrderExportReadiness: async () => readiness(),
    listQueuedOrderExports: async () => [{ orderNumber: 'MCC-1001', order: order() }],
    markOrderExportSent: async (record) => calls.push(['sent', record]),
    markOrderExportFailed: async () => {},
    blockOrderExport: async () => {}
  };
  const syncRepository = {
    upsertOrderLink: async (record) => calls.push(['link', record])
  };
  const inventoryOutboxRepository = {
    enqueueInventorySync: async (slugs, source, options) => calls.push(['inventory', slugs, source, options])
  };
  const client = {
    createOrder: async (shopId, payload) => {
      calls.push(['createOrder', shopId, payload.custom_id]);
      return { pancakeOrderId: '987654' };
    },
    getOrder: async () => verifiedProviderOrder()
  };

  const result = await runOrderLiveExport({
    config: { mode: 'live', syncMaxAttempts: 10 },
    client,
    repository,
    syncRepository,
    inventoryOutboxRepository,
    geoResolver: resolveAddress,
    now: () => new Date('2026-07-08T00:00:00Z')
  });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.summary, { checkedCount: 1, sentCount: 1, blockedCount: 0, failedCount: 0 });
  assert.deepEqual(calls[0], ['enqueueMissing']);
  assert.deepEqual(calls[1], ['createOrder', '123', 'MCC-1001']);
  assert.equal(calls[2][0], 'link');
  assert.equal(calls[2][1].syncStatus, 'pending_sync');
  assert.equal(calls[3][0], 'sent');
  assert.equal(calls[3][1].mode, 'live');
  assert.equal(calls[3][1].pancakeOrderId, '987654');
  assert.equal(calls[3][1].requestPayload.bill_phone_number, '0917****567');
  assert.equal(calls[3][1].providerVerification.valid, true);
  assert.deepEqual(calls[4], ['link', {
    orderNumber: 'MCC-1001',
    pancakeOrderId: '987654',
    shopId: '123',
    syncStatus: 'synced',
    lastSyncedAt: '2026-07-08T00:00:00.000Z'
  }]);
  assert.deepEqual(calls[5], ['inventory', ['shirt'], 'website_order', { maxAttempts: 10 }]);
});

test('live retry verifies an already-created Pancake order without creating a duplicate', async () => {
  const { runOrderLiveExport } = require('../src/integrations/pancake/pancakeOrderExportService');
  const calls = [];
  const repository = {
    loadOrderExportReadiness: async () => readiness(),
    loadOrderExportWorkItem: async () => ({
      orderNumber: 'MCC-RETRY',
      pancakeOrderId: 'existing-987654',
      order: order({ orderNumber: 'MCC-RETRY' })
    }),
    saveOrderAddressMapping: async () => {},
    markOrderExportSent: async (record) => calls.push(['sent', record.pancakeOrderId]),
    markOrderExportFailed: async () => {},
    blockOrderExport: async () => {}
  };
  const client = {
    createOrder: async () => {
      throw new Error('retry must not create a second Pancake order');
    },
    getOrder: async (shopId, pancakeOrderId) => {
      calls.push(['getOrder', shopId, pancakeOrderId]);
      return verifiedProviderOrder(order({ orderNumber: 'MCC-RETRY' }));
    }
  };
  const syncRepository = {
    upsertOrderLink: async (record) => calls.push(['link', record.syncStatus])
  };

  const result = await runOrderLiveExport({
    config: { mode: 'live' }, client, repository, syncRepository,
    inventoryOutboxRepository: { enqueueInventorySync: async () => {} },
    geoResolver: resolveAddress,
    orderNumber: 'MCC-RETRY'
  });

  assert.deepEqual(result.summary, { checkedCount: 1, sentCount: 1, blockedCount: 0, failedCount: 0 });
  assert.deepEqual(calls, [
    ['getOrder', '123', 'existing-987654'],
    ['sent', 'existing-987654'],
    ['link', 'synced']
  ]);
});

test('live export backfills missing links for already sent Pancake exports', async () => {
  const { runOrderLiveExport } = require('../src/integrations/pancake/pancakeOrderExportService');
  const calls = [];
  const syncRepository = {
    backfillSentOrderExportLinks: async (options) => calls.push(['backfill', options.limit])
  };
  const repository = {
    enqueueMissingOrderExports: async () => calls.push(['enqueueMissing']),
    loadOrderExportReadiness: async () => readiness(),
    listQueuedOrderExports: async () => []
  };

  const result = await runOrderLiveExport({
    config: { mode: 'live' },
    client: { createOrder: async () => { throw new Error('should not create'); } },
    repository,
    geoResolver: resolveAddress,
    syncRepository,
    limit: 25
  });

  assert.equal(result.status, 'complete');
  assert.deepEqual(calls, [['backfill', 25], ['enqueueMissing']]);
});

test('live export is blocked unless Pancake mode is live', async () => {
  const { runOrderLiveExport } = require('../src/integrations/pancake/pancakeOrderExportService');
  let called = false;
  const result = await runOrderLiveExport({
    config: { mode: 'shadow' },
    client: { createOrder: async () => { called = true; } },
    repository: {
      loadOrderExportReadiness: async () => readiness(),
      listQueuedOrderExports: async () => [{ orderNumber: 'MCC-1001', order: order() }]
    }
  });

  assert.deepEqual(result, { status: 'blocked', lastErrorCode: 'pancake_mode_not_allowed', summary: { checkedCount: 0, sentCount: 0, blockedCount: 0, failedCount: 0 } });
  assert.equal(called, false);
});

test('live export blocks mapping errors and fails provider errors safely', async () => {
  const { runOrderLiveExport } = require('../src/integrations/pancake/pancakeOrderExportService');
  const calls = [];
  const clientError = new Error('provider down');
  clientError.code = 'pancake_http_error';
  const repository = {
    loadOrderExportReadiness: async () => readiness(),
    listQueuedOrderExports: async () => [
      { orderNumber: 'MCC-1002', order: order({ orderNumber: 'MCC-1002', items: [{ sku: 'MISSING', quantity: 1, unitPriceCents: 50000 }] }) },
      { orderNumber: 'MCC-1003', order: order({ orderNumber: 'MCC-1003' }) }
    ],
    markOrderExportSent: async () => {},
    markOrderExportFailed: async (orderNumber, code) => calls.push(['failed', orderNumber, code]),
    blockOrderExport: async (orderNumber, code) => calls.push(['block', orderNumber, code])
  };
  const client = { createOrder: async () => { throw clientError; } };

  const result = await runOrderLiveExport({
    config: { mode: 'live' }, client, repository, geoResolver: resolveAddress
  });

  assert.deepEqual(result.summary, { checkedCount: 2, sentCount: 0, blockedCount: 1, failedCount: 1 });
  assert.deepEqual(calls, [
    ['block', 'MCC-1002', 'pancake_order_item_mapping_missing'],
    ['failed', 'MCC-1003', 'pancake_http_error']
  ]);
});

test('live export can send one specific queued order for realtime checkout', async () => {
  const { runOrderLiveExport } = require('../src/integrations/pancake/pancakeOrderExportService');
  const calls = [];
  const repository = {
    loadOrderExportReadiness: async () => readiness(),
    loadOrderExportWorkItem: async (orderNumber) => {
      calls.push(['loadOne', orderNumber]);
      return { orderNumber, order: order({ orderNumber }) };
    },
    listQueuedOrderExports: async () => {
      calls.push(['listAll']);
      return [];
    },
    markOrderExportSent: async (record) => calls.push(['sent', record.orderNumber]),
    markOrderExportFailed: async () => {},
    blockOrderExport: async () => {}
  };
  const syncRepository = {
    upsertOrderLink: async (record) => calls.push(['link', record.orderNumber, record.pancakeOrderId])
  };
  const inventoryOutboxRepository = {
    enqueueInventorySync: async (slugs, source) => calls.push(['inventory', slugs, source])
  };
  const client = {
    createOrder: async () => ({ pancakeOrderId: '12345' }),
    getOrder: async () => verifiedProviderOrder(order({ orderNumber: 'MCC-REALTIME' }))
  };

  const result = await runOrderLiveExport({
    config: { mode: 'live' }, client, repository, syncRepository, inventoryOutboxRepository,
    geoResolver: resolveAddress,
    orderNumber: 'MCC-REALTIME'
  });

  assert.deepEqual(result.summary, { checkedCount: 1, sentCount: 1, blockedCount: 0, failedCount: 0 });
  assert.deepEqual(calls, [
    ['loadOne', 'MCC-REALTIME'], ['link', 'MCC-REALTIME', '12345'],
    ['sent', 'MCC-REALTIME'], ['link', 'MCC-REALTIME', '12345'],
    ['inventory', ['shirt'], 'website_order']
  ]);
});

test('live export skips a specific order when no unsent export row exists', async () => {
  const { runOrderLiveExport } = require('../src/integrations/pancake/pancakeOrderExportService');
  const result = await runOrderLiveExport({
    config: { mode: 'live' },
    client: { createOrder: async () => { throw new Error('should not send'); } },
    repository: {
      loadOrderExportReadiness: async () => readiness(),
      loadOrderExportWorkItem: async () => null
    },
    orderNumber: 'MCC-SENT'
  });

  assert.deepEqual(result, { status: 'skipped', reason: 'pancake_order_export_not_queued', summary: { checkedCount: 0, sentCount: 0, blockedCount: 0, failedCount: 0 } });
});

function buildFixturePayload() {
  const { buildPancakeOrderPayload } = require('../src/integrations/pancake/pancakeOrderExportService');
  return buildPancakeOrderPayload(order(), readiness(), addressMapping());
}
