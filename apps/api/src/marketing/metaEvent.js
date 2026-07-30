const crypto = require('node:crypto');
const { normalizePhilippinePhone } = require('../jnt/jntExport');
const {
  META_CURRENCY,
  centavosToMetaPesos,
  normalizeMetaValue,
  validateMetaPurchase
} = require('./metaMoney');
const { normalizeTestEventCode } = require('./metaControlledTest');
const { PII_DATA_TYPE, annotateMetaHashedPii } = require('./metaParameterBuilder');

const META_BROWSER_ID_PATTERN = /^fb\.\d+\.\d+\.[a-zA-Z0-9._~-]+$/;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function metaPii(value, dataType) {
  return annotateMetaHashedPii(sha256(value), dataType);
}

function normalizeEmailForMeta(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

function normalizePhoneForMeta(phone) {
  return normalizePhilippinePhone(phone).replace(/^\+/, '');
}

function normalizeTextForMeta(value, { compact = false } = {}) {
  const normalized = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, compact ? '' : ' ');
  return normalized.slice(0, 100);
}

function contentId(item = {}) {
  return String(item.externalPosVariantId || item.variantId || item.sku || item.id || item.productId || '').trim();
}

function moneyValue(cents) {
  return centavosToMetaPesos(cents);
}

function purchaseValue(totalCents) {
  return centavosToMetaPesos(totalCents);
}

function metaPurchaseEventId(order = {}) {
  const storedEventId = String(order.metaPurchaseEventId || order.meta_purchase_event_id || '').trim();
  if (storedEventId) return storedEventId;
  const orderId = String(order.orderNumber || order.id || '').trim();
  return orderId ? `purchase_${orderId}` : '';
}

function optionalText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeMetaBrowserId(value) {
  const normalized = optionalText(value, 255);
  return META_BROWSER_ID_PATTERN.test(normalized) ? normalized : '';
}

function safeMetaUrl(value, { baseUrl, sameOrigin = false } = {}) {
  try {
    const base = baseUrl ? new URL(String(baseUrl)) : undefined;
    const url = base
      ? new URL(optionalText(value, 2048) || '/', base)
      : new URL(optionalText(value, 2048));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (sameOrigin && base && url.origin !== base.origin) return '';
    url.username = '';
    url.password = '';
    url.hash = '';
    return url.toString();
  } catch (_error) {
    return '';
  }
}

function parseMetaCookies(header) {
  const cookies = Object.fromEntries(String(header || '').split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    try {
      return [name, decodeURIComponent(raw)];
    } catch (_error) {
      return [name, raw];
    }
  }).filter(([name]) => name));
  return {
    fbp: normalizeMetaBrowserId(cookies._fbp),
    fbc: normalizeMetaBrowserId(cookies._fbc)
  };
}

