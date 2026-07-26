const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');
const { resolveRuntimeDataFile } = require('../db/runtimeDataFile');

const VALID_EVENTS = new Set([
  'page_view', 'product_view', 'size_select', 'add_to_cart', 'checkout_start',
  'shipping_info_completed', 'initiate_checkout', 'add_payment_info', 'place_order',
  'checkout_error', 'thank_you_view', 'payment_failed', 'payment_cancelled', 'web_vital'
]);
const WEB_VITALS = new Set(['FCP', 'LCP', 'CLS', 'INP', 'TTFB']);
const CHECKOUT_STEPS = new Set(['product', 'cart', 'information', 'review_payment', 'payment', 'confirmation', 'unknown']);
const DEFAULT_FILE = path.join(__dirname, '..', '..', 'data', 'storefront-analytics.json');
let fileMutationQueue = Promise.resolve();

function dataFile() {
  return resolveRuntimeDataFile('ANALYTICS_DATA_FILE', DEFAULT_FILE);
}

function usePostgres() {
  return hasDatabaseUrl() && !process.env.ANALYTICS_DATA_FILE;
}

function mutateFile(work) {
  const result = fileMutationQueue.then(work, work);
  fileMutationQueue = result.catch(() => {});
  return result;
}

async function writeFileEvents(events) {
  const target = dataFile();
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify({ events: events.slice(-20000) }, null, 2)}\n`);
  await fs.rename(temporary, target);
}

function cleanText(value, maximum = 160) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximum);
}

function cleanPath(value) {
  try {
    const parsed = new URL(String(value || '/'), 'https://storefront.invalid');
    return cleanText(parsed.pathname || '/', 240) || '/';
  } catch (_error) {
    return '/';
  }
}

function cleanCampaign(value) {
  return cleanText(value, 100).replace(/[^a-zA-Z0-9._~+\- ]/g, '');
}

function referrerHost(value) {
  try {
    const host = new URL(String(value || '')).hostname.toLowerCase();
    return cleanText(host, 160);
  } catch (_error) {
    return '';
  }
}

function deviceType(userAgent) {
  const value = String(userAgent || '').toLowerCase();
  if (!value) return 'unknown';
  if (/ipad|tablet|kindle|silk/.test(value)) return 'tablet';
  if (/mobile|iphone|ipod|android/.test(value)) return 'mobile';
  return 'desktop';
}

function browserCategory(userAgent) {
  const value = String(userAgent || '').toLowerCase();
  if (!value) return 'unknown';
  if (/fbav|fban|facebook/.test(value)) return 'facebook';
  if (/instagram/.test(value)) return 'instagram';
  if (/tiktok/.test(value)) return 'tiktok';
  if (/edg\//.test(value)) return 'edge';
  if (/firefox|fxios/.test(value)) return 'firefox';
  if (/chrome|crios/.test(value)) return 'chrome';
  if (/safari/.test(value)) return 'safari';
  return 'other';
}

function privateHash(value) {
  const salt = process.env.ANALYTICS_HASH_SALT
    || process.env.ORDER_CONFIRMATION_SECRET
    || process.env.SESSION_SECRET
    || 'maria-clara-anonymous-funnel';
  return crypto.createHash('sha256').update(`${salt}:${cleanText(value, 160)}`).digest('hex');
}

function sessionHash(sessionId) {
  return privateHash(sessionId);
}

function sanitizedErrorMessage(value) {
  return cleanText(value, 240)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[number]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[identifier]');
}

function normalizeEvent(input = {}, request = {}) {
  const eventId = cleanText(input.eventId, 100);
  const eventName = cleanText(input.eventName, 40).toLowerCase();
  const sessionId = cleanText(input.sessionId, 120);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(eventId)) throw validationError('Analytics event ID is invalid.');
  if (!VALID_EVENTS.has(eventName)) throw validationError('Analytics event name is invalid.');
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(sessionId)) throw validationError('Analytics session is invalid.');
  const quantity = Math.max(0, Math.min(1000, Math.trunc(Number(input.quantity || 0))));
  const rawValue = input.valueCents;
  const valueCents = rawValue === '' || rawValue === null || rawValue === undefined
    ? null
    : Math.trunc(Number(rawValue));
  if (valueCents !== null && (!Number.isInteger(valueCents) || valueCents < 0 || valueCents > 100000000)) {
    throw validationError('Analytics value is invalid.');
  }
  const metricName = cleanText(input.metricName, 40).toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const rawMetricValue = input.metricValue;
  const metricValue = rawMetricValue === '' || rawMetricValue === null || rawMetricValue === undefined
    ? null
    : Number(rawMetricValue);
  if (metricValue !== null && (!Number.isFinite(metricValue) || metricValue < 0 || metricValue > 600000)) {
    throw validationError('Analytics metric value is invalid.');
  }
  if (eventName === 'web_vital' && (!WEB_VITALS.has(metricName) || metricValue === null)) {
    throw validationError('Web Vital metric is invalid.');
  }
  const checkoutStepInput = cleanText(input.checkoutStep, 40).toLowerCase();
  const checkoutStep = CHECKOUT_STEPS.has(checkoutStepInput) ? checkoutStepInput : '';
  const errorCategory = cleanText(input.errorCategory, 80).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const reference = cleanText(input.reference, 160);
  return {
    eventId,
    eventName,
    sessionHash: sessionHash(sessionId),
    path: cleanPath(input.path),
    productId: cleanText(input.productId, 120),
    variantId: cleanText(input.variantId, 120),
    quantity,
    valueCents,
    currency: 'PHP',
    paymentMethod: cleanText(input.paymentMethod, 40),
    deviceType: deviceType(request.userAgent),
    browserCategory: browserCategory(request.userAgent),
    referrerHost: referrerHost(input.referrer),
    utmSource: cleanCampaign(input.utmSource),
    utmMedium: cleanCampaign(input.utmMedium),
    utmCampaign: cleanCampaign(input.utmCampaign),
    metricName,
    metricValue,
    checkoutStep,
    errorCategory,
    errorMessage: sanitizedErrorMessage(input.errorMessage),
    referenceHash: reference ? privateHash(`reference:${reference}`) : '',
    resolvedAt: '',
    occurredAt: new Date().toISOString()
  };
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

async function recordAnalyticsEvent(input, request = {}) {
  const event = normalizeEvent(input, request);
  return persistNormalizedAnalyticsEvent(event);
}

async function persistNormalizedAnalyticsEvent(event, { client } = {}) {
  if (usePostgres()) {
    const execute = client?.query ? client.query.bind(client) : query;
    const result = await execute(
      `INSERT INTO storefront_analytics_events (
         event_id,event_name,session_hash,path,product_id,variant_id,quantity,value_cents,currency,
         payment_method,device_type,browser_category,referrer_host,utm_source,utm_medium,utm_campaign,
         metric_name,metric_value,checkout_step,error_category,error_message,reference_hash,occurred_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [
        event.eventId, event.eventName, event.sessionHash, event.path, event.productId,
        event.variantId, event.quantity, event.valueCents, event.currency, event.paymentMethod,
        event.deviceType, event.browserCategory, event.referrerHost, event.utmSource, event.utmMedium,
        event.utmCampaign, event.metricName, event.metricValue, event.checkoutStep, event.errorCategory,
        event.errorMessage, event.referenceHash, event.occurredAt
      ]
    );
    return { recorded: Boolean(result.rows[0]), eventId: event.eventId };
  }
  return mutateFile(async () => {
    const records = await readFile();
    if (records.some((item) => item.eventId === event.eventId)) return { recorded: false, eventId: event.eventId };
    records.push(event);
    await writeFileEvents(records);
    return { recorded: true, eventId: event.eventId };
  });
}

