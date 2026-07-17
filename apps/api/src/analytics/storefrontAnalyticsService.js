const { listAnalyticsEvents } = require('./storefrontAnalyticsRepository');
const { listOrders } = require('../orders/orderRepository');
const { listEditableProducts } = require('../products/catalogRepository');

const FAILED_ORDER_STATUSES = new Set(['cancelled', 'canceled', 'failed', 'expired', 'unreachable', 'returned']);
const FAILED_PAYMENT_STATUSES = new Set(['failed', 'expired', 'cancelled', 'canceled', 'refunded']);

function integerDays(value) {
  const days = Number(value || 30);
  return [7, 30, 90].includes(days) ? days : 30;
}

function validCompletedOrder(order) {
  if (order.isTestOrder) return false;
  if (FAILED_ORDER_STATUSES.has(String(order.status || '').toLowerCase())) return false;
  if (FAILED_PAYMENT_STATUSES.has(String(order.paymentStatus || '').toLowerCase())) return false;
  if (order.paymentMethod === 'paymongo') return ['paid', 'partially_refunded'].includes(String(order.paymentStatus || ''));
  return Number(order.totalCents || 0) > 0;
}

function percentage(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

function countBy(records, key) {
  const counts = new Map();
  for (const record of records) {
    const value = String(typeof key === 'function' ? key(record) : record[key] || '').trim() || 'unknown';
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function dayKey(value) {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function percentile(values, quantile = 0.75) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)].toFixed(2));
}

async function storefrontAnalyticsSummary({ days: inputDays } = {}) {
  const days = integerDays(inputDays);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [events, allOrders, products] = await Promise.all([
    listAnalyticsEvents({ since }), listOrders(), listEditableProducts()
  ]);
  const periodOrders = allOrders.filter((order) => new Date(order.placedAt || 0) >= since);
  const orders = periodOrders.filter(validCompletedOrder);
  const eventCount = (name) => events.filter((event) => event.eventName === name).length;
  const pageViews = eventCount('page_view');
  const productViews = eventCount('product_view');
  const addToCarts = eventCount('add_to_cart');
  const checkoutStarts = eventCount('initiate_checkout');
  const paymentSelections = eventCount('add_payment_info');
  const paymentFailures = events.filter((event) => event.eventName === 'payment_failed');
  const paymentCancellations = events.filter((event) => event.eventName === 'payment_cancelled');
  const sessions = new Set(events.map((event) => event.sessionHash).filter(Boolean)).size;
  const revenueCents = orders.reduce((sum, order) => sum + Number(order.totalCents || 0), 0);
  const orderItems = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      const id = String(item.productId || item.slug || '').trim();
      if (!id) continue;
      const current = orderItems.get(id) || { productId: id, name: item.productName || id, quantity: 0, revenueCents: 0, orders: new Set() };
      current.quantity += Number(item.quantity || 0);
      current.revenueCents += Number(item.unitPriceCents || 0) * Number(item.quantity || 0);
      current.orders.add(order.orderNumber);
      orderItems.set(id, current);
    }
  }
  const productViewCounts = new Map(countBy(events.filter((event) => event.eventName === 'product_view'), 'productId').map((item) => [item.name, item.count]));
  const cartCounts = new Map(countBy(events.filter((event) => event.eventName === 'add_to_cart'), 'productId').map((item) => [item.name, item.count]));
  const productNames = new Map(products.flatMap((product) => [
    [String(product.id || ''), product.name], [String(product.slug || ''), product.name]
  ]));
  const productIds = new Set([...productViewCounts.keys(), ...cartCounts.keys(), ...orderItems.keys()]);
  const topProducts = [...productIds].filter((id) => id && id !== 'unknown').map((id) => {
    const sales = orderItems.get(id);
    const views = productViewCounts.get(id) || 0;
    const carts = cartCounts.get(id) || 0;
    return {
      productId: id,
      name: sales?.name || productNames.get(id) || id,
      views,
      addToCarts: carts,
      orders: sales?.orders.size || 0,
      quantity: sales?.quantity || 0,
      revenueCents: sales?.revenueCents || 0,
      viewToCartRate: percentage(carts, views)
    };
  }).sort((a, b) => b.revenueCents - a.revenueCents || b.addToCarts - a.addToCarts).slice(0, 12);

  const daily = new Map();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    daily.set(key, { date: key, sessions: new Set(), productViews: 0, addToCarts: 0, checkoutStarts: 0, orders: 0, revenueCents: 0 });
  }
  for (const event of events) {
    const record = daily.get(dayKey(event.occurredAt));
    if (!record) continue;
    record.sessions.add(event.sessionHash);
    if (event.eventName === 'product_view') record.productViews += 1;
    if (event.eventName === 'add_to_cart') record.addToCarts += 1;
    if (event.eventName === 'initiate_checkout') record.checkoutStarts += 1;
  }
  for (const order of orders) {
    const record = daily.get(dayKey(order.placedAt));
    if (!record) continue;
    record.orders += 1;
    record.revenueCents += Number(order.totalCents || 0);
  }

  const vitalGroups = new Map();
  for (const event of events.filter((candidate) => candidate.eventName === 'web_vital')) {
    if (!event.metricName || !Number.isFinite(event.metricValue)) continue;
    const values = vitalGroups.get(event.metricName) || [];
    values.push(event.metricValue);
    vitalGroups.set(event.metricName, values);
  }
  const webVitals = [...vitalGroups].map(([name, values]) => ({
    name,
    samples: values.length,
    average: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
    p75: percentile(values)
  })).sort((left, right) => left.name.localeCompare(right.name));
  const lastPageBySession = new Map();
  for (const event of events) {
    if (event.eventName === 'page_view' && event.sessionHash && event.path) {
      lastPageBySession.set(event.sessionHash, event);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    days,
    since: since.toISOString(),
    measurementStarted: events[0]?.occurredAt || '',
    totals: {
      sessions, pageViews, productViews, addToCarts, checkoutStarts, paymentSelections,
      paymentFailures: paymentFailures.length, paymentCancellations: paymentCancellations.length,
      orders: orders.length, revenueCents,
      averageOrderValueCents: orders.length ? Math.round(revenueCents / orders.length) : 0
    },
    funnel: [
      { name: 'Sessions', count: sessions, rateFromPrevious: 100 },
      { name: 'Product views', count: productViews, rateFromPrevious: percentage(productViews, sessions) },
      { name: 'Add to carts', count: addToCarts, rateFromPrevious: percentage(addToCarts, productViews) },
      { name: 'Checkout starts', count: checkoutStarts, rateFromPrevious: percentage(checkoutStarts, addToCarts) },
      { name: 'Completed orders', count: orders.length, rateFromPrevious: percentage(orders.length, checkoutStarts) }
    ],
    paymentMethods: countBy(orders, (order) => order.paymentMethod || 'cash_on_delivery'),
    paymentIssues: countBy([...paymentFailures, ...paymentCancellations], (event) => event.metricName || event.eventName),
    webVitals,
    cancellations: countBy(periodOrders.filter((order) => String(order.status).toLowerCase() === 'cancelled' && !order.isTestOrder), (order) => order.cancellationReason || 'not_recorded'),
    devices: countBy(events.filter((event) => event.eventName === 'page_view'), 'deviceType'),
    campaigns: countBy(events.filter((event) => event.utmSource), (event) => [event.utmSource, event.utmMedium, event.utmCampaign].filter(Boolean).join(' / ')).slice(0, 12),
    exitPages: countBy([...lastPageBySession.values()], 'path').slice(0, 12),
    topProducts,
    daily: [...daily.values()].map((record) => ({ ...record, sessions: record.sessions.size }))
  };
}