function buildMetaPurchaseEvent({ order, requestContext = {} }) {
  const value = purchaseValue(order?.totalCents);
  const eventId = metaPurchaseEventId(order);
  if (value === null || !eventId) return null;

  const sourceItems = Array.isArray(order?.items) ? order.items : [];
  const items = sourceItems
    .map((item) => {
      const quantity = Number(item.quantity);
      const unitPriceCents = Number(item.unitPriceCents);
      const id = contentId(item);
      const itemPrice = Number.isInteger(unitPriceCents) ? moneyValue(unitPriceCents) : null;
      if (!id || !Number.isInteger(quantity) || quantity <= 0 || itemPrice === null) return null;
      return {
        id,
        quantity,
        item_price: itemPrice
      };
    })
    .filter(Boolean);
  if (!sourceItems.length || items.length !== sourceItems.length) return null;
  const email = normalizeEmailForMeta(order?.customer?.email);
  const phone = normalizePhoneForMeta(order?.customer?.phone);
  const userData = {};
  if (email) userData.em = [metaPii(email, PII_DATA_TYPE.EMAIL)];
  if (phone) userData.ph = [metaPii(phone, PII_DATA_TYPE.PHONE)];
  const firstName = normalizeTextForMeta(order?.customer?.firstName, { compact: true });
  const lastName = normalizeTextForMeta(order?.customer?.lastName, { compact: true });
  const city = normalizeTextForMeta(order?.address?.cityName || order?.address?.city || order?.address?.municipality, { compact: true });
  const province = normalizeTextForMeta(order?.address?.provinceName || order?.address?.province, { compact: true });
  const postalCode = normalizeTextForMeta(order?.address?.postalCode || order?.address?.zipCode, { compact: true });
  const externalId = normalizeTextForMeta(order?.customerAccountId, { compact: true });
  if (firstName) userData.fn = [metaPii(firstName, PII_DATA_TYPE.FIRST_NAME)];
  if (lastName) userData.ln = [metaPii(lastName, PII_DATA_TYPE.LAST_NAME)];
  if (city) userData.ct = [metaPii(city, PII_DATA_TYPE.CITY)];
  if (province) userData.st = [metaPii(province, PII_DATA_TYPE.STATE)];
  if (postalCode) userData.zp = [metaPii(postalCode, PII_DATA_TYPE.ZIP_CODE)];
  if (city || province || postalCode) userData.country = [metaPii('ph', PII_DATA_TYPE.COUNTRY)];
  if (externalId) userData.external_id = [metaPii(externalId, PII_DATA_TYPE.EXTERNAL_ID)];

  const clientIp = optionalText(requestContext.clientIp, 96);
  const clientUserAgent = optionalText(requestContext.clientUserAgent, 512);
  const fbp = normalizeMetaBrowserId(requestContext.fbp);
  const fbc = normalizeMetaBrowserId(requestContext.fbc);
  if (clientIp) userData.client_ip_address = clientIp;
  if (clientUserAgent) userData.client_user_agent = clientUserAgent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const completedAtMs = new Date(order.paidAt || order.placedAt).getTime();
  const event = {
    event_name: 'Purchase',
    event_time: Math.floor((Number.isFinite(completedAtMs) ? completedAtMs : Date.now()) / 1000),
    event_id: eventId,
    action_source: 'website',
    user_data: userData,
    custom_data: {
      currency: META_CURRENCY,
      value,
      order_id: String(order.orderNumber || ''),
      payment_method: String(order.paymentMethod || ''),
      content_type: 'product',
      content_ids: items.map((item) => item.id),
      num_items: items.reduce((total, item) => total + item.quantity, 0),
      contents: items
    }
  };
  const validation = validateMetaPurchase({
    value: event.custom_data.value,
    currency: event.custom_data.currency,
    eventId: event.event_id
  });
  if (!validation.valid) return null;
  const sourceUrl = safeMetaUrl(requestContext.sourceUrl);
  if (sourceUrl) event.event_source_url = sourceUrl;
  const referrerUrl = safeMetaUrl(requestContext.referrerUrl);
  if (referrerUrl) event.referrer_url = referrerUrl;
  const controlledTestEventCode = normalizeTestEventCode(requestContext.metaTestEventCode);
  if (requestContext.metaControlledTestAuthorized === true && controlledTestEventCode) {
    event._meta_test_event_code = controlledTestEventCode;
  }
  return event;
}

function logMetaPurchaseDevelopment(logger, { order, event, browserPixelSent = 'reported_by_browser', conversionsApiSent = false, reason = '' }) {
  const details = {
    orderId: String(order?.id || order?.orderNumber || ''),
    eventId: event?.event_id || metaPurchaseEventId(order),
    purchaseValue: event?.custom_data?.value ?? purchaseValue(order?.totalCents),
    currency: event?.custom_data?.currency || META_CURRENCY,
    paymentMethod: String(order?.paymentMethod || ''),
    numberOfItems: event?.custom_data?.num_items ?? (Array.isArray(order?.items)
      ? order.items.reduce((total, item) => total + Math.max(0, Number(item.quantity || 0)), 0)
      : 0),
    browserPixelSent,
    conversionsApiSent,
    reason
  };
  if (!event) {
    logger?.warn?.('Meta Purchase not queued because its order data is invalid.', details);
    return;
  }
  if (process.env.NODE_ENV === 'development') {
    logger?.info?.('Meta Purchase development status.', details);
  }
}

module.exports = {
  buildMetaPurchaseEvent,
  centavosToMetaPesos,
  logMetaPurchaseDevelopment,
  metaPurchaseEventId,
  normalizeMetaValue,
  normalizeMetaBrowserId,
  normalizeEmailForMeta,
  normalizePhoneForMeta,
  normalizeTextForMeta,
  parseMetaCookies,
  purchaseValue,
  safeMetaUrl,
  sha256,
  META_CURRENCY,
  validateMetaPurchase
};