async function listAnalyticsEvents({ since, until } = {}) {
  const sinceDate = since instanceof Date && Number.isFinite(since.getTime()) ? since : new Date(0);
  const untilDate = until instanceof Date && Number.isFinite(until.getTime()) ? until : new Date(8640000000000000);
  if (usePostgres()) {
    const result = await query(
      `SELECT * FROM storefront_analytics_events
        WHERE occurred_at >= $1 AND occurred_at < $2
        ORDER BY occurred_at ASC`,
      [sinceDate, untilDate]
    );
    return result.rows.map(fromRow);
  }
  return (await readFile())
    .filter((event) => {
      const time = new Date(event.occurredAt || 0);
      return time >= sinceDate && time < untilDate;
    })
    .sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));
}

async function resolveCheckoutIssueCategory(category, resolved = true) {
  const normalized = cleanText(category, 80).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  if (!normalized) throw validationError('Checkout issue category is required.');
  const resolvedAt = resolved ? new Date().toISOString() : '';
  if (usePostgres()) {
    if (resolved) {
      await query(
        `INSERT INTO checkout_issue_resolutions (category, resolved_at, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (category) DO UPDATE
           SET resolved_at = EXCLUDED.resolved_at, updated_at = now()`,
        [normalized, resolvedAt]
      );
    } else {
      await query('DELETE FROM checkout_issue_resolutions WHERE category = $1', [normalized]);
    }
    const result = await query(
      `UPDATE storefront_analytics_events
          SET resolved_at = $2
        WHERE event_name IN ('checkout_error', 'payment_failed', 'payment_cancelled')
          AND error_category = $1
        RETURNING event_id`,
      [normalized, resolvedAt || null]
    );
    return { category: normalized, resolved, updated: result.rowCount };
  }
  return mutateFile(async () => {
    const records = await readFile();
    let updated = 0;
    for (const event of records) {
      if (!['checkout_error', 'payment_failed', 'payment_cancelled'].includes(event.eventName)
        || event.errorCategory !== normalized) continue;
      event.resolvedAt = resolvedAt;
      updated += 1;
    }
    await writeFileEvents(records);
    return { category: normalized, resolved, updated };
  });
}

async function readFile() {
  try {
    const parsed = JSON.parse(await fs.readFile(dataFile(), 'utf8'));
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function fromRow(row) {
  return {
    eventId: row.event_id,
    eventName: row.event_name,
    sessionHash: row.session_hash,
    path: row.path || '',
    productId: row.product_id || '',
    variantId: row.variant_id || '',
    quantity: Number(row.quantity || 0),
    valueCents: row.value_cents === null ? null : Number(row.value_cents),
    currency: row.currency || 'PHP',
    paymentMethod: row.payment_method || '',
    deviceType: row.device_type || 'unknown',
    browserCategory: row.browser_category || 'unknown',
    referrerHost: row.referrer_host || '',
    utmSource: row.utm_source || '',
    utmMedium: row.utm_medium || '',
    utmCampaign: row.utm_campaign || '',
    metricName: row.metric_name || '',
    metricValue: row.metric_value === null ? null : Number(row.metric_value),
    checkoutStep: row.checkout_step || '',
    errorCategory: row.error_category || '',
    errorMessage: row.error_message || '',
    referenceHash: row.reference_hash || '',
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : '',
    occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : ''
  };
}

module.exports = {
  VALID_EVENTS,
  browserCategory,
  deviceType,
  listAnalyticsEvents,
  normalizeEvent,
  persistNormalizedAnalyticsEvent,
  recordAnalyticsEvent,
  resolveCheckoutIssueCategory,
  sanitizedErrorMessage,
  sessionHash
};
