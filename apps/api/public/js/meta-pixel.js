(function () {
  const configuredId = String(window.MARIA_CLARA_META_PIXEL_ID || document.documentElement.dataset.metaPixelId || '').trim();
  const pixelId = configuredId && !configuredId.includes('YOUR_PIXEL_ID') ? configuredId : '';
  const currency = 'PHP';
  const monetaryEvents = new Set(['ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase']);

  window.trackMetaPixelEvent = function trackMetaPixelEvent(eventName, payload = {}, eventId = '') {
    if (monetaryEvents.has(eventName) && !hasValidMonetaryPayload(payload)) return false;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: `meta_${String(eventName).replace(/[A-Z]/g, (letter, index) => `${index ? '_' : ''}${letter.toLowerCase()}`)}`,
      metaEventName: eventName,
      ...(eventId ? { metaEventId: eventId } : {}),
      ...payload
    });

    if (!pixelId || typeof window.fbq !== 'function') return Boolean(window.dataLayer);
    if (eventId) window.fbq('track', eventName, payload, { eventID: eventId });
    else window.fbq('track', eventName, payload);
    return true;
  };

  window.trackMetaPixelViewContent = function trackMetaPixelViewContent(product, variant) {
    if (!product) return false;
    const item = contentItem(product, variant || product, 1);
    if (!item) return false;
    return window.trackMetaPixelEvent('ViewContent', {
      content_ids: [item.id],
      content_name: product.name || '',
      content_type: 'product',
      contents: [item],
      currency,
      value: item.item_price
    });
  };

  window.trackMetaPixelAddToCart = function trackMetaPixelAddToCart(product, variant, quantity = 1) {
    const itemQuantity = Number(quantity);
    const item = contentItem(product, variant, itemQuantity);
    if (!product || !variant || !item) return false;
    const value = normalizeMetaValue(item.item_price * itemQuantity);
    if (value === null) return false;
    return window.trackMetaPixelEvent('AddToCart', {
      content_ids: [item.id],
      content_name: product.name || '',
      content_type: 'product',
      contents: [item],
      currency,
      num_items: itemQuantity,
      value
    });
  };

  window.trackMetaPixelInitiateCheckout = function trackMetaPixelInitiateCheckout(items = [], totals = {}) {
    if (!Array.isArray(items) || !items.length) return false;
    const contents = items.map((item) => contentItem(item, item, Number(item.quantity)));
    const value = centavosToMetaPesos(totals.totalCents);
    if (contents.some((item) => !item) || value === null) return false;
    return window.trackMetaPixelEvent('InitiateCheckout', {
      content_ids: contents.map((item) => item.id),
      content_type: 'product',
      contents,
      currency,
      num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
      value
    });
  };

  window.trackMetaPixelPurchase = function trackMetaPixelPurchase(order, items = []) {
    const orderItems = Array.isArray(items) && items.length ? items : order?.items || order?.cartSnapshot || [];
    const totalCents = Number(order?.totalCents);
    const value = purchaseValue(totalCents);
    if (!order?.orderNumber || value === null || !orderItems.length) return false;
    const orderNumber = order?.orderNumber || '';
    const eventId = String(order?.trackingEventId || `purchase_${orderNumber}`).trim();
    const contents = orderItems.map((item) => contentItem(item, item, Number(item.quantity)));
    if (!eventId || contents.some((item) => !item)) return false;

    if (orderNumber) {
      const purchaseKey = `maria-clara-meta-purchase-${orderNumber}`;
      try {
        if (localStorage.getItem(purchaseKey)) return false;
      } catch (_error) { /* private browsing can disable storage */ }
    }

    const sent = window.trackMetaPixelEvent('Purchase', {
      content_ids: contents.map((item) => item.id),
      content_type: 'product',
      contents,
      currency,
      num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
      order_id: orderNumber,
      value
    }, eventId);
    if (sent && orderNumber) {
      try { localStorage.setItem(`maria-clara-meta-purchase-${orderNumber}`, 'tracked'); } catch (_error) { /* no-op */ }
    }
    return sent;
  };

  if (!pixelId) return;

  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');

  const noscript = document.createElement('noscript');
  const img = document.createElement('img');
  img.height = 1;
  img.width = 1;
  img.style.display = 'none';
  img.src = `https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`;
  noscript.appendChild(img);
  document.head.appendChild(noscript);

  function normalizeMetaValue(amount) {
    const normalized = typeof amount === 'number'
      ? amount
      : Number(String(amount ?? '').replace(/[₱,\s]/g, ''));
    if (!Number.isFinite(normalized) || normalized <= 0) return null;
    return Number(normalized.toFixed(2));
  }

  function centavosToMetaPesos(cents) {
    const raw = typeof cents === 'number' ? cents : String(cents ?? '').trim();
    if (typeof raw === 'string' && !/^\d+$/.test(raw)) return null;
    const numericCents = Number(raw);
    if (!Number.isInteger(numericCents) || numericCents <= 0) return null;
    return normalizeMetaValue(numericCents / 100);
  }

  function moneyValue(cents) {
    return centavosToMetaPesos(cents);
  }

  function purchaseValue(cents) {
    return centavosToMetaPesos(cents);
  }

  function contentItem(product, variant, quantity) {
    const id = String(variant?.externalPosVariantId || variant?.variantId || variant?.id || product?.externalPosProductId || product?.productId || product?.id || '').trim();
    const itemPrice = moneyValue(variant?.unitPriceCents ?? variant?.priceCents ?? product?.unitPriceCents ?? product?.priceCents);
    const itemQuantity = Number(quantity);
    if (!id || itemPrice === null || !Number.isInteger(itemQuantity) || itemQuantity <= 0) return null;
    return {
      id,
      item_price: itemPrice,
      quantity: itemQuantity
    };
  }

  function hasValidMonetaryPayload(payload) {
    return payload?.currency === currency &&
      typeof payload?.value === 'number' &&
      Number.isFinite(payload.value) &&
      payload.value > 0;
  }
})();
