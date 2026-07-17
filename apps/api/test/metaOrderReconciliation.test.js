const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchLivePancakeOrders,
  metaOrderReconciliation,
  mergeLivePancakeRows,
  pancakePayableCents,
  reconcileOrder,
  reconciliationDateRange,
  safeDate,
  summarize
} = require('../src/analytics/metaOrderReconciliationService');
const {
  cachedPancakePayableCents
} = require('../src/analytics/metaOrderReconciliationRepository');

function validOrder(overrides = {}) {
  const orderNumber = overrides.orderNumber || 'MCC-RECON-1';
  const eventId = `purchase_${orderNumber}`;
  return {
    recordType: 'website_order',
    orderNumber,
    customerDisplayName: 'Juan Dela Cruz',
    customer: { firstName: 'Juan', lastName: 'Dela Cruz', phone: '09171234567' },
    address: { houseAddress: '123 Sample Street', barangay: 'Bucandala IV', city: 'Imus City', province: 'Cavite' },
    items: [{ productId: 'product-a', variantId: 'variant-a', sku: 'A-S', quantity: 2, unitPriceCents: 64900 }],
    placedAt: '2026-07-17T01:00:00.000Z',
    paidAt: '',
    paymentMethod: 'cash_on_delivery',
    paymentProvider: '',
    paymentStatus: 'cod_pending',
    status: 'received',
    inventoryReservationStatus: 'committed',
    checkoutChannel: 'storefront_checkout',
    isTestOrder: false,
    totalCents: 127800,
    paidAmountCents: null,
    currency: 'PHP',
    metaPurchaseTrackingVersion: 2,
    metaPurchaseEventId: eventId,
    metaPurchaseValue: 1278,
    metaPurchaseCurrency: 'PHP',
    metaPurchaseStatus: 'complete',
    metaPurchaseLastError: '',
    metaBrowserPurchaseSentAt: '2026-07-17T01:00:02.000Z',
    metaCapiPurchaseQueuedAt: '2026-07-17T01:00:01.000Z',
    metaCapiPurchaseSentAt: '2026-07-17T01:00:03.000Z',
    outboxEvents: [{ eventId, status: 'sent', attemptCount: 1, value: 1278, currency: 'PHP', sentAt: '2026-07-17T01:00:03.000Z' }],
    dispatchEvents: [
      { eventId, source: 'browser', status: 'sent', attemptCount: 1, value: 1278, currency: 'PHP', sentAt: '2026-07-17T01:00:02.000Z' },
      { eventId, source: 'server', status: 'sent', attemptCount: 1, value: 1278, currency: 'PHP', sentAt: '2026-07-17T01:00:03.000Z' }
    ],
    pancakeLinkCount: 1,
    pancakeOrderId: 'PNK-1',
    pancakeSyncStatus: 'synced',
    pancakeSafeErrorCode: '',
    pancakeExportStatus: 'sent',
    pancakeExportAttemptCount: 1,
    pancakeExportSafeErrorCode: '',
    pancakeTotalCents: 129800,
    pancakePayableCents: 127800,
    ...overrides
  };
}

test('Asia/Manila calendar dates become exact half-open UTC bounds', () => {
  const range = reconciliationDateRange({
    start: '2026-07-17', end: '2026-07-17', timezone: 'Asia/Manila'
  });
  assert.equal(range.startUtc, '2026-07-16T16:00:00.000Z');
  assert.equal(range.endExclusiveUtc, '2026-07-17T16:00:00.000Z');
  assert.equal(range.dayCount, 1);
  assert.throws(
    () => reconciliationDateRange({ start: '2026-07-17', end: '2026-07-17', timezone: 'UTC' }),
    /Asia\/Manila/
  );
});

test('Pancake timezone-less timestamps are interpreted as UTC independent of the server host zone', () => {
  assert.equal(safeDate('2026-07-17T04:59:45.829714'), '2026-07-17T04:59:45.829Z');
  assert.equal(safeDate('1784264385'), '2026-07-17T04:59:45.000Z');
});

