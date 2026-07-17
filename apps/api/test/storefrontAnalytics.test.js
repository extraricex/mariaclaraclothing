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
      items: [{ productId: 'product-a', productName: 'Product A', quantity: 2, unitPriceCents: 64900 }], isTestOrder: false
    },
    {
      orderNumber: 'CANCELLED-1', placedAt, status: 'cancelled', paymentMethod: 'cash_on_delivery', paymentStatus: 'cancelled', totalCents: 64900,
      cancellationReason: 'customer_requested', items: [], isTestOrder: false
    },
    {
      orderNumber: 'TEST-1', placedAt, status: 'confirmed', paymentMethod: 'cash_on_delivery', paymentStatus: 'cod_pending', totalCents: 999900,
      items: [{ productId: 'product-a', productName: 'Product A', quantity: 10, unitPriceCents: 99990 }], isTestOrder: true
    }
  ], statusEvents: [], trackingNotifications: []
}));

const { createApp } = require('../src/app');
const {
  listAnalyticsEvents,
  normalizeEvent,
  recordAnalyticsEvent
} = require('../src/analytics/storefrontAnalyticsRepository');
const {
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
