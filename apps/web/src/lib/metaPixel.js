const CURRENCY = 'PHP';
const META_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';
const META_CONSENT_KEY = 'maria-clara-meta-tracking-consent';
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

export function getMetaTrackingConsent(storage = defaultConsentStorage()) {
  const value = storageGet(storage, META_CONSENT_KEY);
  return value === 'accepted' || value === 'declined' ? value : 'unset';
}

export function setMetaTrackingConsent(value, options = {}) {
  const storage = options.storage || defaultConsentStorage();
  const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : null);
  if (value === 'accepted' || value === 'declined') storage?.setItem(META_CONSENT_KEY, value);
  else storage?.removeItem(META_CONSENT_KEY);
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
    requireConsent: Boolean(settings.requireConsent)
  };
  if (!runtimePixelConfig.enabled && typeof window !== 'undefined') {
    setFacebookPixelConsent(window, 'revoke');
    pendingPixelEvents.length = 0;
  }
  return runtimePixelConfig;
}

export function isFacebookAdminPath(path) {
  return String(path || '').startsWith('/admin');
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
  windowRef.fbq('init', pixelId);
  if (requireConsent) {
    setFacebookPixelConsent(windowRef, consentGranted ? 'grant' : 'revoke');
  } else {
    windowRef.__mariaClaraFacebookConsent = 'grant';
  }
  windowRef.__mariaClaraFacebookPixelId = pixelId;
  return consentGranted;
}

export function facebookMoneyValue(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

export function facebookPurchaseValue(totalCents) {
  const cents = Number(totalCents);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  const value = Number((cents / 100).toFixed(2));
  return Number.isFinite(value) && value > 0 ? value : null;
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
      return {
        id: facebookContentId(item),
        quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 0,
        item_price: Number.isInteger(unitPriceCents) && unitPriceCents >= 0
          ? facebookMoneyValue(unitPriceCents)
          : null
      };
    })
    .filter((item) => item.id && item.quantity > 0 && Number.isFinite(item.item_price));
}

export function purchaseEventId(orderNumber) {
  const orderId = String(orderNumber || '').trim();
  return orderId ? `purchase_${orderId}` : '';
}

export function buildFacebookPurchase(order = {}, items = [], suppliedEventId = '') {
  const value = facebookPurchaseValue(order.totalCents);
  const eventId = String(suppliedEventId || order.trackingEventId || purchaseEventId(order.id || order.orderNumber)).trim();
  if (value === null || !eventId || !order.orderNumber) return null;
  const contents = facebookContents(items);
  return {
    eventId,
    payload: {
      content_ids: contents.map((item) => item.id),
      content_type: 'product',
      contents,
      currency: CURRENCY,
      num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
      order_id: String(order.orderNumber || ''),
      value
    }
  };
}

export function buildFacebookViewContent(product = {}) {
  const contentId = facebookContentId(product);
  return {
    content_ids: contentId ? [contentId] : [],
    content_name: String(product.name || ''),
    content_type: 'product',
    content_category: String(product.collection || ''),
    content_variant: String(product.size || ''),
    contents: contentId ? [{ id: contentId, quantity: 1, item_price: facebookMoneyValue(product.priceCents) }] : [],
    currency: CURRENCY,
    value: facebookMoneyValue(product.priceCents)
  };
}

export function buildFacebookAddToCart(item = {}) {
  const contents = facebookContents([item]);
  return {
    content_ids: contents.map((content) => content.id),
    content_name: String(item.productName || item.name || ''),
    content_type: 'product',
    content_variant: String(item.size || ''),
    contents,
    currency: CURRENCY,
    num_items: contents.reduce((sum, content) => sum + content.quantity, 0),
    value: facebookMoneyValue(Number(item.unitPriceCents || item.priceCents || 0) * Number(item.quantity || 1))
  };
}

export function buildFacebookInitiateCheckout(items = [], totals = {}) {
  const contents = facebookContents(items);
  return {
    content_ids: contents.map((content) => content.id),
    content_type: 'product',
    contents,
    currency: CURRENCY,
    num_items: contents.reduce((sum, content) => sum + content.quantity, 0),
    value: facebookMoneyValue(totals.totalCents ?? totals.subtotalCents)
  };
}

export function buildFacebookAddPaymentInfo(items = [], totals = {}, paymentMethod = '') {
  return {
    ...buildFacebookInitiateCheckout(items, totals),
    payment_type: String(paymentMethod || '')
  };
}

