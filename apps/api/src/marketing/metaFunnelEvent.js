const { META_CURRENCY, centavosToMetaPesos } = require('./metaMoney');
const { PII_DATA_TYPE, annotateMetaHashedPii } = require('./metaParameterBuilder');
const {
  normalizeEmailForMeta,
  normalizeMetaBrowserId,
  normalizePhoneForMeta,
  normalizeTextForMeta,
  parseMetaCookies,
  safeMetaUrl,
  sha256
} = require('./metaEvent');

const ANALYTICS_TO_META = Object.freeze({
  page_view: 'PageView',
  product_view: 'ViewContent',
  add_to_cart: 'AddToCart',
  initiate_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo'
});
function text(value, maximum = 255) {
  return String(value || '').trim().slice(0, maximum);
}

function isLikelyBot(userAgent) {
  return /bot|crawler|spider|headless|lighthouse|healthcheck|uptime|monitor/i.test(String(userAgent || ''));
}

function sanitizeContents(value) {
  if (!Array.isArray(value) || !value.length || value.length > 50) return [];
  return value.map((item) => {
    const id = text(item?.id, 120);
    const quantity = item?.quantity;
    const itemPrice = item?.item_price;
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000
      || !Number.isFinite(itemPrice) || itemPrice <= 0) return null;
    return { id, quantity, item_price: Number(itemPrice.toFixed(2)) };
  }).filter(Boolean);
}

function sanitizeCustomData(input, analyticsEvent) {
  const value = centavosToMetaPesos(analyticsEvent.valueCents);
  if (value === null) return null;
  const source = input && typeof input === 'object' ? input : {};
  const contents = sanitizeContents(source.contents);
  if (!contents.length) return null;
  const contentIds = Array.isArray(source.content_ids) ? source.content_ids.map((id) => text(id, 120)) : [];
  const expectedIds = contents.map((item) => item.id);
  const quantity = contents.reduce((sum, item) => sum + item.quantity, 0);
  if (contentIds.length !== expectedIds.length
    || contentIds.some((id, index) => id !== expectedIds[index])
    || !Number.isInteger(source.num_items)
    || source.num_items !== quantity
    || source.currency !== META_CURRENCY
    || typeof source.value !== 'number'
    || source.value !== value) return null;
  return {
    content_ids: expectedIds,
    content_type: 'product',
    contents,
    currency: META_CURRENCY,
    num_items: quantity,
    value,
    ...(text(source.content_name, 255) ? { content_name: text(source.content_name, 255) } : {}),
    ...(text(source.content_category, 255) ? { content_category: text(source.content_category, 255) } : {}),
    ...(text(source.content_variant, 100) ? { content_variant: text(source.content_variant, 100) } : {}),
    ...(text(source.payment_type, 80) ? { payment_type: text(source.payment_type, 80) } : {})
  };
}

function safeSourceUrl(path, baseUrl) {
  const source = safeMetaUrl(text(path, 240) || '/', {
    baseUrl: String(baseUrl || 'https://mariaclaraclothing.com'),
    sameOrigin: true
  });
  if (!source) return '';
  const url = new URL(source);
  url.search = '';
  return url.toString();
}

function addHashedCustomerData(userData, customer = {}) {
  const safeCustomer = customer && typeof customer === 'object' ? customer : {};
  const email = normalizeEmailForMeta(safeCustomer.email);
  const phone = normalizePhoneForMeta(safeCustomer.phone);
  const firstName = normalizeTextForMeta(safeCustomer.firstName, { compact: true });
  const lastName = normalizeTextForMeta(safeCustomer.lastName, { compact: true });
  const externalId = normalizeTextForMeta(safeCustomer.id || safeCustomer.externalId, { compact: true });
  const address = safeCustomer.savedAddress && typeof safeCustomer.savedAddress === 'object'
    ? safeCustomer.savedAddress
    : {};
  const city = normalizeTextForMeta(address.cityName || address.city || address.municipality, { compact: true });
  const province = normalizeTextForMeta(address.provinceName || address.province, { compact: true });
  const postalCode = normalizeTextForMeta(address.postalCode || address.zipCode, { compact: true });

  const metaPii = (value, dataType) => annotateMetaHashedPii(sha256(value), dataType);
  if (email) userData.em = [metaPii(email, PII_DATA_TYPE.EMAIL)];
  if (phone) userData.ph = [metaPii(phone, PII_DATA_TYPE.PHONE)];
  if (firstName) userData.fn = [metaPii(firstName, PII_DATA_TYPE.FIRST_NAME)];
  if (lastName) userData.ln = [metaPii(lastName, PII_DATA_TYPE.LAST_NAME)];
  if (externalId) userData.external_id = [metaPii(externalId, PII_DATA_TYPE.EXTERNAL_ID)];
  if (city) userData.ct = [metaPii(city, PII_DATA_TYPE.CITY)];
  if (province) userData.st = [metaPii(province, PII_DATA_TYPE.STATE)];
  if (postalCode) userData.zp = [metaPii(postalCode, PII_DATA_TYPE.ZIP_CODE)];
  if (city || province || postalCode) userData.country = [metaPii('ph', PII_DATA_TYPE.COUNTRY)];
  return userData;
}

function buildMetaFunnelEvent(input, analyticsEvent, request = {}) {
  const eventName = ANALYTICS_TO_META[analyticsEvent?.eventName];
  const eventId = text(input?.metaEventId || input?.eventId, 100);
  if (!eventName || input?.metaBrowserSent !== true || input?.metaEventName !== eventName
    || eventId !== analyticsEvent?.eventId || isLikelyBot(request.userAgent)) return null;
  const customData = eventName === 'PageView'
    ? undefined
    : sanitizeCustomData(input.metaCustomData, analyticsEvent);
  if (eventName !== 'PageView' && !customData) return null;
  const cookies = parseMetaCookies(request.cookieHeader);
  const parameterBuilder = request.parameterBuilder && typeof request.parameterBuilder === 'object'
    ? request.parameterBuilder
    : {};
  const userData = {};
  const clientIp = text(parameterBuilder.clientIpAddress || request.clientIp, 96);
  const clientUserAgent = text(request.userAgent, 512);
  const fbp = normalizeMetaBrowserId(parameterBuilder.fbp)
    || normalizeMetaBrowserId(cookies.fbp)
    || normalizeMetaBrowserId(input.metaFbp);
  const fbc = normalizeMetaBrowserId(parameterBuilder.fbc)
    || normalizeMetaBrowserId(cookies.fbc)
    || normalizeMetaBrowserId(input.metaFbc);
  if (clientIp) userData.client_ip_address = clientIp;
  if (clientUserAgent) userData.client_user_agent = clientUserAgent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  addHashedCustomerData(userData, request.customer);
  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: 'website',
    user_data: userData
  };
  const sourceUrl = parameterBuilder.eventSourceUrl
    ? safeMetaUrl(parameterBuilder.eventSourceUrl, {
      baseUrl: request.siteUrl,
      sameOrigin: true
    })
    : safeSourceUrl(analyticsEvent.path, request.siteUrl);
  if (sourceUrl) event.event_source_url = sourceUrl;
  const referrerUrl = safeMetaUrl(parameterBuilder.referrerUrl);
  if (referrerUrl) event.referrer_url = referrerUrl;
  if (customData) event.custom_data = customData;
  return event;
}

module.exports = {
  ANALYTICS_TO_META,
  addHashedCustomerData,
  buildMetaFunnelEvent,
  isLikelyBot,
  normalizeMetaBrowserId,
  safeSourceUrl,
  sanitizeContents,
  sanitizeCustomData
};
