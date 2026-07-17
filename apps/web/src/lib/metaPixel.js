import { createFunnelEventId, normalizeFunnelEventId, trackFunnelEvent } from './funnelAnalytics.js';

export const META_CURRENCY = 'PHP';
const META_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';
const META_CONSENT_KEY = 'maria-clara-meta-tracking-consent';
const MONETARY_EVENTS = new Set(['ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase']);
export const META_CONSENT_EVENT = 'maria-clara-meta-consent-changed';
let lastTrackedPagePath = '';
let lastCheckoutEventId = '';
let lastViewContentKey = '';
let runtimePixelConfig = null;
const pendingPixelEvents = [];
const trackedPurchaseEventIds = new Set();

function storageGet(storage, key) {
  try { return storage?.getItem(key) || null; } catch (_error) { return null; }
}

function storageSet(storage, key, value) {
  try { storage?.setItem(key, value); } catch (_error) { /* tracking must never interrupt checkout */ }
}

function defaultConsentStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function wasFacebookPurchaseTracked(eventId, storage = defaultConsentStorage()) {
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId) return false;
  return trackedPurchaseEventIds.has(normalizedEventId) || Boolean(storageGet(storage, `maria-clara-facebook-${normalizedEventId}`));
}

export function getMetaTrackingConsent(storage = defaultConsentStorage()) {
  const value = storageGet(storage, META_CONSENT_KEY);
  return value === 'accepted' || value === 'declined' ? value : 'unset';
}

export function setMetaTrackingConsent(value, options = {}) {
  const storage = options.storage || defaultConsentStorage();
  const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : null);
  try {
    if (value === 'accepted' || value === 'declined') storage?.setItem(META_CONSENT_KEY, value);
    else storage?.removeItem(META_CONSENT_KEY);
  } catch (_error) { /* privacy storage failure must not break the storefront */ }
  const requested = value === 'accepted' ? 'grant' : 'revoke';
  const effective = runtimePixelConfig?.requireConsent === false ? 'grant' : requested;
  setFacebookPixelConsent(windowRef, effective);
  windowRef?.dispatchEvent?.(new Event(META_CONSENT_EVENT));
}

function setFacebookPixelConsent(windowRef, value) {
  if (!windowRef?.fbq || !['grant', 'revoke'].includes(value)) return;
  if (windowRef.__mariaClaraFacebookConsent === value) return;
  windowRef.fbq('consent', value);
  windowRef.__mariaClaraFacebookConsent = value;
}

function hasMetaTrackingConsent(options = {}) {
  const navigatorRef = options.navigatorRef || (typeof navigator !== 'undefined' ? navigator : null);
  if (navigatorRef?.doNotTrack === '1' || navigatorRef?.globalPrivacyControl === true) return false;
  const requireConsent = options.requireConsent ?? runtimePixelConfig?.requireConsent ?? true;
  if (!requireConsent) return true;
  return options.consent ?? getMetaTrackingConsent(options.consentStorage) === 'accepted';
}

export function metaPixelConfig(source = {}) {
  const pixelId = String(source.VITE_FACEBOOK_META_PIXEL_ID || '').trim();
  const enabled = source.VITE_FACEBOOK_META_PIXEL_ENABLED === 'true' &&
    Boolean(pixelId) &&
    !pixelId.includes('YOUR_PIXEL_ID');
  return { enabled, pixelId: enabled ? pixelId : '' };
}

export function configureFacebookMetaPixel(settings = {}) {
  const pixelId = String(settings.pixelId || '').trim();
  runtimePixelConfig = {
    enabled: Boolean(settings.enabled && pixelId),
    pixelId,
    requireConsent: Boolean(settings.requireConsent),
    browserPurchaseEnabled: Boolean(settings.browserPurchaseEnabled)
  };
  if (!runtimePixelConfig.enabled && typeof window !== 'undefined') {
    setFacebookPixelConsent(window, 'revoke');
    pendingPixelEvents.length = 0;
  }
  return runtimePixelConfig;
}

