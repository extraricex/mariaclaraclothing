const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkoutSessionPayload, parsePaidEvent, restockItems, withOrderParam
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
    id: 'evt-1',
    data: {
      type: 'checkout_session.payment.paid',
      data: {
        id: 'cs-1',
        attributes: {
          reference_number: 'MCC-1001',
          payments: [{ id: 'pay-1', attributes: { status: 'paid', amount: 72900, currency: 'PHP', paid_at: 1783785600 } }]
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
});

test('expired reservation restock data preserves exact product variant quantities', () => {
  const order = { items: [{ productId: 'catalog-shirt', productName: 'Shirt', sku: 'SHIRT-M', size: 'M', quantity: 2 }] };
  assert.deepEqual(restockItems(order), [{ slug: 'shirt', productName: 'Shirt', sku: 'SHIRT-M', size: 'M', quantity: 2 }]);
  assert.equal(withOrderParam('https://mariaclaraclothing.com/thank-you', 'MCC-1', { payment: 'success' }), 'https://mariaclaraclothing.com/thank-you?order=MCC-1&payment=success');
});
