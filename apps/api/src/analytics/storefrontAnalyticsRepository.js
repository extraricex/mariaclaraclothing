const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');
const { resolveRuntimeDataFile } = require('../db/runtimeDataFile');

const VALID_EVENTS = new Set([
  'page_view', 'product_view', 'add_to_cart', 'initiate_checkout', 'add_payment_info',
  'payment_failed', 'payment_cancelled', 'web_vital'
]);
const WEB_VITALS = new Set(['FCP', 'LCP', 'CLS', 'INP', 'TTFB']);
const DEFAULT_FILE = path.join(__dirname, '..', '..', 'data', 'storefront-analytics.json');

function dataFile() {
  return resolveRuntimeDataFile('ANALYTICS_DATA_FILE', DEFAULT_FILE);
}

function usePostgres() {
  return hasDatabaseUrl() && !process.env.ANALYTICS_DATA_FILE;
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

function sessionHash(sessionId) {
  const salt = process.env.ANALYTICS_HASH_SALT
    || process.env.ORDER_CONFIRMATION_SECRET
    || process.env.SESSION_SECRET
    || 'maria-clara-anonymous-funnel';
  return crypto.createHash('sha256').update(`${salt}:${cleanText(sessionId, 120)}`).digest('hex');
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
    referrerHost: referrerHost(input.referrer),
    utmSource: cleanCampaign(input.utmSource),
    utmMedium: cleanCampaign(input.utmMedium),
    utmCampaign: cleanCampaign(input.utmCampaign),
    metricName,
    metricValue,
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
         payment_method,device_type,referrer_host,utm_source,utm_medium,utm_campaign,metric_name,metric_value,occurred_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [
        event.eventId, event.eventName, event.sessionHash, event.path, event.productId,
        event.variantId, event.quantity, event.valueCents, event.currency, event.paymentMethod,
        event.deviceType, event.referrerHost, event.utmSource, event.utmMedium, event.utmCampaign,
        event.metricName, event.metricValue, event.occurredAt
      ]
    );
    return { recorded: Boolean(result.rows[0]), eventId: event.eventId };
  }
  const records = await readFile();
  if (records.some((item) => item.eventId === event.eventId)) return { recorded: false, eventId: event.eventId };
  records.push(event);
  const retained = records.slice(-20000);
  await fs.mkdir(path.dirname(dataFile()), { recursive: true });
  await fs.writeFile(dataFile(), `${JSON.stringify({ events: retained }, null, 2)}\n`);
  return { recorded: true, eventId: event.eventId };
}

async function listAnalyticsEvents({ since } = {}) {
  const sinceDate = since instanceof Date && Number.isFinite(since.getTime()) ? since : new Date(0);
  if (usePostgres()) {
    const result = await query(
      `SELECT * FROM storefront_analytics_events
        WHERE occurred_at >= $1
        ORDER BY occurred_at ASC`,
      [sinceDate]
    );
    return result.rows.map(fromRow);
  }
  return (await readFile())
    .filter((event) => new Date(event.occurredAt || 0) >= sinceDate)
    .sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));
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
    referrerHost: row.referrer_host || '',
    utmSource: row.utm_source || '',
    utmMedium: row.utm_medium || '',
    utmCampaign: row.utm_campaign || '',
    metricName: row.metric_name || '',
    metricValue: row.metric_value === null ? null : Number(row.metric_value),
    occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : ''
  };
}

module.exports = {
  VALID_EVENTS,
  deviceType,
  listAnalyticsEvents,
  normalizeEvent,
  persistNormalizedAnalyticsEvent,
  recordAnalyticsEvent,
  sessionHash
};