test('a valid website order, one Pancake payable, and one shared Meta ID reconcile as correct', () => {
  const row = reconcileOrder(validOrder());
  assert.equal(row.reconciliationStatus, 'correct');
  assert.equal(row.browserServerEventIdMatch, true);
  assert.equal(row.expectedCountedPurchases, 1);
  assert.equal(row.metaValueCents, 127800);
  assert.equal(row.pancakePayableCents, 127800);
  assert.deepEqual(row.warnings, []);
  assert.equal(Object.hasOwn(row, 'customer'), false);
  assert.equal(Object.hasOwn(row, 'address'), false);
});

test('reconciliation identifies duplicate server rows, event ID mismatch, value, currency, and missing Pancake', () => {
  const order = validOrder({
    pancakeOrderId: '',
    pancakeLinkCount: 0,
    metaPurchaseCurrency: '',
    outboxEvents: [
      { eventId: 'server-one', status: 'sent', attemptCount: 1, value: 100, currency: '', sentAt: '2026-07-17T01:00:03.000Z' },
      { eventId: 'server-two', status: 'sent', attemptCount: 1, value: 100, currency: '', sentAt: '2026-07-17T01:00:04.000Z' }
    ],
    dispatchEvents: []
  });
  const result = reconcileOrder(order);
  assert.equal(result.reconciliationStatus, 'duplicate_server_event');
  assert.ok(result.warnings.includes('duplicate_server_event'));
  assert.ok(result.warnings.includes('event_id_mismatch'));
  assert.ok(result.warnings.includes('value_mismatch'));
  assert.ok(result.warnings.includes('currency_missing_or_invalid'));
  assert.ok(result.warnings.includes('missing_pancake_order'));
});

test('test orders never become eligible Purchase orders', () => {
  const result = reconcileOrder(validOrder({ isTestOrder: true }));
  assert.equal(result.eligibleForPurchase, false);
  assert.equal(result.eligibilityReason, 'test_order');
  assert.equal(result.reconciliationStatus, 'purchase_sent_when_ineligible');
  assert.ok(result.warnings.includes('purchase_sent_when_ineligible'));
  assert.equal(result.expectedCountedPurchases, 0);
});

test('an ineligible order without a dispatched Purchase remains informational', () => {
  const result = reconcileOrder(validOrder({
    isTestOrder: true,
    metaBrowserPurchaseSentAt: '',
    metaCapiPurchaseSentAt: '',
    outboxEvents: [],
    dispatchEvents: []
  }));
  assert.equal(result.reconciliationStatus, 'not_eligible_for_purchase');
  assert.equal(result.warnings.includes('purchase_sent_when_ineligible'), false);
});

test('Pancake payable uses COD or prepaid amount and includes shipping exactly once', () => {
  assert.equal(pancakePayableCents({ cod: 839 }, {
    codAmountCents: 83900, subtotalCents: 64900, discountTotalCents: 0, shippingFeeCents: 19000, totalCents: 64900
  }), 83900);
  assert.equal(pancakePayableCents({ transfer_money: 769, cod: 0 }, {
    codAmountCents: 0, subtotalCents: 64900, discountTotalCents: 0, shippingFeeCents: 12000, totalCents: 64900
  }), 76900);
  assert.equal(pancakePayableCents({}, {
    codAmountCents: 0, subtotalCents: 129800, discountTotalCents: 10000, shippingFeeCents: 8000, totalCents: 129800
  }), 127800);
  assert.equal(cachedPancakePayableCents({
    prepaidAmountCents: 76900, codAmountCents: 0, subtotalCents: 64900,
    discountTotalCents: 0, shippingFeeCents: 12000, totalCents: 64900
  }, 'paymongo'), 76900);
  assert.equal(cachedPancakePayableCents({
    codAmountCents: 0, subtotalCents: 64900,
    discountTotalCents: 0, shippingFeeCents: 12000, totalCents: 64900
  }, 'paymongo'), 76900);
});

