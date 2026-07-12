const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { parseSignature, verifyPayMongoSignature } = require('../src/payments/paymongoWebhookSignature');

function signature(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

test('PayMongo signature verification accepts the correct test or live digest', () => {
  const secret = 'whsk_test_secret';
  const body = JSON.stringify({ data: { type: 'checkout_session.payment.paid' } });
  const timestamp = 1783785600;
  const digest = signature(secret, timestamp, body);
  assert.deepEqual(parseSignature(`t=${timestamp},te=${digest},li=${'0'.repeat(64)}`), {
    t: String(timestamp), te: digest, li: '0'.repeat(64)
  });
  assert.equal(verifyPayMongoSignature({
    rawBody: Buffer.from(body), header: `t=${timestamp},te=${digest}`, secret,
    livemode: false, now: timestamp * 1000
  }), true);
  assert.equal(verifyPayMongoSignature({
    rawBody: Buffer.from(body), header: `t=${timestamp},li=${digest}`, secret,
    livemode: true, now: timestamp * 1000
  }), true);
});

test('PayMongo signature verification rejects tampering, wrong mode, and stale requests', () => {
  const secret = 'whsk_test_secret';
  const body = '{}';
  const timestamp = 1783785600;
  const digest = signature(secret, timestamp, body);
  assert.equal(verifyPayMongoSignature({ rawBody: 'changed', header: `t=${timestamp},te=${digest}`, secret, livemode: false, now: timestamp * 1000 }), false);
  assert.equal(verifyPayMongoSignature({ rawBody: body, header: `t=${timestamp},te=${digest}`, secret, livemode: true, now: timestamp * 1000 }), false);
  assert.equal(verifyPayMongoSignature({ rawBody: body, header: `t=${timestamp},te=${digest}`, secret, livemode: false, now: (timestamp + 301) * 1000 }), false);
});
