const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-analytics-'));
process.env.ANALYTICS_DATA_FILE = path.join(directory, 'analytics.json');
process.env.ORDERS_DATA_FILE = path.join(directory, 'orders.json');
process.env.PRODUCTS_DATA_FILE = path.join(directory, 'products.json');
fs.copyFileSync(path.join(__dirname, '..', 'data', 'products.json'), process.env.PRODUCTS_DATA_FILE);

const placedAt = new Date().toISOString();
fs.writeFileSync(process.env.ORDERS_DATA_FILE, JSON.stringify({
  orders: [
    {
      orderNumber: 'REAL-1', placedAt, status: 'confirmed', paymentMethod: 'cash_on_delivery', paymentStatus: 'cod_pending', totalCents: 127800,
      channel: 'Online Store', checkoutChannel: 'storefront_checkout',
      items: [{ productId: 'product-a', productName: 'Product A', quantity: 2, unitPriceCents: 64900 }], isTestOrder: false
    },
    {
      orderNumber: 'CANCELLED-1', placedAt, status: 'cancelled', paymentMethod: 'cash_on_delivery', paymentStatus: 'cancelled', totalCents: 64900,
      channel: 'Online Store', checkoutChannel: 'storefront_checkout',
      cancellationReason: 'customer_requested', items: [], isTestOrder: false
    },
    {
      orderNumber: 'TEST-1', placedAt, status: 'confirmed', paymentMethod: 'cash_on_delivery', paymentStatus: 'cod_pending', totalCents: 999900,
      channel: 'Online Store', checkoutChannel: 'storefront_checkout',
      items: [{ productId: 'product-a', productName: 'Product A', quantity: 10, unitPriceCents: 99990 }], isTestOrder: true
    },
    {
      orderNumber: 'PANCAKE-1', placedAt, status: 'delivered', paymentMethod: 'cash_on_delivery', paymentStatus: 'cod_pending', totalCents: 500000,
      channel: 'Pancake POS', checkoutChannel: 'pancake_pos',
      items: [{ productId: 'product-a', productName: 'Product A', quantity: 5, unitPriceCents: 100000 }], isTestOrder: false
    }
  ], statusEvents: [], trackingNotifications: []
}));

const { createApp } = require('../src/app');
const {
  listAnalyticsEvents,
  normalizeEvent,
  recordAnalyticsEvent,
  resolveCheckoutIssueCategory
} = require('../src/analytics/storefrontAnalyticsRepository');
const {
  analyticsDateWindow,
  checkoutIssuesSummary,
  percentile,
  productContentReadiness,
  storefrontAnalyticsSummary
} = require('../src/analytics/storefrontAnalyticsService');

const event = (eventId, eventName, extra = {}) => ({
  eventId, eventName, sessionId: 'session_12345678', path: '/shop', ...extra
});

test('analytics records an anonymous hashed session and deduplicates event IDs', async () => {
  const first = await recordAnalyticsEvent(event('event_12345678', 'page_view'), { userAgent: 'Mozilla/5.0 (iPhone; Mobile)' });
  const duplicate = await recordAnalyticsEvent(event('event_12345678', 'page_view'), { userAgent: 'Mozilla/5.0 (iPhone; Mobile)' });
  const records = await listAnalyticsEvents({ since: new Date(Date.now() - 1000) });
  assert.equal(first.recorded, true);
  assert.equal(duplicate.recorded, false);
  assert.equal(records.length, 1);
  assert.equal(records[0].deviceType, 'mobile');
  assert.notEqual(records[0].sessionHash, 'session_12345678');
  assert.equal(Object.hasOwn(records[0], 'email'), false);
});

test('concurrent JSON fallback events remain valid and complete', async () => {
  await Promise.all(Array.from({ length: 30 }, (_, index) => recordAnalyticsEvent({
    ...event(`event_concurrent_${String(index).padStart(3, '0')}`, 'page_view'),
    sessionId: `session_concurrent_${String(index).padStart(3, '0')}`
  })));
  const parsed = JSON.parse(fs.readFileSync(process.env.ANALYTICS_DATA_FILE, 'utf8'));
  assert.equal(parsed.events.filter((item) => item.eventId.startsWith('event_concurrent_')).length, 30);
});

test('checkout failures retain only sanitized operational context', () => {
  const normalized = normalizeEvent(event('event_checkout_failure', 'checkout_error', {
    checkoutStep: 'information',
    errorCategory: 'Missing Province',
    errorMessage: 'Send to maria@example.com or +63 917 123 4567 at https://private.example/path',
    reference: 'cart-customer-reference'
  }), { userAgent: 'Mozilla/5.0 FBAN/FBIOS Mobile' });
  assert.equal(normalized.checkoutStep, 'information');
  assert.equal(normalized.errorCategory, 'missing_province');
  assert.equal(normalized.browserCategory, 'facebook');
  assert.equal(normalized.errorMessage.includes('maria@example.com'), false);
  assert.equal(normalized.errorMessage.includes('917 123 4567'), false);
  assert.equal(normalized.errorMessage.includes('private.example'), false);
  assert.notEqual(normalized.referenceHash, 'cart-customer-reference');
});

