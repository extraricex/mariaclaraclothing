import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFacebookAddToCart,
  buildFacebookInitiateCheckout,
  buildFacebookPurchase,
  buildFacebookViewContent,
  facebookContentId,
  facebookMoneyValue,
  initializeFacebookMetaPixel,
  metaPixelConfig,
  purchaseEventId,
  shouldTrackFacebookPath
} from '../src/lib/metaPixel.js';

test('Facebook money values convert cents to decimal PHP', () => {
  assert.equal(facebookMoneyValue(79900), 799);
  assert.equal(facebookMoneyValue(171850), 1718.5);
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

  assert.equal(purchaseEventId('MCC-1'), 'purchase:MCC-1');
  assert.equal(event.eventId, 'purchase:MCC-1');
  assert.equal(event.payload.value, 1718);
  assert.deepEqual(event.payload.content_ids, ['POS-1']);
  assert.equal(event.payload.contents[0].item_price, 799);
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
    path: '/product/example'
  };
  assert.equal(initializeFacebookMetaPixel(options), true);
  assert.equal(initializeFacebookMetaPixel(options), true);
  assert.equal(inserted.length, 1);
  assert.equal(customerWindow.fbq.queue.length, 1);
  assert.equal(customerWindow.fbq.queue[0][0], 'init');
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
    currency: 'PHP',
    value: 799
  });
});

test('AddToCart and InitiateCheckout normalize variant contents', () => {
  const item = {
    externalPosVariantId: 'POS-1',
    variantId: 'V-1',
    productName: 'Maria Clara Shirt',
    quantity: 2,
    unitPriceCents: 79900
  };
  const add = buildFacebookAddToCart(item);
  assert.deepEqual(add.content_ids, ['POS-1']);
  assert.equal(add.value, 1598);
  assert.equal(add.contents[0].quantity, 2);

  const checkout = buildFacebookInitiateCheckout([item, { productId: '', quantity: 1 }], { totalCents: 159800 });
  assert.deepEqual(checkout.content_ids, ['POS-1']);
  assert.equal(checkout.num_items, 2);
  assert.equal(checkout.value, 1598);
});
