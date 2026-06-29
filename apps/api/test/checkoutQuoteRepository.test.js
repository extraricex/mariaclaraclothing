const test = require('node:test');
const assert = require('node:assert/strict');
const {
  consumeCheckoutQuote,
  deleteExpiredCheckoutQuotes,
  findCheckoutQuoteForUpdate,
  insertCheckoutQuote
} = require('../src/checkout/checkoutQuoteRepository');

function recordingClient(responses) {
  const calls = [];
  return {
    calls,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return responses.shift() || { rows: [], rowCount: 0 };
    }
  };
}

test('quote repository stores, locks, and consumes a quote', async () => {
  const now = new Date('2026-06-29T10:00:00.000Z');
  const expiresAt = new Date('2026-06-29T10:15:00.000Z');
  const snapshot = {
    cartSessionId: 'cart-1',
    requestHash: 'hash-1',
    pricingFingerprint: 'pricing-1',
    finalizable: true,
    items: [{ variantId: 'catalog-shirt-0', quantity: 1, unitPriceCents: 64900 }],
    totalCents: 72900
  };
  const row = {
    id: '08f13376-57db-4af3-9a9b-6df79ead727a',
    cart_session_id: 'cart-1',
    request_hash: 'hash-1',
    snapshot,
    finalizable: true,
    expires_at: expiresAt,
    consumed_order_number: '',
    created_at: now,
    updated_at: now
  };
  const client = recordingClient([
    { rows: [row], rowCount: 1 },
    { rows: [row], rowCount: 1 },
    { rows: [{ ...row, consumed_order_number: 'MCC-1' }], rowCount: 1 }
  ]);

  const stored = await insertCheckoutQuote(client, snapshot, { ttlMs: 900000, now });
  assert.match(stored.id, /^[0-9a-f-]{36}$/);
  assert.equal(stored.expiresAt, expiresAt.toISOString());
  assert.match(client.calls[0].sql, /INSERT INTO checkout_quotes/);
  assert.match(client.calls[0].sql, /\$4::jsonb/);
  assert.deepEqual(client.calls[0].values.slice(1), [
    'cart-1',
    'hash-1',
    JSON.stringify(snapshot),
    true,
    expiresAt,
    now,
    now
  ]);

  const locked = await findCheckoutQuoteForUpdate(client, stored.id);
  assert.equal(locked.snapshot.totalCents, 72900);
  assert.match(client.calls[1].sql, /FOR UPDATE/);

  const consumed = await consumeCheckoutQuote(client, stored.id, 'MCC-1');
  assert.equal(consumed.consumedOrderNumber, 'MCC-1');
  assert.deepEqual(client.calls[2].values, [stored.id, 'MCC-1']);
});

test('quote repository returns null for missing records and deletes expired quotes', async () => {
  const now = new Date('2026-06-29T11:00:00.000Z');
  const client = recordingClient([
    { rows: [], rowCount: 0 },
    { rows: [], rowCount: 0 },
    { rows: [], rowCount: 4 }
  ]);

  assert.equal(await findCheckoutQuoteForUpdate(client, 'missing'), null);
  assert.equal(await consumeCheckoutQuote(client, 'missing', 'MCC-2'), null);
  assert.equal(await deleteExpiredCheckoutQuotes(client, now), 4);
  assert.match(client.calls[2].sql, /DELETE FROM checkout_quotes/);
  assert.match(client.calls[2].sql, /expires_at <= \$1/);
  assert.deepEqual(client.calls[2].values, [now]);
});
