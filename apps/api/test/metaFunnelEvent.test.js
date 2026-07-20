const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addHashedCustomerData,
  buildMetaFunnelEvent,
  isLikelyBot,
  safeSourceUrl
} = require('../src/marketing/metaFunnelEvent');
const { sha256 } = require('../src/marketing/metaEvent');

function analyticsEvent(overrides = {}) {
  return {
    eventId: 'addtocart_action_1', eventName: 'add_to_cart', path: '/product/mandala?utm_source=meta',
    valueCents: 129800, ...overrides
  };
}

const customData = {
  content_ids: ['SKU-1'], content_type: 'product',
  contents: [{ id: 'SKU-1', quantity: 2, item_price: 649 }],
  currency: 'PHP', num_items: 2, value: 1298
};

test('funnel CAPI event reuses the exact browser event identity and sanitized PHP payload', () => {
  const event = buildMetaFunnelEvent({
    eventId: 'addtocart_action_1', metaEventId: 'addtocart_action_1',
    metaEventName: 'AddToCart', metaBrowserSent: true, metaCustomData: customData
  }, analyticsEvent(), {
    clientIp: '203.0.113.10', userAgent: 'Mozilla/5.0',
    cookieHeader: '_fbp=fb.1.123.456; _fbc=fb.1.123.click', siteUrl: 'https://mariaclaraclothing.com'
  });
  assert.equal(event.event_name, 'AddToCart');
  assert.equal(event.event_id, 'addtocart_action_1');
  assert.equal(event.custom_data.value, 1298);
  assert.equal(event.custom_data.currency, 'PHP');
  assert.equal(event.event_source_url, 'https://mariaclaraclothing.com/product/mandala');
  assert.equal(event.user_data.fbp, 'fb.1.123.456');
  assert.equal(event.user_data.fbc, 'fb.1.123.click');
});

test('PageView CAPI is one real browser navigation and strips private query data', () => {
  const event = buildMetaFunnelEvent({
    eventId: 'pageview_route_1', metaEventId: 'pageview_route_1',
    metaEventName: 'PageView', metaBrowserSent: true
  }, analyticsEvent({ eventId: 'pageview_route_1', eventName: 'page_view', path: '/shop?token=private' }), {
    userAgent: 'Mozilla/5.0', siteUrl: 'https://mariaclaraclothing.com'
  });
  assert.equal(event.event_name, 'PageView');
  assert.equal(event.event_id, 'pageview_route_1');
  assert.equal(event.event_source_url, 'https://mariaclaraclothing.com/shop');
  assert.equal(event.custom_data, undefined);
});

test('funnel CAPI hashes authenticated customer matching data without storing raw PII', () => {
  const event = buildMetaFunnelEvent({
    eventId: 'viewcontent_customer_1', metaEventId: 'viewcontent_customer_1',
    metaEventName: 'ViewContent', metaBrowserSent: true, metaCustomData: customData
  }, analyticsEvent({ eventId: 'viewcontent_customer_1', eventName: 'product_view' }), {
    userAgent: 'Mozilla/5.0', siteUrl: 'https://mariaclaraclothing.com',
    customer: {
      id: 'Customer-ABC-123', email: ' Buyer@Example.COM ', phone: '0917 123 4567',
      firstName: 'María', lastName: 'Dela Cruz',
      savedAddress: { cityName: 'Imus City', provinceName: 'Cavite', postalCode: '4103' }
    }
  });

  assert.deepEqual(event.user_data.em, [sha256('buyer@example.com')]);
  assert.deepEqual(event.user_data.ph, [sha256('639171234567')]);
  assert.deepEqual(event.user_data.external_id, [sha256('customerabc123')]);
  assert.deepEqual(event.user_data.fn, [sha256('maria')]);
  assert.deepEqual(event.user_data.ln, [sha256('delacruz')]);
  assert.deepEqual(event.user_data.ct, [sha256('imuscity')]);
  assert.deepEqual(event.user_data.st, [sha256('cavite')]);
  assert.deepEqual(event.user_data.zp, [sha256('4103')]);
  assert.deepEqual(event.user_data.country, [sha256('ph')]);
  const serialized = JSON.stringify(event);
  for (const raw of ['buyer@example.com', '0917 123 4567', 'María', 'Dela Cruz']) {
    assert.equal(serialized.toLowerCase().includes(raw.toLowerCase()), false);
  }
});

test('empty customer matching values are omitted instead of sent as empty strings', () => {
  assert.deepEqual(addHashedCustomerData({}, { email: '', phone: '', id: '' }), {});
});

test('funnel CAPI rejects ID mismatches, malformed values, unpaired browser events, and bots', () => {
  const request = { userAgent: 'Mozilla/5.0', siteUrl: 'https://mariaclaraclothing.com' };
  const base = {
    eventId: 'addtocart_action_1', metaEventId: 'addtocart_action_1',
    metaEventName: 'AddToCart', metaBrowserSent: true, metaCustomData: customData
  };
  assert.equal(buildMetaFunnelEvent({ ...base, metaEventId: 'different' }, analyticsEvent(), request), null);
  assert.equal(buildMetaFunnelEvent({ ...base, metaBrowserSent: false }, analyticsEvent(), request), null);
  assert.equal(buildMetaFunnelEvent({ ...base, metaCustomData: { ...customData, value: '1298' } }, analyticsEvent(), request), null);
  assert.equal(buildMetaFunnelEvent(base, analyticsEvent(), { ...request, userAgent: 'Googlebot' }), null);
  assert.equal(isLikelyBot('Lighthouse healthcheck'), true);
  assert.equal(safeSourceUrl('/cart?restore=secret', 'https://mariaclaraclothing.com'), 'https://mariaclaraclothing.com/cart');
});
