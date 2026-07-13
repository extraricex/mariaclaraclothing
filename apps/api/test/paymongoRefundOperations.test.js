const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeRefundStatus,
  parseRefundEvent,
  requestRefund
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
