const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAuthoritativeQuote } = require('../src/checkout/checkoutQuoteService');
const { canonicalJson, sha256Object } = require('../src/checkout/requestHash');
const { claimDiscountUsage } = require('../src/discounts/discountRepository');

const PRODUCT = {
  id: 'catalog-shirt',
  slug: 'shirt',
  name: 'Real Shirt',
  priceCents: 64900,
  images: [{ url: '/shirt.jpg' }],
  variants: [
    {
      id: 'catalog-shirt-0',
      sku: 'SHIRT-S',
      size: 'Small',
      priceCents: 70000,
      stockQuantity: 5,
      externalPosVariantId: 'POS-S'
    }
  ]
};

const SHIPPING = {
  regions: [
    { id: 'metro_manila_cavite', label: 'Metro Manila & Cavite', feeCents: 8000 },
    { id: 'luzon', label: 'Luzon', feeCents: 12000 },
    { id: 'visayas_mindanao', label: 'Visayas & Mindanao', feeCents: 18000 }
  ],
  freeShippingEnabled: true,
  freeShippingMinimumItems: 2
};

function address(region = 'metro_manila_cavite') {
  return {
    houseAddress: '12 Test St',
    provinceCode: 'CAVITE',
    province: 'CAVITE',
    cityCode: 'CAVITE|IMUS',
    city: 'IMUS',
    barangayCode: 'CAVITE|IMUS|BUCANDALA IV',
    barangay: 'BUCANDALA IV',
    addressLine: '12 Test St, BUCANDALA IV, IMUS, CAVITE, Philippines',
    shippingRegion: region,
    doorToDoor: true,
    datasetVersion: '2026-06-05T13:33:03.555Z'
  };
}

function quoteDependencies(overrides = {}) {
  return {
    findProduct: async () => PRODUCT,
    resolveAddress: () => address(),
    getSettings: async () => ({ shipping: SHIPPING }),
    quotePromos: async ({ items, shippingFeeCents }) => ({
      discountCode: '',
      discountTotalCents: 0,
      discountSnapshot: {},
      shippingFeeCents,
      freeShippingUnlocked: false,
      subtotalCents: items.reduce(
        (sum, item) => sum + item.unitPriceCents * item.quantity,
        0
      )
    }),
    ...overrides
  };
}

function quoteInput(overrides = {}) {
  return {
    cartSessionId: 'cart-1',
    items: [{
      productId: 'catalog-shirt',
      variantId: 'catalog-shirt-0',
      quantity: 1,
      productName: 'Fake name',
      unitPriceCents: 1
    }],
    address: {
      houseAddress: '12 Test St',
      provinceCode: 'CAVITE',
      cityCode: 'CAVITE|IMUS',
      barangayCode: 'CAVITE|IMUS|BUCANDALA IV'
    },
    discountCode: '',
    ...overrides
  };
}

test('canonical hashes ignore object key order', () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":2}');
  assert.equal(sha256Object({ b: 2, a: 1 }), sha256Object({ a: 1, b: 2 }));
  assert.match(sha256Object({ a: 1 }), /^[0-9a-f]{64}$/);
});

test('quote ignores client names and prices and uses variant override price', async () => {
  const quote = await buildAuthoritativeQuote(
    quoteInput({
      items: [{
        productId: 'catalog-shirt',
        variantId: 'catalog-shirt-0',
        quantity: 2,
        productName: 'Fake',
        unitPriceCents: 1
      }]
    }),
    quoteDependencies()
  );

  assert.equal(quote.items[0].productName, 'Real Shirt');
  assert.equal(quote.items[0].unitPriceCents, 70000);
  assert.equal(quote.items[0].lineTotalCents, 140000);
  assert.equal(quote.shippingFeeCents, 0);
  assert.equal(quote.freeShippingUnlocked, true);
  assert.equal(quote.totalCents, 140000);
  assert.equal(quote.finalizable, true);
  assert.match(quote.pricingFingerprint, /^[0-9a-f]{64}$/);
  assert.match(quote.requestHash, /^[0-9a-f]{64}$/);
});

test('preview quote without address never invents a final shipping fee', async () => {
  const input = quoteInput();
  delete input.address;
  const quote = await buildAuthoritativeQuote(input, quoteDependencies());

  assert.equal(quote.finalizable, false);
  assert.equal(quote.shippingFeeCents, null);
  assert.equal(quote.shippingStatus, 'pending_address');
  assert.equal(quote.totalCents, 70000);
});

test('quote uses each configured server shipping fee', async () => {
  for (const [region, feeCents] of [
    ['metro_manila_cavite', 8000],
    ['luzon', 12000],
    ['visayas_mindanao', 18000]
  ]) {
    const deps = quoteDependencies({
      resolveAddress: () => address(region),
      getSettings: async () => ({
        shipping: { ...SHIPPING, freeShippingEnabled: false }
      })
    });
    const quote = await buildAuthoritativeQuote(quoteInput(), deps);
    assert.equal(quote.shippingRegion, region);
    assert.equal(quote.shippingFeeCents, feeCents);
    assert.equal(quote.totalCents, 70000 + feeCents);
  }
});