test('live Pancake read paginates without mutation and filters the exact created period', async () => {
  const calls = [];
  const pages = [
    {
      total_pages: 2, total_entries: 3,
      data: [{
        id: 'PNK-1', custom_id: 'MCC-RECON-1', inserted_at: '2026-07-17T01:00:00.000Z',
        total_price: 649, shipping_fee: 190, cod: 839, status: 0,
        items: [{ variation_id: 'v1', quantity: 1, price: 649 }]
      }]
    },
    {
      total_pages: 2, total_entries: 3,
      data: [
        { id: 'PNK-2', custom_id: 'MCC-OTHER', inserted_at: '2026-07-17T03:00:00.000Z', transfer_money: 769, total_price: 649, shipping_fee: 120, status: 0, items: [{ variation_id: 'v2', quantity: 1, price: 649 }] },
        { id: 'PNK-OLD', custom_id: 'MCC-OLD', inserted_at: '2026-07-16T12:00:00.000Z', total_price: 649, cod: 649, status: 0, items: [] }
      ]
    }
  ];
  const client = { listOrders: async (_shopId, options) => { calls.push(options); return pages[options.pageNumber - 1]; } };
  const result = await fetchLivePancakeOrders({
    config: { configured: true, shopId: 'shop-1', orderPollPageSize: 100 },
    client,
    startUtc: '2026-07-16T16:00:00.000Z',
    endExclusiveUtc: '2026-07-17T16:00:00.000Z'
  });
  assert.equal(result.complete, true);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].payableCents, 83900);
  assert.equal(result.rows[1].payableCents, 76900);
  assert.deepEqual(calls, [{ pageNumber: 1, pageSize: 100 }, { pageNumber: 2, pageSize: 100 }]);
});

test('live Pancake comparison fails closed when a provider row has no creation timestamp', async () => {
  const result = await fetchLivePancakeOrders({
    config: { configured: true, shopId: 'shop-1', orderPollPageSize: 100 },
    client: {
      listOrders: async () => ({
        total_pages: 1,
        total_entries: 1,
        data: [{ id: 'PNK-NO-CREATED', updated_at: '2026-07-17T01:00:00.000Z', cod: 649 }]
      })
    },
    startUtc: '2026-07-16T16:00:00.000Z',
    endExclusiveUtc: '2026-07-17T16:00:00.000Z'
  });
  assert.equal(result.complete, false);
  assert.equal(result.providerListComplete, false);
  assert.equal(result.errorCode, 'pancake_created_at_missing');
  assert.equal(result.unresolvedCreatedAtCount, 1);
  assert.equal(result.providerPeriodOrderCount, null);
});

test('linked website orders use bounded read-only Pancake detail payloads for final payable totals', async () => {
  const calls = [];
  const client = {
    listOrders: async () => ({ data: [], total_pages: 1, total_entries: 0 }),
    getOrder: async (shopId, pancakeOrderId) => {
      calls.push([shopId, pancakeOrderId]);
      return {
        id: pancakeOrderId,
        custom_id: 'MCC-RECON-1',
        inserted_at: '2026-07-17T04:59:45.829714',
        total_price: 649,
        shipping_fee: 120,
        cod: 769,
        status: 0,
        items: [{ variation_id: 'v1', quantity: 1, price: 649 }]
      };
    }
  };
  const result = await fetchLivePancakeOrders({
    config: { configured: true, shopId: 'shop-1', orderPollPageSize: 100 },
    client,
    websiteRows: [validOrder({ pancakeOrderId: 'PNK-1', placedAt: '2026-07-17T04:59:45.829Z' })],
    startUtc: '2026-07-16T16:00:00.000Z',
    endExclusiveUtc: '2026-07-17T16:00:00.000Z'
  });
  assert.equal(result.complete, true);
  assert.equal(result.linkedDetailCount, 1);
  assert.equal(result.rows[0].source, 'detail');
  assert.equal(result.rows[0].payableCents, 76900);
  assert.deepEqual(calls, [['shop-1', 'PNK-1']]);
});

