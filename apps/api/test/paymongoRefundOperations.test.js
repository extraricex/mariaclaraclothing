const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeRefundStatus,
  parseRefundEvent,
  paymentMethodRefundPolicy,
  requestRefund,
  verifyProviderRefundEligibility
} = require('../src/payments/paymongoRefundService');

test('refund migration stores idempotency, provider state, audit events, and safe constraints', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../db/migrations/20260713_paymongo_refund_operations.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS paymongo_refunds/);
  assert.match(migration, /request_key_hash text NOT NULL UNIQUE/);
  assert.match(migration, /provider_idempotency_key text NOT NULL UNIQUE/);
  assert.match(migration, /CHECK \(status IN \('requesting','pending','processing','succeeded','failed'\)\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS payment_operation_events/);
});

test('refund webhook parser accepts a refund resource without logging the full provider payload', () => {
  const event = parseRefundEvent({
    data: {
      id: 'evt_refund_1',
      attributes: {
        type: 'payment.refund.updated',
        livemode: true,
        data: {
          id: 'ref_1',
          type: 'refund',
          attributes: {
            payment_id: 'pay_1', amount: 72900, currency: 'PHP', reason: 'others',
            notes: 'Approved return', status: 'succeeded', created_at: 1783890000, updated_at: 1783890300
          }
        }
      }
    }
  });
  assert.equal(event.eventId, 'evt_refund_1');
  assert.equal(event.refundId, 'ref_1');
  assert.equal(event.paymentId, 'pay_1');
  assert.equal(event.amountCents, 72900);
  assert.equal(event.status, 'succeeded');
  assert.equal(event.livemode, true);
  assert.match(event.digest, /^[a-f0-9]{64}$/);
});

test('payment.refunded defaults to succeeded when the nested refund omits status', () => {
  const event = parseRefundEvent({
    data: {
      id: 'evt_refunded_1',
      attributes: {
        type: 'payment.refunded', livemode: false,
        data: {
          id: 'pay_2', type: 'payment', attributes: {
            refunds: [{ id: 'ref_2', type: 'refund', attributes: { payment_id: 'pay_2', amount: 10000, currency: 'PHP' } }]
          }
        }
      }
    }
  });
  assert.equal(event.refundId, 'ref_2');
  assert.equal(event.status, 'succeeded');
  assert.equal(normalizeRefundStatus('unexpected'), 'pending');
});

test('refund parser accepts the current PayMongo event envelope with top-level livemode', () => {
  const event = parseRefundEvent({
    event_type: 'send.webhook',
    data: {
      type: 'payment.refund.updated',
      livemode: true,
      data: {
        id: 'ref_current_1',
        type: 'refund',
        attributes: {
          payment_id: 'pay_current_1', amount: 5000, currency: 'PHP', status: 'processing'
        }
      }
    }
  });
  assert.equal(event.eventType, 'payment.refund.updated');
  assert.equal(event.refundId, 'ref_current_1');
  assert.equal(event.paymentId, 'pay_current_1');
  assert.equal(event.livemode, true);
  assert.equal(event.status, 'processing');
});

test('refund service blocks provider calls outside verified live mode', async () => {
  let called = false;
  await assert.rejects(
    requestRefund({ orderNumber: 'MCC-1', amountCents: 100, reason: 'others', requestKey: 'one' }, {
      config: { configured: true, livemode: false },
      client: { createRefund: async () => { called = true; } }
    }),
    (error) => error.code === 'paymongo_live_refunds_required' && error.status === 409
  );
  assert.equal(called, false);
});

test('refund policy blocks QR Ph and explains the external resolution', () => {
  const policy = paymentMethodRefundPolicy('qrph');
  assert.equal(policy.supported, false);
  assert.equal(policy.code, 'paymongo_refund_method_not_supported');
  assert.match(policy.message, /cannot be refunded through PayMongo/);
});

test('refund policy permits supported card and e-wallet methods', () => {
  assert.equal(paymentMethodRefundPolicy('card').supported, true);
  assert.equal(paymentMethodRefundPolicy('gcash').supported, true);
  assert.equal(paymentMethodRefundPolicy('paymaya').supported, true);
});

test('refund preflight reads the authoritative provider method and blocks QR Ph', async () => {
  const order = {
    paymentProvider: 'paymongo',
    providerPaymentId: 'pay_live_qrph',
    paymentStatus: 'paid',
    paymentMetadata: {}
  };
  await assert.rejects(verifyProviderRefundEligibility(order, 400, {
    config: { livemode: true },
    client: {
      retrievePayment: async () => ({
        id: 'pay_live_qrph',
        attributes: { status: 'paid', amount: 400, livemode: true, source: { type: 'qrph' } }
      })
    }
  }), (error) => error.code === 'paymongo_refund_method_not_supported' && error.status === 409);
});