test('checkout issue categories can be resolved and reopen when requested', async () => {
  await recordAnalyticsEvent(event('event_checkout_issue', 'checkout_error', {
    checkoutStep: 'information',
    errorCategory: 'missing_province',
    errorMessage: 'Province is required.'
  }));
  let summary = await checkoutIssuesSummary({ days: 30 });
  assert.equal(summary.issues.find((issue) => issue.category === 'missing_province').resolved, false);
  await resolveCheckoutIssueCategory('missing_province', true);
  summary = await checkoutIssuesSummary({ days: 30 });
  assert.equal(summary.issues.find((issue) => issue.category === 'missing_province').resolved, true);
  await resolveCheckoutIssueCategory('missing_province', false);
  summary = await checkoutIssuesSummary({ days: 30 });
  assert.equal(summary.issues.find((issue) => issue.category === 'missing_province').resolved, false);
});

test('analytics summary excludes cancelled and marked test orders from revenue', async () => {
  await recordAnalyticsEvent({ ...event('event_page_1', 'page_view'), sessionId: 'session_exit_111', path: '/shop' });
  await recordAnalyticsEvent({ ...event('event_page_2', 'page_view'), sessionId: 'session_exit_111', path: '/cart' });
  await recordAnalyticsEvent(event('event_product_1', 'product_view', { productId: 'product-a', valueCents: 64900 }));
  await recordAnalyticsEvent(event('event_cart_1', 'add_to_cart', { productId: 'product-a', quantity: 2, valueCents: 129800 }));
  await recordAnalyticsEvent(event('event_checkout_1', 'initiate_checkout', { quantity: 2, valueCents: 127800 }));
  const summary = await storefrontAnalyticsSummary({ days: 30 });
  assert.equal(summary.totals.orders, 1);
  assert.equal(summary.totals.revenueCents, 127800);
  assert.equal(summary.topProducts[0].quantity, 2);
  assert.deepEqual(summary.cancellations, [{ name: 'customer_requested', count: 1 }]);
  assert.ok(summary.exitPages.some((item) => item.name === '/cart' && item.count === 1));
  assert.deepEqual(summary.funnel.map((step) => step.name), [
    'Sessions', 'Product views', 'Add to cart', 'Checkout starts', 'Add Payment Info', 'Successful orders'
  ]);
});

test('analytics date presets use exclusive Manila day boundaries', () => {
  const previous = analyticsDateWindow({ range: 'previous_7_days' });
  assert.equal((previous.end.getTime() - previous.start.getTime()) / (24 * 60 * 60 * 1000), 7);
  const custom = analyticsDateWindow({ range: 'custom', start: '2026-07-01', end: '2026-07-03' });
  assert.equal(custom.start.toISOString(), '2026-06-30T16:00:00.000Z');
  assert.equal(custom.end.toISOString(), '2026-07-03T16:00:00.000Z');
});

test('Web Vitals accept only supported finite metrics and aggregate p75', async () => {
  const normalized = normalizeEvent(event('event_vital_normalize', 'web_vital', {
    metricName: 'lcp', metricValue: 2450.4
  }), { userAgent: 'Desktop browser' });
  assert.equal(normalized.metricName, 'LCP');
  assert.equal(normalized.metricValue, 2450.4);
  assert.throws(() => normalizeEvent(event('event_vital_bad', 'web_vital', {
    metricName: 'memory', metricValue: 10
  })), /Web Vital metric is invalid/);
  assert.equal(percentile([100, 200, 300, 400], 0.75), 300);

  await recordAnalyticsEvent(event('event_vital_1', 'web_vital', { metricName: 'LCP', metricValue: 1000 }));
  await recordAnalyticsEvent(event('event_vital_2', 'web_vital', { metricName: 'LCP', metricValue: 2000 }));
  await recordAnalyticsEvent(event('event_vital_3', 'web_vital', { metricName: 'LCP', metricValue: 3000 }));
  const summary = await storefrontAnalyticsSummary({ days: 30 });
  const lcp = summary.webVitals.find((metric) => metric.name === 'LCP');
  assert.deepEqual(lcp, { name: 'LCP', samples: 3, average: 2000, p75: 3000 });
});

test('product content readiness reports missing real sales inputs without inventing them', () => {
  const result = productContentReadiness({
    id: 'product-a', slug: 'product-a', name: 'Product A', status: 'active', description: 'Short',
    images: [{ url: '/one.jpg', altText: '' }], variants: [{ sku: 'A-S', size: 'S' }], productPage: {}, seo: {}, metafields: {}
  });
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((issue) => issue.code === 'product_media'));
  assert.ok(result.issues.some((issue) => issue.code === 'size_chart'));
  assert.ok(result.issues.some((issue) => issue.code === 'seo_description'));
});

test('public analytics endpoint honors Global Privacy Control', async () => {
  const server = await new Promise((resolve, reject) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/api/analytics/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-GPC': '1' },
      body: JSON.stringify(event('event_private_1', 'page_view'))
    });
    assert.equal(response.status, 204);
    const records = await listAnalyticsEvents({ since: new Date(Date.now() - 60_000) });
    assert.equal(records.some((record) => record.eventId === 'event_private_1'), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
