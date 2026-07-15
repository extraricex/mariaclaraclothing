import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFacebookAddToCart,
  buildFacebookAddPaymentInfo,
  buildFacebookInitiateCheckout,
  buildFacebookPurchase,
  buildFacebookViewContent,
  centavosToMetaPesos,
  configureFacebookMetaPixel,
  facebookContentId,
  facebookMoneyValue,
  facebookPurchaseValue,
  initializeFacebookMetaPixel,
  getMetaTrackingConsent,
  metaPixelConfig,
  normalizeMetaValue,
  purchaseEventId,
  setMetaTrackingConsent,
  shouldTrackFacebookPath,
  trackFacebookAddToCart,
  trackFacebookAddPaymentInfo,
  trackFacebookEvent,
  trackFacebookInitiateCheckout,
  trackFacebookPageView,
  trackFacebookPurchase
} from '../src/lib/metaPixel.js';

test('Facebook money values convert cents to decimal PHP', () => {
  assert.equal(facebookMoneyValue(79900), 799);
  assert.equal(facebookMoneyValue(171850), 1718.5);
  assert.equal(centavosToMetaPesos(64900), 649);
  assert.equal(centavosToMetaPesos('129800'), 1298);
  for (const invalid of [undefined, null, '', 0, -1, 12.5, '₱64,900', 'PHP 64900']) {
    assert.equal(centavosToMetaPesos(invalid), null);
  }
  assert.equal(normalizeMetaValue('₱1,298.00'), 1298);
  assert.equal(normalizeMetaValue(' 649 '), 649);
  for (const invalid of [undefined, null, '', 0, -1, NaN, 'PHP 649']) {
    assert.equal(normalizeMetaValue(invalid), null);
  }
});

test('Facebook content IDs prefer external variant IDs', () => {
  assert.equal(facebookContentId({ externalPosVariantId: 'POS-1', variantId: 'V-1' }), 'POS-1');
  assert.equal(facebookContentId({ variantId: 'V-1' }), 'V-1');
  assert.equal(facebookContentId({ productId: 'P-1' }), 'P-1');
});

test('Purchase uses PHP values and stable IDs', () => {
  const event = buildFacebookPurchase({ orderNumber: 'MCC-1', totalCents: 171800 }, [
    { externalPosVariantId: 'POS-1', variantId: 'V-1', quantity: 2, unitPriceCents: 79900 }
  ]);

  assert.equal(purchaseEventId('MCC-1'), 'purchase_MCC-1');
  assert.equal(event.eventId, 'purchase_MCC-1');
  assert.equal(event.payload.value, 1718);
  assert.deepEqual(event.payload.content_ids, ['POS-1']);
  assert.equal(event.payload.contents[0].item_price, 799);
});

test('Purchase never builds with an invalid, zero, or formatted total', () => {
  for (const totalCents of [undefined, null, 0, -1, NaN, 'PHP 1278', '₱1,278', 12.5]) {
    assert.equal(buildFacebookPurchase({ orderNumber: 'MCC-invalid', totalCents }, []), null);
  }
  assert.equal(facebookPurchaseValue(127800), 1278);
});

test('Pixel configuration requires the enabled flag and a real ID', () => {
  assert.deepEqual(metaPixelConfig({}), { enabled: false, pixelId: '' });
  assert.deepEqual(metaPixelConfig({
    VITE_FACEBOOK_META_PIXEL_ENABLED: 'true',
    VITE_FACEBOOK_META_PIXEL_ID: '595813035761213'
  }), { enabled: true, pixelId: '595813035761213' });
});

