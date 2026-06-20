const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const nodeFs = require('node:fs');
const nodeOs = require('node:os');
const nodePath = require('node:path');

// Isolate the catalog so deduction never touches the committed data/products.json.
const REAL_PRODUCTS = nodePath.join(__dirname, '..', 'data', 'products.json');
process.env.PRODUCTS_DATA_FILE = nodePath.join(
  nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'mc-inv-')),
  'products.json'
);

const { loadEditableProducts, deductVariantStock } = require('../src/products/catalogRepository');

beforeEach(() => {
  nodeFs.copyFileSync(REAL_PRODUCTS, process.env.PRODUCTS_DATA_FILE);
});

function pickInStock(products) {
  for (const product of products) {
    for (const variant of product.variants) {
      if (Number(variant.stockQuantity) > 0) {
        return { slug: product.slug, size: variant.size, sku: variant.sku, name: product.name, stock: Number(variant.stockQuantity) };
      }
    }
  }
  throw new Error('No in-stock variant in fixture');
}

function variantOf(products, slug, size) {
  return products.find((p) => p.slug === slug).variants.find((v) => v.size === size);
}

test('deductVariantStock reduces the ordered variant stock', async () => {
  const target = pickInStock(loadEditableProducts());
  await deductVariantStock([{ slug: target.slug, sku: target.sku, size: target.size, quantity: 1, productName: target.name }]);
  const after = variantOf(loadEditableProducts(), target.slug, target.size);
  assert.equal(Number(after.stockQuantity), target.stock - 1);
});

test('deductVariantStock blocks oversell and leaves stock unchanged', async () => {
  const target = pickInStock(loadEditableProducts());
  await assert.rejects(
    async () => deductVariantStock([{ slug: target.slug, sku: target.sku, size: target.size, quantity: target.stock + 1, productName: target.name }]),
    (err) => err.status === 409 && err.message === `${target.size} is sold out for ${target.name}`
  );
  const after = variantOf(loadEditableProducts(), target.slug, target.size);
  assert.equal(Number(after.stockQuantity), target.stock);
});

const ORDERS_DIR_BASE = nodePath.join(nodeOs.tmpdir(), 'mc-inv-orders-');

function checkoutBody(item) {
  return {
    customer: { fullName: 'Juan Dela Cruz', phone: '09171234567', email: '' },
    address: {
      addressLine: '12 Sampaguita St, BUCANDALA IV, IMUS, CAVITE, Philippines',
      houseAddress: '12 Sampaguita St',
      barangay: 'BUCANDALA IV',
      city: 'IMUS',
      province: 'CAVITE',
      country: 'Philippines',
      postalCode: ''
    },
    items: [item],
    shippingFeeCents: 8000,
    paymentMethod: 'cash_on_delivery'
  };
}

async function startServer() {
  process.env.ORDERS_DATA_FILE = nodePath.join(nodeFs.mkdtempSync(ORDERS_DIR_BASE), 'orders.json');
  delete require.cache[require.resolve('../src/app')];
  delete require.cache[require.resolve('../src/routes/orders')];
  delete require.cache[require.resolve('../src/orders/orderRepository')];
  const app = require('../src/app').createApp();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  return server;
}

async function firstInStock(port) {
  const { products } = await (await fetch(`http://127.0.0.1:${port}/api/products`)).json();
  for (const product of products) {
    const variant = (product.variants || []).find((v) => Number(v.stockQuantity) > 0);
    if (variant) {
      return {
        item: {
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          size: variant.size,
          quantity: 1,
          unitPriceCents: variant.priceCents ?? product.priceCents,
          externalPosVariantId: variant.externalPosVariantId || ''
        },
        slug: product.slug,
        size: variant.size,
        stock: Number(variant.stockQuantity)
      };
    }
  }
  throw new Error('No in-stock product');
}

test('creating an order deducts the ordered variant stock', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    const picked = await firstInStock(port);
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(checkoutBody(picked.item))
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.currency, 'PHP');
    assert.equal(body.totalCents, picked.item.unitPriceCents + 8000);
    assert.equal(body.trackingEventId, `purchase:${body.orderNumber}`);
    assert.deepEqual(body.items, [{
      variantId: picked.item.variantId,
      externalPosVariantId: picked.item.externalPosVariantId,
      quantity: 1,
      unitPriceCents: picked.item.unitPriceCents
    }]);
    const after = variantOf(loadEditableProducts(), picked.slug, picked.size);
    assert.equal(Number(after.stockQuantity), picked.stock - 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('ordering more than available stock is rejected and stock is unchanged', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    const picked = await firstInStock(port);
    const oversized = { ...picked.item, quantity: picked.stock + 1 };
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(checkoutBody(oversized))
    });
    assert.equal(response.status, 400);
    const after = variantOf(loadEditableProducts(), picked.slug, picked.size);
    assert.equal(Number(after.stockQuantity), picked.stock);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