export function trackFacebookEvent(eventName, payload = {}, options = {}) {
  const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : null);
  const path = options.path ?? windowRef?.location?.pathname ?? '';
  if (runtimePixelConfig?.enabled === false || isFacebookAdminPath(path)) return false;
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
  if (!hasMetaTrackingConsent(options)) return false;

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
  const initialPath = String(windowRef?.__mariaClaraInitialMetaPageViewPath || '');
  if (initialPath) {
    delete windowRef.__mariaClaraInitialMetaPageViewPath;
    lastTrackedPagePath = initialPath;
    lastViewContentKey = '';
    if (initialPath === path) return true;
  }
  if (!shouldTrackFacebookPath(lastTrackedPagePath, path)) return false;
  const tracked = trackFacebookEvent('PageView', {}, { ...options, path });
  if (tracked) {
    lastTrackedPagePath = path;
    lastViewContentKey = '';
  }
  return tracked;
}

export function trackFacebookViewContent(product, options = {}) {
  const payload = buildFacebookViewContent(product);
  if (!payload.content_ids.length) return false;
  const key = `${options.path || ''}:${payload.content_ids.join(',')}`;
  if (key === lastViewContentKey) return false;
  const tracked = trackFacebookEvent('ViewContent', payload, options);
  if (tracked) lastViewContentKey = key;
  return tracked;
}

export function trackFacebookAddToCart(item, options = {}) {
  const payload = buildFacebookAddToCart(item);
  if (!payload.content_ids.length) return false;
  return trackFacebookEvent('AddToCart', payload, options);
}

export function trackFacebookInitiateCheckout(items, totals, eventId, options = {}) {
  if (!eventId || lastCheckoutEventId === eventId) return false;
  const payload = buildFacebookInitiateCheckout(items, totals);
  if (!payload.content_ids.length) return false;
  const tracked = trackFacebookEvent('InitiateCheckout', payload, { ...options, eventId });
  if (tracked) lastCheckoutEventId = eventId;
  return tracked;
}

export function trackFacebookAddPaymentInfo(items, totals, paymentMethod, eventId, options = {}) {
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId) return false;
  const payload = buildFacebookAddPaymentInfo(items, totals, paymentMethod);
  if (!payload.content_ids.length) return false;
  const storage = options.storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  const storageKey = `maria-clara-facebook-${normalizedEventId}`;
  if (storage?.getItem(storageKey)) return false;
  const tracked = trackFacebookEvent('AddPaymentInfo', payload, { ...options, eventId: normalizedEventId });
  if (tracked) storage?.setItem(storageKey, 'tracked');
  return tracked;
}

export function trackFacebookPurchase(order, items, eventId, options = {}) {
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId || !order?.orderNumber) return false;

  const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const storageKey = `maria-clara-facebook-${normalizedEventId}`;
  if (trackedPurchaseEventIds.has(normalizedEventId) || storageGet(storage, storageKey)) return false;

  const event = buildFacebookPurchase(order, items, normalizedEventId);
  if (!event) {
    logFacebookPurchaseDevelopment(order, normalizedEventId, items, false, 'invalid_purchase_data');
    return false;
  }
  const tracked = trackFacebookEvent('Purchase', event.payload, {
    ...options,
    eventId: normalizedEventId
  });
  if (tracked) {
    trackedPurchaseEventIds.add(normalizedEventId);
    storageSet(storage, storageKey, 'tracked');
  }
  logFacebookPurchaseDevelopment(order, normalizedEventId, items, tracked, tracked ? 'sent' : 'not_sent');
  return tracked;
}

function logFacebookPurchaseDevelopment(order, eventId, items, sent, reason) {
  if (!import.meta.env?.DEV || typeof console === 'undefined') return;
  const value = facebookPurchaseValue(order?.totalCents);
  console.info('Meta Purchase development status.', {
    orderId: String(order?.id || order?.orderNumber || ''),
    eventId,
    purchaseValue: value,
    currency: CURRENCY,
    paymentMethod: String(order?.paymentMethod || ''),
    numberOfItems: (Array.isArray(items) ? items : []).reduce((total, item) => total + Math.max(0, Number(item.quantity || 0)), 0),
    browserPixelSent: sent,
    conversionsApiSent: 'reported_by_server',
    reason
  });
}