test('Pixel initializes once on customer paths and never on admin paths', () => {
  const inserted = [];
  const documentRef = {
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: (node) => inserted.push(node) } }]
  };
  const adminWindow = {};
  assert.equal(initializeFacebookMetaPixel({
    windowRef: adminWindow,
    documentRef,
    enabled: true,
    pixelId: '595813035761213',
    path: '/admin/orders'
  }), false);
  assert.equal(adminWindow.fbq, undefined);

  const customerWindow = {};
  const options = {
    windowRef: customerWindow,
    documentRef,
    enabled: true,
    pixelId: '595813035761213',
    path: '/product/example',
    consent: true
  };
  assert.equal(initializeFacebookMetaPixel(options), true);
  assert.equal(initializeFacebookMetaPixel(options), true);
  assert.equal(inserted.length, 1);
  assert.equal(customerWindow.fbq.queue.length, 3);
  assert.deepEqual(customerWindow.fbq.queue.map((call) => call[0]), ['consent', 'init', 'consent']);
  assert.equal(customerWindow.fbq.queue[0][1], 'revoke');
  assert.equal(customerWindow.fbq.queue[2][1], 'grant');
});

test('Pixel initializes detectably with revoked consent and sends no event until accepted', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const events = [];
  const windowRef = { dispatchEvent: (event) => events.push(event.type) };
  assert.equal(getMetaTrackingConsent(storage), 'unset');
  setMetaTrackingConsent('declined', { storage, windowRef });
  assert.equal(getMetaTrackingConsent(storage), 'declined');
  setMetaTrackingConsent('accepted', { storage, windowRef });
  assert.equal(getMetaTrackingConsent(storage), 'accepted');
  assert.deepEqual(events, ['maria-clara-meta-consent-changed', 'maria-clara-meta-consent-changed']);

  const documentRef = {
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }]
  };
  const noConsentWindow = {};
  assert.equal(initializeFacebookMetaPixel({
    windowRef: noConsentWindow, documentRef, enabled: true, pixelId: '123', path: '/', consent: false, requireConsent: true
  }), false);
  assert.equal(typeof noConsentWindow.fbq, 'function');
  assert.equal(noConsentWindow.__mariaClaraFacebookPixelId, '123');
  assert.deepEqual(noConsentWindow.fbq.queue.map((call) => call[0]), ['consent', 'init']);
  assert.equal(noConsentWindow.fbq.queue[0][1], 'revoke');
  assert.doesNotMatch(JSON.stringify(noConsentWindow.fbq.queue), /PageView/);
});

test('admin runtime setting can enable immediate Pixel events without consent', () => {
  configureFacebookMetaPixel({ enabled: true, pixelId: '595813035761213', requireConsent: false });
  const documentRef = {
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }]
  };
  const windowRef = {};
  assert.equal(initializeFacebookMetaPixel({ windowRef, documentRef, path: '/' }), true);
  assert.equal(windowRef.__mariaClaraFacebookConsent, 'grant');
  assert.equal(windowRef.__mariaClaraFacebookPixelId, '595813035761213');
  assert.equal(trackFacebookPageView('/immediate-test', { windowRef, path: '/immediate-test' }), true);
  assert.equal(trackFacebookPageView('/immediate-test', { windowRef, path: '/immediate-test' }), false);
  const item = { variantId: 'V-IMMEDIATE', productName: 'Immediate Shirt', size: 'Large', quantity: 1, unitPriceCents: 79900 };
  assert.equal(trackFacebookAddToCart(item, { windowRef, path: '/product/immediate' }), true);
  assert.equal(trackFacebookInitiateCheckout([item], { totalCents: 79900 }, 'checkout:immediate', { windowRef, path: '/checkout' }), true);
  assert.equal(trackFacebookInitiateCheckout([item], { totalCents: 79900 }, 'checkout:immediate', { windowRef, path: '/checkout' }), false);
  assert.deepEqual(windowRef.fbq.queue.filter((call) => call[0] === 'track').map((call) => call[1]), [
    'PageView', 'AddToCart', 'InitiateCheckout'
  ]);
});

