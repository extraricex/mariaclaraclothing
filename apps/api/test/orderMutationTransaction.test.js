const test = require('node:test');
const assert = require('node:assert/strict');

const { findOrderByNumber } = require('../src/orders/orderRepository');
const { restockVariantStock } = require('../src/products/catalogRepository');

function postgresRow() {
  return {
    order_number: 'MCC-LOCKED',
    customer: {},
    address: {},
    items: [],
    subtotal_cents: 0,
    discount_total_cents: 0,
    shipping_fee_cents: 0,
    total_cents: 0,
    cart_snapshot: [],
    status: 'confirmed',
    fulfillment_status: 'unfulfilled',
    payment_status: 'cod_pending',
    cod_confirmation_status: 'pending',
    delivery_status: 'pending',
    tags: [],
    admin_editable_totals: {},
    discount_snapshot: {}
  };
}

test('admin order mutation can lock and read an order on its transaction client', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousOrdersFile = process.env.ORDERS_DATA_FILE;
  process.env.DATABASE_URL = 'postgres://transaction-test';
  delete process.env.ORDERS_DATA_FILE;
  const calls = [];
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [postgresRow()] };
    }
  };

  try {
    const order = await findOrderByNumber('MCC-LOCKED', {
      client,
      forUpdate: true,
      includeRelated: false
    });
    assert.equal(order.orderNumber, 'MCC-LOCKED');
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /WHERE order_number = \$1 FOR UPDATE$/);
  } finally {
    restoreEnv('DATABASE_URL', previousDatabaseUrl);
    restoreEnv('ORDERS_DATA_FILE', previousOrdersFile);
  }
});

test('cancellation restock uses the caller transaction instead of opening another one', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousProductsFile = process.env.PRODUCTS_DATA_FILE;
  process.env.DATABASE_URL = 'postgres://transaction-test';
  delete process.env.PRODUCTS_DATA_FILE;
  const calls = [];
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rowCount: 1, rows: [] };
    }
  };

  try {
    await restockVariantStock([{ sku: 'SKU-1', quantity: 2 }], { client });
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /SET stock_quantity = stock_quantity \+ \$1/);
    assert.deepEqual(calls[0].values, [2, 'SKU-1']);
  } finally {
    restoreEnv('DATABASE_URL', previousDatabaseUrl);
    restoreEnv('PRODUCTS_DATA_FILE', previousProductsFile);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
