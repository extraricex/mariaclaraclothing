const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkoutSessionPayload, closeCheckoutSessionForExpiry, paidSessionPayload, parsePaidEvent, restockItems, withOrderParam
} = require('../src/payments/paymongoPaymentService');

test('PayMongo checkout payload uses the authoritative total and approved hosted channels', () => {
  const order = {
    orderNumber: 'MCC-1001', totalCents: 145800,
    customer: { email: 'buyer@example.com' },
    items: [{ productName: 'Oversized Shirt', size: 'M', quantity: 2 }]
  };
  const payload = checkoutSessionPayload(order, {
    paymentMethodTypes: ['card', 'gcash', 'paymaya', 'qrph'],
    successUrl: 'https://mariaclaraclothing.com/thank-you',
    cancelUrl: 'https://mariaclaraclothing.com/checkout'
  });
  const attributes = payload.data.attributes;
  assert.equal(attributes.line_items[0].amount, 145800);
  assert.equal(attributes.line_items[0].quantity, 1);
  assert.equal(attributes.line_items[0].currency, 'PHP');
  assert.deepEqual(attributes.payment_method_types, ['card', 'gcash', 'paymaya', 'qrph']);
  assert.equal(new URL(attributes.success_url).searchParams.get('order'), 'MCC-1001');
  assert.equal(attributes.reference_number, 'MCC-1001');
});

test('PayMongo paid event parser extracts session, payment, amount, and reference', () => {
  const event = parsePaidEvent({
    data: {
      id: 'evt-1',
      type: 'event',
      attributes: {
        type: 'checkout_session.payment.paid',
        data: {
        id: 'cs-1',
        attributes: {
          reference_number: 'MCC-1001',
          payment_method_used: 'gcash',
          livemode: true,
          payments: [{ id: 'pay-1', attributes: { status: 'paid', amount: 72900, currency: 'PHP', paid_at: 1783785600 } }]
        }
        }
      }
    }
  });
  assert.deepEqual({
    eventId: event.eventId, eventType: event.eventType, checkoutSessionId: event.checkoutSessionId,
    orderNumber: event.orderNumber, paymentId: event.paymentId, amountCents: event.amountCents, currency: event.currency
  }, {
    eventId: 'evt-1', eventType: 'checkout_session.payment.paid', checkoutSessionId: 'cs-1',
    orderNumber: 'MCC-1001', paymentId: 'pay-1', amountCents: 72900, currency: 'PHP'
  });
  assert.equal(event.paymentMethodType, 'gcash');
  assert.equal(event.livemode, true);
});

test('PayMongo paid event parser falls back to the payment source type', () => {
  const event = parsePaidEvent({
    data: {
      id: 'evt-qrph',
      attributes: {
        type: 'checkout_session.payment.paid',
        data: {
          id: 'cs-qrph',
          attributes: {
            reference_number: 'MCC-QRPH',
            payments: [{
              id: 'pay-qrph',
              attributes: { status: 'paid', amount: 400, currency: 'PHP', livemode: true, source: { type: 'qrph' } }
            }]
          }
        }
      }
    }
  });
  assert.equal(event.paymentMethodType, 'qrph');
  assert.equal(event.livemode, true);
});

test('expired reservation restock data preserves exact product variant quantities', () => {
  const order = { items: [{ productId: 'catalog-shirt', productName: 'Shirt', sku: 'SHIRT-M', size: 'M', quantity: 2 }] };
  assert.deepEqual(restockItems(order), [{ slug: 'shirt', productName: 'Shirt', sku: 'SHIRT-M', size: 'M', quantity: 2 }]);
  assert.equal(withOrderParam('https://mariaclaraclothing.com/thank-you', 'MCC-1', { payment: 'success' }), 'https://mariaclaraclothing.com/thank-you?order=MCC-1&payment=success');
});

test('paid checkout recovery produces the official webhook envelope', () => {
  const payload = paidSessionPayload({
    id: 'cs-1',
    attributes: {
      reference_number: 'MCC-1',
      payments: [{ id: 'pay-1', attributes: { status: 'paid', amount: 10000, currency: 'PHP' } }]
    }
  });
  assert.equal(payload.data.type, 'event');
  assert.equal(payload.data.attributes.type, 'checkout_session.payment.paid');
  assert.equal(parsePaidEvent(payload).paymentId, 'pay-1');
});

test('reservation expiry closes an active PayMongo session before releasing inventory', async () => {
  const calls = [];
  const outcome = await closeCheckoutSessionForExpiry({
    retrieveCheckoutSession: async (id) => {
      calls.push(`retrieve:${id}`);
      return { id, attributes: { status: 'active', payments: [] } };
    },
    expireCheckoutSession: async (id) => {
      calls.push(`expire:${id}`);
      return { id, attributes: { status: 'expired', payments: [] } };
    }
  }, 'cs_active_1');
  assert.equal(outcome.status, 'expired');
  assert.deepEqual(calls, ['retrieve:cs_active_1', 'expire:cs_active_1']);
});

test('reservation expiry preserves a payment that completed before expiration', async () => {
  let expireCalls = 0;
  const outcome = await closeCheckoutSessionForExpiry({
    retrieveCheckoutSession: async () => ({
      id: 'cs_paid_1',
      attributes: {
        status: 'active', reference_number: 'MCC-PAID',
        payments: [{ id: 'pay_paid_1', attributes: { status: 'paid', amount: 10000, currency: 'PHP' } }]
      }
    }),
    expireCheckoutSession: async () => { expireCalls += 1; }
  }, 'cs_paid_1');
  assert.equal(outcome.status, 'paid');
  assert.equal(expireCalls, 0);
  assert.equal(parsePaidEvent(outcome.paidPayload).paymentId, 'pay_paid_1');
});

test('failed, pending, cancelled, and unrelated PayMongo events cannot create a Purchase', async () => {
  for (const eventType of [
    'checkout_session.payment.failed',
    'checkout_session.payment.pending',
    'checkout_session.cancelled',
    'checkout_session.created'
  ]) {
    const result = await require('../src/payments/paymongoPaymentService').processPaidWebhook({
      data: { id: `evt-${eventType}`, type: 'event', attributes: { type: eventType, data: {} } }
    }, { metaEnabled: true });
    assert.deepEqual(result, { status: 'ignored', eventType });
  }
});
