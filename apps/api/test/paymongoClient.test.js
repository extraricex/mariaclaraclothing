const test = require('node:test');
const assert = require('node:assert/strict');

const { createPayMongoClient } = require('../src/payments/paymongoClient');

test('PayMongo client creates an official V2 hosted checkout with server-side Basic auth', async () => {
  let request;
  const client = createPayMongoClient({ apiBaseUrl: 'https://api.paymongo.com', secretKey: 'sk_test_secret', timeoutMs: 1000 }, async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ data: { id: 'cs_test_1', attributes: { checkout_url: 'https://checkout.paymongo.com/cs_test_1' } } }) };
  });
  const payload = { data: { attributes: { line_items: [] } } };
  const result = await client.createCheckoutSession(payload);
  assert.equal(request.url, 'https://api.paymongo.com/v2/checkout_sessions');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, `Basic ${Buffer.from('sk_test_secret:').toString('base64')}`);
  assert.deepEqual(JSON.parse(request.options.body), payload);
  assert.equal(result.checkoutUrl, 'https://checkout.paymongo.com/cs_test_1');
});

test('PayMongo client never exposes provider response bodies in errors', async () => {
  const client = createPayMongoClient({ apiBaseUrl: 'https://api.paymongo.com', secretKey: 'bad', timeoutMs: 1000 }, async () => ({
    ok: false, status: 401, json: async () => ({ secret_provider_detail: 'must not leak' })
  }));
  await assert.rejects(client.createCheckoutSession({}), (error) => {
    assert.equal(error.code, 'paymongo_auth_failed');
    assert.equal(error.message.includes('must not leak'), false);
    return true;
  });
});

test('PayMongo client retrieves a checkout session with the server-side secret', async () => {
  let requestedUrl = '';
  const client = createPayMongoClient({ apiBaseUrl: 'https://api.paymongo.com', secretKey: 'sk_test_secret' }, async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ data: { id: 'cs_test_1', attributes: { status: 'active', payments: [] } } }) };
  });
  const session = await client.retrieveCheckoutSession('cs_test_1');
  assert.equal(requestedUrl, 'https://api.paymongo.com/v1/checkout_sessions/cs_test_1');
  assert.equal(session.id, 'cs_test_1');
});

test('PayMongo client creates an idempotent refund with centavo amount and server-side auth', async () => {
  let request;
  const client = createPayMongoClient({ apiBaseUrl: 'https://api.paymongo.com', secretKey: 'sk_live_secret' }, async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({ data: { id: 'ref_123', attributes: { status: 'pending', amount: 12500, payment_id: 'pay_123' } } })
    };
  });
  const refund = await client.createRefund({
    amountCents: 12500,
    paymentId: 'pay_123',
    reason: 'others',
    notes: 'Customer return approved'
  }, { idempotencyKey: 'mcc-refund-123' });
  assert.equal(request.url, 'https://api.paymongo.com/v1/refunds');
  assert.equal(request.options.headers['Idempotency-Key'], 'mcc-refund-123');
  assert.deepEqual(JSON.parse(request.options.body), {
    data: { attributes: { amount: 12500, payment_id: 'pay_123', reason: 'others', notes: 'Customer return approved' } }
  });
  assert.equal(refund.id, 'ref_123');
  assert.equal(refund.attributes.status, 'pending');
});