export function isFacebookAdminPath(path) {
  const pathname = String(path || '').split(/[?#]/, 1)[0].replace(/\/+$/, '').toLowerCase() || '/';
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

// Temporary production safety boundary: account-side Event Setup rules cannot
// create a second Purchase on checkout confirmation routes while server CAPI is
// authoritative. Re-enable browser Purchase only after Meta Test Events proves
// that automatic rules are removed and browser/server event IDs deduplicate.
export function isFacebookPurchaseSensitivePath(path) {
  const pathname = String(path || '').split(/[?#]/, 1)[0].replace(/\/+$/, '').toLowerCase() || '/';
  return pathname === '/checkout/review' || pathname === '/thank-you';
}

export function isFacebookBrowserPurchaseReady(options = {}) {
  const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : null);
  return isBrowserPurchaseEnabled(options, windowRef) && hasMetaTrackingConsent(options);
}

export function isFacebookPrivateQueryPath(path) {
  const value = String(path || '');
  const [pathname, search = ''] = value.split('?', 2);
  if (!search) return false;
  const normalized = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const params = new URLSearchParams(search);
  return (normalized === '/reset-password' && params.has('token'))
    || (normalized === '/cart' && params.has('restore'));
}

function canonicalMetaPath(path) {
  return String(path || '/').split(/[?#]/, 1)[0] || '/';
}

function isBrowserPurchaseEnabled(options = {}, windowRef = null) {
  return Boolean(
    options.browserPurchaseEnabled
    ?? runtimePixelConfig?.browserPurchaseEnabled
    ?? windowRef?.__mariaClaraFacebookPixelConfig?.browserPurchaseEnabled
    ?? false
  );
}

export function shouldTrackFacebookPath(previousPath, nextPath) {
  const normalized = String(nextPath || '');
  return Boolean(normalized) && normalized !== previousPath && !isFacebookAdminPath(normalized);
}

export function initializeFacebookMetaPixel(options = {}) {
  const environment = metaPixelConfig(import.meta.env || {});
  const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : null);
  const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
  const enabled = options.enabled ?? runtimePixelConfig?.enabled ?? environment.enabled;
  const pixelId = String(options.pixelId ?? runtimePixelConfig?.pixelId ?? environment.pixelId).trim();
  const requireConsent = options.requireConsent ?? runtimePixelConfig?.requireConsent ?? true;
  const path = options.path ?? windowRef?.location?.pathname ?? '';

  if (!windowRef || !documentRef || !enabled || !pixelId || isFacebookAdminPath(path)) return false;
  const consentGranted = hasMetaTrackingConsent({ ...options, requireConsent });
  if (requireConsent && !consentGranted) {
    setFacebookPixelConsent(windowRef, 'revoke');
    return false;
  }
  if (windowRef.__mariaClaraFacebookPixelId === pixelId) {
    setFacebookPixelConsent(windowRef, consentGranted ? 'grant' : 'revoke');
    return consentGranted;
  }

  if (!windowRef.fbq) {
    const queue = function facebookPixelQueue() {
      queue.callMethod
        ? queue.callMethod.apply(queue, arguments)
        : queue.queue.push(arguments);
    };
    windowRef.fbq = queue;
    windowRef._fbq = queue;
    queue.push = queue;
    queue.loaded = true;
    queue.version = '2.0';
    queue.queue = [];

    const script = documentRef.createElement('script');
    script.async = true;
    script.src = META_SCRIPT_URL;
    const firstScript = documentRef.getElementsByTagName('script')[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      documentRef.head?.appendChild(script);
    }
  }

  if (requireConsent) setFacebookPixelConsent(windowRef, 'revoke');
  windowRef.fbq('set', 'autoConfig', false, pixelId);
  windowRef.fbq('init', pixelId);
  if (requireConsent) {
    setFacebookPixelConsent(windowRef, consentGranted ? 'grant' : 'revoke');
  } else {
    windowRef.__mariaClaraFacebookConsent = 'grant';
  }
  windowRef.__mariaClaraFacebookPixelId = pixelId;
  return consentGranted;
}

export function normalizeMetaValue(amount) {
  const normalized = typeof amount === 'number'
    ? amount
    : Number(String(amount ?? '').replace(/[₱,\s]/g, '').trim());
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return Number(normalized.toFixed(2));
}

export function centavosToMetaPesos(amountInCentavos) {
  const raw = typeof amountInCentavos === 'number'
    ? amountInCentavos
    : String(amountInCentavos ?? '').trim();
  if (typeof raw === 'string' && !/^\d+$/.test(raw)) return null;
  const cents = Number(raw);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return normalizeMetaValue(cents / 100);
}

export function facebookMoneyValue(cents) {
  return centavosToMetaPesos(cents);
}

export function facebookPurchaseValue(totalCents) {
  return centavosToMetaPesos(totalCents);
}

export function facebookContentId(item = {}) {
  return String(
    item.externalPosVariantId ||
    item.variantId ||
    item.sku ||
    item.id ||
    item.externalPosProductId ||
    item.productId ||
    item.slug ||
    ''
  ).trim();
}

export function facebookContents(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const quantity = Number(item.quantity);
      const unitPriceCents = Number(item.unitPriceCents ?? item.priceCents);
      const id = facebookContentId(item);
      const itemPrice = Number.isInteger(unitPriceCents) ? centavosToMetaPesos(unitPriceCents) : null;
      if (!id || !Number.isInteger(quantity) || quantity <= 0 || itemPrice === null) return null;
      return { id, quantity, item_price: itemPrice };
    })
    .filter(Boolean);
}

export function purchaseEventId(orderNumber) {
  const orderId = String(orderNumber || '').trim();
  return orderId ? `purchase_${orderId}` : '';
}

export function validateMetaPurchase({ value, currency, eventId } = {}) {
  const errors = [];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push('Purchase value must be a numeric amount greater than 0.');
  }
  if (currency !== META_CURRENCY) {
    errors.push(`Purchase currency must be exactly "${META_CURRENCY}".`);
  }
  if (!String(eventId || '').trim()) {
    errors.push('Meta Purchase event ID is required.');
  }
  return { valid: errors.length === 0, errors };
}

export function buildFacebookPurchase(order = {}, items = [], suppliedEventId = '') {
  const value = facebookPurchaseValue(order.totalCents);
  const eventId = String(suppliedEventId || order.trackingEventId || purchaseEventId(order.orderNumber || order.id)).trim();
  if (value === null || !eventId || !order.orderNumber) return null;
  const sourceItems = Array.isArray(items) ? items : [];
  const contents = facebookContents(sourceItems);
  if (!sourceItems.length || contents.length !== sourceItems.length) return null;
  return {
    eventId,
    payload: {
      content_ids: contents.map((item) => item.id),
      content_type: 'product',
      contents,
      currency: META_CURRENCY,
      num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
      order_id: String(order.orderNumber || ''),
      value
    }
  };
}

export function buildFacebookViewContent(product = {}) {
  const contentId = facebookContentId(product);
  const value = centavosToMetaPesos(product.priceCents);
  if (!contentId || value === null) return null;
  return {
    content_ids: [contentId],
    content_name: String(product.name || '').trim(),
    content_type: 'product',
    content_category: String(product.collection || (Array.isArray(product.collections) ? product.collections.join(', ') : '')),
    content_variant: String(product.size || ''),
    contents: [{ id: contentId, quantity: 1, item_price: value }],
    currency: META_CURRENCY,
    num_items: 1,
    value
  };
}

export function buildFacebookAddToCart(item = {}) {
  const contents = facebookContents([item]);
  if (contents.length !== 1) return null;
  const quantity = contents[0].quantity;
  const unitPriceCents = Number(item.unitPriceCents ?? item.priceCents);
  const value = Number.isInteger(unitPriceCents)
    ? centavosToMetaPesos(unitPriceCents * quantity)
    : null;
  if (value === null) return null;
  return {
    content_ids: contents.map((content) => content.id),
    content_name: String(item.productName || item.name || ''),
    content_type: 'product',
    content_variant: String(item.size || ''),
    contents,
    currency: META_CURRENCY,
    num_items: contents.reduce((sum, content) => sum + content.quantity, 0),
    value
  };
}

export function buildFacebookInitiateCheckout(items = [], totals = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const contents = facebookContents(sourceItems);
  const value = centavosToMetaPesos(totals.totalCents);
  if (!sourceItems.length || contents.length !== sourceItems.length || value === null) return null;
  return {
    content_ids: contents.map((content) => content.id),
    content_type: 'product',
    contents,
    currency: META_CURRENCY,
    num_items: contents.reduce((sum, content) => sum + content.quantity, 0),
    value
  };
}

export function buildFacebookAddPaymentInfo(items = [], totals = {}, paymentMethod = '') {
  const checkout = buildFacebookInitiateCheckout(items, totals);
  if (!checkout) return null;
  return {
    ...checkout,
    payment_type: String(paymentMethod || '')
  };
}

function hasValidMonetaryPayload(eventName, payload) {
  if (!MONETARY_EVENTS.has(eventName)) return true;
  return payload?.currency === META_CURRENCY &&
    typeof payload?.value === 'number' &&
    Number.isFinite(payload.value) &&
    payload.value > 0;
}

export function trackFacebookEvent(eventName, payload = {}, options = {}) {
  const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : null);
  const path = options.path ?? windowRef?.location?.pathname ?? '';
  if (runtimePixelConfig?.enabled === false || isFacebookAdminPath(path)) return false;
  if (eventName === 'Purchase' && !isBrowserPurchaseEnabled(options, windowRef)) {
    return false;
  }
  if (!hasValidMonetaryPayload(eventName, payload)) {
    if (import.meta.env?.DEV && typeof console !== 'undefined') {
      console.warn('Meta monetary event not sent because value or currency is invalid.', {
        eventName,
        eventId: String(options.eventId || ''),
        value: payload?.value,
        currency: payload?.currency
      });
    }
    return false;
  }
  if (!hasMetaTrackingConsent(options)) return false;
  if (!windowRef?.fbq) {
    if (runtimePixelConfig === null && pendingPixelEvents.length < 50) {
      const key = `${eventName}:${options.eventId || ''}:${JSON.stringify(payload)}`;
      if (!pendingPixelEvents.some((event) => event.key === key)) {
        pendingPixelEvents.push({ key, eventName, payload, options: { ...options, windowRef: undefined } });
      }
      return true;
    }
    return false;
  }

  if (options.eventId) {
    windowRef.fbq('track', eventName, payload, { eventID: options.eventId });
  } else {
    windowRef.fbq('track', eventName, payload);
  }
  return true;
}

export function flushPendingFacebookEvents(options = {}) {
  if (!hasMetaTrackingConsent(options)) {
    pendingPixelEvents.length = 0;
    return 0;
  }
  const events = pendingPixelEvents.splice(0);
  let sent = 0;
  for (const event of events) {
    if (trackFacebookEvent(event.eventName, event.payload, { ...event.options, ...options })) sent += 1;
  }
  return sent;
}

export function trackFacebookPageView(path, options = {}) {
  const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : null);
  const canonicalPath = canonicalMetaPath(path);
  if (!shouldTrackFacebookPath(lastTrackedPagePath, canonicalPath)) return false;
  const eventId = createFunnelEventId('pageview');
  const privateQuery = isFacebookPrivateQueryPath(path);
  const tracked = privateQuery ? false : trackFacebookEvent('PageView', {}, {
    ...options,
    path: canonicalPath,
    eventId
  });
  trackFunnelEvent('page_view', {
    path: canonicalPath,
    eventId,
    dedupeKey: canonicalPath,
    dedupeMilliseconds: 1200,
    metaBrowserSent: tracked,
    metaEventName: 'PageView'
  });
  lastTrackedPagePath = canonicalPath;
  lastViewContentKey = '';
  if (tracked) {
    windowRef.__mariaClaraLastMetaPageViewEventId = eventId;
  }
  return tracked;
}