test('live Pancake rows merge by order reference and surface provider-only orders without PII', () => {
  const merged = mergeLivePancakeRows([validOrder({ pancakeOrderId: '' })], {
    complete: true,
    rows: [
      { pancakeOrderId: 'PNK-1', orderNumber: 'MCC-RECON-1', createdAt: '2026-07-17T01:00:00.000Z', totalCents: 64900, payableCents: 127800 },
      { pancakeOrderId: 'PNK-ONLY', orderNumber: 'POS-1', createdAt: '2026-07-17T02:00:00.000Z', totalCents: 50000, payableCents: 50000, paymentMethod: 'cash_on_delivery', paymentStatus: 'cod_pending', status: 'received' }
    ]
  });
  assert.equal(merged[0].pancakeOrderId, 'PNK-1');
  assert.equal(merged[0].pancakePayableCents, 127800);
  assert.equal(merged[1].recordType, 'pancake_only');
  assert.equal(Object.hasOwn(merged[1], 'phone'), false);
  const rows = merged.map(reconcileOrder);
  const summary = summarize(rows);
  assert.equal(summary.totalWebsiteOrders, 1);
  assert.equal(summary.pancakeOrders, 2);
  assert.equal(summary.pancakeOrdersMissingWebsite, 1);
});

test('live Pancake comparison preserves and flags two provider orders for one website order', () => {
  const merged = mergeLivePancakeRows([
    validOrder({ pancakeOrderId: '', pancakeOrderIds: [], pancakeLinkCount: 0 })
  ], {
    complete: true,
    providerListComplete: true,
    rows: [
      { pancakeOrderId: 'PNK-DUP-1', orderNumber: 'MCC-RECON-1', createdAt: '2026-07-17T01:00:00.000Z', totalCents: 127800, payableCents: 127800 },
      { pancakeOrderId: 'PNK-DUP-2', orderNumber: 'MCC-RECON-1', createdAt: '2026-07-17T01:01:00.000Z', totalCents: 127800, payableCents: 127800 }
    ]
  });
  const row = reconcileOrder(merged[0]);
  assert.deepEqual(row.pancakeOrderIds, ['PNK-DUP-1', 'PNK-DUP-2']);
  assert.equal(row.reconciliationStatus, 'duplicate_pancake_order');
  assert.ok(row.warnings.includes('duplicate_pancake_order'));
  assert.equal(summarize([row]).pancakeOrders, 2);
});

test('service reports external Meta limitations and never treats a failed live Pancake read as complete', async () => {
  const result = await metaOrderReconciliation(
    { start: '2026-07-17', end: '2026-07-17', timezone: 'Asia/Manila' },
    {
      listRows: async () => [validOrder()],
      pancakeConfig: { configured: true, shopId: 'shop-1' },
      fetchLivePancakeOrders: async () => ({
        available: false, complete: false, status: 'failed', errorCode: 'pancake_timeout',
        fetchedAt: '2026-07-17T04:00:00.000Z', providerTotalEntries: null, rows: []
      })
    }
  );
  assert.equal(result.livePancake.complete, false);
  assert.equal(result.dataAvailability.pancakeLiveCompleteness.available, false);
  assert.match(result.dataAvailability.pancakeLiveCompleteness.reason, /must not be treated as the complete/);
  assert.equal(result.dataAvailability.metaAdsAttributedPurchases.available, false);
  assert.match(result.dataAvailability.metaAdsAttributedPurchases.reason, /ads_read/);
});

test('Meta reconciliation HTTP endpoint is admin-only', async () => {
  const { createApp } = require('../src/app');
  const server = await new Promise((resolve, reject) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/analytics/meta-reconciliation?start=2026-07-17&end=2026-07-17&timezone=Asia%2FManila`);
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