function productContentReadiness(product) {
  const issues = [];
  const images = Array.isArray(product.images) ? product.images : [];
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const page = product.productPage || {};
  const searchableText = [product.description, page.intro, page.detailsText, ...(page.sections || []).flatMap((section) => [section.title, section.body])].join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (images.length < 3) issues.push({ code: 'product_media', label: `Add real product media (${images.length}/3 minimum recommended)` });
  if (images.some((image) => !String(image.altText || '').trim())) issues.push({ code: 'image_alt', label: 'Complete image alt text' });
  if (!Array.isArray(page.sizeChart) || !page.sizeChart.length) issues.push({ code: 'size_chart', label: 'Add a structured product size chart' });
  if (!String(page.shippingText || '').trim()) issues.push({ code: 'shipping_copy', label: 'Review product shipping copy against global settings' });
  if (searchableText.length < 180) issues.push({ code: 'description', label: 'Add useful fabric, fit, and product details' });
  if (String(product.seo?.description || '').trim().length < 80) issues.push({ code: 'seo_description', label: 'Add a unique SEO description' });
  const colors = Array.isArray(product.metafields?.color)
    ? product.metafields.color.map((value) => String(value || '').trim()).filter(Boolean)
    : [String(product.metafields?.color || '').trim()].filter(Boolean);
  if (!colors.length) issues.push({ code: 'color', label: 'Confirm structured product color' });
  if (!variants.length || variants.some((variant) => !String(variant.sku || '').trim())) issues.push({ code: 'variants', label: 'Complete SKU and size variants' });
  return {
    productId: product.id || product.slug,
    slug: product.slug,
    name: product.name,
    status: product.status || 'active',
    imageCount: images.length,
    issueCount: issues.length,
    ready: issues.length === 0,
    issues
  };
}

async function contentReadinessSummary() {
  const products = (await listEditableProducts()).filter((product) => String(product.status || 'active') !== 'archived');
  const records = products.map(productContentReadiness);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: records.length,
      ready: records.filter((record) => record.ready).length,
      needsAttention: records.filter((record) => !record.ready).length
    },
    products: records.sort((left, right) => right.issueCount - left.issueCount || left.name.localeCompare(right.name))
  };
}

module.exports = {
  contentReadinessSummary,
  integerDays,
  percentile,
  productContentReadiness,
  storefrontAnalyticsSummary,
  validCompletedOrder
};
