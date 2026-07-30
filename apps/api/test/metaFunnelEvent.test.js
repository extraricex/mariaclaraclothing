const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addHashedCustomerData,
  buildMetaFunnelEvent,
  isLikelyBot,
  safeSourceUrl
} = require('../src/marketing/metaFunnelEvent');
const { sha256 } = require('../src/marketing/metaEvent');

function assertMetaPii(actual, normalizedValue) {
  assert.match(actual?.[0] || '', new RegExp(`^${sha256(normalizedValue)}\\.[a-zA-Z0-9]{8}$`));
}

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

test('funnel CAPI accepts validated browser identifiers when the request cookie is not ready', () => {
  const event = buildMetaFunnelEvent({
    eventId: 'viewcontent_click_1', metaEventId: 'viewcontent_click_1',
    metaEventName: 'ViewContent', metaBrowserSent: true, metaCustomData: customData,
    metaFbp: 'fb.1.1785332985000.browser', metaFbc: 'fb.1.1785332985000.MetaClick_ABC-123'
  }, analyticsEvent({
    eventId: 'viewcontent_click_1', eventName: 'product_view'
  }), {
    clientIp: '203.0.113.10', userAgent: 'Mozilla/5.0',
    cookieHeader: '', siteUrl: 'https://mariaclaraclothing.com'
  });

  assert.equal(event.user_data.fbp, 'fb.1.1785332985000.browser');
  assert.equal(event.user_data.fbc, 'fb.1.1785332985000.MetaClick_ABC-123');
});

test('funnel CAPI prefers official builder values and preserves its URL metadata', () => {
  const event = buildMetaFunnelEvent({
    eventId: 'viewcontent_builder_1', metaEventId: 'viewcontent_builder_1',
    metaEventName: 'ViewContent', metaBrowserSent: true, metaCustomData: customData,
    metaFbp: 'fb.1.1.browser-fallback', metaFbc: 'fb.1.1.click-fallback'
  }, analyticsEvent({
    eventId: 'viewcontent_builder_1', eventName: 'product_view'
  }), {
    clientIp: '203.0.113.10', userAgent: 'Mozilla/5.0',
    cookieHeader: '_fbp=fb.1.2.cookie-fallback',
    siteUrl: 'https://mariaclaraclothing.com',
    parameterBuilder: {
      clientIpAddress: '2001:db8::1.AQQAAQMB',
      fbp: 'fb.1.1785332985000.browser.AQQAAQMB',
      fbc: 'fb.1.1785332985000.MetaClick_ABC-123.AQQAAQMB',
      eventSourceUrl: 'https://mariaclaraclothing.com/product/mandala?utm_source=meta.AQQCAQMB',
      referrerUrl: 'https://www.facebook.com/ad?campaign=summer.AQQAAQMB'
    }
  });

  assert.equal(event.user_data.client_ip_address, '2001:db8::1.AQQAAQMB');
  assert.equal(event.user_data.fbp, 'fb.1.1785332985000.browser.AQQAAQMB');
  assert.equal(event.user_data.fbc, 'fb.1.1785332985000.MetaClick_ABC-123.AQQAAQMB');
  assert.equal(event.event_source_url, 'https://mariaclaraclothing.com/product/mandala?utm_source=meta.AQQCAQMB');
  assert.equal(event.referrer_url, 'https://www.facebook.com/ad?campaign=summer.AQQAAQMB');
  assert.equal(event.event_id, 'viewcontent_builder_1');
});

test('funnel CAPI prefers valid request cookies and rejects malformed browser identifiers', () => {
  const event = buildMetaFunnelEvent({
    eventId: 'viewcontent_cookie_1', metaEventId: 'viewcontent_cookie_1',
    metaEventName: 'ViewContent', metaBrowserSent: true, metaCustomData: customData,
    metaFbp: 'not-an-fbp', metaFbc: '<script>alert(1)</script>'
  }, analyticsEvent({
    eventId: 'viewcontent_cookie_1', eventName: 'product_view'
  }), {
    userAgent: 'Mozilla/5.0', cookieHeader: '_fbp=fb.1.123.cookie',
    siteUrl: 'https://mariaclaraclothing.com'
  });

  assert.equal(event.user_data.fbp, 'fb.1.123.cookie');
  assert.equal(event.user_data.fbc, undefined);
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

  assertMetaPii(event.user_data.em, 'buyer@example.com');
  assertMetaPii(event.user_data.ph, '639171234567');
  assertMetaPii(event.user_data.external_id, 'customerabc123');
  assertMetaPii(event.user_data.fn, 'maria');
  assertMetaPii(event.user_data.ln, 'delacruz');
  assertMetaPii(event.user_data.ct, 'imuscity');
  assertMetaPii(event.user_data.st, 'cavite');
  assertMetaPii(event.user_data.zp, '4103');
  assertMetaPii(event.user_data.country, 'ph');
  const serialized = JSON.stringify(event);
  for (const raw of ['buyer@example.com', '0917 123 4567', 'María', 'Dela Cruz']) {
    assert.equal(serialized.toLowerCase().includes(raw.toLowerCase()), false);
  }
});

test('empty customer matching values are omitted instead of sent as empty strings', () => {
  assert.deepEqual(addHashedCustomerData({}, { email: '', phone: '', id: '' }), {});
  assert.deepEqual(addHashedCustomerData({}, null), {});
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
