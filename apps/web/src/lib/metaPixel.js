const CURRENCY = 'PHP';
const META_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';
let lastTrackedPagePath = '';
let lastCheckoutEventId = '';

export function metaPixelConfig(source = {}) {
  const pixelId = String(source.VITE_FACEBOOK_META_PIXEL_ID || '').trim();
  const enabled = source.VITE_FACEBOOK_META_PIXEL_ENABLED === 'true' &&
    Boolean(pixelId) &&
    !pixelId.includes('YOUR_PIXEL_ID');
  return { enabled, pixelId: enabled ? pixelId : '' };
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
  const enabled = options.enabled ?? environment.enabled;
  const pixelId = String(options.pixelId ?? environment.pixelId).trim();
  const path = options.path ?? windowRef?.location?.pathname ?? '';

  if (!windowRef || !documentRef || !enabled || !pixelId || isFacebookAdminPath(path)) return false;
  if (windowRef.__mariaClaraFacebookPixelId === pixelId) return true;

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

  windowRef.fbq('init', pixelId);
  windowRef.__mariaClaraFacebookPixelId = pixelId;
  return true;
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
    contents,
    currency: CURRENCY,
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
  if (!windowRef?.fbq || isFacebookAdminPath(path)) return false;

  if (options.eventId) {
    windowRef.fbq('track', eventName, payload, { eventID: options.eventId });
  } else {
    windowRef.fbq('track', eventName, payload);
  }
  return true;
}

export function trackFacebookPageView(path, options = {}) {
  if (!shouldTrackFacebookPath(lastTrackedPagePath, path)) return false;
  const tracked = trackFacebookEvent('PageView', {}, { ...options, path });
  if (tracked) lastTrackedPagePath = path;
  return tracked;
}

export function trackFacebookViewContent(product, options = {}) {
  const payload = buildFacebookViewContent(product);
  if (!payload.content_ids.length) return false;
  return trackFacebookEvent('ViewContent', payload, options);
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
