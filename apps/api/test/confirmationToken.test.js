const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveConfirmationToken,
  hashConfirmationToken,
  verifyConfirmationToken
} = require('../src/checkout/confirmationToken');
const { saveOrder } = require('../src/orders/orderRepository');

test('confirmation token is deterministic for retry and verifies against only its hash', () => {
  const first = deriveConfirmationToken('MCC-1', 'idem-1', 'x'.repeat(32));
  const second = deriveConfirmationToken('MCC-1', 'idem-1', 'x'.repeat(32));
  assert.equal(first, second);
  assert.notEqual(first, 'idem-1');
  assert.equal(hashConfirmationToken(first).length, 64);
  assert.equal(verifyConfirmationToken(first, hashConfirmationToken(first)), true);
  assert.equal(verifyConfirmationToken('wrong', hashConfirmationToken(first)), false);
  assert.equal(verifyConfirmationToken('', ''), false);
});

test('order persistence stores a confirmation hash and never token plaintext', async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://test';
  const calls = [];
  const token = deriveConfirmationToken('MCC-1', 'idem-1', 'x'.repeat(32));
  const hash = hashConfirmationToken(token);

  try {
    await saveOrder({
      orderNumber: 'MCC-1',
      confirmationTokenHash: hash,
      confirmationTokenCreatedAt: '2026-06-29T00:00:00.000Z'
    }, {
      client: { query: async (sql, values) => calls.push({ sql, values }) }
    });
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }

  assert.match(calls[0].sql, /confirmation_token_hash/);
  assert.equal(calls[0].values.includes(hash), true);
  assert.equal(calls[0].values.includes(token), false);
});