export function trackFacebookViewContent(product, options = {}) {
  const payload = buildFacebookViewContent(product);
  if (!payload?.content_ids.length) return false;
  const eventId = createFunnelEventId('viewcontent');
  const key = `${options.path || ''}:${payload.content_ids.join(',')}`;
  if (key === lastViewContentKey) return false;
  const tracked = trackFacebookEvent('ViewContent', payload, { ...options, eventId });
  trackFunnelEvent('product_view', {
    eventId,
    path: options.path,
    productId: String(product.productId || product.id || product.slug || payload.content_ids[0] || ''),
    variantId: String(product.variantId || payload.content_ids[0] || ''),
    quantity: 1,
    valueCents: product.priceCents,
    dedupeKey: `${options.path || ''}:${payload.content_ids[0]}`,
    dedupeMilliseconds: 1500,
    metaBrowserSent: tracked,
    metaEventName: 'ViewContent',
    metaCustomData: payload
  });
  lastViewContentKey = key;
  return tracked;
}

export function trackFacebookAddToCart(item, options = {}) {
  const payload = buildFacebookAddToCart(item);
  if (!payload?.content_ids.length) return false;
  const eventId = normalizeFunnelEventId(options.eventId || createFunnelEventId('addtocart'), 'addtocart');
  const tracked = trackFacebookEvent('AddToCart', payload, { ...options, eventId });
  trackFunnelEvent('add_to_cart', {
    eventId,
    path: options.path,
    productId: String(item.productId || item.slug || payload.content_ids[0] || ''),
    variantId: String(item.variantId || payload.content_ids[0] || ''),
    quantity: payload.num_items,
    valueCents: Math.round(payload.value * 100),
    metaBrowserSent: tracked,
    metaEventName: 'AddToCart',
    metaCustomData: payload
  });
  return tracked;
}