test('promo results use authoritative lines and can unlock free shipping', async () => {
  let promoInput;
  const quote = await buildAuthoritativeQuote(quoteInput(), quoteDependencies({
    getSettings: async () => ({
      shipping: { ...SHIPPING, freeShippingEnabled: false }
    }),
    quotePromos: async (input) => {
      promoInput = input;
      return {
        discountCode: 'SAVE10',
        discountTotalCents: 10000,
        discountSnapshot: { promoId: 'SAVE10', type: 'fixed' },
        discountDefinition: { code: 'SAVE10', type: 'fixed', value: 10000 },
        shippingFeeCents: 0,
        freeShippingUnlocked: true,
        subtotalCents: 70000
      };
    }
  }));

  assert.equal(promoInput.items[0].productName, 'Real Shirt');
  assert.equal(promoInput.items[0].unitPriceCents, 70000);
  assert.equal(promoInput.shippingFeeCents, 8000);
  assert.equal(quote.discountCode, 'SAVE10');
  assert.equal(quote.discountTotalCents, 10000);
  assert.equal(quote.shippingFeeCents, 0);
  assert.equal(quote.totalCents, 60000);
});

test('authoritative grand total includes discount and shipping exactly once', async () => {
  const quote = await buildAuthoritativeQuote(quoteInput(), quoteDependencies({
    getSettings: async () => ({ shipping: { ...SHIPPING, freeShippingEnabled: false } }),
    quotePromos: async () => ({
      discountCode: 'SAVE100', discountTotalCents: 10000, discountSnapshot: { code: 'SAVE100' },
      freeShippingUnlocked: false
    })
  }));
  assert.equal(quote.subtotalCents, 70000);
  assert.equal(quote.discountTotalCents, 10000);
  assert.equal(quote.shippingFeeCents, 8000);
  assert.equal(quote.totalCents, 68000);
});

test('request hash excludes client-controlled names and prices', async () => {
  const first = await buildAuthoritativeQuote(quoteInput(), quoteDependencies());
  const second = await buildAuthoritativeQuote(quoteInput({
    items: [{
      productId: 'catalog-shirt',
      variantId: 'catalog-shirt-0',
      quantity: 1,
      productName: 'Another fake name',
      unitPriceCents: 999999
    }]
  }), quoteDependencies());

  assert.equal(first.requestHash, second.requestHash);
  assert.equal(first.pricingFingerprint, second.pricingFingerprint);
});

test('quote aggregates duplicate variant lines before stock validation', async () => {
  const quote = await buildAuthoritativeQuote(quoteInput({
    items: [
      { productId: 'catalog-shirt', variantId: 'catalog-shirt-0', quantity: 2 },
      { productId: 'catalog-shirt', variantId: 'catalog-shirt-0', quantity: 3 }
    ]
  }), quoteDependencies());

  assert.equal(quote.items.length, 1);
  assert.equal(quote.items[0].quantity, 5);
  assert.equal(quote.items[0].lineTotalCents, 350000);

  await assert.rejects(
    buildAuthoritativeQuote(quoteInput({
      items: [
        { productId: 'catalog-shirt', variantId: 'catalog-shirt-0', quantity: 5 },
        { productId: 'catalog-shirt', variantId: 'catalog-shirt-0', quantity: 1 }
      ]
    }), quoteDependencies()),
    (error) => error.code === 'insufficient_stock'
      && error.details.availableQuantity === 5
      && error.details.requestedQuantity === 6
  );
});

test('quote rejects invalid cart, product, variant, quantity, and stock', async () => {
  await assert.rejects(
    buildAuthoritativeQuote(quoteInput({ cartSessionId: '' }), quoteDependencies()),
    (error) => error.code === 'cart_session_required'
  );
  await assert.rejects(
    buildAuthoritativeQuote(quoteInput({ items: [] }), quoteDependencies()),
    (error) => error.code === 'cart_invalid'
  );
  await assert.rejects(
    buildAuthoritativeQuote(quoteInput(), quoteDependencies({ findProduct: async () => null })),
    (error) => error.code === 'product_unavailable'
  );
  await assert.rejects(
    buildAuthoritativeQuote(quoteInput({
      items: [{ productId: 'catalog-shirt', variantId: 'missing', quantity: 1 }]
    }), quoteDependencies()),
    (error) => error.code === 'variant_unavailable'
  );
  await assert.rejects(
    buildAuthoritativeQuote(quoteInput({
      items: [{ productId: 'catalog-shirt', variantId: 'catalog-shirt-0', quantity: 1.5 }]
    }), quoteDependencies()),
    (error) => error.code === 'cart_invalid'
  );
  await assert.rejects(
    buildAuthoritativeQuote(quoteInput({
      items: [{ productId: 'catalog-shirt', variantId: 'catalog-shirt-0', quantity: 6 }]
    }), quoteDependencies()),
    (error) => error.code === 'insufficient_stock'
      && error.details.sku === 'SHIRT-S'
      && error.message === 'Small only has 5 pieces left. Please update your cart quantity.'
  );
});

test('discount usage claim is conditional and reports an unavailable promo', async () => {
  const calls = [];
  const successfulClient = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{ code: 'SAVE10' }] };
    }
  };

  assert.equal(await claimDiscountUsage('save10', { client: successfulClient }), 'SAVE10');
  assert.match(calls[0].sql, /usage_limit IS NULL OR usage_count < usage_limit/);
  assert.deepEqual(calls[0].values, ['SAVE10']);

  await assert.rejects(
    claimDiscountUsage('save10', {
      client: { query: async () => ({ rows: [] }) }
    }),
    (error) => error.code === 'promo_unavailable' && error.status === 409
  );
});
