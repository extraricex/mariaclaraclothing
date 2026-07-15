const crypto = require('node:crypto');
const { normalizePhilippinePhone } = require('../jnt/jntExport');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeEmailForMeta(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

function normalizePhoneForMeta(phone) {
  return normalizePhilippinePhone(phone).replace(/^\+/, '');
}

function contentId(item = {}) {
  return String(item.externalPosVariantId || item.variantId || item.sku || item.id || item.productId || '').trim();
}

function normalizeMetaValue(amount) {
  const normalized = typeof amount === 'number'
    ? amount
    : Number(String(amount ?? '').replace(/[₱,\s]/g, ''));
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return Number(normalized.toFixed(2));
}

function centavosToMetaPesos(amountInCentavos) {
  const raw = typeof amountInCentavos === 'number'
    ? amountInCentavos
    : String(amountInCentavos ?? '').trim();
  if (typeof raw === 'string' && !/^\d+$/.test(raw)) return null;
  const cents = Number(raw);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return normalizeMetaValue(cents / 100);
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
    fbp: optionalText(cookies._fbp, 255),
    fbc: optionalText(cookies._fbc, 255)
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
  if (email) userData.em = [sha256(email)];
  if (phone) userData.ph = [sha256(phone)];

  const clientIp = optionalText(requestContext.clientIp, 64);
  const clientUserAgent = optionalText(requestContext.clientUserAgent, 512);
  const fbp = optionalText(requestContext.fbp, 255);
  const fbc = optionalText(requestContext.fbc, 255);
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
      currency: 'PHP',
      value,
      order_id: String(order.orderNumber || ''),
      payment_method: String(order.paymentMethod || ''),
      content_type: 'product',
      content_ids: items.map((item) => item.id),
      num_items: items.reduce((total, item) => total + item.quantity, 0),
      contents: items
    }
  };
  const sourceUrl = optionalText(requestContext.sourceUrl, 2048);
  if (sourceUrl) event.event_source_url = sourceUrl;
  return event;
}

function logMetaPurchaseDevelopment(logger, { order, event, browserPixelSent = 'reported_by_browser', conversionsApiSent = false, reason = '' }) {
  const details = {
    orderId: String(order?.id || order?.orderNumber || ''),
    eventId: event?.event_id || metaPurchaseEventId(order),
    purchaseValue: event?.custom_data?.value ?? purchaseValue(order?.totalCents),
    currency: event?.custom_data?.currency || 'PHP',
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
  normalizeEmailForMeta,
  normalizePhoneForMeta,
  parseMetaCookies,
  purchaseValue,
  sha256
};
