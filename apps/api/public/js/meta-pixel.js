(function () {
  const configuredId = String(window.MARIA_CLARA_META_PIXEL_ID || document.documentElement.dataset.metaPixelId || '').trim();
  const pixelId = configuredId && !configuredId.includes('YOUR_PIXEL_ID') ? configuredId : '';
  const currency = 'PHP';

  window.trackMetaPixelEvent = function trackMetaPixelEvent(eventName, payload = {}, eventId = '') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: `meta_${String(eventName).replace(/[A-Z]/g, (letter, index) => `${index ? '_' : ''}${letter.toLowerCase()}`)}`,
      metaEventName: eventName,
      ...(eventId ? { metaEventId: eventId } : {}),
      ...payload
    });

    if (!pixelId || typeof window.fbq !== 'function') return;
    if (eventId) window.fbq('track', eventName, payload, { eventID: eventId });
    else window.fbq('track', eventName, payload);
  };

  window.trackMetaPixelViewContent = function trackMetaPixelViewContent(product) {
    if (!product) return;
    window.trackMetaPixelEvent('ViewContent', {
      content_ids: [String(product.externalPosProductId || product.id || product.slug || '')],
      content_name: product.name || '',
      content_type: 'product',
      currency,
      value: moneyValue(product.priceCents)
    });
  };

  window.trackMetaPixelAddToCart = function trackMetaPixelAddToCart(product, variant, quantity = 1) {
    if (!product || !variant) return;
    const itemQuantity = Math.max(1, Number(quantity || 1));
    window.trackMetaPixelEvent('AddToCart', {
      content_ids: [String(variant.externalPosVariantId || variant.id || product.id || '')],
      content_name: product.name || '',
      content_type: 'product',
      contents: [contentItem(product, variant, itemQuantity)],
      currency,
      value: moneyValue(Number(product.priceCents || 0) * itemQuantity)
    });
  };

  window.trackMetaPixelInitiateCheckout = function trackMetaPixelInitiateCheckout(items = [], totals = {}) {
    if (!Array.isArray(items) || !items.length) return;
    window.trackMetaPixelEvent('InitiateCheckout', {
      content_ids: items.map((item) => String(item.externalPosVariantId || item.variantId || item.productId || '')).filter(Boolean),
      content_type: 'product',
      contents: items.map((item) => contentItem(item, item, Number(item.quantity || 1))),
      currency,
      num_items: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      value: moneyValue(totals.totalCents ?? totals.subtotalCents)
    });
  };

  window.trackMetaPixelPurchase = function trackMetaPixelPurchase(order, items = []) {
    const orderItems = Array.isArray(items) && items.length ? items : order?.items || order?.cartSnapshot || [];
    const totalCents = Number(order?.totalCents);
    const value = purchaseValue(totalCents);
    if (!order?.orderNumber || value === null) return false;
    const orderNumber = order?.orderNumber || '';
    const eventId = String(order?.trackingEventId || `purchase_${orderNumber}`).trim();

    if (orderNumber) {
      const purchaseKey = `maria-clara-meta-purchase-${orderNumber}`;
      try {
        if (localStorage.getItem(purchaseKey)) return false;
      } catch (_error) { /* private browsing can disable storage */ }
    }

    window.trackMetaPixelEvent('Purchase', {
      content_ids: orderItems.map((item) => String(item.externalPosVariantId || item.variantId || item.productId || '')).filter(Boolean),
      content_type: 'product',
      contents: orderItems.map((item) => contentItem(item, item, Number(item.quantity || 1))),
      currency,
      num_items: orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      order_id: orderNumber,
      value
    }, eventId);
    if (orderNumber) {
      try { localStorage.setItem(`maria-clara-meta-purchase-${orderNumber}`, 'tracked'); } catch (_error) { /* no-op */ }
    }
    return true;
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

  function moneyValue(cents) {
    return Number((Number(cents || 0) / 100).toFixed(2));
  }

  function purchaseValue(cents) {
    if (!Number.isInteger(cents) || cents <= 0) return null;
    const value = Number((cents / 100).toFixed(2));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function contentItem(product, variant, quantity) {
    return {
      id: String(variant?.externalPosVariantId || variant?.variantId || variant?.id || product?.externalPosProductId || product?.productId || product?.id || ''),
      item_price: moneyValue(product?.unitPriceCents ?? product?.priceCents),
      quantity: Math.max(1, Number(quantity || 1))
    };
  }
})();