export function trackFacebookInitiateCheckout(items, totals, eventId, options = {}) {
  const normalizedEventId = eventId ? normalizeFunnelEventId(eventId, 'checkout') : '';
  if (!normalizedEventId || lastCheckoutEventId === normalizedEventId) return false;
  const payload = buildFacebookInitiateCheckout(items, totals);
  if (!payload?.content_ids.length) return false;
  const tracked = trackFacebookEvent('InitiateCheckout', payload, { ...options, eventId: normalizedEventId });
  trackFunnelEvent('initiate_checkout', {
    eventId: normalizedEventId,
    path: options.path,
    quantity: payload.num_items,
    valueCents: totals.totalCents,
    dedupeKey: normalizedEventId,
    dedupeMilliseconds: 60_000,
    metaBrowserSent: tracked,
    metaEventName: 'InitiateCheckout',
    metaCustomData: payload
  });
  if (tracked) lastCheckoutEventId = normalizedEventId;
  return tracked;
}

export function trackFacebookAddPaymentInfo(items, totals, paymentMethod, eventId, options = {}) {
  const normalizedEventId = eventId ? normalizeFunnelEventId(eventId, 'payment') : '';
  if (!normalizedEventId) return false;
  const payload = buildFacebookAddPaymentInfo(items, totals, paymentMethod);
  if (!payload?.content_ids.length) return false;
  const storage = options.storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  const storageKey = `maria-clara-facebook-${normalizedEventId}`;
  if (storageGet(storage, storageKey)) return false;
  const tracked = trackFacebookEvent('AddPaymentInfo', payload, { ...options, eventId: normalizedEventId });
  trackFunnelEvent('add_payment_info', {
    eventId: normalizedEventId,
    path: options.path,
    quantity: payload.num_items,
    valueCents: totals.totalCents,
    paymentMethod,
    dedupeKey: normalizedEventId,
    dedupeMilliseconds: 60_000,
    metaBrowserSent: tracked,
    metaEventName: 'AddPaymentInfo',
    metaCustomData: payload
  });
  if (tracked) storageSet(storage, storageKey, 'tracked');
  return tracked;
}

