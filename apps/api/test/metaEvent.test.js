const test = require('node:test');
const assert = require('node:assert/strict');
const { metaConfig } = require('../src/config/env');
const { buildMetaPurchaseEvent, sha256 } = require('../src/marketing/metaEvent');

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
  assert.equal(event.event_id, 'purchase:MCC-1');
  assert.equal(event.event_time, 1781956800);
  assert.equal(event.custom_data.currency, 'PHP');
  assert.equal(event.custom_data.value, 1718);
  assert.deepEqual(event.custom_data.content_ids, ['POS-1']);
  assert.deepEqual(event.user_data.em, [sha256('test@example.com')]);
  assert.deepEqual(event.user_data.ph, [sha256('639171234567')]);
  assert.equal(JSON.stringify(event).includes('must not be sent'), false);
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