test('React consumes the HTML bootstrap PageView without sending a duplicate', () => {
  configureFacebookMetaPixel({ enabled: true, pixelId: '595813035761213', requireConsent: false });
  const calls = [];
  const windowRef = {
    fbq: (...args) => calls.push(args),
    __mariaClaraInitialMetaPageViewPath: '/bootstrap-test'
  };

  assert.equal(trackFacebookPageView('/bootstrap-test', { windowRef, path: '/bootstrap-test' }), true);
  assert.equal(trackFacebookPageView('/bootstrap-test', { windowRef, path: '/bootstrap-test' }), false);
  assert.equal(calls.length, 0);
  assert.equal(windowRef.__mariaClaraInitialMetaPageViewPath, undefined);

  assert.equal(trackFacebookPageView('/bootstrap-next', { windowRef, path: '/bootstrap-next' }), true);
  assert.deepEqual(calls, [['track', 'PageView', {}]]);
});

test('SPA page views skip repeated and admin paths', () => {
  assert.equal(shouldTrackFacebookPath('', '/'), true);
  assert.equal(shouldTrackFacebookPath('/', '/product/example'), true);
  assert.equal(shouldTrackFacebookPath('/product/example', '/product/example'), false);
  assert.equal(shouldTrackFacebookPath('/', '/admin'), false);
  assert.equal(shouldTrackFacebookPath('/', '/admin/login'), false);
  assert.equal(shouldTrackFacebookPath('/', '/admin/orders/MCC-1'), false);
});

test('ViewContent uses the product ID and PHP price', () => {
  assert.deepEqual(buildFacebookViewContent({
    id: 'P-1',
    name: 'Maria Clara Shirt',
    priceCents: 79900
  }), {
    content_ids: ['P-1'],
    content_name: 'Maria Clara Shirt',
    content_type: 'product',
    content_category: '',
    content_variant: '',
    contents: [{ id: 'P-1', quantity: 1, item_price: 799 }],
    currency: 'PHP',
    value: 799
  });
});

test('AddToCart and InitiateCheckout normalize variant contents', () => {
  const item = {
    externalPosVariantId: 'POS-1',
    variantId: 'V-1',
    productName: 'Maria Clara Shirt',
    size: 'Large',
    quantity: 2,
    unitPriceCents: 79900
  };
  const add = buildFacebookAddToCart(item);
  assert.deepEqual(add.content_ids, ['POS-1']);
  assert.equal(add.value, 1598);
  assert.equal(add.num_items, 2);
  assert.equal(add.content_variant, 'Large');
  assert.equal(add.contents[0].quantity, 2);

  assert.equal(buildFacebookInitiateCheckout([item, { productId: '', quantity: 1 }], { totalCents: 159800 }), null);
  assert.equal(buildFacebookInitiateCheckout([item], { subtotalCents: 159800 }), null);

  const secondItem = { sku: 'SKU-2', quantity: 1, unitPriceCents: 32400 };
  const checkout = buildFacebookInitiateCheckout([item, secondItem], { totalCents: 192200 });
  assert.deepEqual(checkout.content_ids, ['POS-1', 'SKU-2']);
  assert.equal(checkout.num_items, 3);
  assert.equal(checkout.value, 1922);
});

test('₱649 product and cart quantities send numeric peso values', () => {
  const product = buildFacebookViewContent({ id: 'P-649', name: 'Shirt', priceCents: 64900 });
  const quantityOne = buildFacebookAddToCart({ variantId: 'V-649', quantity: 1, unitPriceCents: 64900 });
  const quantityTwo = buildFacebookAddToCart({ variantId: 'V-649', quantity: 2, unitPriceCents: 64900 });
  assert.equal(product.value, 649);
  assert.equal(quantityOne.value, 649);
  assert.equal(quantityTwo.value, 1298);
  for (const payload of [product, quantityOne, quantityTwo]) {
    assert.equal(typeof payload.value, 'number');
    assert.equal(payload.currency, 'PHP');
  }
});

test('monetary events never dispatch a missing, string, zero, or non-PHP value', () => {
  configureFacebookMetaPixel({ enabled: true, pixelId: '595813035761213', requireConsent: false });
  const calls = [];
  const windowRef = { fbq: (...args) => calls.push(args) };
  for (const payload of [
    { currency: 'PHP' },
    { currency: 'PHP', value: 0 },
    { currency: 'PHP', value: '649' },
    { currency: 'PHP 649', value: 649 },
    { currency: 'PHP', value: Number.NaN }
  ]) {
    assert.equal(trackFacebookEvent('ViewContent', payload, { windowRef, path: '/product/test' }), false);
  }
  assert.equal(calls.length, 0);
  assert.equal(trackFacebookEvent('ViewContent', { currency: 'PHP', value: 649 }, { windowRef, path: '/product/test' }), true);
  assert.equal(calls.length, 1);
});

