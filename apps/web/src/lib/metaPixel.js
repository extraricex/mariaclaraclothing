const CURRENCY = 'PHP';
const META_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';

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