export function trackFacebookPurchase(order, items, eventId, options = {}) {
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId || !order?.orderNumber) return false;

  const event = buildFacebookPurchase(order, items, normalizedEventId);
  if (!event) {
    logFacebookPurchaseDevelopment(order, normalizedEventId, items, false, 'invalid_purchase_data');
    return false;
  }
  const tracked = trackFacebookPurchasePayload(event, options);
  logFacebookPurchaseDevelopment(order, normalizedEventId, items, tracked, tracked ? 'sent' : 'not_sent');
  return tracked;
}

export function trackFacebookPurchasePayload(purchase = {}, options = {}) {
  const eventId = String(purchase.eventId || '').trim();
  const payload = purchase.payload;
  const contents = Array.isArray(payload?.contents) ? payload.contents : [];
  const contentIds = Array.isArray(payload?.content_ids) ? payload.content_ids.map(String) : [];
  const validContents = contents.length > 0 && contents.every((item) => (
    String(item?.id || '').trim() &&
    Number.isInteger(item?.quantity) && item.quantity > 0 &&
    typeof item?.item_price === 'number' && Number.isFinite(item.item_price) && item.item_price > 0
  ));
  const quantity = validContents ? contents.reduce((sum, item) => sum + item.quantity, 0) : 0;
  const validation = validateMetaPurchase({ value: payload?.value, currency: payload?.currency, eventId });
  if (!validation.valid || !hasValidMonetaryPayload('Purchase', payload) || !validContents ||
      contentIds.length !== contents.length || payload.num_items !== quantity) return false;

  const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const storageKey = `maria-clara-facebook-${eventId}`;
  if (wasFacebookPurchaseTracked(eventId, storage)) return false;
  const tracked = trackFacebookEvent('Purchase', payload, { ...options, eventId });
  if (tracked) {
    trackedPurchaseEventIds.add(eventId);
    storageSet(storage, storageKey, 'tracked');
  }
  return tracked;
}

function logFacebookPurchaseDevelopment(order, eventId, items, sent, reason) {
  if (!import.meta.env?.DEV || typeof console === 'undefined') return;
  const value = facebookPurchaseValue(order?.totalCents);
  console.info('Meta Purchase development status.', {
    eventName: 'Purchase',
    orderId: String(order?.id || order?.orderNumber || ''),
    eventId,
    purchaseValue: value,
    currency: META_CURRENCY,
    paymentMethod: String(order?.paymentMethod || ''),
    numberOfItems: (Array.isArray(items) ? items : []).reduce((total, item) => total + Math.max(0, Number(item.quantity || 0)), 0),
    browserPixelSent: sent,
    conversionsApiSent: 'reported_by_server',
    metaApiStatus: 'browser_pixel',
    reason
  });
}
