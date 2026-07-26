const { listAnalyticsEvents } = require('./storefrontAnalyticsRepository');
const { listOrders } = require('../orders/orderRepository');
const { listEditableProducts } = require('../products/catalogRepository');
const { hasDatabaseUrl, query } = require('../db/postgres');

const FAILED_ORDER_STATUSES = new Set(['cancelled', 'canceled', 'failed', 'expired', 'unreachable', 'returned']);
const FAILED_PAYMENT_STATUSES = new Set(['failed', 'expired', 'cancelled', 'canceled', 'refunded']);

function integerDays(value) {
  const days = Number(value || 30);
  return [7, 30, 90].includes(days) ? days : 30;
}

function manilaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function manilaDayStart(dateString) {
  return new Date(`${dateString}T00:00:00+08:00`);
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function validDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function analyticsDateWindow({ range, start, end, days } = {}) {
  const todayStart = manilaDayStart(manilaDateString());
  const preset = String(range || '').toLowerCase();
  if (preset === 'today') {
    return { range: preset, label: 'Today', start: todayStart, end: addUtcDays(todayStart, 1) };
  }
  if (preset === 'yesterday') {
    return { range: preset, label: 'Yesterday', start: addUtcDays(todayStart, -1), end: todayStart };
  }
  if (preset === 'previous_7_days') {
    return { range: preset, label: 'Previous 7 days', start: addUtcDays(todayStart, -13), end: addUtcDays(todayStart, -6) };
  }
  if (preset === 'custom' && validDateString(start) && validDateString(end)) {
    const customStart = manilaDayStart(start);
    const customEnd = addUtcDays(manilaDayStart(end), 1);
    if (customEnd > customStart && customEnd.getTime() - customStart.getTime() <= 366 * 24 * 60 * 60 * 1000) {
      return { range: preset, label: `${start} to ${end}`, start: customStart, end: customEnd };
    }
  }
  const legacyDays = range === 'last_7_days' ? 7
    : range === 'last_30_days' ? 30
      : integerDays(days);
  return {
    range: legacyDays === 7 ? 'last_7_days' : legacyDays === 30 ? 'last_30_days' : 'last_90_days',
    label: `Last ${legacyDays} days`,
    start: addUtcDays(todayStart, -(legacyDays - 1)),
    end: addUtcDays(todayStart, 1)
  };
}

function websiteOrder(order) {
  const checkoutChannel = String(order.checkoutChannel || '').trim().toLowerCase();
  const channel = String(order.channel || '').trim().toLowerCase();
  return checkoutChannel === 'storefront_checkout' || channel === 'online store';
}

function validCompletedOrder(order) {
  if (!websiteOrder(order)) return false;
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

async function storefrontAnalyticsSummary(options = {}) {
  const window = analyticsDateWindow(options);
  const days = Math.max(1, Math.ceil((window.end.getTime() - window.start.getTime()) / (24 * 60 * 60 * 1000)));
  const [events, allOrders, products] = await Promise.all([
    listAnalyticsEvents({ since: window.start, until: window.end }), listOrders(), listEditableProducts()
  ]);
  const periodOrders = allOrders.filter((order) => {
    const placedAt = new Date(order.placedAt || 0);
    return placedAt >= window.start && placedAt < window.end && websiteOrder(order);
  });
  const orders = periodOrders.filter(validCompletedOrder);
  const eventCount = (name) => events.filter((event) => event.eventName === name).length;
  const uniqueSessions = (predicate) => new Set(events.filter(predicate).map((event) => event.sessionHash).filter(Boolean)).size;
  const pageViews = eventCount('page_view');
  const productViews = eventCount('product_view');
  const addToCarts = eventCount('add_to_cart');
  const productViewers = uniqueSessions((event) => event.eventName === 'product_view');
  const addToCartUsers = uniqueSessions((event) => event.eventName === 'add_to_cart');
  const sizeSelectors = uniqueSessions((event) => event.eventName === 'size_select');
  const cartViewers = uniqueSessions((event) => event.eventName === 'page_view' && event.path === '/cart');
  const checkoutStarts = uniqueSessions((event) =>
    event.eventName === 'checkout_start'
    || (event.eventName === 'page_view' && event.path === '/checkout'));
  const shippingInfoCompleted = uniqueSessions((event) =>
    event.eventName === 'shipping_info_completed'
    || event.eventName === 'initiate_checkout');
  const paymentSelections = eventCount('add_payment_info');
  const paymentInfoUsers = uniqueSessions((event) => event.eventName === 'add_payment_info');
  const placeOrderUsers = uniqueSessions((event) => event.eventName === 'place_order');
  const thankYouViewers = uniqueSessions((event) =>
    event.eventName === 'thank_you_view'
    || (event.eventName === 'page_view' && event.path === '/thank-you'));
  const paymentFailures = events.filter((event) => event.eventName === 'payment_failed');
  const paymentCancellations = events.filter((event) => event.eventName === 'payment_cancelled');
  const checkoutErrors = events.filter((event) => event.eventName === 'checkout_error');
  const sessions = uniqueSessions((event) => event.eventName === 'page_view');
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
  }).sort((a, b) => b.revenueCents - a.revenueCents || b.addToCarts - a.addToCarts).slice(0, 50);

  const daily = new Map();
  for (let date = new Date(window.start); date < window.end; date = addUtcDays(date, 1)) {
    const key = manilaDateString(date);
    daily.set(key, { date: key, sessions: new Set(), productViews: 0, addToCarts: 0, checkoutStarts: 0, orders: 0, revenueCents: 0 });
  }
  for (const event of events) {
    const record = daily.get(manilaDateString(new Date(event.occurredAt)));
    if (!record) continue;
    if (event.eventName === 'page_view') record.sessions.add(event.sessionHash);
    if (event.eventName === 'product_view') record.productViews += 1;
    if (event.eventName === 'add_to_cart') record.addToCarts += 1;
    if (event.eventName === 'checkout_start'
      || (event.eventName === 'page_view' && event.path === '/checkout')) record.checkoutStarts += 1;
  }
  for (const order of orders) {
    const record = daily.get(manilaDateString(new Date(order.placedAt)));
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
  const firstPageBySession = new Map();
  for (const event of events) {
    if (event.eventName === 'page_view' && event.sessionHash && event.path) {
      if (!firstPageBySession.has(event.sessionHash)) firstPageBySession.set(event.sessionHash, event);
      lastPageBySession.set(event.sessionHash, event);
    }
  }
  const funnelStep = (name, count, previous) => {
    const rateFromPrevious = previous === null ? 100 : percentage(count, previous);
    return {
      name,
      count,
      rateFromPrevious,
      dropOffFromPrevious: previous === null ? 0 : Math.max(0, Number((100 - rateFromPrevious).toFixed(1)))
    };
  };
  const funnel = [];
  for (const [name, count] of [
    ['Sessions', sessions],
    ['Product views', productViewers],
    ['Add to cart', addToCartUsers],
    ['Checkout starts', checkoutStarts],
    ['Add Payment Info', paymentInfoUsers],
    ['Successful orders', orders.length]
  ]) {
    funnel.push(funnelStep(name, count, funnel.length ? funnel.at(-1).count : null));
  }
  const extendedFunnel = [
    funnelStep('Landing sessions', sessions, null),
    funnelStep('Product viewers', productViewers, sessions),
    funnelStep('Size selections', sizeSelectors, productViewers),
    funnelStep('Add-to-cart users', addToCartUsers, productViewers),
    funnelStep('Cart viewers', cartViewers, addToCartUsers),
    funnelStep('Checkout starts', checkoutStarts, addToCartUsers),
    funnelStep('Shipping information completed', shippingInfoCompleted, checkoutStarts),
    funnelStep('Add Payment Info', paymentInfoUsers, shippingInfoCompleted),
    funnelStep('Place Order clicks', placeOrderUsers, paymentInfoUsers),
    funnelStep('Successful website orders', orders.length, placeOrderUsers),
    funnelStep('Thank You page viewers', thankYouViewers, orders.length)
  ];
  const landingPages = countBy([...firstPageBySession.values()], 'path').slice(0, 20);

  return {
    generatedAt: new Date().toISOString(),
    days,
    range: window.range,
    rangeLabel: window.label,
    since: window.start.toISOString(),
    until: window.end.toISOString(),
    measurementStarted: events[0]?.occurredAt || '',
    totals: {
      sessions, pageViews, productViews, productViewers, sizeSelectors, addToCarts, addToCartUsers,
      cartViewers, checkoutStarts, shippingInfoCompleted, paymentSelections, paymentInfoUsers,
      placeOrderUsers, thankYouViewers,
      paymentFailures: paymentFailures.length, paymentCancellations: paymentCancellations.length,
      checkoutErrors: checkoutErrors.length, orders: orders.length, revenueCents,
      conversionRate: percentage(orders.length, sessions),
      averageOrderValueCents: orders.length ? Math.round(revenueCents / orders.length) : 0
    },
    funnel,
    extendedFunnel,
    paymentMethods: countBy(orders, (order) => order.paymentMethod || 'cash_on_delivery'),
    paymentIssues: countBy([...paymentFailures, ...paymentCancellations], (event) => event.metricName || event.eventName),
    webVitals,
    cancellations: countBy(periodOrders.filter((order) => String(order.status).toLowerCase() === 'cancelled' && !order.isTestOrder), (order) => order.cancellationReason || 'not_recorded'),
    devices: countBy(events.filter((event) => event.eventName === 'page_view'), 'deviceType'),
    browsers: countBy(events.filter((event) => event.eventName === 'page_view'), 'browserCategory'),
    campaigns: countBy(events.filter((event) => event.utmSource), (event) => [event.utmSource, event.utmMedium, event.utmCampaign].filter(Boolean).join(' / ')).slice(0, 12),
    landingPages,
    exitPages: countBy([...lastPageBySession.values()], 'path').slice(0, 12),
    topProducts,
    daily: [...daily.values()].map((record) => ({ ...record, sessions: record.sessions.size }))
  };
}

function normalizedIssueCategory(value, fallback = 'order_api_failure') {
  const category = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const aliases = {
    address_invalid: 'invalid_address',
    incomplete_delivery_address: 'invalid_address',
    checkout_customer_invalid: 'invalid_address',
    invalid_mobile_number: 'invalid_phone',
    variant_unavailable: 'insufficient_stock',
    product_unavailable: 'insufficient_stock',
    cart_invalid: 'insufficient_stock',
    checkout_session_failed: 'payment_failure'
  };
  return aliases[category] || category || fallback;
}

function topMapValue(values, fallback = 'unknown') {
  if (!values?.size) return fallback;
  return [...values.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0];
}

function issueLabel(category) {
  return {
    invalid_address: 'Invalid address',
    missing_province: 'Missing Province',
    missing_city: 'Missing City',
    missing_barangay: 'Missing Barangay',
    invalid_phone: 'Invalid phone',
    insufficient_stock: 'Insufficient stock',
    duplicate_submission: 'Duplicate submission',
    payment_failure: 'Payment failure',
    payment_cancelled: 'Payment cancelled',
    order_api_failure: 'Order API failure',
    pancake_failure: 'Pancake failure',
    email_notification_failure: 'Email-notification failure'
  }[category] || String(category || 'unknown').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function checkoutIssuesSummary(options = {}) {
  const window = analyticsDateWindow(options);
  const events = await listAnalyticsEvents({ since: window.start, until: window.end });
  const records = new Map();
  const resolutionTimes = new Map();
  const ensure = (category) => {
    const normalized = normalizedIssueCategory(category);
    if (!records.has(normalized)) {
      records.set(normalized, {
        category: normalized,
        label: issueLabel(normalized),
        count: 0,
        affectedSessions: new Set(),
        devices: new Map(),
        browsers: new Map(),
        routes: new Map(),
        firstSeen: '',
        lastSeen: '',
        unresolvedCount: 0,
        message: ''
      });
    }
    return records.get(normalized);
  };
  const increment = (map, key) => {
    const normalized = String(key || '').trim() || 'unknown';
    map.set(normalized, (map.get(normalized) || 0) + 1);
  };
  for (const event of events) {
    if (!['checkout_error', 'payment_failed', 'payment_cancelled'].includes(event.eventName)) continue;
    const category = event.eventName === 'payment_failed'
      ? 'payment_failure'
      : event.eventName === 'payment_cancelled'
        ? 'payment_cancelled'
        : event.errorCategory || event.metricName;
    const record = ensure(category);
    record.count += 1;
    if (event.sessionHash) record.affectedSessions.add(event.sessionHash);
    increment(record.devices, event.deviceType);
    increment(record.browsers, event.browserCategory);
    increment(record.routes, event.path);
    record.firstSeen = !record.firstSeen || event.occurredAt < record.firstSeen ? event.occurredAt : record.firstSeen;
    record.lastSeen = !record.lastSeen || event.occurredAt > record.lastSeen ? event.occurredAt : record.lastSeen;
    if (!event.resolvedAt) record.unresolvedCount += 1;
    if (!record.message && event.errorMessage) record.message = event.errorMessage;
  }

  if (hasDatabaseUrl()) {
    const [result, resolutionResult] = await Promise.all([
      query(
      `SELECT category, count, first_seen, last_seen
         FROM (
           SELECT 'pancake_failure'::text AS category,
                  COUNT(*)::integer AS count,
                  MIN(created_at) AS first_seen,
                  MAX(updated_at) AS last_seen
             FROM pancake_order_exports
            WHERE created_at >= $1 AND created_at < $2
              AND status IN ('blocked', 'failed')
           UNION ALL
           SELECT 'email_notification_failure'::text,
                  COUNT(*)::integer,
                  MIN(created_at),
                  MAX(updated_at)
             FROM order_notification_outbox
            WHERE created_at >= $1 AND created_at < $2
              AND status = 'failed'
           UNION ALL
           SELECT 'payment_failure'::text,
                  COUNT(*)::integer,
                  MIN(created_at),
                  MAX(created_at)
             FROM payment_operation_events
            WHERE created_at >= $1 AND created_at < $2
              AND level = 'error'
         ) issue
        WHERE count > 0`,
      [window.start, window.end]
      ),
      query('SELECT category, resolved_at FROM checkout_issue_resolutions')
    ]);
    for (const row of resolutionResult.rows) {
      if (row.resolved_at) resolutionTimes.set(row.category, new Date(row.resolved_at).toISOString());
    }
    for (const row of result.rows) {
      const record = ensure(row.category);
      record.count += Number(row.count || 0);
      const firstSeen = row.first_seen ? new Date(row.first_seen).toISOString() : '';
      const lastSeen = row.last_seen ? new Date(row.last_seen).toISOString() : '';
      record.firstSeen = !record.firstSeen || (firstSeen && firstSeen < record.firstSeen) ? firstSeen : record.firstSeen;
      record.lastSeen = !record.lastSeen || (lastSeen && lastSeen > record.lastSeen) ? lastSeen : record.lastSeen;
      record.unresolvedCount += Number(row.count || 0);
    }
  }

  const issues = [...records.values()].map((record) => {
    const resolutionTime = resolutionTimes.get(record.category) || '';
    return {
      category: record.category,
      label: record.label,
      count: record.count,
      affectedSessions: record.affectedSessions.size || null,
      mostAffectedDevice: topMapValue(record.devices),
      mostAffectedBrowser: topMapValue(record.browsers),
      mostAffectedRoute: topMapValue(record.routes, ''),
      firstSeen: record.firstSeen,
      lastSeen: record.lastSeen,
      resolved: record.unresolvedCount === 0 || Boolean(resolutionTime && resolutionTime >= record.lastSeen),
      message: record.message
    };
  }).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  return {
    generatedAt: new Date().toISOString(),
    range: window.range,
    rangeLabel: window.label,
    since: window.start.toISOString(),
    until: window.end.toISOString(),
    total: issues.reduce((sum, issue) => sum + issue.count, 0),
    affectedSessions: new Set(events
      .filter((event) => ['checkout_error', 'payment_failed', 'payment_cancelled'].includes(event.eventName))
      .map((event) => event.sessionHash)
      .filter(Boolean)).size,
    issues
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
  analyticsDateWindow,
  checkoutIssuesSummary,
  contentReadinessSummary,
  integerDays,
  percentile,
  productContentReadiness,
  storefrontAnalyticsSummary,
  validCompletedOrder,
  websiteOrder
};
