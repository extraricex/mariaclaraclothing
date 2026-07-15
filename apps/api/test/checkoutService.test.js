const test = require('node:test');
const assert = require('node:assert/strict');
const { persistPostgresCheckout } = require('../src/orders/checkoutService');

function fixture() {
  return {
    persistedOrder: {
      orderNumber: 'MCC-1',
      placedAt: '2026-06-20T12:00:00.000Z',
      totalCents: 79900,
      customer: {},
      items: []
    },
    cartSessionId: 'cart-1',
    stockItems: [{ sku: 'SKU-1', quantity: 1 }],
    movements: [{ sku: 'SKU-1', quantityChange: -1 }],
    requestContext: {},
    discountCode: 'SAVE'
  };
}

test('Postgres checkout serializes the idempotency key and uses one client for every commerce write', async () => {
  const sqlCalls = [];
  const client = { id: 'client-1', query: async (sql, values) => sqlCalls.push({ sql, values }) };
  const calls = [];
  const deps = {
    transaction: async (callback) => callback(client),
    findByIdempotencyKey: async () => null,
    deductStock: async (_items, options) => calls.push(['stock', options.client]),
    saveOrder: async (_order, options) => calls.push(['order', options.client]),
    appendMovements: async (_items, options) => calls.push(['movements', options.client]),
    convertCart: async (_cart, _order, options) => calls.push(['cart', options.client]),
    incrementDiscount: async (_code, options) => calls.push(['discount', options.client]),
    buildMetaEvent: () => ({ event_id: 'purchase_MCC-1', custom_data: { order_id: 'MCC-1' } }),
    insertOutbox: async (usedClient) => calls.push(['outbox', usedClient]),
    enqueueOrderExport: async (_order, options) => calls.push(['pancakeExport', options.client]),
    enqueueAdminEmail: async (_order, options) => calls.push(['adminEmail', options.client]),
    metaEnabled: true
  };

  const result = await persistPostgresCheckout(fixture(), deps);
  assert.equal(result.orderNumber, 'MCC-1');
  assert.match(sqlCalls[0].sql, /pg_advisory_xact_lock/);
  assert.deepEqual(sqlCalls[0].values, ['cart-1']);
  assert.deepEqual(calls.map(([name]) => name), ['stock', 'order', 'movements', 'cart', 'discount', 'outbox', 'pancakeExport', 'adminEmail']);
  assert.equal(calls.every(([, usedClient]) => usedClient === client), true);
});

test('Postgres checkout returns the existing idempotent order without writes', async () => {
  const existing = { orderNumber: 'MCC-existing' };
  let writes = 0;
  const deps = {
    transaction: async (callback) => callback({ query: async () => {} }),
    findByIdempotencyKey: async () => existing,
    deductStock: async () => { writes += 1; },
    saveOrder: async () => { writes += 1; },
    appendMovements: async () => { writes += 1; },
    convertCart: async () => { writes += 1; },
    incrementDiscount: async () => { writes += 1; },
    buildMetaEvent: () => ({}),
    insertOutbox: async () => { writes += 1; },
    enqueueOrderExport: async () => { writes += 1; },
    enqueueAdminEmail: async () => { writes += 1; },
    metaEnabled: true
  };
  const result = await persistPostgresCheckout(fixture(), deps);
  assert.equal(result, existing);
  assert.equal(writes, 0);
});

test('Postgres checkout rejects an empty idempotency key', async () => {
  await assert.rejects(
    persistPostgresCheckout({ ...fixture(), cartSessionId: '' }, {}),
    (error) => error.status === 400 && /Cart session id/.test(error.message)
  );
});
