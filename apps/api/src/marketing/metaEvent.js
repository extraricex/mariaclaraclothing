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
  return String(item.externalPosVariantId || item.variantId || item.id || item.productId || '').trim();
}

function moneyValue(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function optionalText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function buildMetaPurchaseEvent({ order, requestContext = {} }) {
  const items = (Array.isArray(order?.items) ? order.items : [])
    .map((item) => ({
      id: contentId(item),
      quantity: Math.max(1, Number(item.quantity || 1)),
      item_price: moneyValue(item.unitPriceCents)
    }))
    .filter((item) => item.id);
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

  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(new Date(order.placedAt).getTime() / 1000),
    event_id: `purchase:${order.orderNumber}`,
    action_source: 'website',
    user_data: userData,
    custom_data: {
      currency: 'PHP',
      value: moneyValue(order.totalCents),
      order_id: String(order.orderNumber || ''),
      content_type: 'product',
      content_ids: items.map((item) => item.id),
      contents: items
    }
  };
  const sourceUrl = optionalText(requestContext.sourceUrl, 2048);
  if (sourceUrl) event.event_source_url = sourceUrl;
  return event;
}

module.exports = {
  buildMetaPurchaseEvent,
  normalizeEmailForMeta,
  normalizePhoneForMeta,
  sha256
};