test('AddPaymentInfo includes the selected method and dispatches once per event ID', () => {
  configureFacebookMetaPixel({ enabled: true, pixelId: '595813035761213', requireConsent: false });
  const item = { variantId: 'V-1', quantity: 1, unitPriceCents: 79900 };
  const payload = buildFacebookAddPaymentInfo([item], { totalCents: 89900 }, 'paymongo');
  assert.equal(payload.payment_type, 'paymongo');
  assert.equal(payload.value, 899);

  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const calls = [];
  const windowRef = { fbq: (...args) => calls.push(args) };
  const options = { windowRef, storage, path: '/checkout/review' };
  assert.equal(trackFacebookAddPaymentInfo([item], { totalCents: 89900 }, 'paymongo', 'payment:1', options), true);
  assert.equal(trackFacebookAddPaymentInfo([item], { totalCents: 89900 }, 'paymongo', 'payment:1', options), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'AddPaymentInfo');
  assert.deepEqual(calls[0][3], { eventID: 'payment:1' });
});

test('Purchase dispatches once with the server event ID', () => {
  const calls = [];
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const windowRef = { fbq: (...args) => calls.push(args) };
  const order = { orderNumber: 'MCC-1', totalCents: 79900 };
  const items = [{ variantId: 'V-1', quantity: 1, unitPriceCents: 79900 }];

  assert.equal(trackFacebookPurchase(order, items, 'purchase_MCC-1', { windowRef, storage, path: '/checkout', consent: true }), true);
  assert.equal(trackFacebookPurchase(order, items, 'purchase_MCC-1', { windowRef, storage, path: '/checkout', consent: true }), false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][3], { eventID: 'purchase_MCC-1' });
});

test('Purchase remains safe when browser storage is unavailable and rejects invalid line contents', () => {
  const calls = [];
  const storage = {
    getItem: () => { throw new Error('storage disabled'); },
    setItem: () => { throw new Error('storage disabled'); }
  };
  const windowRef = { fbq: (...args) => calls.push(args) };
  const order = { orderNumber: 'MCC-STORAGE', totalCents: 127800 };
  const items = [
    { sku: 'SKU-VALID', quantity: 2, unitPriceCents: 64900 },
    { sku: 'SKU-BAD-QUANTITY', quantity: 'two', unitPriceCents: 100 },
    { sku: 'SKU-BAD-PRICE', quantity: 1, unitPriceCents: 'PHP 10' }
  ];
  assert.doesNotThrow(() => trackFacebookPurchase(order, items, 'purchase_MCC-STORAGE', {
    windowRef, storage, path: '/thank-you', consent: true
  }));
  assert.equal(trackFacebookPurchase(order, items, 'purchase_MCC-STORAGE', {
    windowRef, storage, path: '/thank-you', consent: true
  }), false);
  assert.equal(calls.length, 0);

  const validOrder = { orderNumber: 'MCC-STORAGE-VALID', totalCents: 129800 };
  const validItems = [{ sku: 'SKU-VALID', quantity: 2, unitPriceCents: 64900 }];
  assert.equal(trackFacebookPurchase(validOrder, validItems, 'purchase_MCC-STORAGE-VALID', {
    windowRef, storage, path: '/thank-you', consent: true
  }), true);
  assert.equal(trackFacebookPurchase(validOrder, validItems, 'purchase_MCC-STORAGE-VALID', {
    windowRef, storage, path: '/thank-you', consent: true
  }), false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2].content_ids, ['SKU-VALID']);
  assert.equal(calls[0][2].num_items, 2);
  assert.equal(calls[0][2].value, 1298);
  assert.equal(calls[0][2].currency, 'PHP');
});
