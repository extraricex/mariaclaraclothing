const test = require('node:test');
const assert = require('node:assert/strict');
const { metaConfig } = require('../src/config/env');
const {
  buildMetaPurchaseEvent,
  centavosToMetaPesos,
  metaPurchaseEventId,
  normalizeMetaValue,
  parseMetaCookies,
  purchaseValue,
  sha256
} = require('../src/marketing/metaEvent');

test('Meta CAPI is disabled by default', () => {
  assert.deepEqual(metaConfig({}), { enabled: false });
});

test('Meta CAPI validates enabled configuration', () => {
  assert.throws(
    () => metaConfig({ META_CONVERSIONS_API_ENABLED: 'true' }),
    /META_PIXEL_ID is required/
  );

  assert.deepEqual(metaConfig({
    META_CONVERSIONS_API_ENABLED: 'true',
    META_PIXEL_ID: '595813035761213',
    META_CONVERSIONS_API_ACCESS_TOKEN: 'test-token',
    META_GRAPH_API_VERSION: 'v-test',
    DATABASE_URL: 'postgres://test'
  }), {
    enabled: true,
    pixelId: '595813035761213',
    accessToken: 'test-token',
    graphApiVersion: 'v-test',
    testEventCode: ''
  });
});

test('Meta Purchase uses persisted totals and hashed matching data', () => {
  const order = {
    orderNumber: 'MCC-1',
    placedAt: '2026-06-20T12:00:00.000Z',
    totalCents: 171800,
    customer: {
      email: ' TEST@Example.COM ',
      phone: '0917 123 4567'
    },
    address: { addressLine: 'must not be sent' },
    items: [{
      externalPosVariantId: 'POS-1',
      variantId: 'V-1',
      quantity: 2,
      unitPriceCents: 79900
    }]
  };

  const event = buildMetaPurchaseEvent({
    order,
    requestContext: {
      sourceUrl: 'https://mariaclara.example/checkout',
      clientIp: '203.0.113.8',
      clientUserAgent: 'Test Browser',
      fbp: 'fb.1.123.456',
      fbc: 'fb.1.123.click'
    }
  });

  assert.equal(event.event_name, 'Purchase');
  assert.equal(event.event_id, 'purchase_MCC-1');
  assert.equal(event.event_time, 1781956800);
  assert.equal(event.custom_data.currency, 'PHP');
  assert.equal(event.custom_data.value, 1718);
  assert.deepEqual(event.custom_data.content_ids, ['POS-1']);
  assert.equal(event.custom_data.num_items, 2);
  assert.deepEqual(event.user_data.em, [sha256('test@example.com')]);
  assert.deepEqual(event.user_data.ph, [sha256('639171234567')]);
  assert.equal(JSON.stringify(event).includes('must not be sent'), false);
});

test('Meta Purchase rejects invalid stored totals without constructing an event', () => {
  const base = {
    orderNumber: 'MCC-invalid', placedAt: '2026-06-20T12:00:00.000Z', customer: {},
    items: [{ sku: 'SKU-1', quantity: 1, unitPriceCents: 64900 }]
  };
  for (const totalCents of [undefined, null, 0, -1, NaN, 'PHP 1278', '₱1,278', 12.5]) {
    assert.equal(buildMetaPurchaseEvent({ order: { ...base, totalCents } }), null);
  }
  assert.equal(purchaseValue(127800), 1278);
  assert.equal(metaPurchaseEventId({ orderNumber: 'MCC-1' }), 'purchase_MCC-1');
  assert.equal(metaPurchaseEventId({ id: 'db-id', orderNumber: 'MCC-1' }), 'purchase_MCC-1');
});

test('Meta value normalization distinguishes peso values from stored centavos', () => {
  assert.equal(normalizeMetaValue('₱1,298.00'), 1298);
  assert.equal(normalizeMetaValue(649), 649);
  assert.equal(centavosToMetaPesos(64900), 649);
  assert.equal(centavosToMetaPesos('129800'), 1298);
  for (const invalid of [undefined, null, '', 0, -1, 12.5, '₱64,900', 'PHP 64900']) {
    assert.equal(centavosToMetaPesos(invalid), null);
  }
});

test('Meta Purchase rejects missing IDs, invalid quantities, and invalid item prices', () => {
  const base = {
    orderNumber: 'MCC-LINES', placedAt: '2026-06-20T12:00:00.000Z', totalCents: 64900, customer: {}
  };
  for (const item of [
    { quantity: 1, unitPriceCents: 64900 },
    { sku: 'SKU-1', quantity: 0, unitPriceCents: 64900 },
    { sku: 'SKU-1', quantity: 'one', unitPriceCents: 64900 },
    { sku: 'SKU-1', quantity: 1, unitPriceCents: 0 },
    { sku: 'SKU-1', quantity: 1, unitPriceCents: 'PHP 649' }
  ]) {
    assert.equal(buildMetaPurchaseEvent({ order: { ...base, items: [item] } }), null);
  }
});

test('Meta Purchase omits empty optional matching values', () => {
  const event = buildMetaPurchaseEvent({
    order: {
      orderNumber: 'MCC-2',
      placedAt: '2026-06-20T12:00:00.000Z',
      totalCents: 79900,
      customer: {},
      items: [{ variantId: 'V-2', quantity: 1, unitPriceCents: 79900 }]
    },
    requestContext: {}
  });
  assert.deepEqual(event.user_data, {});
});

test('Meta Purchase uses the stored grand total for quantities, discount, and shipping without recalculating it', () => {
  const event = buildMetaPurchaseEvent({
    order: {
      orderNumber: 'MCC-EXACT',
      subtotalCents: 129800,
      discountTotalCents: 10000,
      shippingFeeCents: 8000,
      totalCents: 127800,
      paymentMethod: 'cash_on_delivery',
      placedAt: '2026-07-15T01:00:00.000Z',
      items: [
        { productId: 'catalog-one', variantId: 'variant-one', quantity: 1, unitPriceCents: 64900 },
        { productId: 'catalog-two', sku: 'SKU-TWO', quantity: 2, unitPriceCents: 32450 }
      ],
      customer: {}
    }
  });
  assert.equal(event.custom_data.value, 1278);
  assert.equal(event.custom_data.currency, 'PHP');
  assert.equal(event.custom_data.num_items, 3);
  assert.deepEqual(event.custom_data.content_ids, ['variant-one', 'SKU-TWO']);
  assert.deepEqual(event.custom_data.contents, [
    { id: 'variant-one', quantity: 1, item_price: 649 },
    { id: 'SKU-TWO', quantity: 2, item_price: 324.5 }
  ]);
});

test('PayMongo Purchase event time is the confirmed paid time', () => {
  const event = buildMetaPurchaseEvent({
    order: {
      orderNumber: 'MCC-PAID', totalCents: 127800, paymentMethod: 'paymongo',
      placedAt: '2026-07-14T01:00:00.000Z', paidAt: '2026-07-15T03:04:05.000Z',
      items: [{ sku: 'SKU-1', quantity: 1, unitPriceCents: 127800 }], customer: {}
    }
  });
  assert.equal(event.event_time, Math.floor(new Date('2026-07-15T03:04:05.000Z').getTime() / 1000));
});

test('Meta browser cookies are parsed and length-limited', () => {
  assert.deepEqual(parseMetaCookies('_fbp=fb.1.123.456; _fbc=fb.1.123.click; other=value'), {
    fbp: 'fb.1.123.456',
    fbc: 'fb.1.123.click'
  });
  assert.deepEqual(parseMetaCookies(''), { fbp: '', fbc: '' });
});
