const CURRENCY = 'PHP';
const META_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';
const META_CONSENT_KEY = 'maria-clara-meta-tracking-consent';
export const META_CONSENT_EVENT = 'maria-clara-meta-consent-changed';
let lastTrackedPagePath = '';
let lastCheckoutEventId = '';
let lastViewContentKey = '';
let runtimePixelConfig = null;
const pendingPixelEvents = [];

function defaultConsentStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function getMetaTrackingConsent(storage = defaultConsentStorage()) {
  const value = storage?.getItem(META_CONSENT_KEY);
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

  setFacebookPixelConsent(windowRef, 'revoke');
  windowRef.fbq('init', pixelId);
  setFacebookPixelConsent(windowRef, consentGranted ? 'grant' : 'revoke');
  windowRef.__mariaClaraFacebookPixelId = pixelId;
  return consentGranted;
}

export function facebookMoneyValue(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

export function facebookContentId(item = {}) {
  return String(
    item.externalPosVariantId ||
    item.variantId ||
    item.id ||
    item.externalPosProductId ||
    item.productId ||
    item.slug ||
    ''
  ).trim();
}

export function facebookContents(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: facebookContentId(item),
      quantity: Math.max(1, Number(item.quantity || 1)),
      item_price: facebookMoneyValue(item.unitPriceCents ?? item.priceCents)
    }))
    .filter((item) => item.id);
}

export function purchaseEventId(orderNumber) {
  return `purchase:${String(orderNumber || '').trim()}`;
}

export function buildFacebookPurchase(order = {}, items = []) {
  const contents = facebookContents(items);
  return {
    eventId: purchaseEventId(order.orderNumber),
    payload: {
      content_ids: contents.map((item) => item.id),
      content_type: 'product',
      contents,
      currency: CURRENCY,
      num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
      order_id: String(order.orderNumber || ''),
      value: facebookMoneyValue(order.totalCents)
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

export function trackFacebookPurchase(order, items, eventId, options = {}) {
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId || !order?.orderNumber) return false;

  const storage = options.storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  const storageKey = `maria-clara-facebook-${normalizedEventId}`;
  if (storage?.getItem(storageKey)) return false;

  const event = buildFacebookPurchase(order, items);
  const tracked = trackFacebookEvent('Purchase', event.payload, {
    ...options,
    eventId: normalizedEventId
  });
  if (tracked) storage?.setItem(storageKey, 'tracked');
  return tracked;
}
